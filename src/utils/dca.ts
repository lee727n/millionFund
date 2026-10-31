// [WHY] 定投（Dollar-Cost Averaging）是用户在大屏持仓面板对每个持仓基金设置的「按计划自动买入」能力。
// [WHAT] 本模块是定投的唯一数据 + 执行中枢：
//   1. 计划 CRUD（存 localStorage，中性 key 不随版本清理被删）；
//   2. 调度判定（isScheduledDay / nextScheduledDate，基于交易日=工作日且非节假日）；
//   3. 执行引擎 executeDueDCAs：在刷新/挂载时调用，对「今天恰是计划交易日且未执行过」的计划，
//      以当前净值/估值买入一笔「auto_invest」交易、扣减对应账户现金、累加持仓份额；
//   4. 统计 computeDCAStats：按账户折算「每日定投额」「剩余资金可定投天数」。
//
// [DESIGN-铁律] 定投买入用 TradeType='auto_invest'，而 K线买点只渲染 type==='buy'，
//               因此定投的买入**不会**出现在星标/基金 K 线的买入点标记上（用户明确要求）。
// [EXEC-铁律] 本 App 无后端，定投只能在「网页打开且触发刷新」时执行；不打开就不会买（与收益曲线同理）。
//               且仅在「今天」这一交易日执行一次（按 lastExecutedDate 防重），过去的交易日不补买
//               （没有历史每日净值数据，用今日净值回补过去日期在经济学上是错的，故诚实跳过）。

import { STORAGE_KEYS, getPanoramaAccountCash, savePanoramaAccountCash, getDCADailyRates, getTrades } from '@/utils/storage'
import { isWorkday } from '@/utils/navDate'
import { useHoldingStore } from '@/stores/holding'
import { createTrade } from '@/composables/useFundTrade'
import { hasGitHubToken } from '@/api/gist'
import {
  readDcaCloudState, readDcaCloudStateEx, writeDcaCloudState, getDeviceId, bootstrapDcaCloudState
} from '@/api/dcaCloud'
import type { DcaCloudExecution, DcaCloudState } from '@/api/dcaCloud'

// [WHAT] 中性 key 的本地读写（与 storage.ts 的 getItem/setItem 同口径，避免改动其导出面）
function readJSON<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return fallback
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}
function writeJSON(key: string, value: unknown): void {
  localStorage.setItem(key, JSON.stringify(value))
}

// ============ 类型 ============

export type DCAFrequency = 'daily' | 'weekly' | 'monthly'

export interface DCAPlan {
  /** 计划 ID */
  id: string
  /** 基金代码 */
  code: string
  /** 基金名称 */
  name: string
  /** 账户来源（ali/TX/JD）—— 定投从该账户现金扣款 */
  source: string
  /** 每期定投金额（元） */
  amount: number
  /** 频率 */
  frequency: DCAFrequency
  /** weekly 专用：星期几（1=周一 ... 5=周五，仅工作日有意义） */
  weekday?: number
  /** monthly 专用：每月几号（1-28，超过当月天数取最后一天） */
  monthday?: number
  /** 计划开始日期（YYYY-MM-DD），之前不执行 */
  startDate: string
  /** 是否启用 */
  active: boolean
  createdAt: number
  /** 最近一次配置修改时间（ms），用于云端计划双向同步时的冲突解决（后改者胜） */
  updatedAt?: number
  /** 最近一次成功扣款日期（YYYY-MM-DD） */
  lastExecutedDate?: string
  /** 最近一次跳过日期（用于提示） */
  lastSkippedDate?: string
  /** 最近一次跳过原因：'no_value' | 'insufficient_cash' */
  lastSkipReason?: string
  /** 累计执行次数 */
  executedCount: number
  /** 累计投入金额 */
  totalInvested: number
}

// ============ 存储 ============

function getPlans(): DCAPlan[] {
  return readJSON<DCAPlan[]>(STORAGE_KEYS.DCA_PLANS, [])
}
/** 保存计划列表（供 BackupActions 恢复时直接写回） */
export function saveDCAPlans(plans: DCAPlan[]): void {
  writeJSON(STORAGE_KEYS.DCA_PLANS, plans)
}
export function getDCAPlans(): DCAPlan[] {
  return getPlans()
}
export function getDCAPlansByAccount(source: string): DCAPlan[] {
  return getPlans().filter(p => p.source === source)
}

function genId(): string {
  return 'dca_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8)
}

export function addDCAPlan(
  plan: Omit<DCAPlan, 'id' | 'createdAt' | 'executedCount' | 'totalInvested'>
): DCAPlan {
  const plans = getPlans()
  const full: DCAPlan = {
    ...plan,
    id: genId(),
    createdAt: Date.now(),
    updatedAt: Date.now(),
    executedCount: 0,
    totalInvested: 0
  }
  plans.push(full)
  saveDCAPlans(plans)
  return full
}

