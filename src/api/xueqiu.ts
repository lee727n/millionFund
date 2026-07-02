/**
 * 雪球财经API
 */
import { Http } from '@capacitor-community/http'

// 类型定义
export interface HotDiscussion {
  id: string
  title: string
  content: string
  author: string
  likes: number
  comments: number
  time: string
  url: string
}

export interface StockSentiment {
  stock: string
  code: string
  sentiment: number
  change: number
  volume: number
}

export interface UserView {
  user: string
  title: string
  content: string
  likes: number
  time: string
  url: string
}

export interface NewsItem {
  id: string
  title: string
  summary: string
  source: string
  time: string
  url: string
  image?: string
}

/**
 * 获取热门讨论
 */
export async function fetchHotDiscussions(type: 'fund' | 'stock' = 'fund'): Promise<HotDiscussion[]> {
  try {
    const response = await Http.get({
      url: `https://xueqiu.com/statuses/public_timeline_by_category.json?category=${type === 'fund' ? 'fund' : 'stock'}`,
      headers: {
        'User-Agent': 'Mozilla/5.0'
      }
    })
    
    if (response.status === 200 && response.data) {
      const data = JSON.parse(response.data)
      return data.statuses.map((item: any) => ({
        id: String(item.id),
        title: item.text?.substring(0, 50) || '',
        content: item.text || '',
        author: item.user?.screen_name || '',
        likes: item.like_count || 0,
        comments: item.reply_count || 0,
        time: new Date(item.created_at).toLocaleString(),
        url: `https://xueqiu.com/${item.user?.id}/statuses/${item.id}`
      }))
    }
  } catch (e) {
    console.warn('[雪球] 获取热门讨论失败，使用模拟数据', e)
  }
  
  return generateMockDiscussions(type)
}

/**
 * 获取股票情绪列表
 */
export async function fetchStockSentimentList(type: 'fund' | 'stock' = 'fund'): Promise<StockSentiment[]> {
  // 模拟数据
  return [
    { stock: '贵州茅台', code: '600519', sentiment: 85, change: 2.5, volume: 1000000 },
    { stock: '宁德时代', code: '300750', sentiment: 78, change: -1.2, volume: 800000 },
    { stock: '比亚迪', code: '002594', sentiment: 92, change: 5.8, volume: 1200000 }
  ]
}

/**
 * 获取用户观点
 */
export async function fetchUserViews(): Promise<UserView[]> {
  // 模拟数据
  return [
    {
      user: '但斌',
      title: '看好茅台长期价值',
      content: '茅台是中国最好的公司之一，长期持有价值显著...',
      likes: 1234,
      time: '2小时前',
      url: 'https://xueqiu.com/123456'
    },
    {
      user: '林园',
      title: '医药股迎来布局良机',
      content: '医药板块经过调整，很多优质公司估值合理...',
      likes: 856,
      time: '3小时前',
      url: 'https://xueqiu.com/234567'
    }
  ]
}

/**
 * 获取雪球新闻（用于FinanceNews.vue）
 */
export async function fetchXueqiuNews(page = 1, pageSize = 20): Promise<NewsItem[]> {
  const mockNews = [
    {
      title: '茅台股价重回2000元，市值超2.5万亿',
      summary: '贵州茅台股价重回2000元关口，总市值超过2.5万亿元，白酒龙头地位稳固。',
      time: '30分钟前'
    },
    {
      title: '宁德时代发布新一代电池技术，能量密度提升30%',
      summary: '宁德时代发布新一代动力电池技术，能量密度提升30%，续航里程突破1000公里。',
      time: '1小时前'
    },
    {
      title: '比亚迪6月销量突破30万辆，同比增长超50%',
      summary: '比亚迪公布6月销量数据，突破30万辆大关，同比增长超50%，新能源龙头地位稳固。',
      time: '2小时前'
    }
  ]
  
  return mockNews.map((news, index) => ({
    id: `xueqiu_news_${page}_${index}`,
    title: news.title,
    summary: news.summary,
    source: '雪球',
    time: news.time,
    url: 'https://xueqiu.com/',
    image: undefined
  }))
}

// 模拟数据生成函数
function generateMockDiscussions(type: 'fund' | 'stock'): HotDiscussion[] {
  return [
    {
      id: 'mock_1',
      title: '今日大盘走势分析',
      content: '今日A股市场表现强劲，三大指数集体上涨...',
      author: '股市老司机',
      likes: 123,
      comments: 45,
      time: '10分钟前',
      url: 'https://xueqiu.com/'
    },
    {
      id: 'mock_2',
      title: type === 'fund' ? '基金定投策略分享' : '股票技术分析入门',
      content: type === 'fund' ? '基金定投是一种长期投资策略...' : '股票技术分析是通过研究历史价格和成交量...',
      author: '投资小白',
      likes: 89,
      comments: 32,
      time: '30分钟前',
      url: 'https://xueqiu.com/'
    }
  ]
}
