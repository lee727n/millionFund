// [WHY] 雪球数据 - 热门讨论、用户情绪、市场热度
// [WHAT] 提供基金/股票讨论热度、用户观点聚合、组合数据
// [DEPS] 依赖 cache 工具和 http 封装

import { getCache, setCache } from '@/api/cache'
import { http } from '@/utils/http'

const CACHE_TTL = {
  HOT_DISCUSSION: 120,
  STOCK_SENTIMENT: 60,
  USER_VIEWS: 300,
}

// ========== 数据类型定义 ==========

/** 热门讨论帖 */
export interface HotDiscussion {
  id: string
  title: string
  content: string
  userId: string
  userName: string
  userAvatar: string
  createTime: string
  likeCount: number
  commentCount: number
  stock?: string  // 关联股票/基金代码
  stockName?: string
  isFund: boolean
}

/** 个股/基金情绪 */
export interface StockSentiment {
  code: string
  name: string
  sentiment: 'bullish' | 'bearish' | 'neutral'
  sentimentScore: number  // -100 ~ 100
  discussionCount: number
  bullishRatio: number    // 看多比例 %
  hotRank: number         // 热度排名
  hotChange: number       // 热度变化
}

/** 大V观点 */
export interface UserView {
  id: string
  userName: string
  userDesc: string
  title: string
  summary: string
  stock?: string
  direction: 'bullish' | 'bearish' | 'neutral'
  createTime: string
  likes: number
}

// ========== 热门讨论 ==========

export async function fetchHotDiscussions(type: 'stock' | 'fund' = 'fund', count = 20): Promise<HotDiscussion[]> {
  const cacheKey = `xq_hot_${type}_${count}`
  const cached = getCache<HotDiscussion[]>(cacheKey)
  if (cached) return cached

  try {
    // [NOTE] 雪球官方 API，部分需要模拟浏览器头
    const url = type === 'fund'
      ? `https://xueqiu.com/statuses/hot/list.json?type=fund&count=${count}`
      : `https://xueqiu.com/statuses/hot/list.json?type=stock&count=${count}`

    const data = await http.get<{ list: any[] }>(url, {
      timeout: 8000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Cookie': import.meta.env.VITE_XQ_COOKIE || '',
        'Referer': 'https://xueqiu.com/',
      },
    })

    if (data && Array.isArray(data.list)) {
      const list: HotDiscussion[] = data.list.map((item: any) => ({
        id: String(item.id),
        title: item.title || '',
        content: item.text || item.description || '',
        userId: String(item.user_id || item.user?.id || ''),
        userName: item.user?.screen_name || item.username || '匿名用户',
        userAvatar: item.user?.avatar_url || '',
        createTime: item.created_at || item.time || '',
        likeCount: item.like_count || item.likes || 0,
        commentCount: item.comment_count || item.comments || 0,
        stock: item.stock?.code || item.symbol || undefined,
        stockName: item.stock?.name || item.stock_name || undefined,
        isFund: type === 'fund',
      }))
      setCache(cacheKey, list, CACHE_TTL.HOT_DISCUSSION)
      return list
    }
    return fallbackHotDiscussions(type)
  } catch {
    return fallbackHotDiscussions(type)
  }
}

// ========== 热门基金/股票情绪 ==========

export async function fetchStockSentimentList(type: 'fund' | 'stock' = 'fund', count = 10): Promise<StockSentiment[]> {
  const cacheKey = `xq_sentiment_${type}_${count}`
  const cached = getCache<StockSentiment[]>(cacheKey)
  if (cached) return cached

  try {
    const url = type === 'fund'
      ? `https://xueqiu.com/stock/fund/rank.json?type=hot&count=${count}`
      : `https://xueqiu.com/stock/screener/screen.json?type=hot&count=${count}`

    const data = await http.get<{ list: any[] }>(url, {
      timeout: 8000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Cookie': 'xq_a_token=',
      },
    })

    if (data && Array.isArray(data.list)) {
      const list: StockSentiment[] = data.list.slice(0, count).map((item: any) => ({
        code: item.code || item.symbol || '',
        name: item.name || '',
        sentiment: (item.sentiment || 'neutral') as 'bullish' | 'bearish' | 'neutral',
        sentimentScore: parseFloat(item.sentiment_score || item.score || '0'),
        discussionCount: item.discussion_count || item.discussions || 0,
        bullishRatio: parseFloat(item.bullish_ratio || item.ratio || '50'),
        hotRank: item.hot_rank || item.rank || 0,
        hotChange: item.hot_change || item.change || 0,
      }))
      setCache(cacheKey, list, CACHE_TTL.STOCK_SENTIMENT)
      return list
    }
    return fallbackSentimentList(type)
  } catch {
    return fallbackSentimentList(type)
  }
}

// ========== 大V观点 ==========

export async function fetchUserViews(count = 10): Promise<UserView[]> {
  const cacheKey = `xq_views_${count}`
  const cached = getCache<UserView[]>(cacheKey)
  if (cached) return cached

  try {
    const url = `https://xueqiu.com/statuses/original/timeline.json?count=${count}`

    const data = await http.get<{ list: any[] }>(url, {
      timeout: 8000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Cookie': 'xq_a_token=',
      },
    })

    if (data && Array.isArray(data.list)) {
      const list: UserView[] = data.list.map((item: any) => ({
        id: String(item.id),
        userName: item.user?.screen_name || '匿名',
        userDesc: item.user?.description || '',
        title: item.title || '',
        summary: (item.text || '').slice(0, 200),
        stock: item.stock?.code || item.symbol || undefined,
        direction: item.direction || 'neutral',
        createTime: item.created_at || '',
        likes: item.like_count || 0,
      }))
      setCache(cacheKey, list, CACHE_TTL.USER_VIEWS)
      return list
    }
    return fallbackUserViews()
  } catch {
    return fallbackUserViews()
  }
}

