// [WHY] 定义基金相关的 TypeScript 类型，确保类型安全
// [WHAT] 包含基金估值、基金信息、持仓数据等核心数据结构

/**
 * 基金实时估值数据（天天基金 JSONP 返回格式）
 * [EDGE] gszzl 可能为空字符串（非交易时间）
 */
export interface FundEstimate {
  /** 基金代码 */
  fundcode: string
  /** 基金名称 */
  name: string
  /** 单位净值（上一交易日） */
  dwjz: string
  /** 估算净值 */
  gsz: string
  /** 估算涨跌幅（百分比字符串，如 "1.23"） */
  gszzl: string
  /** 估值时间（格式：2024-01-01 15:00） */
  gztime: string
}

/**
 * 基金基本信息（基金列表项）
 * 来源：天天基金 fundcode_search.js
 */
export interface FundInfo {
  /** 基金代码 */
  code: string
  /** 基金简称 */
  name: string
  /** 基金类型（如：混合型、股票型） */
  type: string
  /** 拼音简称（用于搜索） */
  pinyin: string
}

/**
 * 持仓记录
 * [WHAT] 用户录入的基金持仓信息，用于计算收益
 */
export interface HoldingRecord {
  /** 基金代码 */
  code: string
  /** 基金名称 */
  name: string
  /** 买入时净值 */
  buyNetValue: number
  /** 持有份额（自动计算） */
  shares: number
  /** 买入日期 */
  buyDate: string
  /** 持仓天数 */
  holdingDays: number
  /** 关联行业板块 */
  industrySectors?: string
  /** 基金来源（如：支付宝、腾讯、京东） */
  source?: string
  /** 是否为QDII基金 */
  isQDII?: boolean
  /** 创建时间 */
  createdAt: number
}

/**
 * 历史净值记录
 * [WHAT] 基金每日净值数据，用于绘制走势图
 */
export interface NetValueRecord {
  /** 净值日期（YYYY-MM-DD） */
  date: string
  /** 单位净值 */
  netValue: number
  /** 累计净值 */
  totalValue: number
  /** 日涨跌幅（%） */
  changeRate: number
}

/**
 * 重仓股票
 * [WHAT] 基金持有的股票信息
 */
export interface StockHolding {
  /** 股票代码 */
  stockCode: string
  /** 股票名称 */
  stockName: string
  /** 持仓占比（%） */
  holdingRatio: number
  /** 持仓市值（万元） */
  holdingAmount: string
  /** 较上期变化 */
  changeFromLast: string
}

/**
 * 自选基金项（包含实时估值）
 * [WHAT] 自选列表中展示的基金数据，合并了基本信息和实时估值
 */
export interface WatchlistItem {
  /** 基金代码 */
  code: string
  /** 基金名称 */
  name: string
  /** 估算净值 */
  estimateValue?: string
  /** 估算涨跌幅 */
  estimateChange?: string
  /** 估值时间 */
  estimateTime?: string
  /** 上一交易日净值 */
  lastValue?: string
  /** 是否加载中 */
  loading?: boolean
}

/**
 * 持仓汇总信息
 * [WHAT] 持仓页面顶部的汇总统计数据
 */
export interface HoldingSummary {
  /** 总市值 */
  totalValue: number
  /** 总盈亏金额 */
  totalProfit: number
  /** 总收益率 */
  totalProfitRate: number
  /** 当日总收益 */
  todayProfit: number
}

// ========== 交易记录相关类型 ==========

/**
 * 交易类型枚举
 */
export type TradeType = 'buy' | 'sell' | 'dividend' | 'auto_invest'

/**
 * 交易记录
 * [WHAT] 记录每笔基金交易的详细信息
 */
export interface TradeRecord {
  /** 交易ID（唯一标识） */
  id: string
  /** 基金代码 */
  code: string
  /** 基金名称 */
  name: string
  /** 交易类型 */
  type: TradeType
  /** 交易日期（YYYY-MM-DD） */
  date: string
  /** 交易金额（元） */
  amount: number
  /** 成交净值 */
  netValue: number
  /** 成交份额 */
  shares: number
  /** 手续费（元） */
  fee: number
  /** 备注 */
  remark?: string
  /** 创建时间 */
  createdAt: number
}

/**
 * 交易类型显示配置
 */
export const TRADE_TYPE_CONFIG = {
  buy: { label: '买入', color: '#e4393c' },
  sell: { label: '卖出', color: '#1db82c' },
  dividend: { label: '分红', color: '#ff9800' },
  auto_invest: { label: '定投', color: '#1989fa' }
} as const

// ========== 大盘指数相关类型 ==========

/**
 * 大盘指数数据
 */
export interface MarketIndex {
  /** 指数代码 */
  code: string
  /** 指数名称 */
  name: string
  /** 当前点位 */
  current: number
  /** 涨跌额 */
  change: number
  /** 涨跌幅（%） */
  changeRate: number
  /** 成交额（亿） */
  volume: number
}

/**
 * 基金排行项
 */
export interface FundRankItem {
  /** 基金代码 */
  code: string
  /** 基金名称 */
  name: string
  /** 基金类型 */
  type: string
  /** 单位净值 */
  netValue: number
  /** 日涨跌幅 */
  dayChange: number
  /** 近一周涨跌幅 */
  weekChange: number
  /** 近一月涨跌幅 */
  monthChange: number
  /** 近一年涨跌幅 */
  yearChange: number
}
