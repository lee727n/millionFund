// [WHY] 持仓数据状态管理，计算收益和汇总统计
// [WHAT] 管理用户录入的持仓信息，结合实时估值计算浮动盈亏
// [WHAT] 支持 A类/C类基金费用计算
// [DEPS] 依赖 fund store 获取实时估值，依赖 storage 持久化数据

import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { HoldingRecord, HoldingSummary } from '@/types/fund'
import { getHoldings, saveHoldings } from '@/utils/storage'
import { getPrevWorkdaySync } from '@/utils/holiday'
import {
  upsertHolding,
  removeHolding as removeFromStorage,
  updateFundNetValue
} from '@/utils/storage'
import { fetchFundAccurateData, type FundAccurateData } from '@/api/fundFast'
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
   */
  function initHoldings() {
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

      return {
        ...rest,
        industrySectors
      }
    })

    const needsCleanup = records.some((r: any) =>
      r.shareClass !== undefined ||
      r.serviceFeeRate !== undefined ||
      r.serviceFeeDeducted !== undefined ||
      r.lastFeeDate !== undefined ||
      r.lastUpdateDate !== undefined ||
      r.originProfit !== undefined ||
      r.lastTodayProfit !== undefined ||
      Array.isArray(r.industrySectors)
    )

    holdings.value = cleanedRecords.map((r) => ({
      ...r,
      loading: true
    }))

    if (cleanedRecords.length > 0) {
      if (needsCleanup) {
        saveHoldings(cleanedRecords)
        console.log('[数据迁移] 已清理旧字段并保存')
      }
      refreshEstimates()
    }
  }

  /**
   * 刷新所有持仓的估值和收益
   * [WHAT] 使用综合数据获取函数，确保数据准确
   */
  async function refreshEstimates() {
    if (holdings.value.length === 0) {
      isRefreshing.value = false
      return
    }

    isRefreshing.value = true
    const holdingsList = [...holdings.value]
    // console.log('[refreshAllHoldings] 开始刷新，共', holdingsList.length, '只基金:', holdingsList.map(h => h.code))

    try {
      // [WHAT] 并发获取所有基金的准确数据
      const results = await Promise.all(
        holdingsList.map(holding => fetchFundAccurateData(holding.code, holding.isQDII).catch(() => null))
      )

      results.forEach((data, index) => {
        if (data) {
          updateHoldingWithAccurateData(holdingsList[index].code, data)
        } else {
          const item = holdings.value.find((h) => h.code === holdingsList[index].code)
          if (item) item.loading = false
        }
      })
    } finally {
      isRefreshing.value = false
    }
  }

  /**
   * 使用准确数据更新持仓
   * [WHAT] 接收多源验证后的准确数据，计算收益
   */
  async function updateHoldingWithAccurateData(code: string, data: FundAccurateData) {
    const index = holdings.value.findIndex((h) => h.code === code)
    if (index === -1) return

    const holding = holdings.value[index]
    const currentValue = data.currentValue

    // console.log('更新持仓数据:', { code, currentValue, data })

    // 保存净值到本地存储
    updateFundNetValue(code, currentValue)

    // [EDGE] 如果净值无效，跳过计算
    if (currentValue <= 0) {
      holdings.value[index] = {
        ...holding,
        name: data.name || holding.name,
        loading: false
      }
      return
    }

    // [EDGE] 计算份额和服务费 — 记录计算过程以便调试
    const rawBuyNetValue = holding.buyNetValue
    const rawMarketValue = holding.marketValue
    const rawStoredShares = holding.shares

    // 计算买入净值（优先使用持仓记录中的买入净值，否则使用当前净值作为回退）
    const buyNav = rawBuyNetValue > 0 ? rawBuyNetValue : currentValue

    // 计算持有份额：如果记录中已有份额则直接使用，否则用市值 / 买入净值 计算
    let shares = rawStoredShares
    if (!shares || shares <= 0) {
      const denominator = buyNav || 1
      const computedShares = (rawMarketValue || 0) / denominator
      console.log(`计算持有份额: holding.marketValue = ${rawMarketValue}, buyNav = ${buyNav}, shares = marketValue / buyNav = (${rawMarketValue || 0}) / (${denominator}) = ${computedShares}`)
      shares = computedShares
    } else {
      // console.log(`使用已有份额: holding.shares = ${shares}`)
    }

    // 已移除买入净值流程的单行日志，避免重复输出

    // 严格按照份额和净值计算市值和收益
    const marketValue = shares * currentValue

    // [FIX] 持有收益计算逻辑
    // 统一使用公式: profit = (当前净值 - 买入净值) × 持有份额
    // 不需要判断周末/工作日，直接用公式计算即可
    const profit = (currentValue - buyNav) * shares

    // [FIX] 今日收益 = 市值 × 今日涨幅
    // 按照份额计算: todayProfit = 份额 × 当前净值 × (今日涨幅 / 100)
    const todayProfit = shares * currentValue * (data.dayChange / 100)

    // [DEBUG] 详细打印计算过程
    // console.log(`========== [收益计算-刷新] ${code} ==========`)
    // console.log(`买入净值 (buyNav): ${buyNav}`)
    // console.log(`持有份额 (shares): ${shares}`)
    // console.log(`--- 使用当前值计算 ---`)
    // console.log(`当前值 (currentValue): ${currentValue} (来源: ${data.dataSource}, 日期: ${data.navDate || data.estimateTime?.split(' ')[0]})`)
    // console.log(`持有收益: (currentValue - buyNav) × shares = (${currentValue} - ${buyNav}) × ${shares} = ${profit}`)
    // if (data.nav > 0) {
    //   console.log(`--- 使用历史净值计算 ---`)
    //   console.log(`历史净值 (nav): ${data.nav} (日期: ${data.navDate})`)
    //   const profitByNav = (data.nav - buyNav) * shares
    //   console.log(`持有收益: (nav - buyNav) × shares = (${data.nav} - ${buyNav}) × ${shares} = ${profitByNav}`)
    // }
    // if (data.estimate > 0) {
    //   console.log(`--- 使用估值计算 ---`)
    //   console.log(`估值 (estimate): ${data.estimate} (日期: ${data.estimateTime})`)
    //   const profitByEstimate = (data.estimate - buyNav) * shares
    //   console.log(`持有收益: (estimate - buyNav) × shares = (${data.estimate} - ${buyNav}) × ${shares} = ${profitByEstimate}`)
    // }
    // console.log(`今日涨幅: ${data.dayChange}%, 今日收益: todayProfit = shares × currentValue × dayChange = ${shares} × ${currentValue} × ${data.dayChange}% = ${todayProfit}`)
    // console.log(`=============================================`)

    const profitRate = marketValue > 0 ? profit / marketValue * 100 : 0

    // 计算趋势预测和综合评分
    let trendPrediction: TrendPrediction | undefined
    let fundScore: FundScore | undefined
    try {
      const historyResult = await fetchNetValueHistoryFast(code, 90)
      const historyData = historyResult.records || []
      if (historyData && historyData.length >= 30) {
        const netValuePoints = historyData.map(item => ({
          date: item.date,
          value: item.netValue,
          change: item.changeRate
        }))
        trendPrediction = predictTrend(netValuePoints)

        // 计算综合评分
        const returnAnalysis = calculateReturnAnalysis(netValuePoints)
        fundScore = calculateFundScore(returnAnalysis)
      }
    } catch (error) {
      console.error('计算趋势预测和评分失败:', error)
    }

    // [WHAT] 判断是否已更新：根据净值日期判断（QDII 基金允许晚一天更新）
    const today = new Date().toISOString().split('T')[0]

    // 检查是否有今日净值数据
    const hasTodayNav = data.nav > 0 && data.navDate === today

    // [WHAT] 计算前一个工作日（用于QDII基金判断）
    // [WHY] 使用节假日API判断，如果是节假日则继续往前推
    const prevWorkday = getPrevWorkdaySync(today)

    // QDII 基金：如果有前一个工作日净值也视为已更新（因为时差问题）
    const isQDII = holding.isQDII === true
    const hasPrevWorkdayNavForQDII = isQDII && data.nav > 0 && data.navDate === prevWorkday

    // 如果有今日净值，或者 QDII 有前一个工作日净值
    const isUpdated = hasTodayNav || hasPrevWorkdayNavForQDII

    // [WHAT] 计算添加后累计涨跌幅
    // 正确公式：(当前净值 - 买入净值) / 买入净值 * 100%
    let addedGain: number | undefined
    if (holding.buyNetValue && holding.buyNetValue > 0 && currentValue > 0) {
      addedGain = ((currentValue - holding.buyNetValue) / holding.buyNetValue) * 100
      // console.log(`========== [收益计算-累计涨幅] ${code} ==========`)
      // console.log(`  买入净值 (buyNetValue): ${holding.buyNetValue}`)
      // console.log(`  当前净值 (currentValue): ${currentValue}`)
      // console.log(`  累计涨幅 (addedGain): (${currentValue} - ${holding.buyNetValue}) / ${holding.buyNetValue} = ${addedGain.toFixed(2)}%`)
      // console.log(`=============================================`)
    }

    // console.log('更新状态判断:', {
    //   code,
    //   isQDII,
    //   dataSource: data.dataSource,
    //   navDate: data.navDate,
    //   nav: data.nav,
    //   today,
    //   yesterday,
    //   hasTodayNav,
    //   hasYesterdayNavForQDII,
    //   isUpdated,
    //   currentValue: data.currentValue
    // })

    holdings.value[index] = {
      ...holding,
      name: data.name || holding.name,
      currentValue,
      marketValue,
      profit,
      profitRate,
      todayChange: data.dayChange.toFixed(2),
      todayProfit,
      loading: false,
      shares,
      trendPrediction,
      dataSource: data.dataSource,
      valueDate: data.navDate || data.estimateTime?.split(' ')[0],
      isUpdated,
      addedGain,
      fundScore
    }

    // 保存更新后的持仓到本地存储
    upsertHolding(holdings.value[index])
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

      upsertHolding(updatedHolding)
      holdings.value.splice(index, 1, updatedHolding)
    } else {
      const newHolding = {
        ...record,
        loading: false
      }

      upsertHolding(newHolding)
      holdings.value.push(newHolding)
    }
  }

  /**
   * 删除持仓
   */
  function removeHolding(code: string) {
    removeFromStorage(code)
    const index = holdings.value.findIndex((h) => h.code === code)
    if (index > -1) {
      holdings.value.splice(index, 1)
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
    addOrUpdateHolding,
    removeHolding,
    hasHolding,
    getHoldingByCode,
    updateHoldingDays
  }
})
