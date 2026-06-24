// [WHY] 定义 A 股行情相关的 TypeScript 类型，确保类型安全
// [WHAT] 包含 A 股实时行情数据结构

/**
 * A 股实时行情数据
 * [WHAT] 新浪财经 API 返回的格式化数据
 */
export interface AStockQuote {
  /** 股票代码（如：sh600519 / sz000001） */
  symbol: string
  /** 股票名称 */
  name: string
  /** 当前价格 */
  currentPrice: number
  /** 涨跌额 */
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
  /** 成交额（元） */
  amount: number
  /** 买一价（竞买价） */
  bidPrice: number
  /** 卖一价（竞卖价） */
  askPrice: number
}

/**
 * A 股行情 API 错误
 */
export class AStockAPIError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'AStockAPIError'
  }
}
