// [WHY] 统一的基金估值计算逻辑，避免重复代码和API调用
// [WHAT] 提供基金净值/估值获取、交易记录更新等功能
// [DEPS] 依赖 fundFast.ts 和 storage.ts

import { ref, computed } from 'vue'
import { fetchFundAccurateData, type FundAccurateData } from '@/api/fundFast'
import { updateTradesByCode } from '@/utils/storage'
import { useHoldingStore } from '@/stores/holding'

export interface FundValuationData {
  estimate: number
  nav: number
  currentValue: number
  dataSource: 'nav' | 'estimate' | 'fallback' | 'local_cache'
  dayChange: number
  navDate?: string
}

/**
 * 统一的基金估值计算 composable
 * [WHY] 避免全景大屏页面各模块重复计算估值
 * [WHAT] 提供基金净值/估值获取、交易记录更新等功能
 */
export function useFundValuation() {
  const holdingStore = useHoldingStore()
  const liveFundData = ref<Map<string, FundValuationData>>(new Map())

  /**
   * 批量加载基金数据
   * [OPTIMIZATION] 非交易时间 + 净值已更新的基金，直接使用 holdingStore 数据，避免不必要的API调用
   */
  async function loadFundData(fundCodes: string[]) {
    const uniqueCodes = [...new Set(fundCodes)]
    const holdingsMap = new Map<string, any>(holdingStore.holdings.map((h: any) => [h.code, h]))

    await Promise.all(uniqueCodes.map(async (code) => {
      try {
        const holding = holdingsMap.get(code)
        const isQDII = holding?.isQDII || false

        // [OPTIMIZATION] 如果净值已更新，直接使用 holdingStore 数据，不再调用API
        // [WHY] 非交易时间不需要重复获取已更新的净值，减少API调用
        if (holding?.isUpdated && holding?.currentValue > 0) {
          liveFundData.value.set(code, {
            estimate: 0,
            nav: holding.currentValue,
            currentValue: holding.currentValue,
            dataSource: 'nav',
            dayChange: holding.todayChange ? parseFloat(holding.todayChange) : 0,
            navDate: holding.valueDate
          })

          // 净值已更新，同步更新交易记录
          if (holding.currentValue > 0 && holding.valueDate) {
            updateTradesByCode(code, holding.currentValue, holding.valueDate)
          }
          return
        }

        // 净值未更新或 holdingStore 数据不完整，调用API获取最新数据
        const info = await fetchFundAccurateData(code, isQDII, true)
        liveFundData.value.set(code, {
          estimate: info.estimate || 0,
          nav: info.nav || 0,
          currentValue: info.currentValue || 0,
          dataSource: info.dataSource,
          dayChange: info.dayChange || 0,
          navDate: info.navDate
        })

        // 净值已更新时，同步更新交易记录的净值状态（估值转净值）
        if (info.nav > 0 && info.navDate) {
          updateTradesByCode(code, info.nav, info.navDate)
        }
      } catch (e) {
        console.warn(`[useFundValuation] 加载基金数据失败: ${code}`, e)
      }
    }))
  }

  /**
   * 获取单个基金的估值数据
   */
  function getFundData(code: string): FundValuationData | undefined {
    return liveFundData.value.get(code)
  }

  /**
   * 计算交易记录的 postReturn
   * [WHY] 统一计算逻辑，避免各模块重复实现
   */
  function calcPostReturn(trade: any): number {
    const data = liveFundData.value.get(trade.code)
    if (!data || trade.netValue <= 0) return 0

    // 当前值：如果净值已更新用净值，否则用估值
    let currentValue = 0
    if (data.dataSource === 'nav' && data.nav > 0) {
      currentValue = data.nav
    } else if (data.estimate > 0) {
      currentValue = data.estimate
    } else {
      currentValue = data.currentValue || 0
    }

    if (currentValue <= 0) return 0
    return ((currentValue - trade.netValue) / trade.netValue) * 100
  }

  return {
    liveFundData,
    loadFundData,
    getFundData,
    calcPostReturn
  }
}
