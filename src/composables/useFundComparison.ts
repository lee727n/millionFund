// [WHY] 基金对比功能的核心逻辑
// [WHAT] 管理对比列表（2-5只基金），提供添加/删除/对比数据获取功能
// [REF] 参考 Task #17 需求文档

import { ref, computed } from 'vue'
import { fetchPeriodReturnExt, type PeriodReturnExt } from '@/api/tiantianApi'
import {
  fetchTopHoldings,
  fetchIndustryAllocation,
  fetchAssetAllocation,
  fetchFundRating,
} from '@/api/fundFast'
import type { HoldingStock } from '@/api/fundFast'
import type { IndustryAllocation, AssetAllocation, FundRating } from '@/api/fundFast'

/** 阶段涨幅标签 */
export type PeriodLabel = '1周' | '1月' | '3月' | '6月' | '1年' | '今年来'

/** 基金对比项 */
export interface FundComparisonItem {
  code: string
  name: string
  // 阶段涨幅
  returns: Record<PeriodLabel, number>
  // 风险指标
  maxDrawdown: number
  volatility: number
  sharpe: number
  // 重仓股
  topHoldings: HoldingStock[]
  // 行业配置
  industryAllocation: IndustryAllocation[]
  // 资产配置
  assetAllocation: AssetAllocation | null
  // 基金评级
  rating: FundRating | null
}

/** 重仓股对比结果 */
export interface HoldingsComparison {
  // 交集（所有对比基金都持有的股票）
  intersection: { name: string; codes: string[] }[]
  // 并集（所有对比基金持有的所有股票）
  union: { name: string; fundCodes: string[]; avgWeight: number }[]
}

/** 对比场景（用于预设对比） */
export interface ComparisonScenario {
  id: string
  name: string
  description: string
  fundCodes: string[]
}

// [WHAT] 预设对比场景
const PRESET_SCENARIOS: ComparisonScenario[] = [
  {
    id: 'scale-top',
    name: '规模TOP基金',
    description: '同类规模最大的5只基金',
    fundCodes: []
  },
  {
    id: 'return-1y',
    name: '年内收益领先',
    description: '今年来收益最高的5只基金',
    fundCodes: []
  }
]

/**
 * 基金对比组合式函数
 */
