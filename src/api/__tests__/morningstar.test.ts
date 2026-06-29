import { describe, test, expect, vi, beforeEach } from 'vitest'
import type { StarRating, StyleBox, FundCategory } from '@/api/morningstar'

const mockHttp = { get: vi.fn() }
const mockGetCache = vi.fn(() => null)
const mockSetCache = vi.fn()

vi.mock('@/api/cache', () => ({
  getCache: mockGetCache,
  setCache: mockSetCache,
}))

vi.mock('@/utils/http', () => ({
  http: mockHttp,
}))

describe('morningstar.ts API', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetCache.mockReturnValue(null)
  })

  test('fetchStarRating 成功时返回评级数据', async () => {
    mockHttp.get.mockResolvedValue({
      data: { overallRating: '3', threeYearRating: '3', fiveYearRating: '2', tenYearRating: '3', categoryCount: 1200, ratingDate: '2026-06-29' }
    })
    const { fetchStarRating } = await import('@/api/morningstar')
    const result = await fetchStarRating('000001')
    expect(result).not.toBeNull()
    expect(result!.overall).toBe(3)
  })

  test('fetchStarRating HTTP 失败时返回 null', async () => {
    mockHttp.get.mockRejectedValue(new Error('network error'))
    const { fetchStarRating } = await import('@/api/morningstar')
    const result = await fetchStarRating('000001')
    expect(result).toBeNull()
  })

  test('fetchStyleBox 成功时返回风格箱数据', async () => {
    mockHttp.get.mockResolvedValue({
      data: [{ size: 'large', style: 'blend', weight: 60 }, { size: 'mid', style: 'growth', weight: 40 }]
    })
    const { fetchStyleBox } = await import('@/api/morningstar')
    const result = await fetchStyleBox('000001')
    expect(result).toHaveLength(2)
    expect(result[0]!.size).toBe('large')
  })

  test('fetchStyleBox HTTP 失败时返回 fallback', async () => {
    mockHttp.get.mockRejectedValue(new Error('network error'))
    const { fetchStyleBox } = await import('@/api/morningstar')
    const result = await fetchStyleBox('000001')
    expect(result).toHaveLength(9) // 9宫格
  })

  test('fetchFundCategory 成功时返回分类数据', async () => {
    mockHttp.get.mockResolvedValue({
      data: { fundName: '测试基金', categoryName: '股票型', categoryCode: 'EQT', riskLevel: '中风险' }
    })
    const { fetchFundCategory } = await import('@/api/morningstar')
    const result = await fetchFundCategory('000001')
    expect(result).not.toBeNull()
    expect(result!.category).toBe('股票型')
  })

  test('fetchFundCategory HTTP 失败时返回 null', async () => {
    mockHttp.get.mockRejectedValue(new Error('network error'))
    const { fetchFundCategory } = await import('@/api/morningstar')
    const result = await fetchFundCategory('000001')
    expect(result).toBeNull()
  })
})