export function updateDCAPlan(id: string, patch: Partial<DCAPlan>): void {
  const plans = getPlans()
  const idx = plans.findIndex(p => p.id === id)
  if (idx >= 0) {
    plans[idx] = { ...plans[idx], ...patch }
    saveDCAPlans(plans)
  }
}

export function removeDCAPlan(id: string): void {
  saveDCAPlans(getPlans().filter(p => p.id !== id))
}

// ============ 日期工具 ============

function fmtDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
function dateAddDays(d: Date, n: number): Date {
  const x = new Date(d)
  x.setDate(x.getDate() + n)
  return x
}

/**
 * 该日期是否是计划的「应执行日」。
 * [WHAT] 必须是交易日（isWorkday）；再按频率匹配：
 *   - daily：任意交易日
 *   - weekly：该星期几（weekday 1-5）
 *   - monthly：该月号（monthday，越界取当月最后一天）
 * 非交易日（周末/节假日）一律不执行、也不补买。
 */
export function isScheduledDay(plan: DCAPlan, dateStr: string): boolean {
  if (!isWorkday(dateStr)) return false
  const d = new Date(dateStr + 'T00:00:00')
  if (plan.frequency === 'daily') return true
  if (plan.frequency === 'weekly') {
    const wd = plan.weekday ?? 1
    return d.getDay() === wd
  }
  if (plan.frequency === 'monthly') {
    const md = plan.monthday ?? 1
    const lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()
    return d.getDate() === Math.min(md, lastDay)
  }
  return false
}

/** 从 fromStr 起（含）找下一个计划交易日；找不到返回 null（理论上不会，daily 总能找到） */
export function nextScheduledDate(plan: DCAPlan, fromStr: string): string | null {
  let d = new Date(fromStr + 'T00:00:00')
  for (let i = 0; i < 400; i++) {
    const ds = fmtDate(d)
    if (ds >= fromStr && isScheduledDay(plan, ds)) return ds
    d = dateAddDays(d, 1)
  }
  return null
}

/** 频率中文标签 */
export function freqLabel(plan: DCAPlan): string {
  if (plan.frequency === 'daily') return '每日'
  if (plan.frequency === 'weekly') {
    const names = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']
    return '每周' + (names[plan.weekday ?? 1] || '周一')
  }
  if (plan.frequency === 'monthly') return `每月${plan.monthday ?? 1}号`
  return ''
}

// ============ 执行引擎 ============

/** 确定性交易 id：dca_<planId>_<date>，保证任意设备生成同一笔定投交易的同一 id，便于幂等合并（不会重复扣款/份额） */
export function dcaTradeId(planId: string, dateStr: string): string {
  return `dca_${planId}_${dateStr}`
}

export interface DCAExecutedItem {
  plan: DCAPlan
  amount: number
  netValue: number
  shares: number
  date: string
  /** 确定性交易 id（dca_<planId>_<date>），供云端台账与跨设备幂等合并 */
  tradeId: string
}
export interface DCASkippedItem {
  plan: DCAPlan
  reason: 'no_value' | 'insufficient_cash'
}
export interface DCAExecutionResult {
  executed: DCAExecutedItem[]
  skipped: DCASkippedItem[]
}

type PlanLocalOutcome =
  | { kind: 'executed'; item: DCAExecutedItem }
  | { kind: 'skipped'; reason: 'no_value' | 'insufficient_cash' }
  | { kind: 'noop' }

/**
 * [WHAT] 在本地执行「单个」到期定投计划：以当前净值/估值买入一笔 auto_invest 交易、扣减账户现金、累加持仓份额。
 * [WHY] 抽出单计划执行体，供「纯本地」executeDueDCAs 与「云端协调」executeDueDCAsCloud 复用同一套扣款口径。
 * [GUARD] 1) 已执行过（lastExecutedDate===today）跳过；2) 确定性交易 id 已存在则幂等跳过（防重复扣款，跨设备合并时尤其关键）；
 *         3) 无估值 / 现金不足 则跳过并记录原因（不扣款、不标记已执行）。
 */
