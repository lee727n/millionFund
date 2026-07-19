/**
 * 第一财经新闻API
 * 使用Capacitor HTTP插件绕过CORS
 */
import { Http } from '@capacitor-community/http'
import type { ApiNewsItem } from '../types/news'
import { parseRssItems } from '@/utils/rss'
import { logger } from '@/utils/logger'

/**
 * 第一财经 RSS URL 列表（多个备份）
 */
const YICAI_RSS_URLS = [
  'https://www.yicai.com/rss/',
  'https://www.yicai.com/rss/rss.xml',
  'https://rsshub.app/yicai/news',  // RSSHub 路由（如有）
]

/**
 * 抓取第一财经新闻（通过 RSS）
 */
export async function fetchYicaiNews(page = 1, pageSize = 20): Promise<ApiNewsItem[]> {
  // 尝试所有 RSS URL
  for (const url of YICAI_RSS_URLS) {
    try {
      logger.info(`[第一财经] 尝试 RSS: ${url}`)
      
      const response = await Http.get({
        url,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
      })
      
      if (response.status === 200 && response.data) {
        // [M15] 使用统一 RSS 解析工具
        const items = parseRssItems(response.data, '第一财经', 'yicai', 'https://www.yicai.com/')
        if (items.length > 0) {
          logger.info(`[第一财经] ✓ RSS 抓取成功: ${items.length} 条`)
          return items.slice((page - 1) * pageSize, page * pageSize)
        }
      }
    } catch (e) {
      logger.warn(`[第一财经] RSS 抓取失败: ${url}`, e)
    }
  }
  
  // 所有 RSS 都失败，使用模拟数据
  logger.warn('[第一财经] 所有 RSS 源失败，使用模拟数据')
  return generateMockYicaiNews(page, pageSize)
}

// [M15] 解析逻辑已抽取至 @/utils/rss 的 parseRssItems，避免各数据源重复实现
