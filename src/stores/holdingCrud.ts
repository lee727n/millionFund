// [WHY] 持仓 CRUD 操作模块，从 holding.ts 拆分
// [WHAT] 提供持仓的增删改查操作

import { ref } from 'vue'
import type { HoldingRecord, HoldingWithProfit } from '@/types/fund'
import { getHoldings, saveHoldings, removeHolding as removeHoldingFromStorage } from '@/utils/storage'
import { useHoldingCalc } from './holdingCalc'
import { useHoldingFilter } from './holdingFilter'

/**
 * 持仓 CRUD 操作 Composable
 * [WHAT] 管理持仓的增删改查，与计算和筛选模块组合使用
 */
export function useHoldingCrud() {
  // 从其他模块获取需要的状态和函数
  const { calculateProfit, updateMarketValue } = useHoldingCalc()
  const { filterHoldings, sortHoldings } = useHoldingFilter()
  
  // State: 持仓列表
  const holdings = ref<HoldingWithProfit[]>([])
  
  /**
   * 初始化持仓列表
   * [WHY] APP 启动时从本地存储恢复数据
   */
  async function initHoldings(): Promise<void> {
    const records = await getHoldings()
    
    const cleanedRecords = records.map((r: any) => {
      // [WHY] 解构剥离旧字段，只保留有效字段到 rest
      const {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        shareClass,
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        serviceFeeRate,
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        serviceFeeDeducted,
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        lastFeeDate,
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        lastUpdateDate,
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        originProfit,
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        lastTodayProfit,
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
      assetClass: r.assetClass || 'fund', // 默认基金，保持向后兼容
      loading: true
    }))
    
    if (cleanedRecords.length > 0) {
      if (needsCleanup) {
        await saveHoldings(cleanedRecords)
      }
    }
    
    return
  }
  
  /**
   * 添加或更新持仓
   * [WHAT] 如果持仓已存在则更新，否则新增
   */
  async function addOrUpdateHolding(record: HoldingRecord): Promise<void> {
    const index = holdings.value.findIndex(h => h.code === record.code)
    
    if (index >= 0) {
      // 更新现有持仓
      holdings.value[index] = {
        ...holdings.value[index],
        ...record,
        loading: true
      }
    } else {
      // 添加新持仓
      holdings.value.push({
        ...record,
        loading: true
      })
    }
    
    // 保存到本地存储
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
  }
  
  /**
   * 移除持仓
   * [WHAT] 从列表和本地存储中删除指定持仓
   */
  function removeHolding(code: string): void {
    holdings.value = holdings.value.filter(h => h.code !== code)
    // 同时从本地存储删除
    removeHoldingFromStorage(code)
  }
  
  /**
   * 检查是否有该持仓
   */
  function hasHolding(code: string): boolean {
    return holdings.value.some(h => h.code === code)
  }
  
  /**
   * 获取指定代码的持仓
   */
  function getHoldingByCode(code: string): HoldingWithProfit | undefined {
    return holdings.value.find(h => h.code === code)
  }
  
  /**
   * 更新持仓天数
   */
  function updateHoldingDays(): void {
    const now = new Date()
    holdings.value.forEach(h => {
      if (h.buyDate) {
        const buyDate = new Date(h.buyDate)
        h.holdingDays = Math.floor((now.getTime() - buyDate.getTime()) / 86400000)
      }
    })
  }
  
  /**
   * 批量更新持仓数据
   * [WHAT] 用于刷新操作后批量更新持仓的实时数据
   */
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
  
  return {
    // State
    holdings,
    // Actions
    initHoldings,
    addOrUpdateHolding,
    removeHolding,
    hasHolding,
    getHoldingByCode,
    updateHoldingDays,
    batchUpdateHoldings
  }
}
