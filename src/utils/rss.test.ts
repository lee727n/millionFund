// [WHAT] 测试通用 RSS/Atom 解析工具 parseRssItems
// [WHY] 8 个新闻源统一委托此函数，需覆盖 RSS <item> / Atom <entry>、CDATA、link/guid、description/summary、pubDate/published/updated 各种组合
// [DEPS] src/utils/rss

import { describe, test, expect } from 'vitest'
import { parseRssItems } from '@/utils/rss'

const OPTS = { sourceName: '测试源', idPrefix: 'test', defaultUrl: 'https://example.com/' }

describe('parseRssItems - RSS 2.0 <item>', () => {
  test('基础 item 解析（title/link/description/pubDate）', () => {
    const xml = `<?xml version="1.0"?><rss><channel>
      <item>
        <title>测试标题</title>
        <link>https://example.com/a</link>
        <description>摘要内容</description>
        <pubDate>Wed, 02 Oct 2024 13:00:00 GMT</pubDate>
      </item>
    </channel></rss>`

    const items = parseRssItems(xml, OPTS)
    expect(items).toHaveLength(1)
    expect(items[0]!.title).toBe('测试标题')
    expect(items[0]!.url).toBe('https://example.com/a')
    expect(items[0]!.summary).toBe('摘要内容')
    expect(items[0]!.source).toBe('测试源')
    expect(items[0]!.image).toBeUndefined()
    // pubDate RFC822 -> ISO
    expect(items[0]!.publishedAt).toBe('2024-10-02T13:00:00.000Z')
    expect(items[0]!.id).toMatch(/^test_\d+_0$/)
  })

  test('title 被 CDATA 包裹时正确去除 CDATA', () => {
    const xml = `<rss><channel><item>
      <title><![CDATA[CDATA 标题 & 特殊字符]]></title>
      <link>https://example.com/b</link>
      <description><![CDATA[CDATA 摘要]]></description>
    </item></channel></rss>`

    const items = parseRssItems(xml, OPTS)
    expect(items).toHaveLength(1)
    expect(items[0]!.title).toBe('CDATA 标题 & 特殊字符')
    expect(items[0]!.summary).toBe('CDATA 摘要')
  })

  test('link 被 CDATA 包裹时正确提取', () => {
    const xml = `<rss><channel><item>
      <title>链接CD</title>
      <link><![CDATA[https://example.com/cdata]]></link>
      <description>d</description>
    </item></channel></rss>`

    const items = parseRssItems(xml, OPTS)
    expect(items[0]!.url).toBe('https://example.com/cdata')
  })

  test('无 link 时回退到 defaultUrl', () => {
    const xml = `<rss><channel><item>
      <title>无链接</title>
      <description>d</description>
    </item></channel></rss>`

    const items = parseRssItems(xml, OPTS)
    expect(items[0]!.url).toBe('https://example.com/')
  })

  test('无 description/summary 时 summary 回退为 title', () => {
    const xml = `<rss><channel><item>
      <title>仅标题</title>
      <link>https://example.com/x</link>
    </item></channel></rss>`

    const items = parseRssItems(xml, OPTS)
    expect(items[0]!.summary).toBe('仅标题')
  })

  test('无 pubDate 时 publishedAt 为合法 ISO 字符串（当前时间）', () => {
    const xml = `<rss><channel><item>
      <title>无日期</title>
      <link>https://example.com/x</link>
      <description>d</description>
    </item></channel></rss>`

    const items = parseRssItems(xml, OPTS)
    expect(items[0]!.publishedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/)
  })
})

describe('parseRssItems - <guid> 作为链接', () => {
  test('无 link 但有 guid 时，guid 作为 url', () => {
    const xml = `<rss><channel><item>
      <title>用guid</title>
      <guid>https://example.com/guid</guid>
      <description>d</description>
    </item></channel></rss>`

    const items = parseRssItems(xml, OPTS)
    expect(items[0]!.url).toBe('https://example.com/guid')
  })

  test('link 与 guid 同时存在时优先使用 link', () => {
    const xml = `<rss><channel><item>
      <title>link优先</title>
      <link>https://example.com/link</link>
      <guid>https://example.com/guid</guid>
      <description>d</description>
    </item></channel></rss>`

    const items = parseRssItems(xml, OPTS)
    expect(items[0]!.url).toBe('https://example.com/link')
  })
})

