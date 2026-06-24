// [WHY] 定义港股行情相关的 TypeScript 类型，确保类型安全
// [WHAT] 包含港股实时行情数据结构

/**
 * 港股实时行情数据
 * [WHAT] 新浪财经港股 API 返回的格式化数据
 */
export interface HKStockQuote {
  /** 股票代码（如：hk00700 / hk09988） */
  symbol: string
  /** 股票名称 */
  name: string
  /** 当前价格（港元） */
  currentPrice: number
  /** 涨跌额（港元） */
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
  /** 成交额（港元） */
  amount: number
  /** 买一价 */
  bidPrice: number
  /** 卖一价 */
  askPrice: number
  /** 时间戳 */
  timestamp: number
}

/**
 * 港股行情 API 错误
 */
export class HKStockAPIError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'HKStockAPIError'
  }
}
