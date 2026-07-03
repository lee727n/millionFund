// [WHY] 投资组合 Store - 从 holdingStore 拆分组合层面的汇总计算
// [WHAT] 管理投资组合汇总数据、资产配置分布、多币种换算
import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

export const usePortfolioStore = defineStore('portfolio', () => {
  // 汇总数据
  const totalValue = ref(0)
  const totalProfit = ref(0)
  const totalProfitRate = ref(0)
  const todayProfit = ref(0)
  
  // 资产配置分布
  const assetAllocation = ref<Record<string, number>>({})
  
  // 币种分布
  const currencyDistribution = ref<Record<string, number>>({})
  
  // 计算属性
  const isProfitable = computed(() => totalProfit.value > 0)
  const profitPercentage = computed(() => totalValue.value > 0 ? (totalProfit.value / totalValue.value) * 100 : 0)
  
  // 更新汇总数据
  function updateSummary(summary: { totalValue: number; totalProfit: number; totalProfitRate: number; todayProfit: number }) {
    totalValue.value = summary.totalValue
    totalProfit.value = summary.totalProfit
    totalProfitRate.value = summary.totalProfitRate
    todayProfit.value = summary.todayProfit
  }
  
  // 更新资产配置
  function updateAssetAllocation(allocation: Record<string, number>) {
    assetAllocation.value = { ...allocation }
  }
  
  // 更新币种分布
  function updateCurrencyDistribution(distribution: Record<string, number>) {
    currencyDistribution.value = { ...distribution }
  }
  
  // 重置
  function reset() {
    totalValue.value = 0
    totalProfit.value = 0
    totalProfitRate.value = 0
    todayProfit.value = 0
    assetAllocation.value = {}
    currencyDistribution.value = {}
  }
  
  return {
    totalValue,
    totalProfit,
    totalProfitRate,
    todayProfit,
    assetAllocation,
    currencyDistribution,
    isProfitable,
    profitPercentage,
    updateSummary,
    updateAssetAllocation,
    updateCurrencyDistribution,
    reset,
  }
})