describe('parseRssItems - Atom <entry>', () => {
  test('基础 entry 解析（title/link/summary/published）', () => {
    const xml = `<feed xmlns="http://www.w3.org/2005/Atom">
      <entry>
        <title>Atom标题</title>
        <link>https://example.com/atom</link>
        <summary>Atom摘要</summary>
        <published>2024-01-15T08:30:00Z</published>
      </entry>
    </feed>`

    const items = parseRssItems(xml, OPTS)
    expect(items).toHaveLength(1)
    expect(items[0]!.title).toBe('Atom标题')
    expect(items[0]!.url).toBe('https://example.com/atom')
    expect(items[0]!.summary).toBe('Atom摘要')
    expect(items[0]!.publishedAt).toBe('2024-01-15T08:30:00.000Z')
  })

  test('entry 使用 <updated> 而非 <published> 时正确解析', () => {
    const xml = `<feed xmlns="http://www.w3.org/2005/Atom">
      <entry>
        <title>仅updated</title>
        <link>https://example.com/u</link>
        <summary>s</summary>
        <updated>2024-03-20T12:00:00Z</updated>
      </entry>
    </feed>`

    const items = parseRssItems(xml, OPTS)
    expect(items[0]!.publishedAt).toBe('2024-03-20T12:00:00.000Z')
  })

  test('entry 的 link 使用 href 属性（无文本）时回退到 defaultUrl', () => {
    // 当前实现仅支持 <link>文本</link>，Atom href 属性形式无法提取文本链接
    const xml = `<feed xmlns="http://www.w3.org/2005/Atom">
      <entry>
        <title>href链接</title>
        <link href="https://example.com/attr"/>
        <summary>s</summary>
        <updated>2024-03-20T12:00:00Z</updated>
      </entry>
    </feed>`

    const items = parseRssItems(xml, OPTS)
    expect(items[0]!.url).toBe('https://example.com/')
  })
})

describe('parseRssItems - 边界与健壮性', () => {
  test('多 item 均被解析', () => {
    const xml = `<rss><channel>
      <item><title>A</title><link>https://a</link><description>d</description></item>
      <item><title>B</title><link>https://b</link><description>d</description></item>
      <item><title>C</title><link>https://c</link><description>d</description></item>
    </channel></rss>`

    const items = parseRssItems(xml, OPTS)
    expect(items).toHaveLength(3)
    expect(items.map((i) => i.title)).toEqual(['A', 'B', 'C'])
    // id 后缀编号递增，避免重复
    expect(items[0]!.id).toMatch(/_0$/)
    expect(items[1]!.id).toMatch(/_1$/)
    expect(items[2]!.id).toMatch(/_2$/)
  })

  test('title 为空的 item 被跳过', () => {
    const xml = `<rss><channel>
      <item><title></title><link>https://a</link><description>d</description></item>
      <item><title>有效</title><link>https://b</link><description>d</description></item>
    </channel></rss>`

    const items = parseRssItems(xml, OPTS)
    expect(items).toHaveLength(1)
    expect(items[0]!.title).toBe('有效')
  })

  test('空 XML 返回空数组', () => {
    expect(parseRssItems('', OPTS)).toEqual([])
    expect(parseRssItems('<rss><channel></channel></rss>', OPTS)).toEqual([])
  })

  test('idPrefix 与 sourceName 正确写入输出', () => {
    const xml = `<rss><channel><item><title>P</title><link>https://p</link><description>d</description></item></channel></rss>`
    const items = parseRssItems(xml, { sourceName: '证券时报', idPrefix: 'stcn', defaultUrl: 'http://www.stcn.com/' })
    expect(items[0]!.source).toBe('证券时报')
    expect(items[0]!.id).toMatch(/^stcn_\d+_0$/)
  })

  test('非法日期字符串导致整次解析返回空数组（当前容错行为）', () => {
    // new Date('not-a-date').toISOString() 会抛错，被 catch 捕获后整体返回 []
    const xml = `<rss><channel><item><title>坏日期</title><link>https://x</link><pubDate>不是日期</pubDate></item></channel></rss>`
    expect(parseRssItems(xml, OPTS)).toEqual([])
  })
})