function executePlanLocal(plan: DCAPlan, todayStr: string): PlanLocalOutcome {
  if (!plan.active) return { kind: 'noop' }
  if (plan.startDate > todayStr) return { kind: 'noop' }
  if (plan.lastExecutedDate === todayStr) return { kind: 'noop' }
  if (!isScheduledDay(plan, todayStr)) return { kind: 'noop' }

  const store = useHoldingStore()
  const holding = store.holdings.find(h => h.code === plan.code)
  const netValue = holding?.currentValue && holding.currentValue > 0 ? holding.currentValue : 0
  const isNav = !!holding?.isNav
  if (!(netValue > 0)) return { kind: 'skipped', reason: 'no_value' }

  const curCash = getPanoramaAccountCash()[plan.source] || 0
  if (curCash < plan.amount) return { kind: 'skipped', reason: 'insufficient_cash' }

  const tradeId = dcaTradeId(plan.id, todayStr)
  // [WHAT] 幂等闸门：确定性 id 的交易已存在（本机先前执行 / 云端恢复时已落）→ 不再扣款，直接视作已执行
  if (getTrades().some(t => t.id === tradeId)) return { kind: 'noop' }

  const shares = plan.amount / netValue
  createTrade({
    id: tradeId,
    code: plan.code,
    name: plan.name,
    type: 'auto_invest',
    date: todayStr,
    amount: plan.amount,
    netValue,
    shares,
    estimated: !isNav,
    source: plan.source,
    adjustCash: true
  })

  if (holding) {
    store.addOrUpdateHolding({
      ...holding,
      shares: (holding.shares || 0) + shares,
      currentValue: netValue
    })
  }

  plan.lastExecutedDate = todayStr
  plan.executedCount = (plan.executedCount || 0) + 1
  plan.totalInvested = (plan.totalInvested || 0) + plan.amount
  plan.lastSkipReason = undefined

  return { kind: 'executed', item: { plan, amount: plan.amount, netValue, shares, date: todayStr, tradeId } }
}

/**
 * [WHAT] 纯本地执行「今天」到期的定投计划（无云端协调，作为离线/无 Token 的兜底路径）。
 * [WHY] executeDueDCAsCloud 在云端不可达时会回退到这里，保证定投「不会因没网就完全不买」。
 */
export function executeDueDCAs(todayStr: string): DCAExecutionResult {
  const result: DCAExecutionResult = { executed: [], skipped: [] }
  const plans = getPlans()
  if (!plans.length) return result
  let dirty = false
  for (const plan of plans) {
    const outcome = executePlanLocal(plan, todayStr)
    if (outcome.kind === 'executed') {
      result.executed.push(outcome.item)
      dirty = true
    } else if (outcome.kind === 'skipped') {
      plan.lastSkippedDate = todayStr
      plan.lastSkipReason = outcome.reason
      result.skipped.push({ plan, reason: outcome.reason })
      dirty = true
    }
  }
  if (dirty) saveDCAPlans(plans)
  return result
}

// ============ 云端协调执行（跨设备只扣一次） ============

/** 认领软锁的「过期」阈值：超过此时长仍停留在 claimed 未完成，视为另一设备中途崩溃，本机可接管 */
const CLAIM_STALE_MS = 5 * 60 * 1000

function laterDate(a?: string, b?: string): string | undefined {
  if (a && b) return a >= b ? a : b
  return a || b
}

/**
 * [WHAT] 把云端计划合并进本地（云端=配置真源，双向同步）。
 * [WHY] 用户要求「电脑/手机任意一端改了计划都同步到另一端」。合并规则：
 *   - 配置字段（金额/频率/启用/名称…）取 updatedAt 较新者（后改者胜）；
 *   - 执行标记（lastExecutedDate/lastSkippedDate）取日期较大者（防止云端陈旧数据覆盖本地「今天已执行」）；
 *   - 云端独有的计划直接补进本地（另一端新建的）。
 * [TODAY-GUARD] 关键：绝不能让一个没有「今天已执行」标记的陈旧云端计划，把本地「今天已执行」抹掉
 *   —— 否则本地刚扣完款，被云端陈旧状态一覆盖，下次刷新又会再扣。故执行标记一律取较新日期。
 */
function reconcilePlans(cloudPlans?: any[]): void {
  if (!cloudPlans || !cloudPlans.length) return
  const local = getPlans()
  const cloudById = new Map<string, any>()
  for (const cp of cloudPlans) cloudById.set(cp.id, cp)
  const result: DCAPlan[] = []
  for (const lp of local) {
    const cp = cloudById.get(lp.id)
    if (!cp) { result.push(lp); continue }
    const merged: DCAPlan = { ...cp }
    // 配置：本地更新更晚则保留本地配置（防止把刚改的金额被旧云端覆盖）
    if ((lp.updatedAt || 0) > (cp.updatedAt || 0)) {
      merged.amount = lp.amount
      merged.active = lp.active
      merged.name = lp.name
      merged.frequency = lp.frequency
      merged.weekday = lp.weekday
      merged.monthday = lp.monthday
      merged.startDate = lp.startDate
      merged.source = lp.source
      merged.updatedAt = lp.updatedAt
    }
    // 执行标记：日期较大者胜
    merged.lastExecutedDate = laterDate(lp.lastExecutedDate, cp.lastExecutedDate)
    merged.lastSkippedDate = laterDate(lp.lastSkippedDate, cp.lastSkippedDate)
    const cloudMarkerNewer = (cp.lastExecutedDate || '') >= (lp.lastExecutedDate || '')
    merged.executedCount = cloudMarkerNewer ? (cp.executedCount || 0) : (lp.executedCount || 0)
    merged.totalInvested = cloudMarkerNewer ? (cp.totalInvested || 0) : (lp.totalInvested || 0)
    merged.lastSkipReason = (merged.lastSkippedDate === cp.lastSkippedDate)
      ? cp.lastSkipReason : lp.lastSkipReason
    merged.createdAt = lp.createdAt || cp.createdAt
    result.push(merged)
    cloudById.delete(lp.id)
  }
  for (const cp of cloudById.values()) result.push(cp as DCAPlan)
  saveDCAPlans(result)
}

