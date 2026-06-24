// [WHY] 历史趋势数据状态管理，存储和读取每日资产快照
// [WHAT] 管理资产总值的历史数据，支持走势图展示
// [DEPS] 使用 localStorage 持久化数据

import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { AssetClass } from '@/types/holding'

/** 每日资产快照 */
export interface PortfolioSnapshot {
  date: string        // '2026-06-24'
  totalValueCNY: number
  totalCostCNY: number
  totalProfitCNY: number
  byAssetClass: Record<string, { value: number }>
}

/** localStorage key */
const STORAGE_KEY = 'portfolio_history'

/** 最多保存天数 */
const MAX_DAYS = 90

export const useHistoryStore = defineStore('history', () => {
  // ========== State ==========

  /** 历史快照列表 */
  const history = ref<PortfolioSnapshot[]>([])

  // ========== Actions ==========

  /**
   * 从 localStorage 读取历史数据
   * [WHY] 初始化时恢复历史快照
   * @returns 历史快照列表
   */
  function loadHistory(): PortfolioSnapshot[] {
    try {
      const data = localStorage.getItem(STORAGE_KEY)
      if (data) {
        const parsed = JSON.parse(data) as PortfolioSnapshot[]
        history.value = parsed
        return parsed
      }
    } catch (error) {
      console.error('[History] 读取历史数据失败', error)
    }
    return []
  }

  /**
   * 保存快照到 localStorage
   * [WHAT] 保存当日资产快照，如果当天已存在则更新
   * [WHAT] 最多保存 90 天的数据
   */
  function saveSnapshot(snapshot: PortfolioSnapshot): void {
    try {
      // 加载现有数据
      const existing = loadHistory()

      // 检查当天是否已有快照
      const existingIndex = existing.findIndex(item => item.date === snapshot.date)

      if (existingIndex >= 0) {
        // 更新当天的快照
        existing[existingIndex] = snapshot
      } else {
        // 添加新快照
        existing.push(snapshot)
      }

      // 按日期排序
      existing.sort((a, b) => a.date.localeCompare(b.date))

      // 只保留最近 MAX_DAYS 天
      const trimmed = existing.slice(-MAX_DAYS)

      // 保存到 localStorage
      localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed))
      history.value = trimmed
    } catch (error) {
      console.error('[History] 保存快照失败', error)
    }
  }

  /**
   * 获取趋势数据
   * [WHAT] 获取指定天数的趋势数据，用于走势图展示
   * @param days 天数（7, 30, 90）
   * @returns 趋势数据（日期列表和值列表）
   */
  function getTrend(days: number): { dates: string[]; values: number[] } {
    const data = loadHistory()

    // 按日期排序（升序）
    const sorted = [...data].sort((a, b) => a.date.localeCompare(b.date))

    // 取最近 N 天
    const recent = sorted.slice(-days)

    // 提取日期和值
    const dates = recent.map(item => formatDateLabel(item.date))
    const values = recent.map(item => item.totalValueCNY)

    return { dates, values }
  }

  /**
   * 检查今天是否已有快照
   * [WHAT] 避免重复保存同一天的快照
   * @returns 今天是否已有快照
   */
  function hasTodaySnapshot(): boolean {
    const today = new Date().toISOString().split('T')[0]
    const data = loadHistory()
    return data.some(item => item.date === today)
  }

  /**
   * 保存当前资产快照
   * [WHAT] 从 portfolioSummary 读取当前数据并保存快照
   * @param summary 资产汇总数据
   */
  function saveCurrentSnapshot(summary: {
    totalValueCNY: number
    totalCostCNY: number
    totalProfitCNY: number
    byAssetClass: Record<string, { value: number }>
  }): void {
    const today = new Date().toISOString().split('T')[0]

    const snapshot: PortfolioSnapshot = {
      date: today,
      totalValueCNY: summary.totalValueCNY,
      totalCostCNY: summary.totalCostCNY,
      totalProfitCNY: summary.totalProfitCNY,
      byAssetClass: summary.byAssetClass
    }

    saveSnapshot(snapshot)
  }

  // ========== Helpers ==========

  /**
   * 格式化日期标签（显示月-日）
   * [WHAT] 将 '2026-06-24' 格式化为 '6/24'
   */
  function formatDateLabel(dateStr: string): string {
    const parts = dateStr.split('-')
    if (parts.length === 3) {
      return `${parseInt(parts[1])}/${parseInt(parts[2])}`
    }
    return dateStr
  }

  return {
    // State
    history,
    // Actions
    loadHistory,
    saveSnapshot,
    getTrend,
    hasTodaySnapshot,
    saveCurrentSnapshot
  }
})
