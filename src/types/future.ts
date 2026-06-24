// [WHY] 期货行情类型定义
// [WHAT] 定义 FutureQuote 等接口，用于期货 API 对接

/**
 * 期货行情数据
 * [WHAT] 期货实时行情数据
 */
export interface FutureQuote {
  /** 合约代码（如 'GC2606'） */
  symbol: string
  /** 合约名称（如 '黄金2606'） */
  name: string
  /** 最新价 */
  price: number
  /** 涨跌额 */
  change: number
  /** 涨跌幅（%） */
  changeRate: number
  /** 今开 */
  open: number
  /** 最高 */
  high: number
  /** 最低 */
  low: number
  /** 成交量 */
  volume: number
  /** 持仓量 */
  openInterest: number
  /** 更新时间 */
  updatedAt: string
}

/**
 * 常用期货代码
 */
export const FUTURE_SYMBOLS = {
  // 国际期货（COMEX/CBOT/NYMEX）
  GC: 'GC',     // 黄金期货
  CL: 'CL',     // 原油期货
  HG: 'HG',     // 铜期货
  ZS: 'ZS',     // 大豆期货
  ZC: 'ZC',     // 玉米期货
  ZW: 'ZW',     // 小麦期货

  // 中国国债期货（中金所）
  T: 'T',       // 10年期国债期货
  TF: 'TF',     // 5年期国债期货
  TS: 'TS',     // 2年期国债期货
  TL: 'TL',     // 30年期国债期货
} as const

/**
 * 期货品种配置
 */
export interface FutureConfig {
  symbol: string
  name: string
  exchange: string
  category: 'international' | 'domestic'
}

/**
 * 默认期货品种列表
 */
export const DEFAULT_FUTURES: FutureConfig[] = [
  { symbol: 'GC', name: '黄金期货', exchange: 'COMEX', category: 'international' },
  { symbol: 'CL', name: '原油期货', exchange: 'NYMEX', category: 'international' },
  { symbol: 'HG', name: '铜期货', exchange: 'COMEX', category: 'international' },
  { symbol: 'ZS', name: '大豆期货', exchange: 'CBOT', category: 'international' },
  { symbol: 'T', name: '10年国债', exchange: 'CFFEX', category: 'domestic' },
]
