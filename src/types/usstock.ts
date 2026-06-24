// [WHY] 定义美股行情相关的 TypeScript 类型，确保类型安全
// [WHAT] 包含美股实时行情数据结构

/**
 * 美股实时行情数据
 * [WHAT] Yahoo Finance API 返回的格式化数据
 */
export interface USStockQuote {
  /** 股票代码（如：AAPL、TSLA） */
  symbol: string
  /** 股票名称 */
  name: string
  /** 当前价格（美元） */
  currentPrice: number
  /** 涨跌额（美元） */
  change: number
  /** 涨跌幅（%） */
  changePercent: number
  /** 今日开盘价 */
  open: number
  /** 今日最高价 */
  high: number
  /** 今日最低价 */
  low: number
  /** 昨日收盘价 */
  prevClose: number
  /** 成交量（股） */
  volume: number
  /** 成交额（美元） */
  amount: number
  /** 买一价 */
  bidPrice: number
  /** 卖一价 */
  askPrice: number
  /** 市场状态（REGULAR、PRE、POST） */
  marketState: string
  /** 货币单位（USD、HKD 等） */
  currency: string
  /** 时间戳 */
  timestamp: number
}

/**
 * 美股行情 API 错误
 */
export class USStockAPIError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'USStockAPIError'
  }
}
