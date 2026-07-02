// [WHY] 持仓筛选和排序模块，从 holding.ts 拆分
// [WHAT] 提供持仓的筛选、排序、分组等功能

import type { HoldingWithProfit } from '@/types/fund'
import type { AssetClass } from '@/types/holding'

/**
 * 筛选条件
 */
export interface HoldingFilter {
  /** 资产类别筛选 */
  assetClass?: AssetClass | 'all'
  /** 关键词搜索（代码或名称） */
  keyword?: string
  /** 最小盈亏率 */
  minProfitRate?: number
  /** 最大盈亏率 */
  maxProfitRate?: number
  /** 是否有当日收益 */
  hasTodayProfit?: boolean
}

/**
 * 排序字段
 */
export type HoldingSortField =
  | 'name'
  | 'code'
  | 'marketValue'
  | 'profit'
  | 'profitRate'
  | 'todayProfit'
  | 'holdingDays'
  | 'updatedAt'

/**
 * 排序方向
 */
export type SortDirection = 'asc' | 'desc'

/**
 * 排序条件
 */
export interface HoldingSort {
  field: HoldingSortField
  direction: SortDirection
}

/**
 * 持仓筛选和排序 Composable
 * [WHAT] 提供持仓列表的筛选、排序、分组功能
 */
export function useHoldingFilter() {
  
  /**
   * 筛选持仓
   * [WHAT] 根据筛选条件过滤持仓列表
   */
  function filterHoldings(
    holdings: HoldingWithProfit[],
    filter: HoldingFilter
  ): HoldingWithProfit[] {
    let result = [...holdings]
    
    // 按资产类别筛选
    if (filter.assetClass && filter.assetClass !== 'all') {
      result = result.filter(h => h.assetClass === filter.assetClass)
    }
    
    // 按关键词搜索
    if (filter.keyword && filter.keyword.trim()) {
      const keyword = filter.keyword.trim().toLowerCase()
      result = result.filter(h =>
        h.code.toLowerCase().includes(keyword) ||
        h.name.toLowerCase().includes(keyword) ||
        (h.symbol && h.symbol.toLowerCase().includes(keyword))
      )
    }
    
    // 按盈亏率范围筛选
    if (filter.minProfitRate !== undefined) {
      result = result.filter(h => (h.profitRate || 0) >= filter.minProfitRate!)
    }
    if (filter.maxProfitRate !== undefined) {
      result = result.filter(h => (h.profitRate || 0) <= filter.maxProfitRate!)
    }
    
    // 按当日收益筛选
    if (filter.hasTodayProfit !== undefined) {
      if (filter.hasTodayProfit) {
        result = result.filter(h => (h.todayProfit || 0) > 0)
      } else {
        result = result.filter(h => (h.todayProfit || 0) <= 0)
      }
    }
    
    return result
  }
  
  /**
   * 排序持仓
   * [WHAT] 根据排序条件对持仓列表排序
   */
  function sortHoldings(
    holdings: HoldingWithProfit[],
    sort: HoldingSort
  ): HoldingWithProfit[] {
    const result = [...holdings]
    
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
        case 'todayProfit':
          aValue = a.todayProfit || 0
          bValue = b.todayProfit || 0
          break
        case 'holdingDays':
          aValue = a.holdingDays || 0
          bValue = b.holdingDays || 0
          break
        case 'updatedAt':
          aValue = a.updatedAt || ''
          bValue = b.updatedAt || ''
          break
        default:
          aValue = a.updatedAt || ''
          bValue = b.updatedAt || ''
      }
      
      // 比较
      let comparison = 0
      if (typeof aValue === 'string' && typeof bValue === 'string') {
        comparison = aValue.localeCompare(bValue)
      } else {
        comparison = aValue < bValue ? -1 : aValue > bValue ? 1 : 0
      }
      
      // 根据排序方向调整
      return sort.direction === 'desc' ? -comparison : comparison
    })
    
    return result
  }
  
  /**
   * 按资产类别分组
   * [WHAT] 将持仓按资产类别分组
   */
  function groupByAssetClass(
    holdings: HoldingWithProfit[]
  ): Record<string, HoldingWithProfit[]> {
    const groups: Record<string, HoldingWithProfit[]> = {}
    
    holdings.forEach(h => {
      const assetClass = h.assetClass || 'fund'
      if (!groups[assetClass]) {
        groups[assetClass] = []
      }
      groups[assetClass].push(h)
    })
    
    return groups
  }
  
  /**
   * 获取持仓统计信息
   * [WHAT] 计算持仓列表的统计数据
   */
  function getHoldingStats(holdings: HoldingWithProfit[]): {
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
    
    holdings.forEach(h => {
      totalValue += h.marketValue || 0
      totalProfit += h.profit || 0
      if ((h.profit || 0) > 0) {
        profitCount++
      } else if ((h.profit || 0) < 0) {
        lossCount++
      }
    })
    
    return {
      totalCount: holdings.length,
      totalValue,
      totalProfit,
      averageProfitRate: totalValue > 0 ? (totalProfit / totalValue) * 100 : 0,
      profitCount,
      lossCount
    }
  }
  
  return {
    // Filter functions
    filterHoldings,
    // Sort functions
    sortHoldings,
    // Group functions
    groupByAssetClass,
    // Stats functions
    getHoldingStats
  }
}
