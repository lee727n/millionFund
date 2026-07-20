/**
 * 同花顺财经新闻API
 * 使用Capacitor HTTP插件绕过CORS
 */
import { Http } from '@capacitor-community/http'
import type { ApiNewsItem } from '../types/news'
import { logger } from '@/utils/logger'

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
        const items = parse10jqkaRSSItems(response.data)
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
  return generateMock10jqkaNews(page, pageSize)
}

/**
 * 解析同花顺 RSS XML 数据
 */
function parse10jqkaRSSItems(xmlData: string): ApiNewsItem[] {
  try {
    const items: ApiNewsItem[] = []
    
    // 匹配 <item> 标签
    const itemRegex = /<item>([\s\S]*?)<\/item>/g
    let match
    
    while ((match = itemRegex.exec(xmlData)) !== null) {
      const itemContent = match[1]
      
      // 提取标题
      const titleMatch = /<title>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?<\/title>/.exec(itemContent)
      const title = titleMatch ? titleMatch[1].trim() : ''
      
      // 提取链接
      const linkMatch = /<link>(.*?)<\/link>/.exec(itemContent)
      const url = linkMatch ? linkMatch[1].trim() : ''
      
      // 提取描述
      const descMatch = /<description>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?<\/description>/.exec(itemContent)
      const summary = descMatch ? descMatch[1].trim() : ''
      
      // 提取发布时间
      const dateMatch = /<pubDate>(.*?)<\/pubDate>/.exec(itemContent)
      const dateStr = dateMatch ? dateMatch[1].trim() : ''
      const publishedAt = dateStr ? new Date(dateStr).toISOString() : new Date().toISOString()
      
      if (title) {
        items.push({
          id: `10jqka_${Date.now()}_${items.length}`,
          title,
          summary: summary || title,
          source: '同花顺',
          publishedAt,
          url: url || 'https://news.10jqka.com.cn/',
          image: undefined
        })
      }
    }
    
    return items
  } catch (e) {
    logger.error('[同花顺] RSS 解析失败', e)
    return []
  }
}
