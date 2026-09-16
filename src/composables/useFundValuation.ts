// [WHY] 统一的基金估值计算逻辑，避免重复代码和API调用
// [WHAT] 提供基金净值/估值获取、交易记录更新等功能
// [DEPS] 依赖 fundFast.ts 和 storage.ts

import { ref, computed } from 'vue'
import { fetchFundAccurateData, type FundAccurateData } from '@/api/fundFast'
import { updateTradesByCode, getTrades, saveTrades } from '@/utils/storage'
import { getCalendarDateStr, getProgressDateStr, isNavUpToDate } from '@/utils/navDate'
import { useHoldingStore } from '@/stores/holding'

export interface FundValuationData {
  estimate: number
  nav: number
  currentValue: number
  /**
   * [DEPRECATED] 仅用于日志排查，不要再拿它做「是净值还是估值」的判断
   * [WHY] 它同时被拿来表达「数据类型」和「数据新旧」两种含义，盘前/周末会自相矛盾
   * 判断一律用 isNav
   */
  dataSource: 'nav' | 'estimate' | 'fallback' | 'local_cache'
  /** currentValue 用的是净值还是估值（唯一判定出口，等价于 resolveFundValue().isNav） */
  isNav: boolean
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
   * [FIX] 判断「持仓手上这期净值是不是当前该有的那一期」
   * [WHY] 不能信任持久化的 holding.isUpdated 布尔：它一旦置 true 不会因日历日推进复位，
   *       跨天后仍会被当成「已更新」而跳过 API，导致 liveFundData 回灌的是上次更新的旧净值/旧涨幅。
   *       改用持仓自己的 valueDate 重新跑 isNavUpToDate。
   *
   *       ⚠️ 必须用**自然日**口径（不传 today），不能用进度条口径：
   *       09:00 前 getProgressDateStr 会归属上一工作日，QDII 的 `prevWorkday(昨日)`
   *       恒等于 valueDate → 误判为 current，导致跨天/跨夜后「最新净值 -3.77%」
   *       永远进不来（被早上的估算涨幅 -3.24% 覆盖）。详见 2026-09-16 凌晨 QDII 案例。
   */
  function holdingNavIsCurrent(h: any): boolean {
    if (!h || !(h.currentValue > 0)) return false
    return isNavUpToDate({
      nav: h.currentValue,
      navDate: h.valueDate || '',
      isQDII: h.isQDII === true
      // today 不传 → 默认 getCalendarDateStr()（自然日）
    })
  }

  /**
   * 批量加载基金数据
   * [OPTIMIZATION] 非交易时间 + 净值已更新的基金，直接使用 holdingStore 数据，避免不必要的API调用
   */
  async function loadFundData(fundCodes: string[], forceRefresh: boolean = false) {
    const uniqueCodes = [...new Set(fundCodes)]
    const holdingsMap = new Map<string, any>(holdingStore.holdings.map((h: any) => [h.code, h]))

    await Promise.all(uniqueCodes.map(async (code) => {
      try {
        const holding = holdingsMap.get(code)
        const isQDII = holding?.isQDII || false

        // [OPTIMIZATION] 如果手上这期净值已是当前的（valueDate 已是今天 / 盘前归上一工作日），
        // 直接复用 holdingStore 数据，不再调用 API
        // [FIX] 用 holdingNavIsCurrent（基于 valueDate 重跑 isNavUpToDate）替代持久化的 isUpdated 布尔，
        //       否则跨天后 isUpdated 仍为 true，会一直回灌旧净值/旧涨幅、永不重拉
        if (holdingNavIsCurrent(holding)) {
          liveFundData.value.set(code, {
            estimate: 0,
            nav: holding.currentValue,
            currentValue: holding.currentValue,
            dataSource: 'nav',
            // 快路径：拿的是 holding 上已落地的净值，所以恒为净值
            isNav: true,
            dayChange: holding.todayChange ? parseFloat(holding.todayChange) : 0,
            navDate: holding.valueDate
          })

        // [FIX] 快路径只复用 holding 数据、不调 updateHoldingWithAccurateData，原本不会重写
        //       holding.isUpdated —— 而全景「fm-pending」绿色 / 进度条「未更新」完全靠这个布尔驱动。
        //       能进这个分支就说明 valueDate 已是当前这一期（holdingNavIsCurrent 自然日判定），
        //       即基金实际上已更新到最新净值，isUpdated 理应 true。否则会像华宝纳斯达克一样：
        //       数据正确却一直绿。这里按进度条口径重算并写回，与 updateHoldingWithAccurateData 一致。
        holding.isUpdated = isNavUpToDate({
          nav: holding.currentValue,
          navDate: holding.valueDate || '',
          isQDII: holding.isQDII === true,
          today: getProgressDateStr()
        })

        // 净值已更新，同步更新交易记录（快路径：holding 已是今日落地净值，恒为 current）
        if (holding.currentValue > 0 && holding.valueDate) {
          updateTradesByCode(code, holding.currentValue, holding.valueDate, !!holding.isUpdated)
        }
        return
        }

        // 净值未更新或 holdingStore 数据不完整，调用API获取最新数据
        const info = await fetchFundAccurateData(code, isQDII, forceRefresh)
        liveFundData.value.set(code, {
          estimate: info.estimate || 0,
          nav: info.nav || 0,
          currentValue: info.currentValue || 0,
          dataSource: info.dataSource,
          // [WHY] 直接透传 fetchFundAccurateData 的结论，本层不做二次推导
          isNav: info.isNav,
          dayChange: info.dayChange || 0,
          navDate: info.navDate
        })

        // 净值已更新时，同步更新交易记录的净值状态（估值转净值）
        // [FIX] 只有 navIsCurrent（今日该拿到的那期净值确实已出）才确认，
        //       否则盘中/未更新时传入的上一期净值会把今天的估值单误标成「净」
        if (info.nav > 0 && info.navDate) {
          updateTradesByCode(code, info.nav, info.navDate, info.navIsCurrent)
        }

        // [FIX] 净值未更新时，把今天用估值建、但被旧逻辑误标成「净」的交易恢复为 estimated: true
        //       否则全景交易记录会一直错显「净」（Detail.vue / TradeCenter.vue 已有同样修复，这里补齐）
        if (!info.navIsCurrent && !holding?.isUpdated) {
          const today = getCalendarDateStr()
          const allTrades = getTrades()
          let needSave = false
          allTrades.forEach(t => {
            if (t.code === code && t.date === today && !t.estimated) {
              t.estimated = true
              needSave = true
            }
          })
          if (needSave) saveTrades(allTrades)
        }

        // [FIX] 同步回写 holdingStore：让未更新的持仓也能共享这次拉取的数据
        // [WHY] 本 composable 只负责「估值是多少」，持仓收益重算归 holdingStore，两者在此衔接
        holdingStore.updateHoldingWithAccurateData(code, info)
      } catch (e) {
        console.warn(`[useFundValuation] 加载基金数据失败: ${code}`, e)
      }
    }))
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
    if (data.isNav && data.nav > 0) {
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
    calcPostReturn
  }
}
