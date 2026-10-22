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

import { STORAGE_KEYS, getPanoramaAccountCash, savePanoramaAccountCash } from '@/utils/storage'
import { isWorkday } from '@/utils/navDate'
import { useHoldingStore } from '@/stores/holding'
import { createTrade } from '@/composables/useFundTrade'

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

export interface DCAExecutedItem {
  plan: DCAPlan
  amount: number
  netValue: number
  shares: number
  date: string
}
export interface DCASkippedItem {
  plan: DCAPlan
  reason: 'no_value' | 'insufficient_cash'
}
export interface DCAExecutionResult {
  executed: DCAExecutedItem[]
  skipped: DCASkippedItem[]
}

/**
 * [WHAT] 执行「今天」到期的定投计划。
 * [WHY] 放在刷新/挂载时调用：刷新后持仓已带最新 currentValue（净值或估值），可直接作为买入价。
 * [GUARD] 仅今天这一交易日、且 lastExecutedDate !== today、active、startDate<=today 才执行；
 *         同一天多次刷新只扣一次。现金不足 / 无估值 则跳过并记录原因（不扣款、不标记已执行）。
 * [RETURN] 本次执行与跳过的计划，供 UI 提示。
 */
export function executeDueDCAs(todayStr: string): DCAExecutionResult {
  const result: DCAExecutionResult = { executed: [], skipped: [] }
  const plans = getPlans()
  if (!plans.length) return result

  const store = useHoldingStore()

  for (const plan of plans) {
    if (!plan.active) continue
    if (plan.startDate > todayStr) continue
    if (plan.lastExecutedDate === todayStr) continue
    if (!isScheduledDay(plan, todayStr)) continue

    const holding = store.holdings.find(h => h.code === plan.code)
    const netValue = holding?.currentValue && holding.currentValue > 0 ? holding.currentValue : 0
    const isNav = !!holding?.isNav
    if (!(netValue > 0)) {
      plan.lastSkippedDate = todayStr
      plan.lastSkipReason = 'no_value'
      result.skipped.push({ plan, reason: 'no_value' })
      continue
    }

    const curCash = getPanoramaAccountCash()[plan.source] || 0
    if (curCash < plan.amount) {
      plan.lastSkippedDate = todayStr
      plan.lastSkipReason = 'insufficient_cash'
      result.skipped.push({ plan, reason: 'insufficient_cash' })
      continue
    }

    // [WHAT] 以当前净值/估值买入一笔 auto_invest 交易；createTrade 内部按 adjustCash 扣减账户现金
    const shares = plan.amount / netValue
    createTrade({
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

    // [WHAT] 累加持仓份额（与加仓对话框口径一致），市值由下次估值刷新按新份额重算
    if (holding) {
      const updated = {
        ...holding,
        shares: (holding.shares || 0) + shares,
        currentValue: netValue
      }
      store.addOrUpdateHolding(updated)
    }

    plan.lastExecutedDate = todayStr
    plan.executedCount = (plan.executedCount || 0) + 1
    plan.totalInvested = (plan.totalInvested || 0) + plan.amount
    plan.lastSkipReason = undefined
    result.executed.push({ plan, amount: plan.amount, netValue, shares, date: todayStr })
  }

  saveDCAPlans(plans)
  return result
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
