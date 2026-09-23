// [WHY] 持仓数据状态管理，计算收益和汇总统计
// [WHAT] 管理用户录入的持仓信息，结合实时估值计算浮动盈亏
// [WHAT] 支持 A类/C类基金费用计算
// [DEPS] 依赖 fund store 获取实时估值，依赖 storage 持久化数据

import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { HoldingRecord, HoldingSummary } from '@/types/fund'
import { STORAGE_KEYS, getHoldings, saveHoldings, removeFromWatchlist, updateTradesByCode, getTrades, saveTrades, isStarredFund } from '@/utils/storage'
// [REFACTOR] getProgressDateStr / isNavUpToDate 已抽到 utils/navDate.ts，与 fundFast.ts 共用同一份
import { isNavUpToDate, getProgressDateStr, getCalendarDateStr } from '@/utils/navDate'
import { getTodayFirstBuyCorrection, createTrade } from '@/composables/useFundTrade'
import { updateFundNetValue } from '@/utils/storage'
import { fetchFundAccurateData, type FundAccurateData, clearHoldingsCache as clearFundHoldingsCache } from '@/api/fundFast'
import { fetchNetValueHistoryFast } from '@/api/fundFast'
import { predictTrend, calculateReturnAnalysis, calculateFundScore, type TrendPrediction, type FundScore } from '@/utils/statistics'

/** 持仓项（包含实时估值和收益计算） */
export interface HoldingWithProfit extends HoldingRecord {
  /** 当前估值（净值） */
  currentValue?: number
  /** 当前市值 */
  marketValue?: number
  /** 持有收益金额 */
  profit?: number
  /** 持有收益率 */
  profitRate?: number
  /** 当日涨跌幅 */
  todayChange?: string
  /** 当日收益金额 */
  todayProfit?: number
  /** 是否加载中 */
  loading?: boolean
  /** 趋势预测 */
  trendPrediction?: TrendPrediction
  /** [DEPRECATED] 数据来源（'nav' | 'estimate' | 'fallback'）—— 仅日志排查，判定一律用 isNav */
  dataSource?: string
  /** currentValue 用的是净值还是估值（唯一判定出口，等价于 resolveFundValue().isNav） */
  isNav?: boolean
  /** 最新净值/估值的日期 */
  valueDate?: string
  /** 是否已更新（根据日期判断） */
  isUpdated?: boolean
  /** 添加后累计涨跌幅（仅观察账户） */
  addedGain?: number
  /** 综合评分 */
  fundScore?: FundScore
}

/**
 * [FIX] 判断「持仓手上这期净值是不是当前该有的那一期」
 * [WHY] 不能再用持久化的 h.isUpdated 布尔直接当跳过条件：
 *       isUpdated 一旦被置 true 就再也不会因为日历日推进而复位，
 *       导致隔了几天再打开 App 时，持仓还停在「上次更新那天的净值 / 涨幅」，
 *       和账户实际更新后的净值对不上（全景左侧持仓、持仓页都会错显）。
 *       改用持仓自己持有的净值日期 valueDate 重新跑 isNavUpToDate。
 *
 *       ⚠️ **必须用自然日口径（不传 today → 默认 getCalendarDateStr()）**：
 *       进度条口径（getProgressDateStr）在 09:00 前会归属上一工作日，对 QDII 来说
 *       `prevWorkdaySync(昨日) === valueDate` 会恒为 true，导致「早上一开 App
 *       仍然停在更早的旧净值」不重拉。
 *       真实案例：2026-09-16 0:50 QDII 基金 024239，valueDate=2026-09-14、
 *       stored todayChange=-3.24% 是 9/15 盘中的估值进度条口径，9/15 收盘后已发布
 *       的真净值 -3.77% 永远进不来 —— 自然日 (2026-09-16) + QDII 判定
 *       `prevWorkday = 2026-09-15`，所以 9/14 既不是 9/16 也不是 9/15 → 不 current → 重拉。
 * @returns true = 这期净值就是当前该拿到的那一期（可安全复用，无需重拉）
 */