/** 把本地计划推送到云端（配置真源写入；保留云端既有的执行台账，避免并发丢失） */
export async function pushPlansToCloud(): Promise<boolean> {
  if (!hasGitHubToken()) return false
  const plans = getPlans().map(p => ({ ...p, updatedAt: p.updatedAt ?? Date.now() }))
  saveDCAPlans(plans)
  const cloud = await readDcaCloudState(0)
  const state: DcaCloudState = cloud
    ? { ...cloud, plans, deviceId: getDeviceId(), updatedAt: Date.now() }
    : { version: 1, deviceId: getDeviceId(), updatedAt: Date.now(), plans, executions: {} }
  return writeDcaCloudState(state)
}

/**
 * [WHAT] 本地落地一笔云端交易（幂等）。供「本机是执行方」与「本机从云端恢复」两条路径共用。
 * [WHY] 确定性 id 保证：即便本机已存在该笔（重复调用/并发），也只落一次、只扣一次现金、只加一次份额。
 */
function addDcaTradeLocally(params: {
  planId: string; code: string; name: string; source: string; todayStr: string;
  amount: number; netValue: number; shares: number; estimated: boolean
}): boolean {
  const tradeId = dcaTradeId(params.planId, params.todayStr)
  if (getTrades().some(t => t.id === tradeId)) return false
  createTrade({
    id: tradeId,
    code: params.code,
    name: params.name,
    type: 'auto_invest',
    date: params.todayStr,
    amount: params.amount,
    netValue: params.netValue,
    shares: params.shares,
    estimated: params.estimated,
    source: params.source,
    adjustCash: true
  })
  const store = useHoldingStore()
  const holding = store.holdings.find(h => h.code === params.code)
  if (holding) {
    store.addOrUpdateHolding({
      ...holding,
      shares: (holding.shares || 0) + params.shares,
      currentValue: params.netValue
    })
  }
  return true
}

/** 把云端「已完成」的执行台账应用到本地（恢复数据：补交易 + 扣现金 + 加份额 + 标已执行）。返回新落地笔数。 */
function applyCloudExecution(todayStr: string, exec: DcaCloudExecution): number {
  let applied = 0
  for (const t of exec.trades) {
    const added = addDcaTradeLocally({
      planId: t.planId, code: t.code, name: t.name, source: t.source,
      todayStr, amount: t.amount, netValue: t.netValue, shares: t.shares, estimated: !!t.estimated
    })
    if (added) applied++
    const plan = getPlans().find(p => p.id === t.planId)
    if (plan && plan.lastExecutedDate !== todayStr) {
      updateDCAPlan(plan.id, {
        lastExecutedDate: todayStr,
        executedCount: (plan.executedCount || 0) + (added ? 1 : 0),
        totalInvested: (plan.totalInvested || 0) + (added ? t.amount : 0)
      })
    }
  }
  return applied
}

/** 本机已执行但云端没有台账时，把本机今天的执行结果发布到云端（覆盖「离线执行后联网」的场景） */
async function publishLocalDoneToCloud(todayStr: string, planIds: string[]): Promise<boolean> {
  if (!hasGitHubToken() || !planIds.length) return false
  const cloud = await readDcaCloudState(0)
  const trades = getTrades()
  const picked = planIds
    .map(id => ({ id, t: trades.find(x => x.id === dcaTradeId(id, todayStr)) }))
    .filter(x => x.t)
  const cashDelta: Record<string, number> = {}
  for (const x of picked) {
    const src = (x.t as any).source as string
    cashDelta[src] = (cashDelta[src] || 0) - (x.t!.amount || 0)
  }
  const exec: DcaCloudExecution = {
    status: 'done',
    deviceId: getDeviceId(),
    claimedAt: Date.now(),
    doneAt: Date.now(),
    planIds,
    trades: picked.map(x => ({
      planId: x.id,
      code: x.t!.code,
      name: x.t!.name,
      source: (x.t as any).source,
      amount: x.t!.amount,
      netValue: x.t!.netValue,
      shares: x.t!.shares,
      estimated: !!x.t!.estimated
    })),
    cashDelta
  }
  const state: DcaCloudState = cloud
    ? {
        ...cloud,
        executions: { ...cloud.executions, [todayStr]: exec },
        deviceId: getDeviceId(),
        updatedAt: Date.now()
      }
    : {
        version: 1,
        deviceId: getDeviceId(),
        updatedAt: Date.now(),
        plans: getPlans(),
        executions: { [todayStr]: exec }
      }
  return writeDcaCloudState(state)
}

