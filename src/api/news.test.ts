// [WHY] 资讯聚合 API 单元测试
// [WHAT] 测试 news.ts 统一入口的各项功能
// [DEPS] 依赖 vitest

import { describe, it, expect, vi, beforeEach } from 'vitest'
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
} from '../api/news'
import type { NewsSource } from '../types/news'

// Mock 各个 API 模块
vi.mock('../api/jin10', () => ({
  fetchNewsList: vi.fn(),
  fetchFlashNews: vi.fn(),
  fetchEconomicCalendar: vi.fn(),
}))

vi.mock('../api/cls', () => ({
  fetchClsTelegram: vi.fn(),
  fetchClsHotTopics: vi.fn(),
  fetchClsPlateMovement: vi.fn(),
}))

vi.mock('../api/xueqiu', () => ({
  fetchHotDiscussions: vi.fn(),
  fetchStockSentimentList: vi.fn(),
  fetchUserViews: vi.fn(),
}))

vi.mock('../api/choice', () => ({
  fetchNorthFlow: vi.fn(),
  fetchSectorFlows: vi.fn(),
  fetchMainForceFlow: vi.fn(),
}))

describe('news.ts - 资讯聚合 API', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('金十数据 API', () => {
    it('fetchJin10Flash - 应该成功获取快讯', async () => {
      const mockData = [
        { id: '1', content: '测试快讯', time: '10:00', type: 'normal' as const },
      ]

      const { fetchFlashNews } = await import('../api/jin10')
      ;(fetchFlashNews as any).mockResolvedValue(mockData)

      const result = await fetchJin10Flash()
      expect(result).toEqual(mockData)
    })

    it('fetchJin10News - 应该成功获取新闻列表', async () => {
      const mockData = [
        {
          id: '1',
          title: '测试新闻',
          summary: '摘要',
          url: 'https://example.com',
          time: '10:00',
          category: 'general',
          tags: [],
        },
      ]

      const { fetchNewsList } = await import('../api/jin10')
      ;(fetchNewsList as any).mockResolvedValue(mockData)

      const result = await fetchJin10News(1, 20, 'all')
      expect(result).toEqual(mockData)
    })

    it('fetchJin10Calendar - 应该成功获取经济日历', async () => {
      const mockData = [
        {
          id: '1',
          title: 'GDP数据',
          time: '10:00',
          importance: 'high' as const,
        },
      ]

      const { fetchEconomicCalendar } = await import('../api/jin10')
      ;(fetchEconomicCalendar as any).mockResolvedValue(mockData)

      const result = await fetchJin10Calendar('2026-06-20')
      expect(result).toEqual(mockData)
    })
  })

  describe('统一入口函数 fetchNews', () => {
    it('应该根据数据源类型调用正确的 API (jin10)', async () => {
      const { fetchFlashNews } = await import('../api/jin10')
      ;(fetchFlashNews as any).mockResolvedValue([])

      await fetchNews('jin10' as NewsSource, { type: 'flash' })
      expect(fetchFlashNews).toHaveBeenCalled()
    })

    it('应该根据数据源类型调用正确的 API (cailian)', async () => {
      const { fetchClsTelegram } = await import('../api/cls')
      ;(fetchClsTelegram as any).mockResolvedValue([])

      await fetchNews('cailian' as NewsSource, { type: 'telegram' })
      expect(fetchClsTelegram).toHaveBeenCalled()
    })

    it('应该根据数据源类型调用正确的 API (xueqiu)', async () => {
      const { fetchHotDiscussions } = await import('../api/xueqiu')
      ;(fetchHotDiscussions as any).mockResolvedValue([])

      await fetchNews('xueqiu' as NewsSource, { type: 'discussion' })
      expect(fetchHotDiscussions).toHaveBeenCalled()
    })

    it('应该根据数据源类型调用正确的 API (eastmoney)', async () => {
      const { fetchNorthFlow } = await import('../api/choice')
      ;(fetchNorthFlow as any).mockResolvedValue(null)

      await fetchNews('eastmoney' as NewsSource, { type: 'north' })
      expect(fetchNorthFlow).toHaveBeenCalled()
    })

    it('未知数据源应该返回空数组', async () => {
      const result = await fetchNews('unknown' as NewsSource)
      expect(result).toEqual([])
    })
  })

  describe('错误处理', () => {
    it('API 失败时应该捕获错误并返回默认值', async () => {
      const { fetchFlashNews } = await import('../api/jin10')
      ;(fetchFlashNews as any).mockRejectedValue(new Error('Network error'))

      const result = await fetchJin10Flash()
      expect(result).toEqual([])
    })
  })
})
