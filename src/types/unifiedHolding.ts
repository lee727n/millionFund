// [WHY] 统一持仓数据模型，支持多资产类别
// [WHAT] 提供简化的 AssetCategory 和 UnifiedHolding 接口，同时保持与现有 AssetClass 的兼容

/**
 * 资产类别（简化版，用于上层业务逻辑）
 * [WHAT] 将复杂的 AssetClass 映射到五大类，便于业务逻辑处理
 */
export type AssetCategory = 'fund' | 'stock' | 'crypto' | 'bond' | 'other'

/**
 * 资产类别显示配置
 */
export const ASSET_CATEGORY_CONFIG: Record<AssetCategory, { label: string; color: string; icon: string }> = {
  fund: { label: '基金', color: '#3b82f6', icon: '💰' },
  stock: { label: '股票', color: '#ef4444', icon: '📈' },
  crypto: { label: '加密货币', color: '#8b5cf6', icon: '🪙' },
  bond: { label: '债券', color: '#6366f1', icon: '📊' },
  other: { label: '其他', color: '#6b7280', icon: '📦' }
}

/**
 * 统一持仓接口
 * [WHAT] 提供简化的统一数据模型，支持所有资产类别
 * [NOTE] 此接口用于上层业务逻辑，底层存储仍使用详细的 Holding 接口
 */
export interface UnifiedHolding {
  /** 唯一标识 */
  id: string
  /** 资产代码 */
  code: string
  /** 资产名称 */
  name: string
  /** 资产类别（简化版） */
  category: AssetCategory
  /** 持仓金额（元） */
  amount: number
  /** 持有份额/数量 */
  shares?: number
  /** 成本价 */
  costPrice?: number
  /** 当前价 */
  currentPrice?: number
  /** 盈亏金额 */
  profitLoss?: number
  /** 盈亏比率（%） */
  profitLossRate?: number
  /** 数据来源 */
  source?: string
  /** 备注 */
  notes?: string
  /** 创建时间 */
  createdAt: string
  /** 更新时间 */
  updatedAt: string
}

/**
 * 将 AssetClass 映射到 AssetCategory
 * [WHAT] 用于简化业务逻辑中的资产类别判断
 */
import type { AssetClass } from './holding'

export function mapToAssetCategory(assetClass: AssetClass): AssetCategory {
  switch (assetClass) {
    case 'fund':
      return 'fund'
    case 'astock':
    case 'hkstock':
    case 'usstock':
      return 'stock'
    case 'crypto':
      return 'crypto'
    case 'bond':
    case 'convertible':
      return 'bond'
    case 'reits':
    case 'gold':
    case 'commodity':
    case 'future':
    case 'forex':
      return 'other'
    default:
      return 'other'
  }
}

/**
 * 从 UnifiedHolding 转换到详细的 Holding（用于存储）
 */
export function toDetailedHolding(
  unified: UnifiedHolding,
  assetClass: AssetClass
): import('./holding').Holding {
  const now = new Date().toISOString()
  return {
    id: unified.id,
    assetClass,
    symbol: unified.code,
    name: unified.name,
    exchange: undefined,
    currency: 'CNY',
    costPrice: unified.costPrice || 0,
    currentPrice: unified.currentPrice || 0,
    shares: unified.shares || 0,
    costValue: (unified.costPrice || 0) * (unified.shares || 0),
    currentValue: (unified.currentPrice || 0) * (unified.shares || 0),
    profit: unified.profitLoss || 0,
    profitRate: unified.profitLossRate || 0,
    fxRate: 1,
    valueCNY: unified.amount,
    profitCNY: unified.profitLoss || 0,
    createdAt: unified.createdAt,
    updatedAt: unified.updatedAt || now
  }
}
