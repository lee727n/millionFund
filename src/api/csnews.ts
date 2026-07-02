/**
 * 中国证券报新闻API
 * 使用Capacitor HTTP插件绕过CORS
 */
import { Http } from '@capacitor-community/http'
import type { ApiNewsItem } from '../types/news'

/**
 * 中国证券报 RSS URL 列表（多个备份）
 */
const CSNEWS_RSS_URLS = [
  'http://www.cs.com.cn/rss/',
  'http://www.cs.com.cn/rss/rss.xml',
  'https://rsshub.app/cs/news',  // RSSHub 路由（如有）
]

/**
 * 抓取中国证券报新闻（通过 RSS）
 */
export async function fetchCSNews(page = 1, pageSize = 20): Promise<ApiNewsItem[]> {
  // 尝试所有 RSS URL
  for (const url of CSNEWS_RSS_URLS) {
    try {
      console.log(`[中国证券报] 尝试 RSS: ${url}`)
      
      const response = await Http.get({
        url,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
      })
      
      if (response.status === 200 && response.data) {
        const items = parseCSNewsRSSItems(response.data)
        if (items.length > 0) {
          console.log(`[中国证券报] ✓ RSS 抓取成功: ${items.length} 条`)
          return items.slice((page - 1) * pageSize, page * pageSize)
        }
      }
    } catch (e) {
      console.warn(`[中国证券报] RSS 抓取失败: ${url}`, e)
    }
  }
  
  // 所有 RSS 都失败，使用模拟数据
  console.warn('[中国证券报] 所有 RSS 源失败，使用模拟数据')
  return generateMockCSNews(page, pageSize)
}

/**
 * 解析中国证券报 RSS XML 数据
 */
function parseCSNewsRSSItems(xmlData: string): ApiNewsItem[] {
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
          id: `csnews_${Date.now()}_${items.length}`,
          title,
          summary: summary || title,
          source: '中国证券报',
          publishedAt,
          url: url || 'http://www.cs.com.cn/',
          image: undefined
        })
      }
    }
    
    return items
  } catch (e) {
    console.error('[中国证券报] RSS 解析失败', e)
    return []
  }
}
