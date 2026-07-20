/**
 * 新浪财经新闻API
 */
import { Http } from '@capacitor-community/http'
import type { ApiNewsItem } from '../types/news'
import { logger } from '@/utils/logger'
import { parseRssItems } from '@/utils/rss'

/**
 * 新浪财经 RSS Feed URLs（多个备用）
 */
const SINA_RSS_URLS = [
  'https://finance.sina.com.cn/roll/index.d.html?col=financenews&rss=1',
  'https://rss.sina.com.cn/finance/forex.xml',
  'https://rss.sina.com.cn/news/china.xml'
]

/**
 * 抓取新浪财经新闻
 */
export async function fetchSinaNews(page = 1, pageSize = 20): Promise<ApiNewsItem[]> {
  // 尝试所有 RSS URL
  for (const rssUrl of SINA_RSS_URLS) {
    try {
      logger.info(`[新浪财经] 尝试 RSS: ${rssUrl}`)
      const response = await Http.get({
        url: rssUrl,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
      })
      
      if (response.status === 200 && response.data) {
        logger.info(`[新浪财经] ✓ RSS 抓取成功: ${rssUrl}`)
        const items = parseRssItems(response.data, { sourceName: '新浪财经', idPrefix: 'sina', defaultUrl: 'https://finance.sina.com.cn/' })
        if (items.length > 0) {
          return items.slice((page - 1) * pageSize, page * pageSize)
        }
      }
    } catch (e) {
      logger.warn(`[新浪财经] RSS 抓取失败: ${rssUrl}`, e)
    }
  }
  
  // 所有 RSS 都失败，使用模拟数据
  logger.warn('[新浪财经] 所有 RSS 抓取失败，使用模拟数据')
  return generateMockSinaNews(page, pageSize)
}

function parseRSS(xml: string): ApiNewsItem[] {
  return parseRssItems(xml, { sourceName: '新浪财经', idPrefix: 'sina', defaultUrl: 'https://finance.sina.com.cn/' })
}

function generateMockSinaNews(page: number, pageSize: number): ApiNewsItem[] {
  const mockNews = [
    {
      title: '沪深两市成交额突破1.2万亿，创年内新高',
      summary: '今日沪深两市成交额突破1.2万亿元，创年内新高，市场活跃度显著提升。',
      publishedAt: new Date(Date.now() - 15 * 60 * 1000).toISOString()
    },
    {
      title: '北向资金净流入超180亿，外资看好A股',
      summary: '今日北向资金净流入超180亿元，外资持续看好A股市场，净流入规模创近期新高。',
      publishedAt: new Date(Date.now() - 45 * 60 * 1000).toISOString()
    },
    {
      title: '科创板第五套标准上市企业突破100家',
      summary: '科创板实施第五套标准上市的企业数量突破100家，为科技创新企业提供有力支持。',
      publishedAt: new Date(Date.now() - 1.5 * 60 * 60 * 1000).toISOString()
    },
    {
      title: '多只AI概念股涨停，人工智能板块强势',
      summary: '今日人工智能板块表现强势，多只AI概念股涨停，市场对AI应用前景保持乐观。',
      publishedAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString()
    },
    {
      title: '港股恒生指数涨超1.5%，科技股领涨',
      summary: '香港恒生指数今日涨超1.5%，科技股领涨，腾讯、阿里等权重股表现强劲。',
      publishedAt: new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString()
    }
  ]
  
  return mockNews.map((news, index) => ({
    id: `sina_mock_${page}_${index}`,
    title: news.title,
    summary: news.summary,
    source: '新浪财经',
    publishedAt: news.publishedAt,
    url: 'https://finance.sina.com.cn/',
    image: undefined
  }))
}
