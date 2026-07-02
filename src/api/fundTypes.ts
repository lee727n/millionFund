// [WHAT] 基金API模块的类型定义
// [WHY] 统一导出所有基金相关接口，供各子模块使用

/** 基金实时估值数据点（分时图） */
export interface IntradayPoint {
  time: string
  value: number
  growth: number
}

/** 基金重仓股 */
export interface HoldingStock {
  code: string
  name: string
  weight: string
  change: number | null
}

/** 基金综合数据（多源验证后的准确数据） */
export interface FundAccurateData {
  code: string
  name: string
  // 公布净值（基金公司官方，最准确）
  nav: number
  navDate: string
  navChange: number
  // 估算净值（交易时间内参考）
  estimate: number
  estimateTime: string
  estimateChange: number
  // 推荐使用值（自动选择最准确的）
  currentValue: number
  dayChange: number
  // 数据源状态
  dataSource: 'nav' | 'estimate' | 'fallback'
  updateTime: string
}

/** 简化K线数据点 */
export interface SimpleKLineData {
  time: string
  value: number
  change: number
  volume?: number  // 可选的成交量字段
}

/** 阶段涨幅 */
export interface PeriodReturn {
  period: string
  label: string
  days: number
  change: number
}

/** 大盘指数（简化版） */
export interface MarketIndexSimple {
  code: string
  name: string
  current: number
  change: number
  changePercent: number
}

/** 基金排行榜单项（简化版） */
export interface FundRankItemSimple {
  code: string
  name: string
  netValue: number
  dayChange: number
}

/** 基金经理信息 */
export interface FundManagerInfo {
  name: string           // 经理姓名
  photo: string          // 头像URL
  workTime: string       // 从业时间
  fundSize: string       // 管理规模
  bestReturn: string     // 最佳回报
  experience: string     // 简介
  funds: {               // 管理的基金
    code: string
    name: string
    type: string
    size: string
    returnRate: string   // 任职回报
    startDate: string    // 任职日期
  }[]
}

/** 经理业绩走势数据点 */
export interface ManagerProfitPoint {
  date: string      // 日期 YYYY-MM-DD
  profit: number    // 累计收益率%
}

/** 全球指数行情 */
export interface GlobalIndex {
  name: string
  code: string
  price: number
  change: number
  changePercent: number
  region: string
}

/** 行业配置 */
export interface IndustryAllocation {
  name: string      // 行业名称
  ratio: number     // 占比 %
  color: string     // 饼图颜色
}

/** 资产配置 */
export interface AssetAllocation {
  stock: number     // 股票占比 %
  bond: number      // 债券占比 %
  cash: number      // 现金占比 %
  other: number     // 其他占比 %
}

/** 基金评级与风险指标 */
export interface FundRating {
  rating: number           // 综合评级 1-5
  riskLevel: string        // 风险等级
  sharpeRatio: number      // 夏普比率
  maxDrawdown: number      // 最大回撤 %
  volatility: number       // 波动率 %
  rankInSimilar: string    // 同类排名
}
