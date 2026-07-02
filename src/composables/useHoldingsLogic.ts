// [WHY] 持仓相关逻辑 compos函数
// [WHAT] 管理持仓排序、筛选、计算属性

import { ref, computed, type Ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useHoldingStore } from '@/stores/holding'
import { showToast } from 'vant'
import { getSourceLabel } from '@/config/sources'
import { ASSET_CLASS_CONFIG } from '@/types/holding'
import type { HoldingWithProfit } from '@/stores/holding'
import type { AssetClass } from '@/types/holding'

export function useHoldingsLogic() {
  const holdingStore = useHoldingStore()
  const { t } = useI18n()

  // [WHAT] 排序方向
  const sortDirection = ref<'up' | 'down' | 'none'>('down')

  // [WHAT] UI模式：simple=简洁 / full=全功能
  const uiMode = ref<'simple' | 'full'>('simple')

  // [WHAT] 当前资产类别筛选
  const currentAssetClassFilter = ref<AssetClass | ''>('')

  // [WHAT] 当前筛选来源
  const currentSourceFilter = ref<string>('')

  // [WHAT] 排序函数
  function sortFunds(funds: any[]) {
    if (sortDirection.value === 'up') {
      return [...funds].sort((a, b) => {
        const changeA = parseFloat(a.todayChange || '0')
        const changeB = parseFloat(b.todayChange || '0')
        return changeA - changeB
      })
    } else if (sortDirection.value === 'down') {
      return [...funds].sort((a, b) => {
        const changeA = parseFloat(a.todayChange || '0')
        const changeB = parseFloat(b.todayChange || '0')
        return changeB - changeA
      })
    }
    return [...funds]
  }

  // [WHAT] 正常账户持仓
  const normalHoldings = computed(() => {
    let funds = holdingStore.holdings.filter(fund => fund.source !== 'observe')
    if (currentSourceFilter.value) {
      funds = funds.filter(fund => fund.source === currentSourceFilter.value)
    }
    if (currentAssetClassFilter.value) {
      funds = funds.filter(fund => fund.assetClass === currentAssetClassFilter.value)
    }
    return sortFunds(funds)
  })

  // [WHAT] 观察账户持仓
  const observeHoldings = computed(() => {
    const funds = holdingStore.holdings.filter(fund => fund.source === 'observe')
    return sortFunds(funds)
  })

  // [WHAT] 计算当日盈亏总和
  const totalTodayProfit = computed(() => {
    return normalHoldings.value.reduce((total, fund) => {
      if (fund.todayProfit) {
        return total + (typeof fund.todayProfit === 'string' ? parseFloat(fund.todayProfit) : fund.todayProfit)
      }
      return total
    }, 0)
  })

  // [WHAT] 计算当日收益百分比
  const totalTodayProfitPercent = computed(() => {
    const totalMarketValue = normalHoldings.value.reduce((total, fund) => {
      return total + (fund.marketValue || 0)
    }, 0)
    
    if (totalMarketValue === 0) return 0
    
    return (totalTodayProfit.value / totalMarketValue) * 100
  })

  // [WHAT] 计算观察账户当日收益
  const observeTodayProfit = computed(() => {
    return observeHoldings.value.reduce((total, fund) => {
      if (fund.todayProfit) {
        return total + (typeof fund.todayProfit === 'string' ? parseFloat(fund.todayProfit) : fund.todayProfit)
      }
      return total
    }, 0)
  })

  // [WHAT] 计算观察账户当日收益率
  const observeTodayProfitPercent = computed(() => {
    const totalMarketValue = observeHoldings.value.reduce((total, fund) => {
      return total + (fund.marketValue || 0)
    }, 0)
      
    if (totalMarketValue === 0) return 0
      
    return (observeTodayProfit.value / totalMarketValue) * 100
  })

  // [WHAT] 排序持仓基金
  function handleSort(direction: 'up' | 'down') {
    sortDirection.value = direction
  }

  // [WHAT] 按来源筛选基金
  function filterBySource(source: string) {
    if (currentSourceFilter.value === source) {
      currentSourceFilter.value = ''
      showToast('已取消来源筛选')
    } else {
      currentSourceFilter.value = source
      showToast(`已筛选 ${getSourceLabel(source)} 来源的基金`)
    }
  }

  // [WHAT] 按资产类别筛选持仓
  function filterByAssetClass(assetClass: AssetClass | '') {
    if (currentAssetClassFilter.value === assetClass) {
      currentAssetClassFilter.value = ''
      showToast('已取消资产类别筛选')
    } else {
      currentAssetClassFilter.value = assetClass
      const label = assetClass ? ASSET_CLASS_CONFIG[assetClass].label : '全部'
      showToast(`已筛选：${label}`)
    }
  }

  return {
    sortDirection: sortDirection as Ref<'up' | 'down' | 'none'>,
    uiMode,
    currentAssetClassFilter,
    currentSourceFilter,
    normalHoldings,
    observeHoldings,
    totalTodayProfit,
    totalTodayProfitPercent,
    observeTodayProfit,
    observeTodayProfitPercent,
    handleSort,
    filterBySource,
    filterByAssetClass,
  }
}
