// [WHAT] 通用 RSS/Atom 解析工具
// [WHY] 8 个新闻源（证券时报/新浪/中证报/同花顺/腾讯/第一财经/头条/网易）的 RSS 解析逻辑完全重复，
//        此处统一抽取，消除重复并集中维护 CDATA / <item> / <entry> 兼容。
// [DEPS] 依赖类型 @/types/news 的 ApiNewsItem

import type { ApiNewsItem } from '@/types/news'
import { logger } from '@/utils/logger'

const ITEM_REGEX = /<item>([\s\S]*?)<\/item>|<entry>([\s\S]*?)<\/entry>/g
const TITLE_REGEX = /<title>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?<\/title>/
const LINK_REGEX =
  /<link>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?<\/link>|<guid>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?<\/guid>/
const DESC_REGEX =
  /<description>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?<\/description>|<summary>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?<\/summary>/
const DATE_REGEX =
  /<pubDate>(.*?)<\/pubDate>|<published>(.*?)<\/published>|<updated>(.*?)<\/updated>/

export interface RssParseOptions {
  /** 来源展示名（写入 ApiNewsItem.source） */
  sourceName: string
  /** id 前缀（如 'stcn' / 'sina'） */
  idPrefix: string
  /** 当条目无 <link> 时使用的回退地址 */
  defaultUrl?: string
}

/**
 * 解析 RSS 2.0 (<item>) 或 Atom (<entry>) 格式的 XML，返回统一的 ApiNewsItem 列表。
 * 自动兼容 CDATA 包裹、Atom 的 <guid>/<summary>/<published>/<updated> 字段。
 */
export function parseRssItems(xml: string, options: RssParseOptions): ApiNewsItem[] {
  const { sourceName, idPrefix, defaultUrl = '' } = options
  const items: ApiNewsItem[] = []

  try {
    let match: RegExpExecArray | null
    ITEM_REGEX.lastIndex = 0
    while ((match = ITEM_REGEX.exec(xml)) !== null) {
      const itemContent = match[1] || match[2]

      const titleMatch = TITLE_REGEX.exec(itemContent)
      const title = titleMatch ? titleMatch[1].trim() : ''
      if (!title) continue

      const linkMatch = LINK_REGEX.exec(itemContent)
      const url = linkMatch ? (linkMatch[1] || linkMatch[2]).trim() : ''

      const descMatch = DESC_REGEX.exec(itemContent)
      const summaryRaw = descMatch ? (descMatch[1] || descMatch[2]).trim() : ''

      const dateMatch = DATE_REGEX.exec(itemContent)
      const dateStr = dateMatch
        ? (dateMatch[1] || dateMatch[2] || dateMatch[3]).trim()
        : ''
      const publishedAt = dateStr ? new Date(dateStr).toISOString() : new Date().toISOString()

      items.push({
        id: `${idPrefix}_${Date.now()}_${items.length}`,
        title,
        summary: summaryRaw || title,
        source: sourceName,
        publishedAt,
        url: url || defaultUrl,
        image: undefined
      })
    }
    return items
  } catch (e) {
    logger.error(`[rss] 解析失败: ${sourceName}`, e)
    return []
  }
}
