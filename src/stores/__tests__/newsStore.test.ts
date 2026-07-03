// [WHY] news store 单元测试：验证新闻列表、搜索筛选与缓存清理逻辑
import { describe, it, expect, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useNewsStore } from '@/stores/newsStore'
import type { ApiNewsItem } from '@/types/news'

beforeEach(() => {
  setActivePinia(createPinia())
})

// 构造测试用新闻条目
function makeArticle(overrides: Partial<ApiNewsItem> = {}): ApiNewsItem {
  return {
    id: '1',
    title: '测试新闻标题',
    summary: '这是一段测试摘要',
    url: 'https://example.com/1',
    publishedAt: '2024-01-01T00:00:00Z',
    source: 'jin10',
    ...overrides,
  }
}

describe('useNewsStore - 新闻状态管理', () => {
  it('初始状态：空列表、无错误、来源为 all', () => {
    const store = useNewsStore()
    expect(store.articles).toEqual([])
    expect(store.loading).toBe(false)
    expect(store.error).toBeNull()
    expect(store.searchKeyword).toBe('')
    expect(store.activeSource).toBe('all')
    expect(store.lastFetchTime).toBe(0)
    expect(store.articleCount).toBe(0)
    expect(store.filteredCount).toBe(0)
  })

  it('setArticles：写入列表并记录抓取时间', () => {
    const store = useNewsStore()
    const list = [
      makeArticle({ id: '1', title: '新闻一' }),
      makeArticle({ id: '2', title: '新闻二' }),
    ]
    store.setArticles(list)
    expect(store.articles).toHaveLength(2)
    expect(store.articles[0]?.id).toBe('1')
    expect(store.articleCount).toBe(2)
    expect(store.lastFetchTime).toBeGreaterThan(0)
  })

  it('setSearchKeyword：写入搜索关键词', () => {
    const store = useNewsStore()
    store.setSearchKeyword('基金')
    expect(store.searchKeyword).toBe('基金')
  })

  it('filteredArticles：按关键词过滤标题/摘要/来源', () => {
    const store = useNewsStore()
    store.setArticles([
      makeArticle({ id: '1', title: '基金净值大涨', summary: '摘要A', source: 'jin10' }),
      makeArticle({ id: '2', title: '股票震荡', summary: '基金调仓', source: 'sina' }),
      makeArticle({ id: '3', title: '外汇新闻', summary: '美元走强', source: 'jin10' }),
    ])

    // 无关键词：返回全部
    expect(store.filteredArticles).toHaveLength(3)
    expect(store.filteredCount).toBe(3)

    // 关键词命中标题
    store.setSearchKeyword('净值')
    expect(store.filteredArticles).toHaveLength(1)
    expect(store.filteredArticles[0]?.id).toBe('1')

    // 关键词命中摘要
    store.setSearchKeyword('调仓')
    expect(store.filteredArticles).toHaveLength(1)
    expect(store.filteredArticles[0]?.id).toBe('2')

    // 关键词命中来源（大小写不敏感）
    store.setSearchKeyword('SINA')
    expect(store.filteredArticles).toHaveLength(1)
    expect(store.filteredArticles[0]?.id).toBe('2')

    // 关键词无匹配
    store.setSearchKeyword('不存在的关键词')
    expect(store.filteredArticles).toHaveLength(0)
    expect(store.filteredCount).toBe(0)
  })

  it('filteredArticles：按数据源过滤', () => {
    const store = useNewsStore()
    store.setArticles([
      makeArticle({ id: '1', source: 'jin10' }),
      makeArticle({ id: '2', source: 'sina' }),
      makeArticle({ id: '3', source: 'jin10' }),
    ])

    store.setActiveSource('jin10')
    expect(store.filteredArticles).toHaveLength(2)
    expect(store.filteredArticles.every(a => a.source === 'jin10')).toBe(true)

    // all 返回全部
    store.setActiveSource('all')
    expect(store.filteredArticles).toHaveLength(3)
  })

  it('filteredArticles：来源与关键词组合过滤', () => {
    const store = useNewsStore()
    store.setArticles([
      makeArticle({ id: '1', title: '基金大涨', source: 'jin10' }),
      makeArticle({ id: '2', title: '基金大跌', source: 'sina' }),
      makeArticle({ id: '3', title: '股票震荡', source: 'jin10' }),
    ])

    store.setActiveSource('jin10')
    store.setSearchKeyword('基金')
    // jin10 来源中标题含"基金"的只有 id=1
    expect(store.filteredArticles).toHaveLength(1)
    expect(store.filteredArticles[0]?.id).toBe('1')
  })

  it('clearArticles：清空列表与抓取时间', () => {
    const store = useNewsStore()
    store.setArticles([makeArticle({ id: '1' }), makeArticle({ id: '2' })])
    expect(store.articleCount).toBe(2)
    expect(store.lastFetchTime).toBeGreaterThan(0)

    store.clearArticles()

    expect(store.articles).toEqual([])
    expect(store.articleCount).toBe(0)
    expect(store.lastFetchTime).toBe(0)
  })

  it('setLoading / setError：写入加载与错误状态', () => {
    const store = useNewsStore()
    store.setLoading(true)
    expect(store.loading).toBe(true)

    store.setError('网络异常')
    expect(store.error).toBe('网络异常')

    store.setLoading(false)
    store.setError(null)
    expect(store.loading).toBe(false)
    expect(store.error).toBeNull()
  })
})
