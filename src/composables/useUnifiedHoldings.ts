// [WHY] 统一持仓操作 Composable
// [WHAT] 提供基于 UnifiedHolding 模型的响应式操作接口
// [NOTE] 底层使用 holdingStore，保持与现有系统的兼容

import { ref, computed, watch } from 'vue'
import type { UnifiedHolding, AssetCategory } from '@/types/unifiedHolding'
import { useHoldingStore } from '@/stores/holdingStore'
import type { HoldingWithProfit } from '@/types/fund'
import type { AssetClass } from '@/types/holding'

/**
 * 统一持仓操作 Composable
 * [WHAT] 将 HoldingWithProfit 映射为 UnifiedHolding，提供简化的操作接口
 */
export function useUnifiedHoldings() {
  // 使用主 Store
  const holdingStore = useHoldingStore()
  
  // ========== 映射函数 ==========
  
  /**
   * 将 HoldingWithProfit 转换为 UnifiedHolding
   */
  function toUnifiedHolding(holding: HoldingWithProfit): UnifiedHolding {
    // 映射 assetClass 到 AssetCategory
    const categoryMap: Record<AssetClass, AssetCategory> = {
      'fund': 'fund',
      'astock': 'stock',
      'hkstock': 'stock',
      'usstock': 'stock',
      'bond': 'bond',
      'convertible': 'bond',
      'reits': 'other',
      'gold': 'other',
      'commodity': 'other',
      'future': 'other',
      'forex': 'other',
      'crypto': 'crypto'
    }
    
    const assetClass = (holding.assetClass || 'fund') as AssetClass
    const category = categoryMap[assetClass] || 'other'
    
    return {
      id: holding.id || holding.code,
      code: holding.code,
      name: holding.name,
      category,
      amount: holding.marketValue || 0,
      shares: holding.shares,
      costPrice: holding.costPrice || holding.buyNetValue,
      currentPrice: holding.currentValue,
      profitLoss: holding.profit,
      profitLossRate: holding.profitRate,
      source: holding.source,
      notes: holding.industrySectors,
      createdAt: holding.createdAt ? new Date(holding.createdAt).toISOString() : new Date().toISOString(),
      updatedAt: holding.updatedAt ? new Date(holding.updatedAt).toISOString() : new Date().toISOString()
    }
  }
  
  /**
   * 将 UnifiedHolding 转换为 HoldingWithProfit
   */
  function fromUnifiedHolding(unified: UnifiedHolding): Partial<HoldingWithProfit> {
    return {
      id: unified.id,
      code: unified.code,
      name: unified.name,
      assetClass: mapToAssetClass(unified.category),
      marketValue: unified.amount,
      shares: unified.shares,
      costPrice: unified.costPrice,
      currentValue: unified.currentPrice,
      profit: unified.profitLoss,
      profitRate: unified.profitLossRate,
      source: unified.source,
      industrySectors: unified.notes,
      createdAt: new Date(unified.createdAt).getTime(),
      updatedAt: new Date(unified.updatedAt).toISOString()
    }
  }
  
  /**
   * 将 AssetCategory 映射回 AssetClass
   */
  function mapToAssetClass(category: AssetCategory): AssetClass {
    switch (category) {
      case 'fund':
        return 'fund'
      case 'stock':
        return 'astock' // 默认 A股
      case 'crypto':
        return 'crypto'
      case 'bond':
        return 'bond'
      case 'other':
        return 'fund' // 默认基金
      default:
        return 'fund'
    }
  }
  
  // ========== 响应式数据 ==========
  
  /** 统一持仓列表 */
  const unifiedHoldings = computed<UnifiedHolding[]>(() => {
    return holdingStore.holdings.map(toUnifiedHolding)
  })
  
  /** 按类别分组的持仓 */
  const holdingsByCategory = computed(() => {
    const groups: Record<AssetCategory, UnifiedHolding[]> = {
      'fund': [],
      'stock': [],
      'crypto': [],
      'bond': [],
      'other': []
    }
    
    unifiedHoldings.value.forEach(h => {
      groups[h.category].push(h)
    })
    
    return groups
  })
  
  /** 总市值 */
  const totalValue = computed(() => {
    return unifiedHoldings.value.reduce((sum, h) => sum + h.amount, 0)
  })
  
  /** 总盈亏 */
  const totalProfit = computed(() => {
    return unifiedHoldings.value.reduce((sum, h) => sum + (h.profitLoss || 0), 0)
  })
  
  // ========== 操作方法 ==========
  
  /**
   * 添加或更新持仓
   * [WHAT] 接受 UnifiedHolding，转换为内部格式后调用 Store
   */
  async function addOrUpdateUnifiedHolding(unified: UnifiedHolding): Promise<void> {
    const holdingData = fromUnifiedHolding(unified)
    // 需要转换为 HoldingRecord 格式
    const record = {
      code: unified.code,
      name: unified.name,
      buyNetValue: unified.costPrice || 0,
      shares: unified.shares || 0,
      buyDate: unified.createdAt,
      holdingDays: 0,
      createdAt: new Date(unified.createdAt).getTime(),
      assetClass: mapToAssetClass(unified.category),
      symbol: unified.code,
      source: unified.source
    }
    
    await holdingStore.addOrUpdateHolding(record)
  }
  
  /**
   * 移除持仓
   */
  function removeUnifiedHolding(code: string): void {
    holdingStore.removeHolding(code)
  }
  
  /**
   * 根据类别筛选持仓
   */
  function getHoldingsByCategory(category: AssetCategory): UnifiedHolding[] {
    return unifiedHoldings.value.filter(h => h.category === category)
  }
  
  /**
   * 刷新所有持仓
   */
  async function refreshAll(): Promise<void> {
    await holdingStore.refreshEstimates()
  }
  
  /**
   * 初始化
   */
  async function init(): Promise<void> {
    await holdingStore.initHoldings()
  }
  
  return {
    // 状态
    unifiedHoldings,
    holdingsByCategory,
    totalValue,
    totalProfit,
    
    // 方法
    addOrUpdateUnifiedHolding,
    removeUnifiedHolding,
    getHoldingsByCategory,
    refreshAll,
    init,
    
    // 映射函数（导出供外部使用）
    toUnifiedHolding,
    fromUnifiedHolding,
    
    // 底层 Store（高级用法）
    holdingStore
  }
}