export interface DCACloudExecutionResult extends DCAExecutionResult {
  /** 本次是否走了云端协调（false=无 Token/离线/写云失败，退化为纯本地执行） */
  cloudCoordinated: boolean
  /** 从云端恢复（本机未执行、云端已执行）的新落地笔数 */
  recovered: number
  /** 因云端正在执行（其他设备认领中）而本机跳过的笔数 */
  deferred: number
}

// [WHAT] 「今天从云端恢复了几笔 / 是否云端协调」的共享快照（localStorage，中性 key 不受版本清理影响）
// [WHY] 定投在首页(Home)或定投页执行、并把「已恢复」记到内存 ref 里的话，
//       持仓页/手机端导航条看不到这个数字。落到 localStorage 后任意页面都能读到同一份真相。
const DCA_SYNC_KEY = 'dca_today_sync'

export interface DcaTodaySync {
  /** 今天从云端恢复（他设备执行、本机同步）的笔数 */
  recovered: number
  /** 最近一次执行是否走了云端协调（false=本地模式/未配置 Token） */
  cloud: boolean
}

export function getDcaTodaySync(todayStr: string): DcaTodaySync {
  try {
    const raw = localStorage.getItem(DCA_SYNC_KEY)
    if (!raw) return { recovered: 0, cloud: false }
    const v = JSON.parse(raw) as { date?: string; recovered?: number; cloud?: boolean }
    if (v.date !== todayStr) return { recovered: 0, cloud: false } // 换日自动失效
    return { recovered: v.recovered || 0, cloud: !!v.cloud }
  } catch {
    return { recovered: 0, cloud: false }
  }
}

export function setDcaTodaySync(todayStr: string, patch: Partial<DcaTodaySync>): void {
  try {
    const prev = getDcaTodaySync(todayStr)
    localStorage.setItem(DCA_SYNC_KEY, JSON.stringify({
      date: todayStr,
      recovered: patch.recovered ?? prev.recovered,
      cloud: patch.cloud ?? prev.cloud
    }))
  } catch {
    /* 忽略：写不进去不影响定投执行 */
  }
}

// [WHAT] 「今天云端协调是否已成功处理过一次」的每日标记（localStorage，换日失效）。
// [WHY] 定投一天只需跑一次；但 executeDueDCAsCloud 会被「每 60s 自动刷新」反复调用，每次都打 GitHub gist。
//       一旦今天成功执行/恢复过一次（或确认无到期计划），就不再让自动刷新去轮询 gist，避免无谓的 GitHub 限流/请求。
//       手动下拉刷新 / 进入定投页仍可 force 触发（见 executeDueDCAsCloud 的 force 选项）。
const DCA_CLOUD_DONE_KEY = 'dca_cloud_done'

export function isDcaCloudDoneToday(todayStr: string): boolean {
  try {
    const raw = localStorage.getItem(DCA_CLOUD_DONE_KEY)
    if (!raw) return false
    const v = JSON.parse(raw) as { date?: string; done?: boolean }
    return v.date === todayStr && !!v.done
  } catch {
    return false
  }
}

export function markDcaCloudDoneToday(todayStr: string): void {
  try {
    localStorage.setItem(DCA_CLOUD_DONE_KEY, JSON.stringify({ date: todayStr, done: true }))
  } catch {
    /* 忽略 */
  }
}

/**
 * [WHAT] 云端协调版定投执行（跨设备只扣一次的核心入口）。
 * [WHY] 用户要求：电脑/手机同时登录也只扣一次；在外面用手机扣费，回来电脑端云恢复即可完全恢复数据。
 * [FLOW]
 *   1. 拉云端（强制实时）。无 Token → 退化纯本地执行（仍可买，但失去跨设备去重，会提示）。
 *   2. reconcilePlans：云端计划合并进本地（配置真源，但本地「今天已执行」不被陈旧云端覆盖）。
 *   3. 分支：
 *      a. 云端已 done → 本机 applyCloudExecution 幂等恢复（补交易/扣现金/加份额）；本机独有已执行的也补发云端。
 *      b. 云端 claimed（他人认领中且未超时）→ 本机退避不扣，等对方 done；本机若已本地执行则发布云端。
 *      c. 无记录 / 认领已过期 → 本机认领(claimed)→二次校验归属→本地执行→发布 done + 同步计划。
 * [DEDUPE] 认领软锁 + 认领后二次校验归属，覆盖「顺序打开」（手机扣了→电脑看到 done→跳过）这一 99% 真实场景；
 *         极小概率两台设备同一秒同时刷新可能各扣一次（确定性 id 保证单设备内不重复，跨设备的 1% 重复需用户手动核对）。
 */
