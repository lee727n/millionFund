// [WHY] 集思录 API 单元测试
// [WHAT] 测试可转债、LOF、REITs、基金梯度等数据接口

import { describe, test, expect, vi, beforeEach } from 'vitest'

// Mock cache module - jisilu.ts uses getCache/setCache (not cache.get)
vi.mock('@/api/cache', () => ({
  cache: {
    get: vi.fn(() => null),
    set: vi.fn(),
  },
  getCache: vi.fn(() => undefined),
  setCache: vi.fn(),
  clearCache: vi.fn(),
  CACHE_TTL: {
    CONVERTIBLE: 30000,
    LOF_PREMIUM: 60000,
    REITS: 120000,
    FUND_LADDER: 300000,
  },
}))

// Mock http
vi.mock('@/utils/http', () => ({
  http: {
    get: vi.fn(),
    post: vi.fn(),
    text: vi.fn(),
    json: vi.fn(),
  },
}))

// Mock logger
vi.mock('@/utils/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}))

import {
  fetchConvertibleBonds,
  fetchConvertibleList,
  fetchConvertibleQuote,
  fetchLofPremiums,
  fetchReitsData,
  fetchFundLadder,
  fallbackConvertibleBonds,
} from '@/api/jisilu'

import { getCache, setCache, CACHE_TTL } from '@/api/cache'
import { http } from '@/utils/http'

describe('jisilu.ts', () => {
  beforeEach(() => {
    // resetAllMocks clears mockReturnValue (unlike clearAllMocks)
    vi.resetAllMocks()
    // Re-set defaults after reset
    getCache.mockReturnValue(undefined)
    http.get.mockResolvedValue(null as any)
    http.post.mockResolvedValue(null as any)
  })

  // ─── fallbackConvertibleBonds ────────────────────────────────

  describe('fallbackConvertibleBonds', () => {
    test('返回兜底可转债数据', () => {
      const data = fallbackConvertibleBonds()
      expect(data).toHaveLength(5)
      expect(data[0]).toHaveProperty('code')
      expect(data[0]).toHaveProperty('name')
      expect(data[0]).toHaveProperty('price')
    })

    test('包含南银转债', () => {
      const data = fallbackConvertibleBonds()
      const nanYin = data.find(b => b.code === '113050')
      expect(nanYin).toBeDefined()
      expect(nanYin!.name).toBe('南银转债')
    })
  })

  // ─── fetchConvertibleBonds ──────────────────────────────────

  describe('fetchConvertibleBonds', () => {
    test('缓存命中时直接返回', async () => {
      const cached = [fallbackConvertibleBonds()[0]]
      getCache.mockReturnValue(cached as any)
      const result = await fetchConvertibleBonds(5)
      expect(result).toBe(cached)
    })

    test('API 成功时解析数据', async () => {
      http.post.mockResolvedValue({
        rows: [
          {
            cell: {
              bond_id: '113050',
              bond_nm: '南银转债',
              price: '125.80',
              prev_close: '125.36',
              change_rt: '0.35',
              premium_rt: '-0.5',
              call_days: '1280',
              remain_size: '8.5',
              rating_cd: 'AAA',
              ytm_rt: '-1.2',
            }
          },
        ]
      })

      const result = await fetchConvertibleBonds(5)
      expect(result).toHaveLength(1)
      expect(result[0].code).toBe('113050')
      expect(result[0].name).toBe('南银转债')
      expect(result[0].price).toBeCloseTo(125.80)
      expect(result[0].change).toBeCloseTo(0.44)
      expect(result[0].premiumRate).toBeCloseTo(-0.5)
    })

    test('API 失败时返回兜底数据', async () => {
      http.post.mockRejectedValue(new Error('network'))
      const result = await fetchConvertibleBonds(5)
      expect(result.length).toBeGreaterThan(0)
    })

    test('空 rows 时返回空数组', async () => {
      http.post.mockResolvedValue({ rows: [] })
      const result = await fetchConvertibleBonds(5)
      expect(result).toEqual([])
    })

    test('没有 rows 字段时返回兜底数据', async () => {
      http.post.mockResolvedValue({ data: [] })
      const result = await fetchConvertibleBonds(5)
      expect(result.length).toBeGreaterThan(0)
    })

    test('数据切片不超过 count', async () => {
      const rows = Array.from({ length: 50 }, (_, i) => ({
        cell: {
          bond_id: `1130${i}`,
          bond_nm: `转债${i}`,
          price: '100.00',
          prev_close: '99.00',
          change_rt: '1.01',
          premium_rt: '0',
          call_days: '1000',
          remain_size: '5.0',
          rating_cd: 'A',
          ytm_rt: '0',
        }
      }))
      http.post.mockResolvedValue({ rows })

      const result = await fetchConvertibleBonds(10)
      expect(result).toHaveLength(10)
    })
  })

  // ─── fetchConvertibleList ────────────────────────────────────

  describe('fetchConvertibleList', () => {
    test('委托给 fetchConvertibleBonds', async () => {
      http.post.mockResolvedValue({
        rows: [{
          cell: {
            bond_id: '113050', bond_nm: '南银转债', price: '125.80',
            prev_close: '125.36', change_rt: '0.35', premium_rt: '-0.5',
            call_days: '1280', remain_size: '8.5', rating_cd: 'AAA', ytm_rt: '-1.2',
          }
        }]
      })
      const result = await fetchConvertibleList(5)
      expect(result).toHaveLength(1)
      expect(result[0].code).toBe('113050')
    })
  })

  // ─── fetchConvertibleQuote ───────────────────────────────────

  describe('fetchConvertibleQuote', () => {
    test('空数组返回空', async () => {
      const result = await fetchConvertibleQuote([])
      expect(result).toEqual([])
    })

    test('缓存命中时返回', async () => {
      const cached = [{ code: '113050', name: '南银转债' }]
      getCache.mockReturnValue(cached as any)
      const result = await fetchConvertibleQuote(['113050'])
      expect(result).toBe(cached)
    })

    test('API 返回时过滤指定代码', async () => {
      http.post.mockResolvedValue({
        rows: [
          {
            cell: {
              bond_id: '113050',
              bond_nm: '南银转债',
              price: '125.80',
              prev_close: '125.36',
              change_rt: '0.35',
              premium_rt: '-0.5',
              call_days: '1280',
              remain_size: '8.5',
              rating_cd: 'AAA',
              ytm_rt: '-1.2',
            }
          },
          {
            cell: {
              bond_id: '110079',
              bond_nm: '杭银转债',
              price: '122.50',
              prev_close: '122.16',
              change_rt: '0.28',
              premium_rt: '1.2',
              call_days: '1350',
              remain_size: '10.2',
              rating_cd: 'AAA',
              ytm_rt: '-0.8',
            }
          },
        ]
      })

      const result = await fetchConvertibleQuote(['113050'])
      expect(result).toHaveLength(1)
      expect(result[0].code).toBe('113050')
    })

    test('API 失败时返回兜底', async () => {
      http.post.mockRejectedValue(new Error('network'))
      const result = await fetchConvertibleQuote(['113050'])
      expect(result.length).toBeGreaterThan(0)
    })
  })

  // ─── fetchLofPremiums ────────────────────────────────────────

  describe('fetchLofPremiums', () => {
    test('缓存命中时返回', async () => {
      const cached = [{ code: '161725', name: '白酒基金' }]
      getCache.mockReturnValue(cached as any)
      const result = await fetchLofPremiums()
      expect(result).toBe(cached)
    })

    test('API 成功时解析数据', async () => {
      http.get.mockResolvedValue({
        rows: [
          {
            cell: {
              fund_id: '161725',
              fund_nm: '白酒基金',
              nav: '0.985',
              price: '1.012',
              premium_rt: '2.74',
              volume: '852000',
            }
          },
        ]
      })

      const result = await fetchLofPremiums()
      expect(result).toHaveLength(1)
      expect(result[0].code).toBe('161725')
      expect(result[0].name).toBe('白酒基金')
      expect(result[0].nav).toBeCloseTo(0.985)
      expect(result[0].premium).toBeCloseTo(2.74)
      expect(result[0].volume).toBeCloseTo(85.2) // /10000
    })

    test('API 失败时返回兜底', async () => {
      http.get.mockRejectedValue(new Error('network'))
      const result = await fetchLofPremiums()
      expect(result.length).toBeGreaterThan(0)
    })
  })

  // ─── fetchReitsData ──────────────────────────────────────────

  describe('fetchReitsData', () => {
    test('缓存命中时返回', async () => {
      const cached = [{ code: '508000', name: '华夏REIT' }]
      getCache.mockReturnValue(cached as any)
      const result = await fetchReitsData()
      expect(result).toBe(cached)
    })

    test('API 成功时解析数据', async () => {
      http.get.mockResolvedValue({
        rows: [
          {
            cell: {
              fund_id: '508000',
              fund_nm: '华夏REIT',
              price: '5.82',
              change_rt: '0.52',
              dividend_rt: '6.5',
              total_return: '18.2',
              days_listed: '680',
            }
          },
        ]
      })

      const result = await fetchReitsData()
      expect(result).toHaveLength(1)
      expect(result[0].code).toBe('508000')
      expect(result[0].price).toBeCloseTo(5.82)
    })

    test('API 失败时返回兜底', async () => {
      http.get.mockRejectedValue(new Error('network'))
      const result = await fetchReitsData()
      expect(result.length).toBeGreaterThan(0)
    })
  })

  // ─── fetchFundLadder ─────────────────────────────────────────

  describe('fetchFundLadder', () => {
    test('缓存命中时返回', async () => {
      const cached = [{ code: '001354', name: '科技成长混合' }]
      getCache.mockReturnValue(cached as any)
      const result = await fetchFundLadder()
      expect(result).toBe(cached)
    })

    test('API 成功时解析数据', async () => {
      http.get.mockResolvedValue({
        rows: [
          {
            cell: {
              fund_id: '001354',
              fund_nm: '科技成长混合',
              nav: '1.825',
              latest_nav: '1.856',
              period_return: '18.5',
              rank: '25',
              total: '650',
              fund_type: '偏股混合',
            }
          },
        ]
      })

      const result = await fetchFundLadder()
      expect(result).toHaveLength(1)
      expect(result[0].code).toBe('001354')
      expect(result[0].type).toBe('偏股混合')
    })

    test('API 失败时返回兜底', async () => {
      http.get.mockRejectedValue(new Error('network'))
      const result = await fetchFundLadder()
      expect(result.length).toBeGreaterThan(0)
    })
  })
})
