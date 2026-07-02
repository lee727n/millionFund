/**
 * 第一财经新闻API
 * 使用Capacitor HTTP插件绕过CORS
 */
import { Http } from '@capacitor-community/http'
import type { ApiNewsItem } from '../types/news'

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
      console.log(`[第一财经] 尝试 RSS: ${url}`)
      
      const response = await Http.get({
        url,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
      })
      
      if (response.status === 200 && response.data) {
        const items = parseYicaiRSSItems(response.data)
        if (items.length > 0) {
          console.log(`[第一财经] ✓ RSS 抓取成功: ${items.length} 条`)
          return items.slice((page - 1) * pageSize, page * pageSize)
        }
      }
    } catch (e) {
      console.warn(`[第一财经] RSS 抓取失败: ${url}`, e)
    }
  }
  
  // 所有 RSS 都失败，使用模拟数据
  console.warn('[第一财经] 所有 RSS 源失败，使用模拟数据')
  return generateMockYicaiNews(page, pageSize)
}

/**
 * 解析第一财经 RSS XML 数据
 */
function parseYicaiRSSItems(xmlData: string): ApiNewsItem[] {
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
          id: `yicai_${Date.now()}_${items.length}`,
          title,
          summary: summary || title,
          source: '第一财经',
          publishedAt,
          url: url || 'https://www.yicai.com/',
          image: undefined
        })
      }
    }
    
    return items
  } catch (e) {
    console.error('[第一财经] RSS 解析失败', e)
    return []
  }
}
