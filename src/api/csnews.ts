/**
 * 中国证券报新闻API
 */
import type { ApiNewsItem } from '../types/news'

/**
 * 抓取中国证券报新闻
 * TODO: 需找替代数据源（可尝试 RSS 或网页抓取）
 */
export async function fetchCSNews(page = 1, pageSize = 20): Promise<ApiNewsItem[]> {
  try {
    // TODO: 实现真实 API 调用
    // 可尝试的替代方案：
    // 1. 中国证券报 RSS: http://www.cs.com.cn/rss/ (需验证)
    // 2. 网页抓取: http://www.cs.com.cn/
    // 3. 使用 Capitor HTTP 插件绕过 CORS
    
    // 暂时返回模拟数据
    console.warn('[中国证券报] 使用模拟数据（需找替代数据源）')
  } catch (e) {
    console.warn('[中国证券报] 抓取失败，使用模拟数据', e)
  }
  
  // 模拟数据
  const mockNews: ApiNewsItem[] = [
    {
      id: `csnews_mock_${page}_0`,
      title: '央行：稳健货币政策要灵活适度，保持流动性合理充裕',
      summary: '央行发布货币政策执行报告，强调稳健货币政策要灵活适度，保持流动性合理充裕，支持实体经济发展。',
      source: '中国证券报',
      publishedAt: new Date(Date.now() - 50 * 60 * 1000).toISOString(),
      url: 'https://www.cs.com.cn/',
      image: undefined
    },
    {
      id: `csnews_mock_${page}_1`,
      title: '科创板做市商制度效果显现，流动性明显改善',
      summary: '科创板做市商制度实施效果显现，相关股票流动性明显改善，价格发现效率提升。',
      source: '中国证券报',
      publishedAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
      url: 'https://www.cs.com.cn/',
      image: undefined
    },
    {
      id: `csnews_mock_${page}_2`,
      title: '数字经济板块走强，政策支持力度加大',
      summary: '数字经济板块今日走势强劲，国家对数字经济支持力度不断加大，产业发展进入快车道。',
      source: '中国证券报',
      publishedAt: new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString(),
      url: 'https://www.cs.com.cn/',
      image: undefined
    },
    {
      id: `csnews_mock_${page}_3`,
      title: '消费品出口数据亮眼，外贸韧性显现',
      summary: '最新数据显示消费品出口保持强劲增长，外贸韧性显现，为全球经济增长贡献中国力量。',
      source: '中国证券报',
      publishedAt: new Date(Date.now() - 4.5 * 60 * 60 * 1000).toISOString(),
      url: 'https://www.cs.com.cn/',
      image: undefined
    },
    {
      id: `csnews_mock_${page}_4`,
      title: '养老金入市规模扩大，长期资金来源多元化',
      summary: '养老金入市规模持续扩大，长期资金来源更加多元化，资本市场投资者结构不断优化。',
      source: '中国证券报',
      publishedAt: new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString(),
      url: 'https://www.cs.com.cn/',
      image: undefined
    }
  ]
  
  return mockNews
}
