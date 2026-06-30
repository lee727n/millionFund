// [WHY] 资讯聚合 API 单元测试
// [WHAT] 测试 news.ts 统一入口的各项功能，包括成功和错误路径
// [DEPS] 依赖 vitest

import { describe, test, expect, vi, beforeEach } from 'vitest'

// Mock 各个 API 模块
vi.mock('@/api/jin10', () => ({
  fetchNewsList: vi.fn(),
  fetchFlashNews: vi.fn(),
  fetchEconomicCalendar: vi.fn(),
}))

vi.mock('@/api/cls', () => ({
  fetchClsTelegram: vi.fn(),
  fetchClsHotTopics: vi.fn(),
  fetchClsPlateMovement: vi.fn(),
}))

vi.mock('@/api/xueqiu', () => ({
  fetchHotDiscussions: vi.fn(),
  fetchStockSentimentList: vi.fn(),
  fetchUserViews: vi.fn(),
}))

vi.mock('@/api/choice', () => ({
  fetchNorthFlow: vi.fn(),
  fetchSectorFlows: vi.fn(),
  fetchMainForceFlow: vi.fn(),
}))

import {
  fetchJin10Flash,
  fetchJin10News,
  fetchJin10Calendar,
  fetchCailianNews,
  fetchCailianHotTopics,
  fetchCailianPlate,
  fetchXueqiuDiscussions,
  fetchXueqiuSentiment,
  fetchXueqiuViews,
  fetchChoiceNorthFlow,
  fetchChoiceSectorFlows,
  fetchChoiceMainForce,
  fetchNews,
} from '@/api/news'

import { fetchFlashNews, fetchNewsList, fetchEconomicCalendar } from '@/api/jin10'
import { fetchClsTelegram, fetchClsHotTopics, fetchClsPlateMovement } from '@/api/cls'
import { fetchHotDiscussions, fetchStockSentimentList, fetchUserViews } from '@/api/xueqiu'
import { fetchNorthFlow, fetchSectorFlows, fetchMainForceFlow } from '@/api/choice'