export function useFundComparison() {
  // [WHAT] 对比列表（最多5只）
  const comparisonList = ref<FundComparisonItem[]>([])
  const isLoading = ref(false)
  const error = ref<string | null>(null)

  // [WHAT] 是否已到上限（5只）
  const isMaxReached = computed(() => comparisonList.value.length >= 5)

  // [WHAT] 是否可以开始对比（至少2只）
  const canCompare = computed(() => comparisonList.value.length >= 2)

  /**
   * 添加基金到对比列表
   * @param code 基金代码
   * @param name 基金名称
   */
  async function addFund(code: string, name: string): Promise<boolean> {
    // 检查是否已存在
    if (comparisonList.value.some(f => f.code === code)) {
      error.value = `基金 ${code} 已在对比列表中`
      return false
    }

    // 检查是否达到上限
    if (isMaxReached.value) {
      error.value = '最多对比5只基金'
      return false
    }

    isLoading.value = true
    error.value = null

    try {
      // 获取基金对比数据
      const item = await fetchFundComparisonData(code, name)
      comparisonList.value.push(item)
      return true
    } catch (err) {
      error.value = `获取基金 ${code} 数据失败: ${err}`
      return false
    } finally {
      isLoading.value = false
    }
  }

  /**
   * 从对比列表中移除基金
   * @param code 基金代码
   */
  function removeFund(code: string): void {
    const index = comparisonList.value.findIndex(f => f.code === code)
    if (index !== -1) {
      comparisonList.value.splice(index, 1)
    }
  }

  /**
   * 清空对比列表
   */
  function clearAll(): void {
    comparisonList.value = []
    error.value = null
  }

  /**
   * 获取基金对比数据
   * @param code 基金代码
   * @param name 基金名称
   * @returns 基金对比项
   */
  async function fetchFundComparisonData(code: string, name: string): Promise<FundComparisonItem> {
    // 并行获取所有需要的数据
    const [
      periodReturns,
      topHoldings,
      industryAllocation,
      assetAllocation,
      fundRating
    ] = await Promise.all([
      fetchPeriodReturnExt(code).catch(() => [] as PeriodReturnExt[]),
      fetchTopHoldings(code).catch(() => [] as HoldingStock[]),
      fetchIndustryAllocation(code).catch(() => [] as IndustryAllocation[]),
      fetchAssetAllocation(code).catch(() => null as AssetAllocation | null),
      fetchFundRating(code).catch(() => null as FundRating | null)
    ])

    // 构建阶段涨幅映射
    const returns: Record<PeriodLabel, number> = {
      '1周': 0,
      '1月': 0,
      '3月': 0,
      '6月': 0,
      '1年': 0,
      '今年来': 0
    }

    // 映射阶段涨幅数据
    const labelMap: Record<string, PeriodLabel> = {
      '近1周': '1周',
      '近1月': '1月',
      '近3月': '3月',
      '近6月': '6月',
      '近1年': '1年',
      '今年以来': '今年来'
    }

    periodReturns.forEach(item => {
      const label = labelMap[item.label]
      if (label) {
        returns[label] = item.fundReturn
      }
    })

    return {
      code,
      name,
      returns,
      maxDrawdown: fundRating?.maxDrawdown ?? 0,
      volatility: fundRating?.volatility ?? 0,
      sharpe: fundRating?.sharpeRatio ?? 0,
      topHoldings,
      industryAllocation,
      assetAllocation,
      rating: fundRating
    }
  }

  /**
   * 获取重仓股对比结果
   */
  const holdingsComparison = computed<HoldingsComparison>(() => {
    const allHoldings = comparisonList.value.map(f => ({
      fundCode: f.code,
      fundName: f.name,
      holdings: f.topHoldings
    }))

    // 计算交集（所有基金都持有的股票）
    const stockCountMap = new Map<string, { name: string; codes: string[] }>()

    allHoldings.forEach(fund => {
      fund.holdings.forEach(holding => {
        const key = holding.code
        if (!stockCountMap.has(key)) {
          stockCountMap.set(key, { name: holding.name, codes: [] })
        }
        stockCountMap.get(key)!.codes.push(fund.fundCode)
      })
    })

    const intersection = Array.from(stockCountMap.values())
      .filter(item => item.codes.length === comparisonList.value.length)
      .map(item => ({ name: item.name, codes: item.codes }))

    // 计算并集
    const unionMap = new Map<string, { name: string; fundCodes: string[]; weights: number[] }>()

    allHoldings.forEach(fund => {
      fund.holdings.forEach(holding => {
        const key = holding.code
        if (!unionMap.has(key)) {
          unionMap.set(key, {
            name: holding.name,
            fundCodes: [],
            weights: []
          })
        }
        const entry = unionMap.get(key)!
        entry.fundCodes.push(fund.fundCode)
        entry.weights.push(parseFloat(holding.weight) || 0)
      })
    })

    const union = Array.from(unionMap.values())
      .map(item => ({
        name: item.name,
        fundCodes: item.fundCodes,
        avgWeight: item.weights.reduce((a, b) => a + b, 0) / item.weights.length
      }))
      .sort((a, b) => b.avgWeight - a.avgWeight)

    return { intersection, union }
  })

  /**
   * 获取收益对比表格数据（用于展示）
   */
  const returnsComparisonTable = computed(() => {
    const periods: PeriodLabel[] = ['1周', '1月', '3月', '6月', '1年', '今年来']

    return periods.map(period => ({
      period,
      values: comparisonList.value.map(fund => ({
        code: fund.code,
        name: fund.name,
        value: fund.returns[period]
      }))
    }))
  })

  /**
   * 从自选列表添加基金
   * @param fundStore 基金 store
   */
  async function addFromWatchlist(fundStore: any, index: number): Promise<boolean> {
    if (index < 0 || index >= fundStore.funds.length) {
      error.value = '无效的基金索引'
      return false
    }

    const fund = fundStore.funds[index]
    return addFund(fund.code, fund.name)
  }

  return {
    // 状态
    comparisonList,
    isLoading,
    error,
    isMaxReached,
    canCompare,

    // 计算属性
    holdingsComparison,
    returnsComparisonTable,

    // 方法
    addFund,
    removeFund,
    clearAll,
    addFromWatchlist,
    fetchFundComparisonData
  }
}

/**
 * 格式化百分比
 * @param value 数值
 * @returns 格式化后的百分比字符串
 */
export function formatPercent(value: number): string {
  const sign = value >= 0 ? '+' : ''
  return `${sign}${value.toFixed(2)}%`
}

/**
 * 获取收益率对应的 CSS 类名
 * @param value 收益率
 * @returns CSS 类名
 */
export function getReturnClass(value: number): string {
  if (value > 0) return 'text-red-500'
  if (value < 0) return 'text-green-500'
  return 'text-gray-500'
}
