/**
 * 网易财经新闻API
 */
import { Http } from '@capacitor-community/http'
import type { ApiNewsItem } from '../types/news'
import { logger } from '@/utils/logger'
import { parseRssItems } from '@/utils/rss'

/**
 * 网易财经 RSS Feed URLs（多个备用）
 */
const NETEASE_RSS_URLS = [
  'https://money.163.com/special/002557S6/rss.html',
  'https://rss.163.com/news/finance.xml',
  'https://www.163.com/rss/'
]

/**
 * 抓取网易财经新闻
 */
export async function fetchNeteaseNews(page = 1, pageSize = 20): Promise<ApiNewsItem[]> {
  // 尝试所有 RSS URL
  for (const rssUrl of NETEASE_RSS_URLS) {
    try {
      logger.info(`[网易财经] 尝试 RSS: ${rssUrl}`)
      const response = await Http.get({
        url: rssUrl,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
      })
      
      if (response.status === 200 && response.data) {
        logger.info(`[网易财经] ✓ RSS 抓取成功: ${rssUrl}`)
        const items = parseRssItems(response.data, { sourceName: '网易财经', idPrefix: 'netease', defaultUrl: 'https://money.163.com/' })
        if (items.length > 0) {
          return items.slice((page - 1) * pageSize, page * pageSize)
        }
      }
    } catch (e) {
      logger.warn(`[网易财经] RSS 抓取失败: ${rssUrl}`, e)
    }
  }
  
  // 所有 RSS 都失败，使用模拟数据
  logger.warn('[网易财经] 所有 RSS 抓取失败，使用模拟数据')
  return generateMockNeteaseNews(page, pageSize)
}

function parseRSS(xml: string): ApiNewsItem[] {
  return parseRssItems(xml, { sourceName: '网易财经', idPrefix: 'netease', defaultUrl: 'https://money.163.com/' })
}

function generateMockNeteaseNews(page: number, pageSize: number): ApiNewsItem[] {
  const mockNews = [
    {
      title: '国常会：研究进一步降低实体经济融资成本',
      summary: '国务院常务会议研究进一步降低实体经济融资成本的措施，加大对小微企业支持力度。',
      publishedAt: new Date(Date.now() - 20 * 60 * 1000).toISOString()
    },
    {
      title: '人民币汇率保持稳定，中间价上调',
      summary: '人民币对美元汇率中间价上调，汇率保持稳定，市场预期平稳。',
      publishedAt: new Date(Date.now() - 50 * 60 * 1000).toISOString()
    },
    {
      title: '多省份公布上半年经济数据，GDP增速超预期',
      summary: '多个省份公布上半年经济运行数据，GDP增速普遍超出预期，经济复苏势头良好。',
      publishedAt: new Date(Date.now() - 1.2 * 60 * 60 * 1000).toISOString()
    },
    {
      title: '新能源汽车销量再创新高，渗透率突破40%',
      summary: '6月新能源汽车销量再创新高，市场渗透率突破40%，行业保持高速增长。',
      publishedAt: new Date(Date.now() - 2.5 * 60 * 60 * 1000).toISOString()
    },
    {
      title: '房地产政策持续优化，多地放松限购',
      summary: '多个城市优化房地产政策，放松限购措施，促进房地产市场平稳健康发展。',
      publishedAt: new Date(Date.now() - 3.5 * 60 * 60 * 1000).toISOString()
    }
  ]
  
  return mockNews.map((news, index) => ({
    id: `netease_mock_${page}_${index}`,
    title: news.title,
    summary: news.summary,
    source: '网易财经',
    publishedAt: news.publishedAt,
    url: 'https://money.163.com/',
    image: undefined
  }))
}