async function executeDueDCAsCloudCore(todayStr: string): Promise<DCACloudExecutionResult> {
  const empty: DCACloudExecutionResult = { executed: [], skipped: [], cloudCoordinated: false, recovered: 0, deferred: 0 }

  const hasToken = hasGitHubToken()
  // [FIX] 用 Ex 版本区分「确实不存在(notfound)」与「云端读取瞬时失败(error，如 GitHub 429 限流)」。
  //       两者以前都被 readDcaCloudState 归一成 null → 误判为本地模式 → 徽标被钉死在「本地」。
  const probe = hasToken ? await readDcaCloudStateEx(0) : { state: null, notfound: false, error: false }
  let cloud = probe.state
  if (!cloud) {
    // [FIX] 有 Token 但云端状态 gist 尚不存在（新 Token / 首次使用）：引导创建后再读一次，
    //       否则会永久卡在「本地」模式，跨设备「只扣一次」去重永不生效。仅 notfound 才引导（error 重试无意义）。
    if (hasToken && probe.notfound) {
      const ok = await bootstrapDcaCloudState(getDCAPlans())
      if (ok) {
        const fresh = await readDcaCloudStateEx(0)
        if (fresh.state) cloud = fresh.state
      }
    }
  }
  if (!cloud) {
    // [WHAT] 进不来云端分支的原因分两类：
    //   - 无 Token / 确实无 gist 且引导失败 → 真·本地模式，徽标标「本地」没问题；
    //   - 云端读取瞬时失败（网络抖 / GitHub 429 限流）→ 不能误标「本地」，否则一次限流就让徽标永久变本地。
    // [FIX] 后者保留上一次快照的 cloud 标记，并仍本地兜底执行（保证今天不漏买），但徽标不翻转。
    const local = executeDueDCAs(todayStr)
    const genuineLocal = !hasToken || probe.notfound
    if (!genuineLocal) {
      console.warn('[定投] 云端读取瞬时失败，本次按本地兜底执行，但保留云端徽标（避免 GitHub 限流误翻本地）')
    }
    return {
      ...local,
      cloudCoordinated: genuineLocal ? false : getDcaTodaySync(todayStr).cloud,
      recovered: 0,
      deferred: 0
    }
  }

  reconcilePlans(cloud.plans)
  const plans = getPlans()
  const duePlans = plans.filter(p =>
    p.active && p.startDate <= todayStr && isScheduledDay(p, todayStr) &&
    p.lastExecutedDate !== todayStr &&
    !getTrades().some(t => t.id === dcaTradeId(p.id, todayStr))
  )
  const locallyDonePlanIds = plans
    .filter(p => p.lastExecutedDate === todayStr)
    .map(p => p.id)

  const cloudExec = cloud.executions?.[todayStr]

  // 4a. 云端已「完成」→ 本机恢复 / 幂等
  if (cloudExec && cloudExec.status === 'done') {
    const recovered = applyCloudExecution(todayStr, cloudExec)
    for (const pid of cloudExec.planIds) {
      const plan = getPlans().find(p => p.id === pid)
      if (plan && plan.lastExecutedDate !== todayStr) updateDCAPlan(pid, { lastExecutedDate: todayStr })
    }
    const missing = locallyDonePlanIds.filter(id => !cloudExec.planIds.includes(id))
    if (missing.length) await publishLocalDoneToCloud(todayStr, missing)
    // [WHAT] executed 恒为空：本分支本机「没有执行」任何扣款，只是从云端恢复。
    //       若把云端台账里已有的交易也塞进 executed，会导致每次刷新都误报「已执行 N 笔」；
    //       真正的「本次新恢复了几笔」由 recovered 表达（UI 据此提示「已恢复 N 笔」）。
    return { executed: [], skipped: [], cloudCoordinated: true, recovered, deferred: 0 }
  }

  // 4b. 云端「认领中」
  if (cloudExec && cloudExec.status === 'claimed') {
    const mine = cloudExec.deviceId === getDeviceId()
    const stale = Date.now() - (cloudExec.claimedAt || 0) > CLAIM_STALE_MS
    if (!mine && !stale) {
      if (locallyDonePlanIds.length) await publishLocalDoneToCloud(todayStr, locallyDonePlanIds)
      return { executed: [], skipped: [], cloudCoordinated: true, recovered: 0, deferred: duePlans.length }
    }
    // 我方认领 或 认领已过期 → 接管（落到 4c）
  }

  // 4c. claim + 执行 + 发布（本机是执行方）
  if (duePlans.length > 0) {
    const deviceId = getDeviceId()
    const claim: DcaCloudExecution = {
      status: 'claimed', deviceId, claimedAt: Date.now(),
      planIds: duePlans.map(p => p.id), trades: [], cashDelta: {}
    }
    const state1: DcaCloudState = {
      ...cloud, executions: { ...cloud.executions, [todayStr]: claim },
      deviceId, updatedAt: Date.now()
    }
    const claimedOk = await writeDcaCloudState(state1)
    if (!claimedOk) {
      const local = executeDueDCAs(todayStr)
      return { ...local, cloudCoordinated: false, recovered: 0, deferred: 0 }
    }
    // 二次校验：重读云端，确认我们认领的这条仍归我们（没被另一设备覆盖）
    const verify = await readDcaCloudState(0)
    const cur = verify?.executions?.[todayStr]
    if (!cur || cur.deviceId !== deviceId) {
      if (cur && cur.status === 'done') {
        const recovered = applyCloudExecution(todayStr, cur)
        return { executed: [], skipped: [], cloudCoordinated: true, recovered, deferred: 0 }
      }
      return { executed: [], skipped: [], cloudCoordinated: true, recovered: 0, deferred: duePlans.length }
    }
    // 认领确认归我 → 本地执行
    const local = executeDueDCAs(todayStr)
    const cashDelta: Record<string, number> = {}
    for (const it of local.executed) {
      cashDelta[it.plan.source] = (cashDelta[it.plan.source] || 0) - it.amount
    }
    const done: DcaCloudExecution = {
      status: 'done', deviceId, claimedAt: claim.claimedAt, doneAt: Date.now(),
      planIds: local.executed.map(it => it.plan.id),
      trades: local.executed.map(it => {
        const t = getTrades().find(x => x.id === it.tradeId)
        return {
          planId: it.plan.id, code: it.plan.code, name: it.plan.name, source: it.plan.source,
          amount: it.amount, netValue: it.netValue, shares: it.shares, estimated: !!t?.estimated
        }
      }),
      cashDelta
    }
    const state2: DcaCloudState = {
      ...cloud, executions: { ...cloud.executions, [todayStr]: done },
      deviceId, updatedAt: Date.now()
    }
    await writeDcaCloudState(state2)
    await pushPlansToCloud()
    return { executed: local.executed, skipped: local.skipped, cloudCoordinated: true, recovered: 0, deferred: 0 }
  }

  // 4d. 无到期计划，但本机今天已执行过（可能离线执行）→ 发布到云端
  if (locallyDonePlanIds.length) {
    await publishLocalDoneToCloud(todayStr, locallyDonePlanIds)
    const executed = locallyDonePlanIds.map(id => {
      const plan = getPlans().find(p => p.id === id)
      const t = getTrades().find(x => x.id === dcaTradeId(id, todayStr))
      return plan && t
        ? { plan, amount: t.amount, netValue: t.netValue, shares: t.shares, date: todayStr, tradeId: dcaTradeId(id, todayStr) }
        : null
    }).filter(Boolean) as DCAExecutedItem[]
    return { executed, skipped: [], cloudCoordinated: true, recovered: 0, deferred: 0 }
  }

  // 4e. 无事可做：仍把本地计划同步到云端（配置变更后让另一端能拉到）
  await pushPlansToCloud()
  return empty
}