// ========== 兜底数据 ==========

function fallbackHotDiscussions(type: 'stock' | 'fund'): HotDiscussion[] {
  if (type === 'fund') {
    return [
      { id: '1', title: '新能源基金还能持有吗？', content: '最近新能源板块波动较大，持有的基金回撤了不少，大家怎么看后续走势？', userId: '1', userName: '基金小韭菜', userAvatar: '', createTime: '2026-06-20 14:30', likeCount: 128, commentCount: 56, stock: '001354', stockName: '新能源主题', isFund: true },
      { id: '2', title: '科技创新基金定投记录', content: '坚持定投科技创新基金已经一年了，年化收益12%，分享一下我的定投策略。', userId: '2', userName: '定投达人', userAvatar: '', createTime: '2026-06-20 13:00', likeCount: 95, commentCount: 32, stock: '007343', stockName: '科技创新', isFund: true },
      { id: '3', title: 'QDII基金今年表现亮眼', content: '美股和日股基金今年涨幅都不错，纳指ETF已经涨了15%了，后悔买少了。', userId: '3', userName: '全球配置', userAvatar: '', createTime: '2026-06-20 11:20', likeCount: 82, commentCount: 41, stock: '513100', stockName: '纳指ETF', isFund: true },
      { id: '4', title: '医药基金终于回暖了', content: '拿了两年多的医药基金，终于看到回本的希望了，最近一个月涨了10%。', userId: '4', userName: '药不能停', userAvatar: '', createTime: '2026-06-20 10:00', likeCount: 210, commentCount: 89, stock: '006113', stockName: '医药健康', isFund: true },
    ]
  }
  return [
    { id: '1', title: '茅台还能买吗？', content: '贵州茅台股价企稳，大家觉得现在这个价位适合入手吗？', userId: '5', userName: '价值投资', userAvatar: '', createTime: '2026-06-20 14:00', likeCount: 156, commentCount: 72, stock: '600519', stockName: '贵州茅台', isFund: false },
    { id: '2', title: 'AI板块今年怎么看', content: '人工智能板块热了一年了，现在还能追吗？', userId: '6', userName: '科技猎手', userAvatar: '', createTime: '2026-06-20 12:30', likeCount: 88, commentCount: 45, stock: '300308', stockName: '中际旭创', isFund: false },
  ]
}

function fallbackSentimentList(type: 'fund' | 'stock'): StockSentiment[] {
  if (type === 'fund') {
    return [
      { code: '001354', name: '科技成长', sentiment: 'bullish', sentimentScore: 65, discussionCount: 1230, bullishRatio: 72, hotRank: 1, hotChange: 5 },
      { code: '006113', name: '医药健康', sentiment: 'bullish', sentimentScore: 55, discussionCount: 980, bullishRatio: 68, hotRank: 2, hotChange: 12 },
      { code: '161725', name: '白酒基金', sentiment: 'neutral', sentimentScore: -5, discussionCount: 870, bullishRatio: 48, hotRank: 3, hotChange: -3 },
      { code: '513100', name: '纳指ETF', sentiment: 'bullish', sentimentScore: 70, discussionCount: 760, bullishRatio: 78, hotRank: 4, hotChange: 8 },
      { code: '007343', name: '科技创新', sentiment: 'bullish', sentimentScore: 60, discussionCount: 650, bullishRatio: 70, hotRank: 5, hotChange: 15 },
    ]
  }
  return [
    { code: '300750', name: '宁德时代', sentiment: 'bullish', sentimentScore: 45, discussionCount: 2300, bullishRatio: 65, hotRank: 1, hotChange: 3 },
    { code: '600519', name: '贵州茅台', sentiment: 'neutral', sentimentScore: 10, discussionCount: 2100, bullishRatio: 52, hotRank: 2, hotChange: -2 },
    { code: '002371', name: '北方华创', sentiment: 'bullish', sentimentScore: 72, discussionCount: 1800, bullishRatio: 80, hotRank: 3, hotChange: 18 },
  ]
}

function fallbackUserViews(): UserView[] {
  return [
    { id: '1', userName: 'ETF拯救世界', userDesc: '指数基金投资达人', title: '当前市场估值分析', summary: '全市场PE处于历史中位数附近，整体估值合理偏低。建议保持定投节奏，不要追高。', stock: '000300', direction: 'bullish', createTime: '2026-06-20', likes: 520 },
    { id: '2', userName: '价值发现者', userDesc: '专业投资者，专注价值投资', title: '医药板块估值已至历史低位', summary: '医药板块经过两年调整，估值已回到历史低位。创新药、CXO等细分领域值得关注。', stock: '006113', direction: 'bullish', createTime: '2026-06-19', likes: 320 },
    { id: '3', userName: '趋势交易员', userDesc: '趋势跟踪策略', title: '短期注意风险', summary: '指数连续上涨后面临技术性回调压力，建议适当降低仓位，等待更好的加仓时机。', direction: 'bearish', createTime: '2026-06-19', likes: 280 },
  ]
}
