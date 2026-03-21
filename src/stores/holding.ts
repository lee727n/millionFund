// [WHY] 持仓数据状态管理，计算收益和汇总统计
// [WHAT] 管理用户录入的持仓信息，结合实时估值计算浮动盈亏
// [WHAT] 支持 A类/C类基金费用计算
// [DEPS] 依赖 fund store 获取实时估值，依赖 storage 持久化数据

import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { HoldingRecord, HoldingSummary } from '@/types/fund'
import { getHoldings, saveHoldings } from '@/utils/storage'
import {
  upsertHolding,
  removeHolding as removeFromStorage,
  updateFundNetValue
} from '@/utils/storage'
import { fetchFundAccurateData, type FundAccurateData } from '@/api/fundFast'
import { fetchNetValueHistoryFast } from '@/api/fundFast'
import { predictTrend, type TrendPrediction } from '@/utils/statistics'

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

    // [EDGE] 计算份额和服务费
    let shares = holding.shares
    const buyNav = holding.buyNetValue > 0 ? holding.buyNetValue : currentValue
    if (!shares || shares <= 0) {
      shares = (holding.marketValue || 0) / (buyNav || 1)
    }

    // 严格按照份额和净值计算市值和收益
    const marketValue = shares * currentValue

    // 持有收益 = (当前净值 - 成本净值) × 持有份额
    const profit = (currentValue - buyNav) * shares

    // 当日收益 = 持仓市值 × 当日涨跌幅
    const todayProfit = marketValue * (data.dayChange / 100)

    const profitRate = marketValue > 0 ? profit / marketValue * 100 : 0

    // 计算趋势预测
    let trendPrediction: TrendPrediction | undefined
    try {
      const historyData = await fetchNetValueHistoryFast(code, 60)
      if (historyData && historyData.length >= 30) {
        const netValuePoints = historyData.map(item => ({
          date: item.date,
          value: item.netValue,
          change: item.changeRate
        }))
        trendPrediction = predictTrend(netValuePoints)
      }
    } catch (error) {
      console.error('计算趋势预测失败:', error)
    }

    // [WHAT] 判断是否已更新：根据净值日期判断（QDII 基金允许晚一天更新）
    const today = new Date().toISOString().split('T')[0]
    const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0]

    // 检查是否有今日净值数据
    const hasTodayNav = data.nav > 0 && data.navDate === today
    // QDII 基金：如果有昨日净值也视为已更新（因为时差问题）
    const isQDII = holding.isQDII === true
    const hasYesterdayNavForQDII = isQDII && data.nav > 0 && data.navDate === yesterday

    // 如果 dataSource 是 nav 且有今日净值，或者 QDII 有昨日净值
    const isUpdated = hasTodayNav || hasYesterdayNavForQDII || (data.dataSource === 'nav' && data.navDate === today)

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
      isUpdated
    }

    // 保存更新后的持仓到本地存储
    upsertHolding(holdings.value[index])
  }

  /**
   * 添加或更新持仓
   * @param record 持仓记录
   */
  function addOrUpdateHolding(record: HoldingRecord) {
    upsertHolding(record)

    const index = holdings.value.findIndex((h) => h.code === record.code)
    if (index > -1) {
      const updatedHolding = {
        ...holdings.value[index],
        ...record,
        loading: false
      }
      holdings.value.splice(index, 1, updatedHolding)
    } else {
      holdings.value.push({
        ...record,
        loading: false
      })
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