/**
 * [WHAT] 云端协调执行的对外入口 = 核心流程 + 把「已恢复/是否云端」落到共享快照。
 * [WHY] 快照存 localStorage，让没执行定投的页面（持仓页导航条、手机端）也能显示同一份今日状态。
 * [OPT] force=true 时忽略「今日已处理」标记，强制再跑一次（手动下拉刷新 / 进入定投页想要主动同步时用）；
 *       自动 60s 轮询默认 force=false，今天成功处理过一次后就不再打 GitHub gist，避免无谓限流。
 */
export async function executeDueDCAsCloud(todayStr: string, opts?: { force?: boolean }): Promise<DCACloudExecutionResult> {
  // [FIX] 今日云端协调已成功处理过一次（执行/恢复/确认无到期），自动刷新不再重复轮询 gist。
  //       [BUG修复] 短路返回必须 recovered/executed=0：否则会把快照里昨日已恢复的笔数又带回来，
  //       导致每次自动刷新都弹「已从云端恢复 N 笔」。状态条读的是共享快照（getDcaTodaySync），不依赖此返回值，故清零安全。
  if (!opts?.force && isDcaCloudDoneToday(todayStr)) {
    const prev = getDcaTodaySync(todayStr)
    return {
      executed: [], skipped: [],
      cloudCoordinated: prev.cloud,
      recovered: 0,
      deferred: 0
    }
  }
  const res = await executeDueDCAsCloudCore(todayStr)
  try {
    const prev = getDcaTodaySync(todayStr)
    setDcaTodaySync(todayStr, {
      // 「已恢复」取当日累计最大值：同日多次刷新时，后一次 recovered=0 不该把之前记的清掉
      recovered: Math.max(prev.recovered, res.recovered),
      cloud: res.cloudCoordinated
    })
    // [FIX] 今日云端协调成功进入终态（执行/恢复过，或确认无到期计划）即标记完成，自动轮询停止；
    //       唯独「其他设备认领中(deferred)」不标记——本机需继续轮询，等对方 done 后本机再恢复。
    if (res.cloudCoordinated && res.deferred === 0) {
      markDcaCloudDoneToday(todayStr)
    }
  } catch {
    /* 忽略：快照写失败不影响定投执行 */
  }
  return res
}

