/**
 * 证券时报新闻API
 */
import type { ApiNewsItem } from '../types/news'

/**
 * 抓取证券时报新闻
 * TODO: 需找替代数据源（可尝试 RSS 或网页抓取）
 */
export async function fetchSTCNNews(page = 1, pageSize = 20): Promise<ApiNewsItem[]> {
  try {
    // TODO: 实现真实 API 调用
    // 可尝试的替代方案：
    // 1. 证券时报 RSS: http://www.stcn.com/rss/ (需验证)
    // 2. 网页抓取: http://www.stcn.com/
    // 3. 使用 Capitor HTTP 插件绕过 CORS
    
    // 暂时返回模拟数据
    console.warn('[证券时报] 使用模拟数据（需找替代数据源）')
  } catch (e) {
    console.warn('[证券时报] 抓取失败，使用模拟数据', e)
  }
  
  // 模拟数据
  const mockNews: ApiNewsItem[] = [
    {
      id: `stcn_mock_${page}_0`,
      title: '监管层：继续优化上市融资制度，支持科技创新',
      summary: '证监会表示将继续优化上市融资制度，加大对科技创新企业的支持力度，提升资本市场服务实体经济能力。',
      source: '证券时报',
      publishedAt: new Date(Date.now() - 45 * 60 * 1000).toISOString(),
      url: 'https://www.stcn.com/',
      image: undefined
    },
    {
      id: `stcn_mock_${page}_1`,
      title: '多家上市公司披露半年度业绩预告，超七成预喜',
      summary: '多家上市公司披露2026年半年度业绩预告，超过七成企业预喜，上市公司整体经营业绩稳步改善。',
      source: '证券时报',
      publishedAt: new Date(Date.now() - 1.8 * 60 * 60 * 1000).toISOString(),
      url: 'https://www.stcn.com/',
      image: undefined
    },
    {
      id: `stcn_mock_${page}_2`,
      title: 'REITs市场扩容提速，基础设施项目加速上市',
      summary: 'REITs市场扩容提速，多只基础设施REITs项目加速上市，为基础设施建设提供资金支持。',
      source: '证券时报',
      publishedAt: new Date(Date.now() - 2.8 * 60 * 60 * 1000).toISOString(),
      url: 'https://www.stcn.com/',
      image: undefined
    },
    {
      id: `stcn_mock_${page}_3`,
      title: '互联互通机制优化，外资配置A股更便利',
      summary: '互联互通机制持续优化，外资配置A股更加便利，资本市场双向开放水平不断提升。',
      source: '证券时报',
      publishedAt: new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString(),
      url: 'https://www.stcn.com/',
      image: undefined
    },
    {
      id: `stcn_mock_${page}_4`,
      title: '期货公司风险管理业务快速增长，服务实体能力增强',
      summary: '期货公司风险管理业务规模快速增长，服务实体经济能力持续增强，行业高质量发展稳步推进。',
      source: '证券时报',
      publishedAt: new Date(Date.now() - 5.5 * 60 * 60 * 1000).toISOString(),
      url: 'https://www.stcn.com/',
      image: undefined
    }
  ]
  
  return mockNews
}
