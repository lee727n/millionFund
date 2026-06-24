// [WHY] 可转债类型定义
// [WHAT] 定义 ConvertibleBond 等接口，用于集思录 API 对接

/**
 * 可转债行情数据
 * [WHAT] 集思录 API 返回的可转债实时行情数据
 */
export interface ConvertibleBond {
  /** 转债代码 */
  code: string
  /** 转债名称 */
  name: string
  /** 现价 */
  price: number
  /** 涨跌额 */
  change: number
  /** 涨跌幅（%） */
  changePercent: number
  /** 溢价率（%） */
  premiumRate: number
  /** 剩余年限 */
  residualDuration: number
}

/**
 * 可转债详细数据（扩展）
 * [WHAT] 包含更多字段的可转债数据，用于持仓计算
 */
export interface ConvertibleBondDetail extends ConvertibleBond {
  /** 剩余规模（亿） */
  remainingSize: number
  /** 评级 */
  rating: string
  /** 距到期天数 */
  callDays: number
  /** 到期税前收益率（%） */
  ytm: number
}

/**
 * 可转债持仓记录
 * [WHAT] 用户持有的可转债记录
 */
export interface ConvertibleHolding {
  /** 转债代码 */
  code: string
  /** 转债名称 */
  name: string
  /** 持有数量（张） */
  amount: number
  /** 成本价 */
  costPrice: number
  /** 当前价 */
  currentPrice: number
  /** 市值 */
  marketValue: number
  /** 持有收益 */
  profit: number
  /** 持有收益率（%） */
  profitRate: number
}
