import { describe, test, expect, vi, beforeEach } from 'vitest'

// Mock all API modules
vi.mock('@/api/jin10', () => ({
  fetchNewsList: vi.fn(),
  fetchFlashNews: vi.fn(),
  fetchEconomicCalendar: vi.fn()
}))

vi.mock('@/api/cls', () => ({
  fetchClsTelegram: vi.fn(),
  fetchClsHotTopics: vi.fn(),
  fetchClsPlateMovement: vi.fn()
}))

vi.mock('@/api/xueqiu', () => ({
  fetchHotDiscussions: vi.fn(),
  fetchStockSentimentList: vi.fn(),
  fetchUserViews: vi.fn()
}))

vi.mock('@/api/choice', () => ({
  fetchNorthFlow: vi.fn(),
  fetchSectorFlows: vi.fn(),
  fetchMainForceFlow: vi.fn()
}))

describe('news.ts', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  test('fetchJin10Flash 成功获取快讯', async () => {
    const { fetchFlashNews } = await import('@/api/jin10')
    fetchFlashNews.mockResolvedValue([{ id: '1', content: 'test' }])

    const { fetchJin10Flash } = await import('@/api/news')
    const result = await fetchJin10Flash()

    expect(result.length).toBe(1)
    expect(result[0]!.id).toBe('1')
  })

  test('fetchJin10Flash 失败时返回空数组', async () => {
    const { fetchFlashNews } = await import('@/api/jin10')
    fetchFlashNews.mockRejectedValue(new Error('error'))

    const { fetchJin10Flash } = await import('@/api/news')
    const result = await fetchJin10Flash()

    expect(result).toEqual([])
  })

  test('fetchJin10News 成功获取新闻', async () => {
    const { fetchNewsList } = await import('@/api/jin10')
    fetchNewsList.mockResolvedValue([{ id: '1', title: 'test' }])

    const { fetchJin10News } = await import('@/api/news')
    const result = await fetchJin10News(1, 20, 'all')

    expect(result.length).toBe(1)
  })

  test('fetchJin10Calendar 成功获取日历', async () => {
    const { fetchEconomicCalendar } = await import('@/api/jin10')
    fetchEconomicCalendar.mockResolvedValue([{ id: '1', event: 'test' }])

    const { fetchJin10Calendar } = await import('@/api/news')
    const result = await fetchJin10Calendar('2024-01-01')

    expect(result.length).toBe(1)
  })

  test('fetchCailianNews 成功获取电报', async () => {
    const { fetchClsTelegram } = await import('@/api/cls')
    fetchClsTelegram.mockResolvedValue([{ id: '1', content: 'test' }])

    const { fetchCailianNews } = await import('@/api/news')
    const result = await fetchCailianNews(20)

    expect(result.length).toBe(1)
  })

  test('fetchCailianHotTopics 成功获取热门主题', async () => {
    const { fetchClsHotTopics } = await import('@/api/cls')
    fetchClsHotTopics.mockResolvedValue([{ id: '1', topic: 'test' }])

    const { fetchCailianHotTopics } = await import('@/api/news')
    const result = await fetchCailianHotTopics()

    expect(result.length).toBe(1)
  })

  test('fetchCailianPlate 成功获取板块异动', async () => {
    const { fetchClsPlateMovement } = await import('@/api/cls')
    fetchClsPlateMovement.mockResolvedValue([{ sector: 'test', change: 1.0 }])

    const { fetchCailianPlate } = await import('@/api/news')
    const result = await fetchCailianPlate()

    expect(result.length).toBe(1)
  })

  test('fetchXueqiuDiscussions 成功获取讨论', async () => {
    const { fetchHotDiscussions } = await import('@/api/xueqiu')
    fetchHotDiscussions.mockResolvedValue([{ id: '1', title: 'test' }])

    const { fetchXueqiuDiscussions } = await import('@/api/news')
    const result = await fetchXueqiuDiscussions('fund', 20)

    expect(result.length).toBe(1)
  })

  test('fetchXueqiuSentiment 成功获取情绪', async () => {
    const { fetchStockSentimentList } = await import('@/api/xueqiu')
    fetchStockSentimentList.mockResolvedValue([{ stock: 'test', score: 80 }])

    const { fetchXueqiuSentiment } = await import('@/api/news')
    const result = await fetchXueqiuSentiment('fund', 10)

    expect(result.length).toBe(1)
  })

  test('fetchXueqiuViews 成功获取大V观点', async () => {
    const { fetchUserViews } = await import('@/api/xueqiu')
    fetchUserViews.mockResolvedValue([{ id: '1', content: 'test' }])

    const { fetchXueqiuViews } = await import('@/api/news')
    const result = await fetchXueqiuViews(10)

    expect(result.length).toBe(1)
  })

  test('fetchChoiceNorthFlow 成功获取北向资金', async () => {
    const { fetchNorthFlow } = await import('@/api/choice')
    fetchNorthFlow.mockResolvedValue({ date: '2024-01-01', amount: 100000000 })

    const { fetchChoiceNorthFlow } = await import('@/api/news')
    const result = await fetchChoiceNorthFlow()

    expect(result).not.toBeNull()
  })

  test('fetchChoiceNorthFlow 失败时返回 null', async () => {
    const { fetchNorthFlow } = await import('@/api/choice')
    fetchNorthFlow.mockRejectedValue(new Error('error'))

    const { fetchChoiceNorthFlow } = await import('@/api/news')
    const result = await fetchChoiceNorthFlow()

    expect(result).toBeNull()
  })

  test('fetchChoiceSectorFlows 成功获取板块资金', async () => {
    const { fetchSectorFlows } = await import('@/api/choice')
    fetchSectorFlows.mockResolvedValue([{ sector: 'test', amount: 100000000 }])

    const { fetchChoiceSectorFlows } = await import('@/api/news')
    const result = await fetchChoiceSectorFlows(10)

    expect(result.length).toBe(1)
  })

  test('fetchChoiceMainForce 成功获取主力资金', async () => {
    const { fetchMainForceFlow } = await import('@/api/choice')
    fetchMainForceFlow.mockResolvedValue([{ stock: 'test', amount: 100000000 }])

    const { fetchChoiceMainForce } = await import('@/api/news')
    const result = await fetchChoiceMainForce()

    expect(result.length).toBe(1)
  })

  test('fetchNews jin10 flash 类型', async () => {
    const { fetchFlashNews } = await import('@/api/jin10')
    fetchFlashNews.mockResolvedValue([{ id: '1' }])

    const { fetchNews } = await import('@/api/news')
    const result = await fetchNews('jin10', { type: 'flash' })

    expect(result.length).toBe(1)
  })

  test('fetchNews jin10 calendar 类型', async () => {
    const { fetchEconomicCalendar } = await import('@/api/jin10')
    fetchEconomicCalendar.mockResolvedValue([{ id: '1' }])

    const { fetchNews } = await import('@/api/news')
    const result = await fetchNews('jin10', { type: 'calendar' })

    expect(result.length).toBe(1)
  })

  test('fetchNews jin10 默认类型（news）', async () => {
    const { fetchNewsList } = await import('@/api/jin10')
    fetchNewsList.mockResolvedValue([{ id: '1' }])

    const { fetchNews } = await import('@/api/news')
    const result = await fetchNews('jin10', {})

    expect(result.length).toBe(1)
  })

  test('fetchNews cailian telegram 类型', async () => {
    const { fetchClsTelegram } = await import('@/api/cls')
    fetchClsTelegram.mockResolvedValue([{ id: '1' }])

    const { fetchNews } = await import('@/api/news')
    const result = await fetchNews('cailian', { type: 'telegram' })

    expect(result.length).toBe(1)
  })

  test('fetchNews cailian hotTopics 类型', async () => {
    const { fetchClsHotTopics } = await import('@/api/cls')
    fetchClsHotTopics.mockResolvedValue([{ id: '1' }])

    const { fetchNews } = await import('@/api/news')
    const result = await fetchNews('cailian', { type: 'hotTopics' })

    expect(result.length).toBe(1)
  })

  test('fetchNews cailian plate 类型', async () => {
    const { fetchClsPlateMovement } = await import('@/api/cls')
    fetchClsPlateMovement.mockResolvedValue([{ sector: 'test' }])

    const { fetchNews } = await import('@/api/news')
    const result = await fetchNews('cailian', { type: 'plate' })

    expect(result.length).toBe(1)
  })

  test('fetchNews cailian 默认类型（telegram）', async () => {
    const { fetchClsTelegram } = await import('@/api/cls')
    fetchClsTelegram.mockResolvedValue([{ id: '1' }])

    const { fetchNews } = await import('@/api/news')
    const result = await fetchNews('cailian', {})

    expect(result.length).toBe(1)
  })

  test('fetchNews xueqiu disscussion 类型', async () => {
    const { fetchHotDiscussions } = await import('@/api/xueqiu')
    fetchHotDiscussions.mockResolvedValue([{ id: '1' }])

    const { fetchNews } = await import('@/api/news')
    const result = await fetchNews('xueqiu', { type: 'discussion' })

    expect(result.length).toBe(1)
  })

  test('fetchNews xueqiu sentiment 类型', async () => {
    const { fetchStockSentimentList } = await import('@/api/xueqiu')
    fetchStockSentimentList.mockResolvedValue([{ stock: 'test' }])

    const { fetchNews } = await import('@/api/news')
    const result = await fetchNews('xueqiu', { type: 'sentiment' })

    expect(result.length).toBe(1)
  })

  test('fetchNews xueqiu views 类型', async () => {
    const { fetchUserViews } = await import('@/api/xueqiu')
    fetchUserViews.mockResolvedValue([{ id: '1' }])

    const { fetchNews } = await import('@/api/news')
    const result = await fetchNews('xueqiu', { type: 'views' })

    expect(result.length).toBe(1)
  })

  test('fetchNews xueqiu 默认类型（discussion）', async () => {
    const { fetchHotDiscussions } = await import('@/api/xueqiu')
    fetchHotDiscussions.mockResolvedValue([{ id: '1' }])

    const { fetchNews } = await import('@/api/news')
    const result = await fetchNews('xueqiu', {})

    expect(result.length).toBe(1)
  })

  test('fetchNews easmoney north 类型', async () => {
    const { fetchNorthFlow } = await import('@/api/choice')
    fetchNorthFlow.mockResolvedValue({ date: '2024-01-01' })

    const { fetchNews } = await import('@/api/news')
    const result = await fetchNews('eastmoney', { type: 'north' })

    expect(result).not.toBeNull()
  })

  test('fetchNews easmoney sector 类型', async () => {
    const { fetchSectorFlows } = await import('@/api/choice')
    fetchSectorFlows.mockResolvedValue([{ sector: 'test' }])

    const { fetchNews } = await import('@/api/news')
    const result = await fetchNews('eastmoney', { type: 'sector' })

    expect(result.length).toBe(1)
  })

  test('fetchNews easmoney mainforce 类型', async () => {
    const { fetchMainForceFlow } = await import('@/api/choice')
    fetchMainForceFlow.mockResolvedValue([{ stock: 'test' }])

    const { fetchNews } = await import('@/api/news')
    const result = await fetchNews('eastmoney', { type: 'mainforce' })

    expect(result.length).toBe(1)
  })

  test('fetchNews easmoney 默认类型（north）', async () => {
    const { fetchNorthFlow } = await import('@/api/choice')
    fetchNorthFlow.mockResolvedValue({ date: '2024-01-01' })

    const { fetchNews } = await import('@/api/news')
    const result = await fetchNews('eastmoney', {})

    expect(result).not.toBeNull()
  })

  test('fetchNews 未知数据源返回空数组', async () => {
    const { fetchNews } = await import('@/api/news')
    const result = await fetchNews('unknown' as any, {})

    expect(result).toEqual([])
  })
})
