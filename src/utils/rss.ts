// [WHY] 统一 RSS / Atom 解析工具（M15）
// [WHAT] 提供 parseRssItems，从 RSS 2.0（<item>）或 Atom（<entry>）XML 提取 ApiNewsItem[]
// [DEPS] 被各新闻源 API 文件（toutiao / sina / netease / tencent / 10jqka / stcn / yicai / csnews）复用，
//        替代原先 8 份近乎重复的解析实现

import type { ApiNewsItem } from '../types/news'

/**
 * 解析 RSS / Atom XML，提取资讯列表
 * @param xml - RSS 2.0 或 Atom 格式的 XML 字符串
 * @param source - 数据源中文名（如「新浪财经」），用于 ApiNewsItem.source 字段
 * @param sourceKey - 数据源英文标识（如「sina」），用于生成唯一 id 前缀
 * @param fallbackUrl - 当条目无链接时使用的兜底地址（通常为数据源首页）
 * @returns ApiNewsItem[] 解析成功的新闻项；解析失败返回空数组
 */
export function parseRssItems(
  xml: string,
  source: string,
  sourceKey: string,
  fallbackUrl = ''
): ApiNewsItem[] {
  try {
    const items: ApiNewsItem[] = []

    // 同时支持 RSS 2.0 的 <item> 与 Atom 的 <entry>
    const itemRegex = /<item>([\s\S]*?)<\/item>|<entry>([\s\S]*?)<\/entry>/g
    let match: RegExpExecArray | null

    while ((match = itemRegex.exec(xml)) !== null) {
      const itemContent = match[1] || match[2] || ''

      // 标题（兼容 CDATA）
      const titleMatch = /<title>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?<\/title>/.exec(itemContent)
      const title = titleMatch ? titleMatch[1].trim() : ''

      // 链接：优先 <link>，其次 <guid>
      const linkMatch = /<link>(.*?)<\/link>|<guid>(.*?)<\/guid>/.exec(itemContent)
      const url = linkMatch ? (linkMatch[1] || linkMatch[2]).trim() : ''

      // 摘要：兼容 <description> 与 <summary>，兼容 CDATA
      const descMatch = /<description>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?<\/description>|<summary>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?<\/summary>/.exec(itemContent)
      const summary = descMatch ? (descMatch[1] || descMatch[2]).trim() : ''

      // 发布时间：兼容 <pubDate> / <published> / <updated>
      const dateMatch = /<pubDate>(.*?)<\/pubDate>|<published>(.*?)<\/published>|<updated>(.*?)<\/updated>/.exec(itemContent)
      const dateStr = dateMatch ? (dateMatch[1] || dateMatch[2] || dateMatch[3]).trim() : ''
      const publishedAt = dateStr ? new Date(dateStr).toISOString() : new Date().toISOString()

      if (title) {
        items.push({
          id: `${sourceKey}_${Date.now()}_${items.length}`,
          title,
          summary: summary || title,
          source,
          publishedAt,
          url: url || fallbackUrl,
          image: undefined
        })
      }
    }

    return items
  } catch (e) {
    console.error(`[rss] 解析 ${source} RSS 失败`, e)
    return []
  }
}
