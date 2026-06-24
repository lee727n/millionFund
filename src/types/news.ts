// [WHY] 资讯模块统一类型定义
// [WHAT] 定义所有资讯相关的数据类型和枚举
// [DEPS] 被 src/api/news.ts 和各个数据源 API 文件引用

/**
 * 数据源类型
 * - jin10: 金十数据
 * - cailian: 财联社
 * - xueqiu: 雪球
 * - eastmoney: 东方财富
 */
export type NewsSource = 'jin10' | 'cailian' | 'xueqiu' | 'eastmoney'

/**
 * 资讯分类
 * - flash: 快讯/电报
 * - market: 市场动态
 * - macro: 宏观经济
 * - industry: 行业资讯
 * - crypto: 加密货币
 * - watchlist: 自选股资讯
 */
export type NewsCategory = 'flash' | 'market' | 'macro' | 'industry' | 'crypto' | 'watchlist'

/**
 * 重要性级别
 * - high: 高
 * - medium: 中
 * - low: 低
 */
export type Importance = 'high' | 'medium' | 'low'

/**
 * 统一资讯项接口
 * 用于聚合多个数据源的资讯
 */
export interface NewsItem {
  /** 唯一标识 */
  id: string
  /** 数据源 */
  source: NewsSource
  /** 资讯分类 */
  category: NewsCategory
  /** 标题 */
  title: string
  /** 摘要 */
  summary: string
  /** 完整内容（可选） */
  content?: string
  /** 原文链接 */
  url: string
  /** 关联的股票/基金代码 */
  relatedSymbols?: string[]
  /** 发布时间 */
  publishedAt: string
  /** 重要性 */
  importance: Importance
  /** 是否已读 */
  isRead: boolean
  /** 是否标星 */
  isStarred: boolean
}

/**
 * 快讯/电报项（简化版，用于实时推送）
 */
export interface FlashItem {
  /** 唯一标识 */
  id: string
  /** 数据源 */
  source: NewsSource
  /** 内容 */
  content: string
  /** 发布时间 */
  time: string
  /** 类型/重要性 */
  type: 'urgent' | 'important' | 'normal' | 'warning'
  /** 关联股票代码（可选） */
  stocks?: string[]
}

/**
 * 经济日历项
 */
export interface CalendarItem {
  /** 唯一标识 */
  id: string
  /** 事件标题 */
  title: string
  /** 发布时间 */
  time: string
  /** 重要性 */
  importance: Importance
  /** 实际值（可选） */
  actual?: string
  /** 预期值（可选） */
  forecast?: string
  /** 前值（可选） */
  previous?: string
  /** 货币/地区（可选） */
  currency?: string
}

/**
 * 热门讨论帖（雪球）
 */
export interface HotDiscussion {
  /** 唯一标识 */
  id: string
  /** 标题 */
  title: string
  /** 内容 */
  content: string
  /** 用户ID */
  userId: string
  /** 用户名 */
  userName: string
  /** 用户头像 */
  userAvatar: string
  /** 创建时间 */
  createTime: string
  /** 点赞数 */
  likeCount: number
  /** 评论数 */
  commentCount: number
  /** 关联股票/基金代码 */
  stock?: string
  /** 关联股票/基金名称 */
  stockName?: string
  /** 是否为基金讨论 */
  isFund: boolean
}

/**
 * 股票/基金情绪（雪球）
 */
export interface StockSentiment {
  /** 代码 */
  code: string
  /** 名称 */
  name: string
  /** 情绪方向 */
  sentiment: 'bullish' | 'bearish' | 'neutral'
  /** 情绪得分 (-100 ~ 100) */
  sentimentScore: number
  /** 讨论数量 */
  discussionCount: number
  /** 看多比例 (%) */
  bullishRatio: number
  /** 热度排名 */
  hotRank: number
  /** 热度变化 */
  hotChange: number
}

/**
 * 大V观点（雪球）
 */
export interface UserView {
  /** 唯一标识 */
  id: string
  /** 用户名 */
  userName: string
  /** 用户描述 */
  userDesc: string
  /** 标题 */
  title: string
  /** 摘要 */
  summary: string
  /** 关联股票/基金代码 */
  stock?: string
  /** 观点方向 */
  direction: 'bullish' | 'bearish' | 'neutral'
  /** 创建时间 */
  createTime: string
  /** 点赞数 */
  likes: number
}

/**
 * 热门主题（财联社）
 */
export interface HotTopic {
  /** 唯一标识 */
  id: string
  /** 主题名称 */
  name: string
  /** 热度 */
  hot: number
  /** 热度变化 (%) */
  change: number
  /** 关联股票 */
  stocks: string[]
}

/**
 * 板块异动（财联社）
 */
export interface PlateMovement {
  /** 唯一标识 */
  id: string
  /** 板块名称 */
  plateName: string
  /** 方向 */
  direction: 'up' | 'down'
  /** 涨跌幅 (%) */
  changePercent: number
  /** 领涨股 */
  leadingStock: string
  /** 异动原因 */
  reason: string
}

/**
 * 北向资金数据（东方财富）
 */
export interface NorthFlowData {
  /** 日期 */
  date: string
  /** 合计净流入 (亿元) */
  totalNetInflow: number
  /** 沪股通净流入 */
  shNetInflow: number
  /** 深股通净流入 */
  szNetInflow: number
  /** 余额 (亿元) */
  balance: number
  /** 近5日数据 */
  recent5Day: { date: string; value: number }[]
}

/**
 * 板块资金流向（东方财富）
 */
export interface SectorFlow {
  /** 板块名称 */
  sectorName: string
  /** 净流入 (亿元) */
  netInflow: number
  /** 领涨股 */
  leadingStock?: string
}

/**
 * 主力资金流向（东方财富）
 */
export interface MainForceFlow {
  /** 标签 */
  label: string
  /** 净流入 (亿元) */
  netInflow: number
  /** 占比 (%) */
  ratio: number
  /** 是否主力 */
  isMain: boolean
}

/**
 * API 响应状态
 */
export interface NewsApiResponse<T> {
  /** 是否成功 */
  success: boolean
  /** 数据 */
  data: T
  /** 消息 */
  message?: string
  /** 时间戳 */
  timestamp: number
}
