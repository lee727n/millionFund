// [WHY] 统一持仓数据模型，支持跨市场多币种资产汇总
// [WHAT] 在 HoldingRecord 基础上扩展币种、人民币换算值、市场名称等字段

import type { HoldingRecord } from './fund'

/**
 * 统一持仓记录
 * [WHAT] 扩展 HoldingRecord，增加多币种换算与市场信息，用于全品种资产汇总
 * [NOTE] currency 默认 CNY；非人民币资产需通过 fx 模块换算后填入 convertedValueCNY
 */
export interface UnifiedHolding extends HoldingRecord {
  /** 持仓币种（默认 CNY） */
  currency: 'CNY' | 'USD' | 'HKD'
  /** 换算后的人民币市值 */
  convertedValueCNY?: number
  /** 换算使用的汇率 */
  exchangeRate?: number
  /** 市场名称（如 'A股'、'港股'、'美股'、'加密货币'） */
  marketName?: string
}
