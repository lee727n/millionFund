/**
 * 同花顺财经新闻API
 * 使用Capacitor HTTP插件绕过CORS
 */
import { Http } from '@capacitor-community/http'
import type { ApiNewsItem } from '../types/news'
import { logger } from '@/utils/logger'
import { parseRssItems } from '@/utils/rss'
import { generateMockNews } from '@/utils/mockNews'

/**
 * 同花顺 RSS URL 列表（多个备份）
 */
const JQKKA_RSS_URLS = [
  'https://news.10jqka.com.cn/rss/',
  'https://news.10jqka.com.cn/',
  'https://rsshub.app/10jqka/news',  // RSSHub 路由（如有）
]

/**
 * 抓取同花顺财经新闻（通过 RSS）
 */
export async function fetch10jqkaNews(page = 1, pageSize = 20): Promise<ApiNewsItem[]> {
  // 尝试所有 RSS URL
  for (const url of JQKKA_RSS_URLS) {
    try {
      logger.info(`[同花顺] 尝试 RSS: ${url}`)
      
      const response = await Http.get({
        url,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
      })
      
      if (response.status === 200 && response.data) {
        const items = parseRssItems(response.data, { sourceName: '同花顺', idPrefix: '10jqka', defaultUrl: 'https://news.10jqka.com.cn/' })
        if (items.length > 0) {
          logger.info(`[同花顺] ✓ RSS 抓取成功: ${items.length} 条`)
          return items.slice((page - 1) * pageSize, page * pageSize)
        }
      }
    } catch (e) {
      logger.warn(`[同花顺] RSS 抓取失败: ${url}`, e)
    }
  }
  
  // 所有 RSS 都失败，使用模拟数据
  logger.warn('[同花顺] 所有 RSS 源失败，使用模拟数据')
  return generateMockNews('同花顺', '10jqka', 'https://news.10jqka.com.cn/', page, pageSize)
}

/**
 * 解析同花顺 RSS XML 数据
 */
function parse10jqkaRSSItems(xmlData: string): ApiNewsItem[] {
  return parseRssItems(xmlData, { sourceName: '同花顺', idPrefix: '10jqka', defaultUrl: 'https://news.10jqka.com.cn/' })
}
