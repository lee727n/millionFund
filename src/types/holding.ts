// [WHY] 统一资产数据模型，支持基金、A股、港股、美股、加密、可转债等全品种
// [WHAT] 定义 Holding（统一持仓记录）和 PortfolioSummary（资产汇总）类型

/**
 * 资产类别
 */
export type AssetClass =
  | 'fund'        // 基金
  | 'astock'      // A股
  | 'hkstock'     // 港股
  | 'usstock'     // 美股
  | 'bond'        // 债券
  | 'convertible' // 可转债
  | 'reits'       // REITs
  | 'gold'        // 黄金
  | 'commodity'   // 大宗商品
  | 'future'      // 期货
  | 'forex'       // 外汇
  | 'crypto'      // 加密货币

/**
 * 统一持仓记录
 * [WHAT] 支持全品种资产的统一数据模型
 */
export interface Holding {
  id: string
  assetClass: AssetClass

  // 标的标识
  symbol: string         // 代码：000001、BTC、GC（黄金期货）
  name: string           // 名称
  exchange?: string      // 交易所：SSE、HKEX、NASDAQ、Binance

  // 价格数据
  currency: 'CNY' | 'USD' | 'HKD' | 'USDT'
  costPrice: number      // 成本价（本币）
  currentPrice: number   // 当前价（本币）
  shares: number         // 持有数量

  // 计算字段（自动计算，存 localStorage 时保存）
  costValue: number      // 成本 = costPrice * shares
  currentValue: number   // 市值 = currentPrice * shares
  profit: number         // 盈亏 = currentValue - costValue
  profitRate: number     // 盈亏率 = profit / costValue

  // 汇率（用于人民币汇总）
  fxRate: number         // 当前汇率（本币→人民币）
  valueCNY: number       // 人民币市值
  profitCNY: number      // 人民币盈亏

  // 时间
  createdAt: string      // 建仓时间
  updatedAt: string      // 最后更新
}

/**
 * 资产汇总
 * [WHAT] 所有资产的汇总统计信息
 */
export interface PortfolioSummary {
  totalValueCNY: number    // 总市值（人民币）
  totalCostCNY: number     // 总成本（人民币）
  totalProfitCNY: number   // 总盈亏（人民币）
  totalProfitRate: number  // 总收益率

  todayChangeCNY: number   // 今日变动（人民币）
  todayChangeRate: number  // 今日变动率

  // 按资产类别分组
  byAssetClass: Record<AssetClass, {
    value: number
    profit: number
    weight: number   // 占比 0-1
    count: number    // 持仓数量
  }>

  updatedAt: string
}

/**
 * 资产类别显示配置
 */
export const ASSET_CLASS_CONFIG: Record<AssetClass, { label: string; color: string; icon: string }> = {
  fund:        { label: '基金',   color: '#3b82f6', icon: '💰' },
  astock:      { label: 'A股',   color: '#ef4444', icon: '📈' },
  hkstock:     { label: '港股',   color: '#f59e0b', icon: '🇭🇰' },
  usstock:     { label: '美股',   color: '#22c55e', icon: '🇺🇸' },
  bond:        { label: '债券',   color: '#6366f1', icon: '📊' },
  convertible:  { label: '可转债', color: '#ec4899', icon: '🔄' },
  reits:       { label: 'REITs',  color: '#06b6d4', icon: '🏢' },
  gold:        { label: '黄金',   color: '#eab308', icon: '🥇' },
  commodity:   { label: '大宗商品', color: '#84cc16', icon: '🛢️' },
  future:      { label: '期货',   color: '#f97316', icon: '⚡' },
  fore:       { label: '外汇',   color: '#14b8a6', icon: '💱' },
  crypto:      { label: '加密货币', color: '#8b5cf6', icon: '🪙' }
}
