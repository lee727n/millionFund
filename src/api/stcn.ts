/**
 * 证券时报新闻API
 * 使用Capacitor HTTP插件绕过CORS
 */
import { Http } from '@capacitor-community/http'
import type { ApiNewsItem } from '../types/news'
import { logger } from '@/utils/logger'
import { parseRssItems } from '@/utils/rss'

/**
 * 证券时报 RSS URL 列表（多个备份）
 */
const STCN_RSS_URLS = [
  'http://www.stcn.com/rss/',
  'http://www.stcn.com/rss/rss.xml',
  'https://rsshub.app/stcn/news',  // RSSHub 路由（如有）
]

/**
 * 抓取证券时报新闻（通过 RSS）
 */
export async function fetchSTCNNews(page = 1, pageSize = 20): Promise<ApiNewsItem[]> {
  // 尝试所有 RSS URL
  for (const url of STCN_RSS_URLS) {
    try {
      logger.info(`[证券时报] 尝试 RSS: ${url}`)
      
      const response = await Http.get({
        url,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
      })
      
      if (response.status === 200 && response.data) {
        const items = parseRssItems(response.data, { sourceName: '证券时报', idPrefix: 'stcn', defaultUrl: 'http://www.stcn.com/' })
        if (items.length > 0) {
          logger.info(`[证券时报] ✓ RSS 抓取成功: ${items.length} 条`)
          return items.slice((page - 1) * pageSize, page * pageSize)
        }
      }
    } catch (e) {
      logger.warn(`[证券时报] RSS 抓取失败: ${url}`, e)
    }
  }
  
  // 所有 RSS 都失败，使用模拟数据
  logger.warn('[证券时报] 所有 RSS 源失败，使用模拟数据')
  return generateMockSTCNNews(page, pageSize)
}

/**
 * 解析证券时报 RSS XML 数据
 */
function parseSTCNRSSItems(xmlData: string): ApiNewsItem[] {
  return parseRssItems(xmlData, { sourceName: '证券时报', idPrefix: 'stcn', defaultUrl: 'http://www.stcn.com/' })
}