// [市值排查] 调成本份额追踪日志开关。如需启用，把 COST_ADJUST_TRACE 改为 true（或让 WorkBuddy 打开"市值排查log"）
const COST_ADJUST_TRACE = false
const COST_ADJUST_TRACE_CODE = '017811'
function holdingNavIsCurrent(h: any): boolean {
  if (!h || !(h.currentValue > 0)) return false
  return isNavUpToDate({
    nav: h.currentValue,
    navDate: h.valueDate || '',
    isQDII: h.isQDII === true
    // today 不传 → 默认 getCalendarDateStr()（自然日口径，与 MEMORY.md "两个今天"一致）
  })
}

export const useHoldingStore = defineStore('holding', () => {
  // ========== State ==========

  /** 持仓列表（包含收益计算） */
  const holdings = ref<HoldingWithProfit[]>([])

  // [FIX] 跨标签页同步：全景大屏用 window.open('_blank') 在新窗口打开详情，
  //       Detail 改了来源/持仓写回 localStorage 后，原全景标签页的 holdings 是内存态、不会自动更新，
  //       导致「改了来源、回全景刷新还在量化观察」。监听 storage 事件：别的标签页改了 fund_holdings 就重新读回内存。
  // [WHY] storage 事件只在【其它】标签页写入时触发（本标签页写不触发），正好覆盖「Detail 改、全景读」的跨窗口场景。
  let storageSyncRegistered = false
  function registerStorageSync() {
    if (storageSyncRegistered || typeof window === 'undefined') return
    storageSyncRegistered = true
    window.addEventListener('storage', (e: StorageEvent) => {
      if (e.key === STORAGE_KEYS.HOLDINGS) {
        syncHoldingsFromStorage()
      }
    })
  }

  /** 轻量回读：用 localStorage 当前值覆盖内存 holdings（跨标签页同步 / 手动刷新兜底），不重新拉估值 */
  function syncHoldingsFromStorage() {
    const stored = getHoldings()
    holdings.value = stored.map((r: any) => ({ ...r, loading: false }))
  }

  // 注册跨标签页 storage 监听（只注册一次）
  registerStorageSync()

  /** 是否正在刷新 */
  const isRefreshing = ref(false)

  // ========== Getters ==========

  /** 持仓汇总统计 */
  const summary = computed<HoldingSummary>(() => {
    let totalValue = 0
    let totalProfit = 0
    let todayProfit = 0
    let totalCost = 0

    holdings.value.forEach((h) => {
      if (h.marketValue !== undefined) {
        totalValue += h.marketValue
      }
      totalProfit += h.profit || 0
      if (h.todayProfit !== undefined) {
        todayProfit += h.todayProfit
      }
      // [WHAT] 总成本 = 买入净值 × 份额 累加；用于真组合 ROI（总收益÷总成本，等同单基金 addedGain 口径）
      totalCost += (h.shares || 0) * (h.buyNetValue || 0)
    })

    // [FIX] 真组合 ROI = 总收益 ÷ 总成本；禁止用 ÷总市值（profit/marketValue 下跌时偏激，非真 ROI）
    const totalProfitRate = totalCost > 0 ? (totalProfit / totalCost) * 100 : 0

    return {
      totalValue,
      totalProfit,
      totalCost,
      totalProfitRate,
      todayProfit
    }
  })

  /** 持仓基金代码列表 */
  const holdingCodes = computed(() => holdings.value.map((h) => h.code))

  // ========== Actions ==========

  /**
   * 初始化持仓列表
   * [WHY] APP 启动时从本地存储恢复数据
   * [FIX] 改为 async，等待 refreshEstimates() 完成，确保 isUpdated 字段被正确设置
   */
  async function initHoldings() {
    const records = getHoldings()

    const cleanedRecords = records.map((r: any) => {
      const {
        shareClass,
        serviceFeeRate,
        serviceFeeDeducted,
        lastFeeDate,
        lastUpdateDate,
        originProfit,
        lastTodayProfit,
        ...rest
      } = r

      const industrySectors = Array.isArray(rest.industrySectors)
        ? rest.industrySectors.join(', ')
        : rest.industrySectors

      // 迁移中文 source → 英文 key（PanoramaDashboard 来源弹窗曾用中文值）
      const sourceMap: Record<string, string> = {
        '支付宝': 'ali',
        '腾讯': 'TX',
        '京东': 'JD',
        '观察': 'observe'
      }
      const source = (sourceMap[rest.source] ?? rest.source) || undefined

      // [MIGRATION] isNav 是新字段，存量数据里没有。
      // 从旧的 dataSource 回灌一次，否则老持仓在刷新前会从「净值」错显示成「估值」。
      const isNav = rest.isNav ?? (rest.dataSource === 'nav')

      return {
        ...rest,
        industrySectors,
        source,
        isNav
      }
    })

    const sourceMap: Record<string, string> = {
      '支付宝': 'ali',
      '腾讯': 'TX',
      '京东': 'JD',
      '观察': 'observe'
    }
    const recordsNeedSourceMigration = records.some((r: any) => sourceMap[r.source])

    const needsCleanup = records.some((r: any) =>
      r.shareClass !== undefined ||
      r.serviceFeeRate !== undefined ||
      r.serviceFeeDeducted !== undefined ||
      r.lastFeeDate !== undefined ||
      r.lastUpdateDate !== undefined ||
      r.originProfit !== undefined ||
      r.lastTodayProfit !== undefined ||
      Array.isArray(r.industrySectors) ||
      // isNav 是本轮新增字段：即使旧记录没有 dataSource，也要落盘一次迁移结果
      r.isNav === undefined
    ) || recordsNeedSourceMigration

    holdings.value = cleanedRecords.map((r) => ({
      ...r,
      loading: true
    }))
    // [市值排查] 仅当开关打开时才追踪
    if (COST_ADJUST_TRACE) {
      const traced = cleanedRecords.filter((r: any) => r.code === COST_ADJUST_TRACE_CODE)
      if (traced.length) console.log('[COST-ADJUST][initHoldings] 从存储读取:', traced.map((r: any) => ({ code: r.code, shares: r.shares, marketValue: r.marketValue, valueDate: r.valueDate, isNav: r.isNav, isUpdated: r.isUpdated })))
    }

      if (cleanedRecords.length > 0) {
      if (needsCleanup) {
        saveHoldings(cleanedRecords)
        console.log('[数据迁移] 已清理旧字段并保存')
      }
      // [FIX] 等待 refreshEstimates() 完成，确保 isUpdated 字段被正确设置
      await refreshEstimates()
      // [WHAT] 自愈：补齐「缺买入交易记录」的持仓（老代码单加路径从不 addTrade → K线无买点）
      await backfillBuyTrades()
    }
  }

  /**
   * 刷新所有持仓的估值和收益
   * [WHAT] 使用综合数据获取函数，确保数据准确
   * [FIX] 性能优化：已更新的基金（isUpdated === true）直接跳过，不需要再调 API
   *       净值已发布的基金没有估值变化，跳过可以节省大量重仓股价拉取开销
   */
  /**
   * [WHAT] 自愈：为「缺买入交易记录」的持仓补建 buy 交易（K线买点数据源）。
   * [WHY] 修复前的单加路径从不 addTrade，导致部分存量持仓（如京东账户早期添加的基金）
   *       在 K线图上没有买点。每个持仓都应有对应的 buy 交易（这是买点渲染的唯一数据源），
   *       缺它的只可能是老代码创建的持仓，补建即恢复不变式。
   * [SCOPE] 不限 buyDate：跨天重开 App 也要能修复（原 buyDate===今天 护栏会让「昨天添加、今天才重开」
   *         的基金永久漏掉买点）。只补买点 + 保留现有成本基数（buyNetValue/shares 一律不改写），
   *         不按今天价重算份额，避免破坏存量持仓的真实成本。已有 buy 交易的持仓（含加仓/减仓过的）跳过。
   */
  async function backfillBuyTrades(): Promise<void> {
    const allTrades = getTrades()
    let holdingsChanged = false

    for (const h of holdings.value) {
      if (!h) continue
      // 已有 buy 交易 → 买点已在，跳过（加仓/减仓过的也在此跳过，绝不重复创建或覆盖）
      if (allTrades.some(t => t.code === h.code && t.type === 'buy')) continue

      // 买入净值：优先持仓记录的买入净值，兜底用当前净值（保证交易记录有合法价格）
      const buyNet = h.buyNetValue > 0 ? h.buyNetValue : (h.currentValue || 0)
      if (!(buyNet > 0) || !(h.shares > 0)) continue

      // 投入本金 = 现有份额 × 买入净值（保留用户真实成本基数，不重新算份额）
      const amount = h.shares * buyNet

      // 用持仓记录的买入净值建一笔 buy 交易，仅补「买点标记」，成本基数沿用不变
      createTrade({
        code: h.code,
        name: h.name,
        type: 'buy',
        date: h.buyDate,
        amount,
        netValue: buyNet,
        shares: h.shares,
        estimated: false, // 存量买入净值是真实净值，不参与晚上估值重算
        source: h.source
      })

      holdingsChanged = true
      console.log(`[backfillBuyTrades] 补齐买点: ${h.code} amount=${amount} buyNetValue=${buyNet}`)
    }

    if (holdingsChanged) saveHoldings(holdings.value as any[])
  }

  async function refreshEstimates() {
    if (holdings.value.length === 0) {
      isRefreshing.value = false
      return
    }

    isRefreshing.value = true
    const holdingsList = [...holdings.value]

    try {
      // [FIX] 只刷新「手上净值日期不是当前这一期」的基金（净值未发布 / 跨天未更新，需要重拉）
      // 已更新（valueDate 已是今天或盘前归上一工作日）的基金直接复用 holding 数据，无需重复拉取
      const staleHoldings = holdingsList.filter(h => !holdingNavIsCurrent(h))

      // 先处理已更新的基金：直接复用 holding 数据，不调 API
      holdingsList.forEach(holding => {
        if (holdingNavIsCurrent(holding)) {
          const data = {
            code: holding.code,
            name: holding.name || '',
            nav: holding.currentValue,
            navDate: holding.valueDate || '',
            navChange: 0,
            estimate: 0,
            estimateTime: '',
            estimateChange: 0,
            currentValue: holding.currentValue,
            dayChange: parseFloat(holding.todayChange || '0'),
            // [WHAT] 这里塞的是 holding.currentValue，按净值处理
            isNav: true,
            dataSource: 'nav' as const,
            // 这些持仓已被 holdingStore 判定为 isUpdated，净值就是当前这一期
            navIsCurrent: true,
            updateTime: new Date().toISOString()
          }
          updateHoldingWithAccurateData(holding.code, data)
        }
      })

      // 再处理未更新的基金（需要估值）
      if (staleHoldings.length > 0) {
        const results = await Promise.all(
          staleHoldings.map(holding => fetchFundAccurateData(holding.code, holding.isQDII).catch(() => null))
        )

        results.forEach((data, index) => {
          if (data) {
            updateHoldingWithAccurateData(staleHoldings[index].code, data)
          } else {
            const item = holdings.value.find((h) => h.code === staleHoldings[index].code)
            if (item) item.loading = false
          }
        })
      }

      // [WHAT] 净值公布后：把「今天首次添加（单笔买入、无减仓）」的持仓份额用正式净值重算，
      //        同时把估值交易记录转正。覆盖「持仓页刷新」场景（星标/详情之外最直接的入口）。
      // [WHY] 交易时间内添加用盘中估值算份额，晚上净值公布后交易记录已被 updateTradesByCode 改净值，
      //       但持仓 shares/buyNetValue 还是估值口径 → 不改会凭空差一个估值误差。
      // [SCOPE] 只动「今天买入 + 仅一笔买入 + 无减仓」的持仓，历史/加仓/减仓持仓零误伤。
      const today = getCalendarDateStr()
      let holdingChanged = false
      holdings.value.forEach(h => {
        if (!holdingNavIsCurrent(h)) return
        const nav = h.currentValue || 0
        const navDate = h.valueDate || ''
        if (!(nav > 0)) return
        // 估值交易转正（无 estimated 交易时为 no-op）
        updateTradesByCode(h.code, nav, navDate, true)
        const c = getTodayFirstBuyCorrection(h.code, nav, h.buyDate, today)
        if (c) {
          h.shares = c.shares
          h.buyNetValue = c.buyNetValue
          holdingChanged = true
        }
      })
      if (holdingChanged) saveHoldings(holdings.value as any[])
    } finally {
      isRefreshing.value = false
    }
  }

  /**
   * 使用准确数据更新持仓
   * [WHAT] 接收多源验证后的准确数据，计算收益
   * [FIX] updateHoldingWithAccurateData **本身是同步写回**（没有 await 在持有数据更新路径上）
   *       trendPrediction / fundScore 拆到独立的异步后台任务，绝不阻塞 holding 写回
   *       彻底消除竞态条件：调成本 → 存 holding → 任何旧的 updateHoldingWithAccurateData 
   *       都不可能再用快照覆盖，因为写回是同步的、且基底是实时读的 holdings.value[index]
   */
  function updateHoldingWithAccurateData(code: string, data: FundAccurateData): void {
    const index = holdings.value.findIndex((h) => h.code === code)
    if (index === -1) return

    const currentValue = data.currentValue
    updateFundNetValue(code, currentValue)

    // [EDGE] 净值无效只更新 name
    if (currentValue <= 0) {
      const h = holdings.value[index]
      holdings.value[index] = { ...h, name: data.name || h.name, loading: false }
      return
    }

    // 实时读取 holding（不是快照！每次都读最新的）
    const h = holdings.value[index]

    // 基于最新 holding 算 marketValue / profit
    const shares = h.shares || 0
    // [市值排查] 仅当开关打开时才追踪
    if (COST_ADJUST_TRACE && code === COST_ADJUST_TRACE_CODE) console.log('[COST-ADJUST][updateHolding]', code, 'inputShares=', shares, 'buyNetValue=', h.buyNetValue, 'currentValue=', currentValue, '=> marketValue=', (shares * currentValue).toFixed(2), 'profit=', ((currentValue - (h.buyNetValue || currentValue)) * shares).toFixed(2))
    const buyNav = h.buyNetValue || currentValue
    const marketValue = shares * currentValue
    const profit = (currentValue - buyNav) * shares
    const profitRate = marketValue > 0 ? profit / marketValue * 100 : 0
    const prevNav = data.dayChange !== 0 ? currentValue / (1 + data.dayChange / 100) : currentValue
    const todayProfit = shares * prevNav * (data.dayChange / 100)

    const isQDII = h.isQDII === true
    // [WHAT] 判断净值是否已更新（进度条口径）
    // [WHY] 与 fundFast.ts 共用 utils/navDate.ts 的 isNavUpToDate，避免两份公式各自漂移
    // [SCOPE] 全项目**只有这里**用进度条口径 getProgressDateStr()：
    //         9 点前归属上一交易日，是刻意设计的宽限期，否则整个早上进度条都是空的。
    //         其余一切场景（估值、交易守卫、缓存）都用 isNavUpToDate 的默认自然日。
    const isUpdated = isNavUpToDate({
      nav: data.nav,
      navDate: data.navDate,
      isQDII,
      today: getProgressDateStr()
    })

    let addedGain: number | undefined
    if (buyNav > 0 && currentValue > 0) {
      addedGain = ((currentValue - buyNav) / buyNav) * 100
    }

    // 同步写回！基底是实时 holding，不会有竞态
    const updated = {
      ...h,
      name: data.name || h.name,
      currentValue,
      marketValue,
      profit,
      profitRate,
      todayChange: data.dayChange.toFixed(2),
      todayProfit,
      loading: false,
      dataSource: data.dataSource,
      // [WHY] 直接透传 fetchFundAccurateData 的结论，本层不做二次推导
      isNav: data.isNav,
      valueDate: data.navDate || data.estimateTime?.split(' ')[0],
      isUpdated,
      addedGain,
      // trendPrediction / fundScore 不在这里写 —— 下面后台任务独立更新
    }

    // console.log(`[updateHolding] ${code} shares=${updated.shares?.toFixed(2)}, buyNet=${updated.buyNetValue?.toFixed(4)}, marketValue=${updated.marketValue?.toFixed(2)}, profit=${updated.profit?.toFixed(2)}, isUpdated=${isUpdated}`)

    holdings.value[index] = updated
    saveHoldings(holdings.value as any[])

      // [FIX] trendPrediction / fundScore 异步后台任务，独立更新
      // 这个任务可能稍后完成，但它只更新 trendPrediction / fundScore，spread ...holdings.value[index]
      // 时会读最新 holding，不会覆盖 shares / buyNetValue 等用户可编辑字段
      ; (async () => {
        try {
          const historyResult = await fetchNetValueHistoryFast(code, 90)
          const historyData = historyResult.records || []
          if (historyData && historyData.length >= 30) {
            const netValuePoints = historyData.map(item => ({
              date: item.date,
              value: item.netValue,
              change: item.changeRate
            }))
            const trendPrediction = predictTrend(netValuePoints)
            const returnAnalysis = calculateReturnAnalysis(netValuePoints)
            const fundScore = calculateFundScore(returnAnalysis)

            // 再次读最新 holding 作为基底，不覆盖 shares / buyNetValue
            const h2 = holdings.value[index]
            if (h2) {
              h2.trendPrediction = trendPrediction
              h2.fundScore = fundScore
              saveHoldings(holdings.value as any[])
            }
          }
        } catch (error) {
          // 静默：后台评分失败不影响主流程
        }
      })()
  }

  /**
   * 添加或更新持仓
   * @param record 持仓记录
   */
  function addOrUpdateHolding(record: HoldingRecord) {
    // [FIX] 同 code 可能有多条持仓记录（老数据/导入残留/同 code 重复添加——详见 removeHolding 注释）。
    //       旧逻辑用 findIndex 只更新【第一条】，导致「改来源」这种操作只动了其中一条：
    //       剩下的 observe(量化观察) 记录仍挂在观察里 → 用户改完来源刷新后基金还在量化观察（008984 财通科技创新复现）。
    //       这里的写回与 removeHolding 的 filter(h=>h.code!==code) 保持一致：code 维度全量更新，杜绝「改了但没完全改」。
    const matched = holdings.value
      .map((h, i) => (h.code === record.code ? i : -1))
      .filter((i) => i > -1)

    if (matched.length > 0) {
      // [FIX] 同一 code 只应有一条持仓记录（同 code 多条是老数据/导入残留/重复添加造成的脏数据）。
      //       以第一条为基底合并 record，再把【所有】同 code 记录删掉、用这唯一一条回填——
      //       既保证「改来源/加仓」对所有重复记录生效（根治「改了来源还在量化观察」），
      //       又顺手把脏重复数据收敛成一条（避免全景/首页重复展示 + 市值被重复累加）。
      //       [WHY] 不能像旧写法那样对 precomputed 索引逐个 splice——splice 会让后续索引错位，
      //             第二次 splice 命中错误元素。这里用 filter+push 彻底避开索引位移。
      const baseIndex = matched[0]
      const base = holdings.value[baseIndex]
      const updatedHolding = {
        ...base,
        ...record,
        loading: false
      }

      // [FIX] 市值恒等于「份额 × 当前净值/估值」。加仓/减仓改了 shares 后必须同步重算 marketValue，
      //       否则持仓页/全景的总市值停留在旧值（002163 加仓 5w 后仍显示 12.11W）。
      // [WHY] 旧逻辑只做字段合并、不重算市值——submitTrade 改 shares 后持久化的还是旧 marketValue。
      //       所有调用方传入的 (shares, currentValue) 与 marketValue 本应一致，这里强制对齐不会误伤：
      //       submitCostAdjust 落入的 marketValue = newShares × latestNetValue，重算完全等价。
      const mvShares = (updatedHolding.shares as number) || 0
      const mvCurrent = (updatedHolding.currentValue as number) || 0
      if (mvShares > 0 && mvCurrent > 0) {
        updatedHolding.marketValue = mvShares * mvCurrent
      }

      // 先移除全部同 code 记录（含重复），再在基底原位置回填唯一一条
      holdings.value = holdings.value.filter((h) => h.code !== record.code)
      const insertAt = Math.min(baseIndex, holdings.value.length)
      holdings.value.splice(insertAt, 0, updatedHolding)
    } else {
      const newHolding = {
        ...record,
        loading: false
      }

      holdings.value.push(newHolding)
    }
    // [FIX] 直接存整个内存数组（holdings.value 是唯一权威），杜绝 storage.ts upsertHolding 的 read-modify-write 竞态
    saveHoldings(holdings.value as any[])
  }

  /**
   * 删除持仓
   * [FIX] 删除「这个基金」= 从账户中移除：
   *   1. 移除该 code 的【全部】持仓记录（原实现 findIndex+splice 只删第一条，
   *      若同一 code 存在两条记录——如真实账户 + 量化观察(observe) 或老数据/导入残留——
   *      删一次只删一条，剩下那条仍会出现在量化观察里）。
   *   2. 顺手把自选(观察)也清掉，保证「删除基金」在全渠道语义一致：
   *      量化观察本身就是 source==='observe' 的账户，不是独立数据，不该删了持仓还在别处残留。
   * [WHY] 用户心智：详情/首页长按/自选列表任意一处删除该基金，都应把它从账户里移走。
   */
  function removeHolding(code: string) {
    const before = holdings.value.length
    holdings.value = holdings.value.filter((h) => h.code !== code)
    if (holdings.value.length !== before) {
      saveHoldings(holdings.value as any[])
    }
    removeFromWatchlist(code)
    // [FIX] 删持仓后级联交易记录：仍星标（在星标K线继续看）→ 保留买点（旧需求：删基金星标K线仍留点位）；
    //       未星标 → 删掉该 code 全部交易，避免孤儿交易一直挂在 K线买点 / 交易记录上。
    //       [WHY] 之前 removeHolding 完全不碰交易，导致「删了持仓的基金」买点永不消失、且与新版「买点=交易记录」口径打架。
    if (!isStarredFund(code)) {
      const remaining = getTrades().filter(t => t.code !== code)
      if (remaining.length !== getTrades().length) saveTrades(remaining)
    }
  }

  /**
   * 检查是否有该基金的持仓
   */
  function hasHolding(code: string): boolean {
    return holdingCodes.value.includes(code)
  }

  /**
   * 获取单个持仓
   */
  function getHoldingByCode(code: string): HoldingWithProfit | undefined {
    return holdings.value.find((h) => h.code === code)
  }

  /**
   * 更新持仓天数
   * [WHY] 每次刷新时更新持仓天数
   */
  function updateHoldingDays() {
    const today = new Date()
    holdings.value.forEach((h) => {
      if (h.buyDate) {
        const buyDate = new Date(h.buyDate)
        const diffTime = today.getTime() - buyDate.getTime()
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24))
        h.holdingDays = diffDays
      }
    })
  }

  /**
   * 清除所有基金的持仓缓存
   * [WHY] 用户手动触发更新持仓数据时调用
   * [FIX] 使用统一的 clearFundHoldingsCache 函数，同时清除内存和持久化缓存
   */
  function clearHoldingsCache() {
    holdings.value.forEach(h => {
      clearFundHoldingsCache(h.code)
    })
  }

  return {
    // State
    holdings,
    isRefreshing,
    // Getters
    summary,
    holdingCodes,
    // Actions
    initHoldings,
    refreshEstimates,
    updateHoldingWithAccurateData,
    addOrUpdateHolding,
    removeHolding,
    hasHolding,
    getHoldingByCode,
    updateHoldingDays,
    clearHoldingsCache,
    syncHoldingsFromStorage
  }
})