describe('news.ts', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  // ─── 金十数据 API 封装 ──────────────────────────────────────

  describe('fetchJin10Flash', () => {
    test('成功时返回快讯列表', async () => {
      const data = [{ id: '1', title: '快讯', time: '10:00' }]
      fetchFlashNews.mockResolvedValue(data as any)
      const result = await fetchJin10Flash()
      expect(result).toBe(data)
    })

    test('失败时返回空数组', async () => {
      fetchFlashNews.mockRejectedValue(new Error('network'))
      const result = await fetchJin10Flash()
      expect(result).toEqual([])
    })
  })

  describe('fetchJin10News', () => {
    test('成功时返回新闻列表', async () => {
      const data = [{ id: '1', title: '新闻', content: '内容' }]
      fetchNewsList.mockResolvedValue(data as any)
      const result = await fetchJin10News(1, 20, 'all')
      expect(result).toBe(data)
    })

    test('失败时返回空数组', async () => {
      fetchNewsList.mockRejectedValue(new Error('network'))
      const result = await fetchJin10News()
      expect(result).toEqual([])
    })
  })

  describe('fetchJin10Calendar', () => {
    test('成功时返回日历列表', async () => {
      const data = [{ date: '2026-06-30', event: '数据发布' }]
      fetchEconomicCalendar.mockResolvedValue(data as any)
      const result = await fetchJin10Calendar('2026-06-30')
      expect(result).toBe(data)
    })

    test('失败时返回空数组', async () => {
      fetchEconomicCalendar.mockRejectedValue(new Error('network'))
      const result = await fetchJin10Calendar()
      expect(result).toEqual([])
    })
  })

  // ─── 财联社 API 封装 ────────────────────────────────────────

  describe('fetchCailianNews', () => {
    test('成功时返回电报列表', async () => {
      const data = [{ id: '1', content: '电报内容', time: '10:00' }]
      fetchClsTelegram.mockResolvedValue(data as any)
      const result = await fetchCailianNews(20)
      expect(result).toBe(data)
    })

    test('失败时返回空数组', async () => {
      fetchClsTelegram.mockRejectedValue(new Error('network'))
      const result = await fetchCailianNews()
      expect(result).toEqual([])
    })
  })

  describe('fetchCailianHotTopics', () => {
    test('成功时返回热门主题', async () => {
      const data = [{ name: '热门', count: 100 }]
      fetchClsHotTopics.mockResolvedValue(data as any)
      const result = await fetchCailianHotTopics()
      expect(result).toBe(data)
    })

    test('失败时返回空数组', async () => {
      fetchClsHotTopics.mockRejectedValue(new Error('network'))
      const result = await fetchCailianHotTopics()
      expect(result).toEqual([])
    })
  })

  describe('fetchCailianPlate', () => {
    test('成功时返回板块异动', async () => {
      const data = [{ name: '板块', change: 5.2 }]
      fetchClsPlateMovement.mockResolvedValue(data as any)
      const result = await fetchCailianPlate()
      expect(result).toBe(data)
    })

    test('失败时返回空数组', async () => {
      fetchClsPlateMovement.mockRejectedValue(new Error('network'))
      const result = await fetchCailianPlate()
      expect(result).toEqual([])
    })
  })

  // ─── 雪球 API 封装 ──────────────────────────────────────────

  describe('fetchXueqiuDiscussions', () => {
    test('基金讨论成功', async () => {
      const data = [{ title: '讨论', author: '用户' }]
      fetchHotDiscussions.mockResolvedValue(data as any)
      const result = await fetchXueqiuDiscussions('fund', 20)
      expect(result).toBe(data)
    })

    test('股票讨论成功', async () => {
      const data = [{ title: '股票讨论' }]
      fetchHotDiscussions.mockResolvedValue(data as any)
      const result = await fetchXueqiuDiscussions('stock', 10)
      expect(result).toBe(data)
    })

    test('失败时返回空数组', async () => {
      fetchHotDiscussions.mockRejectedValue(new Error('network'))
      const result = await fetchXueqiuDiscussions()
      expect(result).toEqual([])
    })
  })

  describe('fetchXueqiuSentiment', () => {
    test('成功时返回情绪列表', async () => {
      const data = [{ name: '基金', sentiment: 'positive' }]
      fetchStockSentimentList.mockResolvedValue(data as any)
      const result = await fetchXueqiuSentiment('fund', 10)
      expect(result).toBe(data)
    })

    test('失败时返回空数组', async () => {
      fetchStockSentimentList.mockRejectedValue(new Error('network'))
      const result = await fetchXueqiuSentiment()
      expect(result).toEqual([])
    })
  })

  describe('fetchXueqiuViews', () => {
    test('成功时返回观点列表', async () => {
      const data = [{ name: '大V', view: '看多' }]
      fetchUserViews.mockResolvedValue(data as any)
      const result = await fetchXueqiuViews(10)
      expect(result).toBe(data)
    })

    test('失败时返回空数组', async () => {
      fetchUserViews.mockRejectedValue(new Error('network'))
      const result = await fetchXueqiuViews()
      expect(result).toEqual([])
    })
  })

  // ─── 东方财富 Choice API 封装 ──────────────────────────────

  describe('fetchChoiceNorthFlow', () => {
    test('成功时返回北向资金', async () => {
      const data = { northFlow: 100, date: '2026-06-30' }
      fetchNorthFlow.mockResolvedValue(data as any)
      const result = await fetchChoiceNorthFlow()
      expect(result).toBe(data)
    })

    test('失败时返回 null', async () => {
      fetchNorthFlow.mockRejectedValue(new Error('network'))
      const result = await fetchChoiceNorthFlow()
      expect(result).toBeNull()
    })
  })

  describe('fetchChoiceSectorFlows', () => {
    test('成功时返回板块资金', async () => {
      const data = [{ name: '板块', flow: 50 }]
      fetchSectorFlows.mockResolvedValue(data as any)
      const result = await fetchChoiceSectorFlows(10)
      expect(result).toBe(data)
    })

    test('失败时返回空数组', async () => {
      fetchSectorFlows.mockRejectedValue(new Error('network'))
      const result = await fetchChoiceSectorFlows()
      expect(result).toEqual([])
    })
  })

  describe('fetchChoiceMainForce', () => {
    test('成功时返回主力资金', async () => {
      const data = [{ name: '股票', force: 80 }]
      fetchMainForceFlow.mockResolvedValue(data as any)
      const result = await fetchChoiceMainForce()
      expect(result).toBe(data)
    })

    test('失败时返回空数组', async () => {
      fetchMainForceFlow.mockRejectedValue(new Error('network'))
      const result = await fetchChoiceMainForce()
      expect(result).toEqual([])
    })
  })

  // ─── fetchNews 统一入口 ────────────────────────────────────

  describe('fetchNews', () => {
    // jin10 分支
    test('jin10 flash 类型', async () => {
      fetchFlashNews.mockResolvedValue([{ id: '1' }] as any)
      const result = await fetchNews('jin10', { type: 'flash' })
      expect(fetchFlashNews).toHaveBeenCalled()
      expect(result).toHaveLength(1)
    })

    test('jin10 calendar 类型', async () => {
      fetchEconomicCalendar.mockResolvedValue([{ date: '2026-06-30' }] as any)
      const result = await fetchNews('jin10', { type: 'calendar' })
      expect(fetchEconomicCalendar).toHaveBeenCalled()
    })

    test('jin10 默认类型调用新闻列表', async () => {
      fetchNewsList.mockResolvedValue([{ id: '1' }] as any)
      const result = await fetchNews('jin10', { page: 1, pageSize: 20, category: 'all' })
      expect(fetchNewsList).toHaveBeenCalledWith(1, 20, 'all')
    })

    // cailian 分支
    test('cailian telegram 类型', async () => {
      fetchClsTelegram.mockResolvedValue([{ id: '1' }] as any)
      const result = await fetchNews('cailian', { type: 'telegram', limit: 20 })
      expect(fetchClsTelegram).toHaveBeenCalledWith(20)
    })

    test('cailian hotTopics 类型', async () => {
      fetchClsHotTopics.mockResolvedValue([{ id: '1' }] as any)
      const result = await fetchNews('cailian', { type: 'hotTopics' })
      expect(fetchClsHotTopics).toHaveBeenCalled()
    })

    test('cailian plate 类型', async () => {
      fetchClsPlateMovement.mockResolvedValue([{ id: '1' }] as any)
      const result = await fetchNews('cailian', { type: 'plate' })
      expect(fetchClsPlateMovement).toHaveBeenCalled()
    })

    test('cailian 默认类型调用电报', async () => {
      fetchClsTelegram.mockResolvedValue([{ id: '1' }] as any)
      const result = await fetchNews('cailian')
      expect(fetchClsTelegram).toHaveBeenCalledWith(20)
    })

    // xueqiu 分支
    test('xueqiu discussion 类型', async () => {
      fetchHotDiscussions.mockResolvedValue([{ id: '1' }] as any)
      const result = await fetchNews('xueqiu', { type: 'discussion', category: 'fund', count: 20 })
      expect(fetchHotDiscussions).toHaveBeenCalledWith('fund', 20)
    })

    test('xueqiu sentiment 类型', async () => {
      fetchStockSentimentList.mockResolvedValue([{ id: '1' }] as any)
      const result = await fetchNews('xueqiu', { type: 'sentiment', category: 'stock', count: 10 })
      expect(fetchStockSentimentList).toHaveBeenCalledWith('stock', 10)
    })

    test('xueqiu views 类型', async () => {
      fetchUserViews.mockResolvedValue([{ id: '1' }] as any)
      const result = await fetchNews('xueqiu', { type: 'views', count: 10 })
      expect(fetchUserViews).toHaveBeenCalledWith(10)
    })

    test('xueqiu 默认类型调用讨论', async () => {
      fetchHotDiscussions.mockResolvedValue([{ id: '1' }] as any)
      const result = await fetchNews('xueqiu')
      expect(fetchHotDiscussions).toHaveBeenCalledWith('fund', 20)
    })

    // eastmoney 分支
    test('eastmoney north 类型', async () => {
      fetchNorthFlow.mockResolvedValue({ northFlow: 100 } as any)
      const result = await fetchNews('eastmoney', { type: 'north' })
      expect(fetchNorthFlow).toHaveBeenCalled()
    })

    test('eastmoney sector 类型', async () => {
      fetchSectorFlows.mockResolvedValue([{ name: '板块' }] as any)
      const result = await fetchNews('eastmoney', { type: 'sector', count: 10 })
      expect(fetchSectorFlows).toHaveBeenCalledWith(10)
    })

    test('eastmoney mainforce 类型', async () => {
      fetchMainForceFlow.mockResolvedValue([{ name: '股票' }] as any)
      const result = await fetchNews('eastmoney', { type: 'mainforce' })
      expect(fetchMainForceFlow).toHaveBeenCalled()
    })

    test('eastmoney 默认类型调用北向资金', async () => {
      fetchNorthFlow.mockResolvedValue({ northFlow: 100 } as any)
      const result = await fetchNews('eastmoney')
      expect(fetchNorthFlow).toHaveBeenCalled()
    })

    // 未知数据源
    test('未知数据源返回空数组', async () => {
      const result = await fetchNews('unknown' as any)
      expect(result).toEqual([])
    })
  })
})
