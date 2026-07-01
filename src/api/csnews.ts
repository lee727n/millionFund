/**
 * 中国证券报新闻API
 */
import type { NewsItem } from './toutiao'

export async function fetchCSNews(page = 1, pageSize = 20): Promise<NewsItem[]> {
  const mockNews = [
    {
      title: '央行：稳健货币政策要灵活适度，保持流动性合理充裕',
      summary: '央行发布货币政策执行报告，强调稳健货币政策要灵活适度，保持流动性合理充裕，支持实体经济发展。',
      time: '50分钟前'
    },
    {
      title: '科创板做市商制度效果显现，流动性明显改善',
      summary: '科创板做市商制度实施效果显现，相关股票流动性明显改善，价格发现效率提升。',
      time: '2小时前'
    },
    {
      title: '数字经济板块走强，政策支持力度加大',
      summary: '数字经济板块今日走势强劲，国家对数字经济支持力度不断加大，产业发展进入快车道。',
      time: '3小时前'
    },
    {
      title: '消费品出口数据亮眼，外贸韧性显现',
      summary: '最新数据显示消费品出口保持强劲增长，外贸韧性显现，为全球经济增长贡献中国力量。',
      time: '4.5小时前'
    },
    {
      title: '养老金入市规模扩大，长期资金来源多元化',
      summary: '养老金入市规模持续扩大，长期资金来源更加多元化，资本市场投资者结构不断优化。',
      time: '6小时前'
    }
  ]
  
  return mockNews.map((news, index) => ({
    id: `csnews_mock_${page}_${index}`,
    title: news.title,
    summary: news.summary,
    source: '中国证券报',
    time: news.time,
    url: 'https://www.cs.com.cn/',
    image: undefined
  }))
}