// ============ 统计 ============

// [WHAT] 把「每期金额」折算成「每日平均定投额」的假设：
//   每周 5 个交易日、每月约 21 个交易日。用于「剩余资金可定投天数」估算，UI 会注明。
export const TRADING_DAYS_PER_WEEK = 5
export const TRADING_DAYS_PER_MONTH = 21

/** 单计划日均定投额（元/交易日）。未启用为 0。 */
export function planDailyRate(plan: DCAPlan): number {
  if (!plan.active || !(plan.amount > 0)) return 0
  switch (plan.frequency) {
    case 'daily': return plan.amount
    case 'weekly': return plan.amount / TRADING_DAYS_PER_WEEK
    case 'monthly': return plan.amount / TRADING_DAYS_PER_MONTH
    default: return 0
  }
}

export interface DCAAccountStat {
  source: string
  /** 账户现金余额 */
  cash: number
  /** 该账户所有启用计划的日均定投额合计（元/交易日） */
  dailyRate: number
  /** 启用计划数 */
  planCount: number
  /** 累计投入金额 */
  totalInvested: number
  /** 累计执行次数 */
  executedCount: number
  /** 剩余资金可定投天数 = cash / dailyRate（dailyRate=0 时为 Infinity） */
  daysRemaining: number
}

/**
 * [WHAT] 按账户统计定投数据。
 * [WHY] 用户要求「按账户计算：每天定投多少、剩余资金还能定投多少天」。
 * [NOTE] 只对 ali/TX/JD 三账户统计（与现金余额口径一致）。
 */
export function computeDCAStats(plans: DCAPlan[], cashMap: Record<string, number>): DCAAccountStat[] {
  const map: Record<string, DCAAccountStat> = {}
  for (const acc of ['ali', 'TX', 'JD']) {
    map[acc] = {
      source: acc,
      cash: cashMap[acc] || 0,
      dailyRate: 0,
      planCount: 0,
      totalInvested: 0,
      executedCount: 0,
      daysRemaining: 0
    }
  }
  for (const p of plans) {
    if (!(p.source in map)) continue
    map[p.source].dailyRate += planDailyRate(p)
    if (p.active) map[p.source].planCount += 1
    map[p.source].totalInvested += p.totalInvested || 0
    map[p.source].executedCount += p.executedCount || 0
  }
  for (const k of Object.keys(map)) {
    const s = map[k]
    s.daysRemaining = s.dailyRate > 0 ? Math.floor(s.cash / s.dailyRate) : Infinity
  }
  return Object.values(map)
}

/**
 * [WHAT] 由本地完整计划折算「每账户每日定投额」（元/交易日）。
 * [WHY] 备份 payload 只带这个派生值，不再带整套计划（手机端用不到也无法同步执行）。
 */
export function computeDCADailyRateMap(): Record<string, number> {
  const plans = getDCAPlans()
  const map: Record<string, number> = {}
  for (const p of plans) {
    if (!(p.active && p.amount > 0)) continue
    map[p.source] = (map[p.source] || 0) + planDailyRate(p)
  }
  return map
}

/**
 * [WHAT] 取某账户当前「每日定投额」：优先本地完整计划（网页端），否则回落到备份恢复的每日额度（手机端）。
 * [WHY] 手机端没有完整 DCA 计划，但恢复备份后会落地 dca_daily_rates，足以驱动「定投¥/天 / 可投天数」展示。
 */
export function getAccountDailyRateMap(): Record<string, number> {
  const fromPlans = computeDCADailyRateMap()
  if (Object.keys(fromPlans).length > 0) return fromPlans
  return getDCADailyRates()
}
