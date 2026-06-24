// [WHY] 大宗商品/贵金属类型定义
// [WHAT] 定义 CommodityQuote 等接口，用于新浪财经 API 对接

/**
 * 大宗商品行情数据
 * [WHAT] 新浪财经 API 返回的大宗商品实时行情数据
 */
export interface CommodityQuote {
  /** 商品代码（如 'Au9999'） */
  symbol: string
  /** 商品名称（如 '上海黄金'） */
  name: string
  /** 当前价格 */
  price: number
  /** 涨跌额 */
  change: number
  /** 涨跌幅（%） */
  changePercent: number
  /** 成交量 */
  volume: number
  /** 买一价 */
  bidPrice: number
  /** 卖一价 */
  askPrice: number
  /** 更新时间 */
  updateTime?: string
}

/**
 * 黄金价格数据（简化）
 * [WHAT] 用于快速获取黄金价格
 */
export interface GoldPrice {
  /** 价格（元/克） */
  price: number
  /** 涨跌额 */
  change: number
  /** 涨跌幅（%） */
  changePercent: number
  /** 更新时间 */
  updateTime: string
}

/**
 * 常用大宗商品代码
 */
export const COMMODITY_SYMBOLS = {
  // 上海黄金交易所
  AU9999: 'Au9999',   // 黄金
  AG9999: 'Ag9999',   // 白银
  AU9995: 'Au9995',   // 黄金9995
  PT9995: 'Pt9995',   // 铂金

  // COMEX 期货
  GC: 'GC',   // 黄金期货
  SI: 'SI',   // 白银期货

  // WTI 原油期货
  CL: 'CL',   // 原油期货
} as const
