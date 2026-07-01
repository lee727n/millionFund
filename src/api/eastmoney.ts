/**
 * 东方财富新闻API
 */
import type { NewsItem } from './toutiao'

export async function fetchEastmoneyNews(page = 1, pageSize = 20): Promise<NewsItem[]> {
  const mockNews = [
    {
      title: 'A股日成交额连续5日超万亿，市场活跃度高',
      summary: 'A股市场日成交额连续5个交易日突破万亿元，市场活跃度维持高位，投资者信心增强。',
      time: '35分钟前'
    },
    {
      title: '社保基金增持多只蓝筹股，长期资金持续入市',
      summary: '社保基金二季度增持多只蓝筹股，长期资金持续入市，价值投资理念得到践行。',
      time: '1.2小时前'
    },
    {
      title: '医药板块强势反弹，创新药企集体大涨',
      summary: '医药板块今日强势反弹，创新药企业集体大涨，市场对行业政策预期改善。',
      time: '2.2小时前'
    },
    {
      title: '军工板块表现亮眼，多只个股涨停',
      summary: '军工板块今日表现亮眼，多只个股涨停，国防现代化建设持续推进。',
      time: '3.2小时前'
    },
    {
      title: '光伏板块企稳回升，产业链价格止跌企稳',
      summary: '光伏板块今日企稳回升，产业链价格止跌企稳，行业基本面有望改善。',
      time: '4.5小时前'
    }
  ]
  
  return mockNews.map((news, index) => ({
    id: `eastmoney_mock_${page}_${index}`,
    title: news.title,
    summary: news.summary,
    source: '东方财富',
    time: news.time,
    url: 'https://www.eastmoney.com/',
    image: undefined
  }))
}
