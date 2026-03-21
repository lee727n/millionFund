// [WHY] 基金数据状态管理，集中管理自选列表和实时估值
// [WHAT] 使用 Pinia 管理响应式状态，实现数据和 UI 的自动同步
// [DEPS] 依赖 storage 工具持久化数据，依赖 fund API 获取实时数据

import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { WatchlistItem, FundEstimate } from '@/types/fund'
import { fetchFundEstimateFast, fetchFundAccurateData, fetchFundBasicInfo } from '@/api/fundFast'
import {
  getWatchlist,
  saveWatchlist,
  addToWatchlist as addToStorage,
  removeFromWatchlist as removeFromStorage,
  isInWatchlist
} from '@/utils/storage'

export const useFundStore = defineStore('fund', () => {
  // ========== State ==========

  /** 自选基金列表（包含实时估值） */
  const watchlist = ref<WatchlistItem[]>([])

  /** 是否正在刷新 */
  const isRefreshing = ref(false)

  /** 上次刷新时间 */
  const lastRefreshTime = ref<string>('')

  // ========== Getters ==========

  /** 自选基金代码列表 */
  const watchlistCodes = computed(() => watchlist.value.map((item) => item.code))

  // ========== Actions ==========

  /**
   * 初始化自选列表
   * [WHY] APP 启动时从本地存储恢复数据
   */
  function initWatchlist() {
    const codes = getWatchlist()
    watchlist.value = codes.map((code) => ({
      code,
      name: '',
      loading: true
    }))
    // [WHAT] 初始化后立即刷新估值
    if (codes.length > 0) {
      refreshEstimates()
    }
  }

  /**
   * 刷新所有自选基金的估值
   * [WHY] 下拉刷新或定时刷新时调用
   * [WHAT] 使用多源数据获取，提高成功率
   */
  async function refreshEstimates() {
    if (watchlist.value.length === 0) {
      // [EDGE] 没有自选时也需要重置刷新状态
      isRefreshing.value = false
      return
    }

    isRefreshing.value = true
    const codes = watchlist.value.map((item) => item.code)

    try {
      // [WHAT] 并发请求所有基金估值（使用多源数据）
      const results = await Promise.all(
        codes.map(async code => {
          try {
            // [WHAT] 优先使用快速接口（天天基金）
            const fastData = await fetchFundEstimateFast(code)
            if (fastData && fastData.name) return { type: 'fast' as const, data: fastData }
          } catch {
            // 快速接口失败，尝试备用
          }

          try {
            // [WHAT] 备用1：使用东方财富基本信息接口
            const basicInfo = await fetchFundBasicInfo(code)
            if (basicInfo && basicInfo.name) {
              return {
                type: 'basic' as const,
                data: {
                  fundcode: code,
                  name: basicInfo.name,
                  gsz: String(basicInfo.netValue),
                  gszzl: String(basicInfo.changeRate),
                  gztime: basicInfo.updateTime,
                  dwjz: String(basicInfo.netValue)
                }
              }
            }
          } catch {
            // 备用1失败
          }

          try {
            // [WHAT] 备用2：使用多源精准数据
            const accurateData = await fetchFundAccurateData(code)
            if (accurateData && accurateData.name) return { type: 'accurate' as const, data: accurateData }
          } catch {
            // 备用2也失败
          }

          return null
        })
      )

      // [WHAT] 更新每只基金的估值数据
      results.forEach((result, index) => {
        if (result) {
          if (result.type === 'fast' || result.type === 'basic') {
            updateFundData(codes[index], result.data)
          } else if (result.type === 'accurate') {
            // [WHAT] 从 accurate 数据构建兼容格式
            const d = result.data
            updateFundData(codes[index], {
              fundcode: d.code,
              name: d.name,
              gsz: String(d.currentValue),
              gszzl: String(d.dayChange),
              gztime: d.updateTime,
              dwjz: String(d.nav)
            })
          }
        } else {
          // [EDGE] 请求失败时保留原数据，但标记加载完成
          const item = watchlist.value.find((f) => f.code === codes[index])
          if (item) {
            item.loading = false
          }
        }
      })

      lastRefreshTime.value = new Date().toLocaleTimeString('zh-CN', {
        hour: '2-digit',
        minute: '2-digit'
      })
    } finally {
      isRefreshing.value = false
    }
  }

  /**
   * 刷新单只基金估值
   */
  async function refreshSingleFund(code: string) {
    try {
      const data = await fetchFundEstimateFast(code)
      updateFundData(code, data)
    } catch {
      // 静默失败
    }
  }

  /**
   * 更新单只基金数据
   * [WHAT] 将 API 返回的数据更新到 watchlist 中
   */
  function updateFundData(code: string, data: FundEstimate) {
    const index = watchlist.value.findIndex((item) => item.code === code)
    if (index > -1) {
      watchlist.value[index] = {
        code: data.fundcode,
        name: data.name,
        estimateValue: data.gsz,
        estimateChange: data.gszzl,
        estimateTime: data.gztime,
        lastValue: data.dwjz,
        loading: false
      }
    }
  }

  /**
   * 添加基金到自选
   * [EDGE] 已存在则不重复添加
   */
  async function addFund(code: string, name: string) {
    if (isInWatchlist(code)) return false

    // [WHAT] 先添加到列表（显示加载状态），再获取估值
    addToStorage(code)
    watchlist.value.unshift({
      code,
      name,
      loading: true
    })

    // 立即获取该基金的估值
    await refreshSingleFund(code)
    return true
  }

  /**
   * 从自选中移除基金
   */
  function removeFund(code: string) {
    removeFromStorage(code)
    const index = watchlist.value.findIndex((item) => item.code === code)
    if (index > -1) {
      watchlist.value.splice(index, 1)
    }
  }

  /**
   * 检查基金是否在自选中
   */
  function isFundInWatchlist(code: string): boolean {
    return watchlistCodes.value.includes(code)
  }

  return {
    // State
    watchlist,
    isRefreshing,
    lastRefreshTime,
    // Getters
    watchlistCodes,
    // Actions
    initWatchlist,
    refreshEstimates,
    refreshSingleFund,
    addFund,
    removeFund,
    isFundInWatchlist
  }
})
