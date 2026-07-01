/**
 * 证券时报新闻API
 */
import type { NewsItem } from './toutiao'

export async function fetchSTCNNews(page = 1, pageSize = 20): Promise<NewsItem[]> {
  const mockNews = [
    {
      title: '监管层：继续优化上市融资制度，支持科技创新',
      summary: '证监会表示将继续优化上市融资制度，加大对科技创新企业的支持力度，提升资本市场服务实体经济能力。',
      time: '45分钟前'
    },
    {
      title: '多家上市公司披露半年度业绩预告，超七成预喜',
      summary: '多家上市公司披露2026年半年度业绩预告，超过七成企业预喜，上市公司整体经营业绩稳步改善。',
      time: '1.8小时前'
    },
    {
      title: 'REITs市场扩容提速，基础设施项目加速上市',
      summary: 'REITs市场扩容提速，多只基础设施REITs项目加速上市，为基础设施建设提供资金支持。',
      time: '2.8小时前'
    },
    {
      title: '互联互通机制优化，外资配置A股更便利',
      summary: '互联互通机制持续优化，外资配置A股更加便利，资本市场双向开放水平不断提升。',
      time: '4小时前'
    },
    {
      title: '期货公司风险管理业务快速增长，服务实体能力增强',
      summary: '期货公司风险管理业务规模快速增长，服务实体经济能力持续增强，行业高质量发展稳步推进。',
      time: '5.5小时前'
    }
  ]
  
  return mockNews.map((news, index) => ({
    id: `stcn_mock_${page}_${index}`,
    title: news.title,
    summary: news.summary,
    source: '证券时报',
    time: news.time,
    url: 'https://www.stcn.com/',
    image: undefined
  }))
}
