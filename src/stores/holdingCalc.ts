// [WHY] 持仓盈亏计算逻辑模块，从 holding.ts 拆分
// [WHAT] 提供持仓盈亏、市值等计算函数

import { ref, computed } from 'vue'
import type { HoldingWithProfit } from '@/types/fund'
import type { PortfolioSummary, AssetClass } from '@/types/holding'
import { upsertHolding } from '@/utils/storage'

/**
 * 持仓计算逻辑 Composable
 * [WHAT] 计算持仓的盈亏、市值、收益率等指标
 */
export function useHoldingCalc() {
  // State: 资产汇总
  const portfolioSummary = ref<PortfolioSummary | null>(null)
  
  // Getters: 持仓汇总统计
  const summary = computed(() => {
    let totalValue = 0
    let totalProfit = 0
    let todayProfit = 0
    
    // 需要从外部传入 holdings
    // 这里只提供计算函数，具体 holdings 由调用方提供
    
    return {
      totalValue,
      totalProfit,
      totalProfitRate: totalValue > 0 ? (totalProfit / totalValue) * 100 : 0,
      todayProfit
    }
  })
  
  /**
   * 计算持仓盈亏
   * [WHAT] 根据当前价和成本价计算持仓盈亏
   */
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
  
  /**
   * 计算当日收益
   * [WHAT] 根据持仓市值和当日涨跌幅计算当日收益
   */
  function calculateTodayProfit(
    marketValue: number,
    changePercent: number
  ): number {
    return marketValue * (changePercent / 100)
  }
  
  /**
   * 更新持仓的基金数据
   * [WHAT] 使用基金实时估值数据更新持仓
   * @param holding 持仓对象
   * @param data 基金实时数据
   * @param persist 是否立即持久化
   */
  async function updateHoldingWithFundData(
    holding: HoldingWithProfit,
    data: any, // FundAccurateData
    persist = true
  ): Promise<void> {
    const currentValue = data.currentValue
    
    // [EDGE] 如果净值无效，跳过计算，保留原有数据
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
    
    // 保存更新后的持仓到本地存储
    if (persist) upsertHolding(holding)
  }
  
  /**
   * 更新持仓的股票/商品/期货数据
   * [WHAT] 通用更新函数，适用于所有有实时价格的资产
   */
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
  
  /**
   * 计算资产汇总
   * [WHAT] 按资产类别统计持仓的总市值、总盈亏等
   */
  function fetchPortfolioSummary(holdings: HoldingWithProfit[]): PortfolioSummary {
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
    
    holdings.forEach((h) => {
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
    portfolioSummary,
    // Getters
    summary,
    // Actions
    calculateProfit,
    calculateTodayProfit,
    updateHoldingWithFundData,
    updateHoldingWithStockData,
    fetchPortfolioSummary
  }
}
