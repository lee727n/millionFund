// [WHY] 持仓主 Store，组合 CRUD、计算、筛选模块
// [WHAT] 统一导出持仓相关功能，保持与原有 holding.ts 的 API 兼容

import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { HoldingRecord, HoldingWithProfit, HoldingSummary } from '@/types/fund'
import type { PortfolioSummary, AssetClass } from '@/types/holding'
import { getHoldings, saveHoldings } from '@/utils/storage'
import { upsertHolding, removeHolding as removeFromStorage } from '@/utils/storage'
import { fetchFundAccurateData } from '@/api/fundFast'
import { fetchAStockQuote } from '@/api/astock'
import { fetchHKStockQuote } from '@/api/hkstock'
import { fetchUSStockQuote } from '@/api/usstock'
import { fetchCryptoPrice } from '@/api/crypto'
import { fetchCommodityQuote } from '@/api/commodity'
import { fetchFutureRealtime } from '@/api/future'
import { fetchBondQuote } from '@/api/bond'
import { fetchForexRate } from '@/api/forex'

/**
 * 持仓主 Store
 * [WHAT] 组合 useHoldingCrud、useHoldingCalc、useHoldingFilter 三个模块
 * [NOTE] 保持与原有 API 完全兼容
 */
export const useHoldingStore = defineStore('holding', () => {
  // ========== 引入子模块 ==========
  
  // CRUD 模块
  const crud = {
    holdings: ref<HoldingWithProfit[]>([]),
    initHoldings,
    addOrUpdateHolding,
    removeHolding,
    hasHolding,
    getHoldingByCode,
    updateHoldingDays,
    batchUpdateHoldings
  }
  
  /** 持仓列表（从 CRUD 模块） */
  const holdings = crud.holdings

  // ========== Getters ==========

  /** 持仓汇总统计（从计算模块） */
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

  // 计算模块
  const calc = {
    portfolioSummary: ref<PortfolioSummary | null>(null),
    summary,
    calculateProfit,
    calculateTodayProfit,
    updateHoldingWithFundData,
    updateHoldingWithStockData,
    fetchPortfolioSummary
  }
  
  // ========== State ==========
  
  /** 是否正在刷新 */
  const isRefreshing = ref(false)
  
  /** 资产汇总（从计算模块） */
  const portfolioSummary = calc.portfolioSummary
  
  // ========== Actions ==========
  
  /**
   * 初始化持仓列表
   */
  async function initHoldings() {
    const records = await getHoldings()
    
    const cleanedRecords = records.map((r: any) => {
      const {
        shareClass: _shareClass,
        serviceFeeRate: _serviceFeeRate,
        serviceFeeDeducted: _serviceFeeDeducted,
        lastFeeDate: _lastFeeDate,
        lastUpdateDate: _lastUpdateDate,
        originProfit: _originProfit,
        lastTodayProfit: _lastTodayProfit,
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
      assetClass: r.assetClass || 'fund',
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
   */
  async function refreshEstimates() {
    // [WHY] 并发刷新守卫：正在刷新时直接返回，避免重复并发刷新
    if (isRefreshing.value) return

    if (holdings.value.length === 0) {
      isRefreshing.value = false
      return
    }
    
    isRefreshing.value = true
    
    try {
      const groups: Record<AssetClass, HoldingWithProfit[]> = {} as any
      holdings.value.forEach(h => {
        const ac = (h.assetClass || 'fund') as AssetClass
        if (!groups[ac]) groups[ac] = []
        groups[ac].push(h)
      })
      
      const promises: Promise<void>[] = []
      
      if (groups.fund) {
        promises.push(refreshFunds(groups.fund))
      }
      if (groups.astock) {
        promises.push(refreshAStocks(groups.astock))
      }
      if (groups.hkstock) {
        promises.push(refreshHKStocks(groups.hkstock))
      }
      if (groups.usstock) {
        promises.push(refreshUSStocks(groups.usstock))
      }
      if (groups.bond) {
        promises.push(refreshBonds(groups.bond))
      }
      if (groups.convertible) {
        promises.push(refreshConvertibles(groups.convertible))
      }
      if (groups.reits) {
        promises.push(refreshREITs(groups.reits))
      }
      if (groups.gold) {
        promises.push(refreshGold(groups.gold))
      }
      if (groups.commodity) {
        promises.push(refreshCommodities(groups.commodity))
      }
      if (groups.future) {
        promises.push(refreshFutures(groups.future))
      }
      if (groups.forex) {
        promises.push(refreshForex(groups.forex))
      }
      if (groups.crypto) {
        promises.push(refreshCrypto(groups.crypto))
      }
      
      await Promise.all(promises)
    } finally {
      isRefreshing.value = false
      saveHoldings(holdings.value)
      fetchPortfolioSummary()
    }
  }
  
  // ========== 刷新函数（保持原有逻辑） ==========
  
  async function refreshFunds(holdings: HoldingWithProfit[]) {
    const results = await Promise.all(
      holdings.map(h => fetchFundAccurateData(h.code, h.isQDII).catch(() => null))
    )
    
    results.forEach((data, index) => {
      if (data) {
        updateHoldingWithFundData(holdings[index]!, data, false)
      } else {
        holdings[index]!.loading = false
      }
    })
  }
  
  async function refreshAStocks(holdings: HoldingWithProfit[]) {
    const codes = holdings.map(h => h.symbol)
    const results = await fetchAStockQuote(codes).catch(() => [])
    
    holdings.forEach(h => {
      const quote = results.find(q => q.symbol === h.symbol)
      if (quote) {
        updateHoldingWithStockData(h, quote.currentPrice, quote.changePercent, false)
      } else {
        h.loading = false
      }
    })
  }
  
  async function refreshHKStocks(holdings: HoldingWithProfit[]) {
    const codes = holdings.map(h => h.symbol)
    const results = await fetchHKStockQuote(codes).catch(() => [])
    
    holdings.forEach(h => {
      const quote = results.find(q => q.symbol === h.symbol)
      if (quote) {
        updateHoldingWithStockData(h, quote.currentPrice, quote.changePercent, false)
      } else {
        h.loading = false
      }
    })
  }
  
  async function refreshUSStocks(holdings: HoldingWithProfit[]) {
    const codes = holdings.map(h => h.symbol)
    const results = await fetchUSStockQuote(codes).catch(() => []) as any
    
    holdings.forEach(h => {
      const quote = results.find(q => q.symbol === h.symbol)
      if (quote) {
        updateHoldingWithStockData(h, quote.currentPrice, quote.changePercent, false)
      } else {
        h.loading = false
      }
    })
  }
  
  async function refreshBonds(holdings: HoldingWithProfit[]) {
    const codes = holdings.map(h => h.symbol)
    const results = await Promise.all(
      codes.map(code => fetchBondQuote(code).catch(() => null))
    )
    
    holdings.forEach((h, index) => {
      const quote = results[index]
      if (quote) {
        updateHoldingWithStockData(h, quote.price, quote.changePercent, false)
      } else {
        h.loading = false
      }
    })
  }
  
  async function refreshConvertibles(holdings: HoldingWithProfit[]) {
    await refreshAStocks(holdings)
  }
  
  async function refreshREITs(holdings: HoldingWithProfit[]) {
    await refreshAStocks(holdings)
  }
  
  async function refreshGold(holdings: HoldingWithProfit[]) {
    await refreshCommodities(holdings)
  }
  
  async function refreshCommodities(holdings: HoldingWithProfit[]) {
    const codes = holdings.map(h => h.symbol)
    const results = await fetchCommodityQuote(codes).catch(() => []) as any
    
    holdings.forEach(h => {
      const quote = results.find(q => q.symbol === h.symbol)
      if (quote) {
        updateHoldingWithStockData(h, quote.price, quote.changePercent, false)
      } else {
        h.loading = false
      }
    })
  }
  
  async function refreshFutures(holdings: HoldingWithProfit[]) {
    const codes = holdings.map(h => h.symbol)
    const results = await Promise.all(
      codes.map(code => fetchFutureRealtime(code).catch(() => null))
    ) as any
    
    holdings.forEach((h, index) => {
      const quote = results[index]
      if (quote) {
        updateHoldingWithStockData(h, quote.price, quote.changePercent, false)
      } else {
        h.loading = false
      }
    })
  }
  
  async function refreshForex(holdings: HoldingWithProfit[]) {
    const pairs = holdings.map(h => `${h.symbol}CNY`)
    const results = await fetchForexRate(pairs).catch(() => [])
    
    holdings.forEach(h => {
      const quote = results.find(q => q.pair.includes(h.symbol))
      if (quote) {
        updateHoldingWithStockData(h, quote.rate, quote.changePercent, false)
      } else {
        h.loading = false
      }
    })
  }
  
  async function refreshCrypto(holdings: HoldingWithProfit[]) {
    const symbols = holdings.map(h => h.symbol)
    const results = await fetchCryptoPrice(symbols).catch(() => new Map())
    
    holdings.forEach(h => {
      const quote = results.get(h.symbol)
      if (quote) {
        updateHoldingWithStockData(h, quote.price, quote.changePercent24h, false)
      } else {
        h.loading = false
      }
    })
  }
  
  // ========== 计算函数（从 holdingCalc 迁移） ==========
  
  function calculateProfit(
    currentPrice: number,
    costPrice: number,
    shares: number
  ): { profit: number; profitRate: number } {
    const marketValue = shares * currentPrice
    const costValue = shares * costPrice
    const profit = marketValue - costValue
    const profitRate = costValue > 0 ? (profit / costValue) * 100 : 0
    
    return { profit, profitRate }
  }
  
  function calculateTodayProfit(
    marketValue: number,
    changePercent: number
  ): number {
    return marketValue * (changePercent / 100)
  }
  
  async function updateHoldingWithFundData(
    holding: HoldingWithProfit,
    data: any,
    persist = true
  ): Promise<void> {
    const currentValue = data.currentValue
    
    if (currentValue <= 0) {
      Object.assign(holding, {
        name: data.name || holding.name,
        loading: false,
        dataSource: data.dataSource,
        valueDate: data.navDate || data.estimateTime?.split(' ')[0],
      })
      if (persist) upsertHolding(holding)
      return
    }
    
    let shares = holding.shares
    let buyNav = holding.buyNetValue
    
    if (!shares || shares <= 0) {
      if (currentValue > 0 && holding.marketValue && holding.marketValue > 0) {
        shares = holding.marketValue / currentValue
      } else if (buyNav > 0 && holding.marketValue && holding.marketValue > 0) {
        shares = holding.marketValue / buyNav
      } else {
        shares = 0
      }
    }
    
    if (!buyNav || buyNav <= 0) {
      if (currentValue > 0) {
        buyNav = currentValue
      } else {
        buyNav = 0
      }
    }
    
    if (shares <= 0 || currentValue <= 0 || buyNav <= 0) {
      Object.assign(holding, {
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
      })
      if (persist) upsertHolding(holding)
      return
    }
    
    const marketValue = shares * currentValue
    const profit = (currentValue - buyNav) * shares
    const todayProfit = marketValue * (data.dayChange / 100)
    const profitRate = marketValue > 0 ? (profit / marketValue) * 100 : 0
    
    const today = new Date().toISOString().split('T')[0]
    const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0]
    
    const hasTodayNav = data.nav > 0 && data.navDate === today
    const isQDII = holding.isQDII === true
    const hasYesterdayNavForQDII = isQDII && data.nav > 0 && data.navDate === yesterday
    const isUpdated = hasTodayNav || hasYesterdayNavForQDII || (data.dataSource === 'nav' && data.navDate === today)
    
    let addedGain: number | undefined
    if (holding.buyNetValue && holding.buyNetValue > 0 && currentValue > 0) {
      addedGain = ((currentValue - holding.buyNetValue) / currentValue) * 100
    }
    
    Object.assign(holding, {
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
    })
    
    if (persist) upsertHolding(holding)
  }
  
  function updateHoldingWithStockData(
    holding: HoldingWithProfit,
    currentPrice: number,
    changePercent: number,
    persist = true
  ): void {
    if (!holding.shares || holding.shares <= 0 || currentPrice <= 0) {
      holding.loading = false
      return
    }
    
    const marketValue = holding.shares * currentPrice
    const profit = (currentPrice - holding.costPrice) * holding.shares
    const profitRate = marketValue > 0 ? (profit / marketValue) * 100 : 0
    const todayProfit = marketValue * (changePercent / 100)
    
    Object.assign(holding, {
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
    })
    
    if (persist) {
      upsertHolding(holding)
    }
  }
  
  function fetchPortfolioSummary(): PortfolioSummary {
    const now = new Date().toISOString()
    const byAssetClass: Record<AssetClass, { value: number; profit: number; weight: number; count: number }> = {} as any
    
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
      
      byAssetClass[assetClass].value += marketValueCNY
      byAssetClass[assetClass].profit += profitCNY
      byAssetClass[assetClass].count += 1
      
      totalValueCNY += marketValueCNY
      totalCostCNY += costCNY
      todayChangeCNY += h.todayProfit || 0
    })
    
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
  
  // ========== CRUD 函数（从 holdingCrud 迁移） ==========
  
  async function addOrUpdateHolding(record: HoldingRecord) {
    const index = holdings.value.findIndex(h => h.code === record.code)
    
    if (index >= 0) {
      holdings.value[index] = {
        ...holdings.value[index],
        ...record,
        loading: true
      }
    } else {
      holdings.value.push({
        ...record,
        loading: true
      })
    }
    
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
    await refreshEstimates()
  }
  
  function removeHolding(code: string) {
    holdings.value = holdings.value.filter(h => h.code !== code)
    removeFromStorage(code)
  }
  
  function hasHolding(code: string): boolean {
    return holdings.value.some(h => h.code === code)
  }
  
  function getHoldingByCode(code: string): HoldingWithProfit | undefined {
    return holdings.value.find(h => h.code === code)
  }
  
  function updateHoldingDays() {
    const now = new Date()
    holdings.value.forEach(h => {
      if (h.buyDate) {
        const buyDate = new Date(h.buyDate)
        h.holdingDays = Math.floor((now.getTime() - buyDate.getTime()) / 86400000)
      }
    })
  }
  
  function batchUpdateHoldings(updates: Partial<HoldingWithProfit>[]): void {
    updates.forEach(update => {
      if (!update.code) return
      
      const index = holdings.value.findIndex(h => h.code === update.code)
      if (index >= 0) {
        holdings.value[index] = {
          ...holdings.value[index],
          ...update
        }
      }
    })
  }
  
  // ========== 筛选函数（从 holdingFilter 迁移） ==========
  
  function filterHoldings(
    holdingList: HoldingWithProfit[],
    filter: { assetClass?: AssetClass | 'all'; keyword?: string }
  ): HoldingWithProfit[] {
    let result = [...holdingList]
    
    if (filter.assetClass && filter.assetClass !== 'all') {
      result = result.filter(h => h.assetClass === filter.assetClass)
    }
    
    if (filter.keyword && filter.keyword.trim()) {
      const keyword = filter.keyword.trim().toLowerCase()
      result = result.filter(h =>
        h.code.toLowerCase().includes(keyword) ||
        h.name.toLowerCase().includes(keyword) ||
        (h.symbol && h.symbol.toLowerCase().includes(keyword))
      )
    }
    
    return result
  }
  
  function sortHoldings(
    holdingList: HoldingWithProfit[],
    sort: { field: string; direction: 'asc' | 'desc' }
  ): HoldingWithProfit[] {
    const result = [...holdingList]
    
    result.sort((a, b) => {
      let aValue: any
      let bValue: any
      
      switch (sort.field) {
        case 'name':
          aValue = a.name || ''
          bValue = b.name || ''
          break
        case 'code':
          aValue = a.code || ''
          bValue = b.code || ''
          break
        case 'marketValue':
          aValue = a.marketValue || 0
          bValue = b.marketValue || 0
          break
        case 'profit':
          aValue = a.profit || 0
          bValue = b.profit || 0
          break
        case 'profitRate':
          aValue = a.profitRate || 0
          bValue = b.profitRate || 0
          break
        default:
          aValue = a.updatedAt || ''
          bValue = b.updatedAt || ''
      }
      
      let comparison = 0
      if (typeof aValue === 'string' && typeof bValue === 'string') {
        comparison = aValue.localeCompare(bValue)
      } else {
        comparison = aValue < bValue ? -1 : aValue > bValue ? 1 : 0
      }
      
      return sort.direction === 'desc' ? -comparison : comparison
    })
    
    return result
  }
  
  function groupByAssetClass(
    holdingList: HoldingWithProfit[]
  ): Record<string, HoldingWithProfit[]> {
    const groups: Record<string, HoldingWithProfit[]> = {}
    
    holdingList.forEach(h => {
      const assetClass = h.assetClass || 'fund'
      if (!groups[assetClass]) {
        groups[assetClass] = []
      }
      groups[assetClass].push(h)
    })
    
    return groups
  }
  
  function getHoldingStats(holdingList: HoldingWithProfit[]): {
    totalCount: number
    totalValue: number
    totalProfit: number
    averageProfitRate: number
    profitCount: number
    lossCount: number
  } {
    let totalValue = 0
    let totalProfit = 0
    let profitCount = 0
    let lossCount = 0
    
    holdingList.forEach(h => {
      totalValue += h.marketValue || 0
      totalProfit += h.profit || 0
      if ((h.profit || 0) > 0) {
        profitCount++
      } else if ((h.profit || 0) < 0) {
        lossCount++
      }
    })
    
    return {
      totalCount: holdingList.length,
      totalValue,
      totalProfit,
      averageProfitRate: totalValue > 0 ? (totalProfit / totalValue) * 100 : 0,
      profitCount,
      lossCount
    }
  }
  
  // ========== 返回所有状态和函数 ==========
  
  return {
    // State
    holdings,
    isRefreshing,
    portfolioSummary,
    
    // Getters
    summary,
    holdingCodes,
    
    // Actions - 初始化和刷新
    initHoldings,
    refreshEstimates,
    
    // Actions - 计算
    calculateProfit,
    calculateTodayProfit,
    updateHoldingWithFundData,
    updateHoldingWithStockData,
    fetchPortfolioSummary,
    
    // Actions - CRUD
    addOrUpdateHolding,
    removeHolding,
    hasHolding,
    getHoldingByCode,
    updateHoldingDays,
    batchUpdateHoldings,
    
    // Actions - 筛选和排序
    filterHoldings,
    sortHoldings,
    groupByAssetClass,
    getHoldingStats
  }
})
