// [WHY] 持仓数据状态管理，计算收益和汇总统计
// [WHAT] 管理用户录入的持仓信息，结合实时估值计算浮动盈亏
// [WHAT] 支持 A类/C类基金费用计算
// [WHAT] 支持多资产类别（基金、A股、港股、美股、债券、期货、外汇、加密等）
// [DEPS] 依赖各资产 API 获取实时行情，依赖 storage 持久化数据

import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { HoldingRecord, HoldingSummary } from '@/types/fund'
import type { PortfolioSummary } from '@/types/holding'
import { getHoldings, saveHoldings } from '@/utils/storage'
import {
  upsertHolding,
  removeHolding as removeFromStorage,
} from '@/utils/storage'
import { fetchFundAccurateData, type FundAccurateData } from '@/api/fundFast'
import { fetchAStockQuote } from '@/api/astock'
import { fetchHKStockQuote } from '@/api/hkstock'
import { fetchUSStockQuote } from '@/api/usstock'
import { fetchCryptoPrice } from '@/api/crypto'
import { fetchCommodityQuote } from '@/api/commodity'
import { fetchFutureRealtime } from '@/api/future'
import { fetchBondQuote } from '@/api/bond'
import { fetchForexRate } from '@/api/forex'

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
}

export const useHoldingStore = defineStore('holding', () => {
  // ========== State ==========
  
  /** 持仓列表（包含收益计算） */
  const holdings = ref<HoldingWithProfit[]>([])
  
  /** 是否正在刷新 */
  const isRefreshing = ref(false)
  
  /** 资产汇总 */
  const portfolioSummary = ref<PortfolioSummary | null>(null)
  
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
  async function initHoldings() {
    const records = await getHoldings()
    
    const cleanedRecords = records.map((r: any) => {
      // [WHY] 解构剥离旧字段，只保留有效字段到 rest
      const {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        shareClass,
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        serviceFeeRate,
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        serviceFeeDeducted,
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        lastFeeDate,
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        lastUpdateDate,
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        originProfit,
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
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
      assetClass: r.assetClass || 'fund', // 默认基金，保持向后兼容
      loading: true
    }))
    
    if (cleanedRecords.length > 0) {
      if (needsCleanup) {
        await saveHoldings(cleanedRecords)
      }
      await refreshEstimates()
    }
  }
  
  /**
   * 刷新所有持仓的估值和收益
   * [WHAT] 支持全资产类别，使用对应的 API 获取实时行情
   */
  async function refreshEstimates() {
    if (holdings.value.length === 0) {
      isRefreshing.value = false
      return
    }
    
    isRefreshing.value = true
    
    try {
      // [WHAT] 按资产类别分组
      const groups: Record<AssetClass, HoldingWithProfit[]> = {} as any
      holdings.value.forEach(h => {
        const ac = (h.assetClass || 'fund') as AssetClass
        if (!groups[ac]) groups[ac] = []
        groups[ac].push(h)
      })
      
      // [WHAT] 并发刷新各资产类别
      const promises: Promise<void>[] = []
      
      // 基金
      if (groups.fund) {
        promises.push(refreshFunds(groups.fund))
      }
      
      // A股
      if (groups.astock) {
        promises.push(refreshAStocks(groups.astock))
      }
      
      // 港股
      if (groups.hkstock) {
        promises.push(refreshHKStocks(groups.hkstock))
      }
      
      // 美股
      if (groups.usstock) {
        promises.push(refreshUSStocks(groups.usstock))
      }
      
      // 债券
      if (groups.bond) {
        promises.push(refreshBonds(groups.bond))
      }
      
      // 可转债
      if (groups.convertible) {
        promises.push(refreshConvertibles(groups.convertible))
      }
      
      // REITs
      if (groups.reits) {
        promises.push(refreshREITs(groups.reits))
      }
      
      // 黄金
      if (groups.gold) {
        promises.push(refreshGold(groups.gold))
      }
      
      // 大宗商品
      if (groups.commodity) {
        promises.push(refreshCommodities(groups.commodity))
      }
      
      // 期货
      if (groups.future) {
        promises.push(refreshFutures(groups.future))
      }
      
      // 外汇
      if (groups.forex) {
        promises.push(refreshForex(groups.forex))
      }
      
      // 加密货币
      if (groups.crypto) {
        promises.push(refreshCrypto(groups.crypto))
      }
      
      await Promise.all(promises)
    } finally {
      isRefreshing.value = false
      fetchPortfolioSummary()
    }
  }
  
  /**
   * 刷新基金持仓
   */
  async function refreshFunds(holdings: HoldingWithProfit[]) {
    const results = await Promise.all(
      holdings.map(h => fetchFundAccurateData(h.code, h.isQDII).catch(() => null))
    )
    
    results.forEach((data, index) => {
      if (data) {
        updateHoldingWithFundData(holdings[index]!.code, data)
      } else {
        const item = holdings.find(h => h.code === holdings[index]!.code)
        if (item) item.loading = false
      }
    })
  }
  
  /**
   * 刷新 A股持仓
   */
  async function refreshAStocks(holdings: HoldingWithProfit[]) {
    const codes = holdings.map(h => h.symbol)
    const results = await fetchAStockQuote(codes).catch(() => [])
    
    holdings.forEach(h => {
      const quote = results.find(q => q.symbol === h.symbol)
      if (quote) {
        updateHoldingWithStockData(h.code, quote.currentPrice, quote.changePercent)
      } else {
        h.loading = false
      }
    })
  }
  
  /**
   * 刷新港股持仓
   */
  async function refreshHKStocks(holdings: HoldingWithProfit[]) {
    const codes = holdings.map(h => h.symbol)
    const results = await fetchHKStockQuote(codes).catch(() => [])
    
    holdings.forEach(h => {
      const quote = results.find(q => q.symbol === h.symbol)
      if (quote) {
        updateHoldingWithStockData(h.code, quote.currentPrice, quote.changePercent)
      } else {
        h.loading = false
      }
    })
  }
  
  /**
   * 刷新美股持仓
   */
  async function refreshUSStocks(holdings: HoldingWithProfit[]) {
    const codes = holdings.map(h => h.symbol)
    const results = await fetchUSStockQuote(codes).catch(() => []) as any
    
    holdings.forEach(h => {
      const quote = results.find(q => q.symbol === h.symbol)
      if (quote) {
        updateHoldingWithStockData(h.code, quote.currentPrice, quote.changePercent)
      } else {
        h.loading = false
      }
    })
  }
  
  /**
   * 刷新债券持仓
   */
  async function refreshBonds(holdings: HoldingWithProfit[]) {
    const codes = holdings.map(h => h.symbol)
    const results = await Promise.all(
      codes.map(code => fetchBondQuote(code).catch(() => null))
    )
    
    holdings.forEach((h, index) => {
      const quote = results[index]
      if (quote) {
        updateHoldingWithStockData(h.code, quote.price, quote.changePercent)
      } else {
        h.loading = false
      }
    })
  }
  
  /**
   * 刷新可转债持仓
   */
  async function refreshConvertibles(holdings: HoldingWithProfit[]) {
    // 可转债使用股票 API（场内交易）
    await refreshAStocks(holdings)
  }
  
  /**
   * 刷新 REITs 持仓
   */
  async function refreshREITs(holdings: HoldingWithProfit[]) {
    // REITs 使用股票 API（场内交易）
    await refreshAStocks(holdings)
  }
  
  /**
   * 刷新黄金持仓
   */
  async function refreshGold(holdings: HoldingWithProfit[]) {
    // 黄金使用大宗商品 API
    await refreshCommodities(holdings)
  }
  
  /**
   * 刷新大宗商品持仓
   */
  async function refreshCommodities(holdings: HoldingWithProfit[]) {
    const codes = holdings.map(h => h.symbol)
    const results = await fetchCommodityQuote(codes).catch(() => []) as any
    
    holdings.forEach(h => {
      const quote = results.find(q => q.symbol === h.symbol)
      if (quote) {
        updateHoldingWithStockData(h.code, quote.price, quote.changePercent)
      } else {
        h.loading = false
      }
    })
  }
  
  /**
   * 刷新期货持仓
   */
  async function refreshFutures(holdings: HoldingWithProfit[]) {
    const codes = holdings.map(h => h.symbol)
    const results = await Promise.all(
      codes.map(code => fetchFutureRealtime(code).catch(() => null))
    ) as any
    
    holdings.forEach((h, index) => {
      const quote = results[index]
      if (quote) {
        updateHoldingWithStockData(h.code, quote.price, quote.changePercent)
      } else {
        h.loading = false
      }
    })
  }
  
  /**
   * 刷新外汇持仓
   */
  async function refreshForex(holdings: HoldingWithProfit[]) {
    const pairs = holdings.map(h => `${h.symbol}CNY`)
    const results = await fetchForexRate(pairs).catch(() => [])
    
    holdings.forEach(h => {
      const quote = results.find(q => q.pair.includes(h.symbol))
      if (quote) {
        // 外汇：汇率变动 = 收益
        const changePercent = quote.changePercent
        updateHoldingWithStockData(h.code, quote.rate, changePercent)
      } else {
        h.loading = false
      }
    })
  }
  
  /**
   * 刷新加密货币持仓
   */
  async function refreshCrypto(holdings: HoldingWithProfit[]) {
    const symbols = holdings.map(h => h.symbol)
    const results = await fetchCryptoPrice(symbols).catch(() => new Map())
    
    holdings.forEach(h => {
      const quote = results.get(h.symbol)
      if (quote) {
        updateHoldingWithStockData(h.code, quote.price, quote.changePercent24h)
      } else {
        h.loading = false
      }
    })
  }
  
  /**
   * 使用基金数据更新持仓
   */
  async function updateHoldingWithFundData(code: string, data: FundAccurateData) {
    const index = holdings.value.findIndex(h => h.code === code)
    if (index === -1) return

    const holding = holdings.value[index]!
    const currentValue = data.currentValue

    // [EDGE] 如果净值无效，跳过计算，保留原有数据
    if (currentValue <= 0) {
      holdings.value[index] = {
        ...holding,
        name: data.name || holding.name,
        loading: false,
        dataSource: data.dataSource,
        valueDate: data.navDate || data.estimateTime?.split(' ')[0],
      }
      upsertHolding(holdings.value[index])
      return
    }

    // [EDGE] 计算份额和成本净值 - 边界情况处理
    let shares = holding.shares
    let buyNav = holding.buyNetValue

    // [FIX] 边界情况处理：确保份额和成本净值有效
    if (!shares || shares <= 0) {
      // [CASE 1] 优先使用市值/当前净值估算份额
      if (currentValue > 0 && holding.marketValue && holding.marketValue > 0) {
        shares = holding.marketValue / currentValue
      }
      // [CASE 2] 使用市值/成本净值估算份额
      else if (buyNav > 0 && holding.marketValue && holding.marketValue > 0) {
        shares = holding.marketValue / buyNav
      }
      // [CASE 3] 无法计算份额，标记为无效持仓
      else {
        shares = 0
      }
    }

    // [FIX] 成本净值边界处理
    if (!buyNav || buyNav <= 0) {
      // [CASE 1] 使用当前净值作为成本（观察仓场景）
      if (currentValue > 0) {
        buyNav = currentValue
      } else {
        buyNav = 0
      }
    }

    // [FIX] 份额无效时，跳过收益计算
    if (shares <= 0 || currentValue <= 0 || buyNav <= 0) {
      holdings.value[index] = {
        ...holding,
        name: data.name || holding.name,
        currentValue,
        shares,
        buyNetValue: buyNav,
        marketValue: shares > 0 ? shares * currentValue : holding.marketValue,
        profit: 0,
        profitRate: 0,
        todayProfit: 0,
        loading: false,
        dataSource: data.dataSource,
        valueDate: data.navDate || data.estimateTime?.split(' ')[0],
        isUpdated: currentValue > 0,
      }
      upsertHolding(holdings.value[index])
      return
    }

    // 严格按照份额和净值计算市值和收益
    const marketValue = shares * currentValue

    // 持有收益 = (当前净值 - 成本净值) × 持有份额
    const profit = (currentValue - buyNav) * shares

    // 当日收益 = 持仓市值 × 当日涨跌幅
    const todayProfit = marketValue * (data.dayChange / 100)

    // [FIX] 收益率计算保护：避免除零
    const profitRate = marketValue > 0 ? (profit / marketValue) * 100 : 0

    // [WHAT] 判断是否已更新：根据净值日期判断
    const today = new Date().toISOString().split('T')[0]
    const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0]

    const hasTodayNav = data.nav > 0 && data.navDate === today
    const isQDII = holding.isQDII === true
    const hasYesterdayNavForQDII = isQDII && data.nav > 0 && data.navDate === yesterday
    const isUpdated = hasTodayNav || hasYesterdayNavForQDII || (data.dataSource === 'nav' && data.navDate === today)

    // [WHAT] 计算添加后累计涨跌幅
    let addedGain: number | undefined
    if (holding.buyNetValue && holding.buyNetValue > 0 && currentValue > 0) {
      addedGain = ((currentValue - holding.buyNetValue) / currentValue) * 100
    }

    holdings.value[index] = {
      ...holding,
      name: data.name || holding.name,
      currentValue,
      marketValue,
      profit,
      profitRate,
      todayChange: data.dayChange != null ? data.dayChange.toFixed(2) : undefined,
      todayProfit,
      loading: false,
      shares,
      buyNetValue: buyNav,
      dataSource: data.dataSource,
      valueDate: data.navDate || data.estimateTime?.split(' ')[0],
      isUpdated,
      addedGain,
    }

    // 保存更新后的持仓到本地存储
    upsertHolding(holdings.value[index])
  }
  
  /**
   * 使用股票/商品/期货数据更新持仓
   * [WHAT] 通用更新函数，适用于所有有实时价格的资产
   */
  function updateHoldingWithStockData(code: string, currentPrice: number, changePercent: number) {
    const index = holdings.value.findIndex(h => h.code === code)
    if (index === -1) return
    
    const holding = holdings.value[index]
    
    if (!holding.shares || holding.shares <= 0 || currentPrice <= 0) {
      holding.loading = false
      return
    }
    
    const marketValue = holding.shares * currentPrice
    const profit = (currentPrice - holding.costPrice) * holding.shares
    const profitRate = marketValue > 0 ? (profit / marketValue) * 100 : 0
    const todayProfit = marketValue * (changePercent / 100)
    
    holdings.value[index] = {
      ...holding,
      currentValue: currentPrice,
      marketValue,
      profit,
      profitRate,
      todayChange: changePercent.toFixed(2),
      todayProfit,
      loading: false,
      dataSource: 'realtime',
      valueDate: new Date().toISOString().split('T')[0],
      isUpdated: true
    }
    
    upsertHolding(holdings.value[index])
  }
  
  /**
   * 添加持仓
   */
  async function addOrUpdateHolding(record: HoldingRecord) {
    const index = holdings.value.findIndex(h => h.code === record.code)
    
    if (index >= 0) {
      // 更新现有持仓
      holdings.value[index] = {
        ...holdings.value[index],
        ...record,
        loading: true
      }
    } else {
      // 添加新持仓
      holdings.value.push({
        ...record,
        loading: true
      })
    }
    
    // 保存到本地存储
    const cleanedHoldings = holdings.value.map(h => ({
      id: h.id,
      assetClass: h.assetClass || 'fund',
      symbol: h.symbol,
      name: h.name,
      exchange: h.exchange,
      currency: h.currency,
      costPrice: h.costPrice,
      currentPrice: h.currentPrice,
      shares: h.shares,
      costValue: h.costValue,
      currentValue: h.currentValue,
      profit: h.profit,
      profitRate: h.profitRate,
      fxRate: h.fxRate,
      valueCNY: h.valueCNY,
      profitCNY: h.profitCNY,
      createdAt: h.createdAt,
      updatedAt: new Date().toISOString()
    }))
    
    await saveHoldings(cleanedHoldings)
    
    // 刷新该持仓的实时数据
    await refreshEstimates()
  }
  
  /**
   * 移除持仓
   */
  function removeHolding(code: string) {
    holdings.value = holdings.value.filter(h => h.code !== code)
    removeFromStorage(code)
  }
  
  /**
   * 检查是否有该持仓
   */
  function hasHolding(code: string): boolean {
    return holdings.value.some(h => h.code === code)
  }
  
  /**
   * 获取指定代码的持仓
   */
  function getHoldingByCode(code: string): HoldingWithProfit | undefined {
    return holdings.value.find(h => h.code === code)
  }
  
  /**
   * 更新持仓天数
   */
  function updateHoldingDays() {
    const now = new Date()
    holdings.value.forEach(h => {
      if (h.buyDate) {
        const buyDate = new Date(h.buyDate)
        h.holdingDays = Math.floor((now.getTime() - buyDate.getTime()) / 86400000)
      }
    })
  }
  
  /**
   * 计算资产汇总
   */
  function fetchPortfolioSummary(): PortfolioSummary {
    const now = new Date().toISOString()
    const byAssetClass: Record<AssetClass, { value: number; profit: number; weight: number; count: number }> = {} as any
    
    // 初始化各资产类别
    const assetClasses: AssetClass[] = [
      'fund', 'astock', 'hkstock', 'usstock',
      'bond', 'convertible', 'reits',
      'gold', 'commodity', 'future', 'forex',
      'crypto'
    ]
    assetClasses.forEach((ac) => {
      byAssetClass[ac] = { value: 0, profit: 0, weight: 0, count: 0 }
    })
    
    let totalValueCNY = 0
    let totalCostCNY = 0
    let todayChangeCNY = 0
    
    holdings.value.forEach((h) => {
      const assetClass = (h.assetClass || 'fund') as AssetClass
      const marketValueCNY = h.marketValue || 0
      const profitCNY = h.profit || 0
      const costCNY = marketValueCNY - profitCNY
      
      // 累加到对应资产类别
      byAssetClass[assetClass].value += marketValueCNY
      byAssetClass[assetClass].profit += profitCNY
      byAssetClass[assetClass].count += 1
      
      // 累加总计
      totalValueCNY += marketValueCNY
      totalCostCNY += costCNY
      todayChangeCNY += h.todayProfit || 0
    })
    
    // 计算各类别权重
    assetClasses.forEach((ac) => {
      byAssetClass[ac].weight = totalValueCNY > 0 ? byAssetClass[ac].value / totalValueCNY : 0
    })
    
    const totalProfitCNY = totalValueCNY - totalCostCNY
    const totalProfitRate = totalCostCNY > 0 ? (totalProfitCNY / totalCostCNY) * 100 : 0
    const todayChangeRate = totalValueCNY > 0 ? (todayChangeCNY / totalValueCNY) * 100 : 0
    
    const summary: PortfolioSummary = {
      totalValueCNY,
      totalCostCNY,
      totalProfitCNY,
      totalProfitRate,
      todayChangeCNY,
      todayChangeRate,
      byAssetClass,
      updatedAt: now
    }
    
    portfolioSummary.value = summary
    return summary
  }
  
  return {
    // State
    holdings,
    isRefreshing,
    portfolioSummary,
    // Getters
    summary,
    holdingCodes,
    // Actions
    initHoldings,
    refreshEstimates,
    fetchPortfolioSummary,
    addOrUpdateHolding,
    removeHolding,
    hasHolding,
    getHoldingByCode,
    updateHoldingDays
  }
})
