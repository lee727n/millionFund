// [WHY] 持仓数据状态管理，计算收益和汇总统计
// [WHAT] 管理用户录入的持仓信息，结合实时估值计算浮动盈亏
// [WHAT] 支持 A类/C类基金费用计算
// [DEPS] 依赖 fund store 获取实时估值，依赖 storage 持久化数据

import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { HoldingRecord, HoldingSummary } from '@/types/fund'
import { getHoldings, saveHoldings } from '@/utils/storage'
import { getPrevWorkdaySync } from '@/utils/holiday'

function getTradingDateStr(date: Date = new Date()): string {
  const hour = date.getHours()
  if (hour < 9) {
    date = new Date(date.getTime() - 24 * 60 * 60 * 1000)
  }
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}
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
  /** 数据来源（'nav' | 'estimate' | 'fallback'） */
  dataSource?: string
  /** 最新净值/估值的日期 */
  valueDate?: string
  /** 是否已更新（根据日期判断） */
  isUpdated?: boolean
  /** 添加后累计涨跌幅（仅观察账户） */
  addedGain?: number
  /** 综合评分 */
  fundScore?: FundScore
}

export const useHoldingStore = defineStore('holding', () => {
  // ========== State ==========

  /** 持仓列表（包含收益计算） */
  const holdings = ref<HoldingWithProfit[]>([])

  /** 是否正在刷新 */
  const isRefreshing = ref(false)

  // ========== Getters ==========

  /** 持仓汇总统计 */
  const summary = computed<HoldingSummary>(() => {
    let totalValue = 0
    let totalProfit = 0
    let todayProfit = 0

    holdings.value.forEach((h) => {
      if (h.marketValue !== undefined) {
        totalValue += h.marketValue
      }
      totalProfit += h.profit || 0
      if (h.todayProfit !== undefined) {
        todayProfit += h.todayProfit
      }
    })

    const totalProfitRate = totalValue > 0 ? (totalProfit / totalValue) * 100 : 0

    return {
      totalValue,
      totalProfit,
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

      return {
        ...rest,
        industrySectors,
        source
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
      Array.isArray(r.industrySectors)
    ) || recordsNeedSourceMigration

    holdings.value = cleanedRecords.map((r) => ({
      ...r,
      loading: true
    }))

    if (cleanedRecords.length > 0) {
      if (needsCleanup) {
        saveHoldings(cleanedRecords)
        console.log('[数据迁移] 已清理旧字段并保存')
      }
      // [FIX] 等待 refreshEstimates() 完成，确保 isUpdated 字段被正确设置
      await refreshEstimates()
    }
  }

  /**
   * 刷新所有持仓的估值和收益
   * [WHAT] 使用综合数据获取函数，确保数据准确
   * [FIX] 性能优化：已更新的基金（isUpdated === true）直接跳过，不需要再调 API
   *       净值已发布的基金没有估值变化，跳过可以节省大量重仓股价拉取开销
   */
  async function refreshEstimates() {
    if (holdings.value.length === 0) {
      isRefreshing.value = false
      return
    }

    isRefreshing.value = true
    const holdingsList = [...holdings.value]

    try {
      // [FIX] 只刷新未更新的基金（净值未发布，需要估值）
      // 已更新的基金直接用当前 holding 数据，无需重复拉取
      const staleHoldings = holdingsList.filter(h => !h.isUpdated)

      // 先处理已更新的基金：直接复用 holding 数据，不调 API
      holdingsList.forEach(holding => {
        if (holding.isUpdated && holding.currentValue > 0) {
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
            dataSource: 'nav' as const,
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
    const buyNav = h.buyNetValue || currentValue
    const marketValue = shares * currentValue
    const profit = (currentValue - buyNav) * shares
    const profitRate = marketValue > 0 ? profit / marketValue * 100 : 0
    const prevNav = data.dayChange !== 0 ? currentValue / (1 + data.dayChange / 100) : currentValue
    const todayProfit = shares * prevNav * (data.dayChange / 100)

    const today = getTradingDateStr()
    const hasTodayNav = data.nav > 0 && data.navDate === today
    const prevWorkday = getPrevWorkdaySync(today)
    const isQDII = h.isQDII === true
    const hasPrevWorkdayNavForQDII = isQDII && data.nav > 0 && data.navDate === prevWorkday
    const isUpdated = hasTodayNav || hasPrevWorkdayNavForQDII

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
    const index = holdings.value.findIndex((h) => h.code === record.code)

    if (index > -1) {
      const existingHolding = holdings.value[index]
      const updatedHolding = {
        ...existingHolding,
        ...record,
        loading: false
      }

      holdings.value.splice(index, 1, updatedHolding)
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
   */
  function removeHolding(code: string) {
    const index = holdings.value.findIndex((h) => h.code === code)
    if (index > -1) {
      holdings.value.splice(index, 1)
    }
    saveHoldings(holdings.value as any[])
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
    clearHoldingsCache
  }
})
