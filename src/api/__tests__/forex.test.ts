import { describe, test, expect, vi, beforeEach } from 'vitest'

vi.mock('@/utils/http', () => ({
  http: {
    get: vi.fn(),
    text: vi.fn(),
    json: vi.fn(),
  },
}))

vi.mock('@/utils/logger', () => ({
  logger: {
    error: vi.fn(),
    warn: vi.fn(),
  },
}))

vi.mock('@/api/cache', () => ({
  getCache: vi.fn().mockReturnValue(undefined),
  setCache: vi.fn(),
  CACHE_TTL: 300,
}))

import { http } from '@/utils/http'
import {
  fetchForexRate,
  fetchForexRates,
  fetchPBOCentralParity,
  FOREX_PAIRS,
} from '@/api/forex'

describe('forex.ts API', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  // ─── fetchForexRate ────────────────────────────────────────────

  describe('fetchForexRate', () => {
    test('成功获取汇率', async () => {
      http.get.mockResolvedValue({
        rates: { CNY: 7.25 },
        time_last_update_utc: '2026-06-30T12:00:00',
      })
      const result = await fetchForexRate('USDCNY')
      expect(result).not.toBeNull()
      expect(result!.rate).toBe(7.25)
      expect(result!.base).toBe('USD')
      expect(result!.quote).toBe('CNY')
    })

    test('API 失败时返回 null', async () => {
      http.get.mockRejectedValue(new Error('network error'))
      const result = await fetchForexRate('USDCNY')
      expect(result).toBeNull()
    })

    test('无对应汇率时返回 null', async () => {
      http.get.mockResolvedValue({
        rates: { USD: 1.0 },
        time_last_update_utc: '2026-06-30T12:00:00',
      })
      const result = await fetchForexRate('USDCNY')
      expect(result).toBeNull()
    })
  })

  // ─── fetchForexRates ───────────────────────────────────────────

  describe('fetchForexRates', () => {
    test('批量获取汇率（相同基础货币）', async () => {
      http.get.mockResolvedValue({
        rates: { CNY: 7.25 },
        time_last_update_utc: '2026-06-30T12:00:00',
      })
      const result = await fetchForexRates(['USDCNY', 'USDHKD'])
      expect(result.length).toBeGreaterThanOrEqual(1)
    })

    test('API 失败时返回空数组', async () => {
      http.get.mockRejectedValue(new Error('network error'))
      const result = await fetchForexRates(['USDCNY', 'EURCNY'])
      expect(result.length).toBe(0)
    })

    test('部分请求失败时只返回成功的结果', async () => {
      http.get
        .mockRejectedValueOnce(new Error('network error'))
        .mockResolvedValueOnce({ rates: { CNY: 7.85 }, time_last_update_utc: '2026-06-30T12:00:00' })
      const result = await fetchForexRates(['USDCNY', 'EURCNY'])
      // USDCNY 失败，只有 EURCNY 成功
      expect(result.length).toBe(1)
      expect(result[0].base).toBe('EUR')
      expect(result[0].rate).toBe(7.85)
    })
  })

  // ─── fetchPBOCentralParity ────────────────────────────────────

  describe('fetchPBOCentralParity', () => {
    test('字符串响应时 regex 匹配返回解析数据', async () => {
      http.get.mockResolvedValue(
        'var USDCNY="7.2450,7.2520,7.2400,7.2560,7.2550,7.2480,100,1000,7.2450"'
      )
      const result = await fetchPBOCentralParity()
      expect(result).toHaveProperty('USDCNY')
      expect(result.USDCNY).toBe(7.245)
    })

    test('非字符串响应时返回兜底数据', async () => {
      http.get.mockResolvedValue(null as any)
      const result = await fetchPBOCentralParity()
      expect(result).toHaveProperty('USDCNY')
      expect(result.USDCNY).toBe(7.245)
    })

    test('API 失败时返回兜底数据', async () => {
      http.get.mockRejectedValue(new Error('network error'))
      const result = await fetchPBOCentralParity()
      expect(result).toHaveProperty('USDCNY')
      expect(result.USDCNY).toBe(7.245)
    })

    test('空字符串时返回兜底数据', async () => {
      http.get.mockResolvedValue('')
      const result = await fetchPBOCentralParity()
      expect(result).toHaveProperty('USDCNY')
      expect(result.USDCNY).toBe(7.245)
    })
  })

  // ─── FOREX_PAIRS ──────────────────────────────────────────────

  test('FOREX_PAIRS 包含常用货币对', async () => {
    expect(FOREX_PAIRS.USDCNY).toBe('USDCNY')
    expect(FOREX_PAIRS.EURCNY).toBe('EURCNY')
    expect(FOREX_PAIRS.JPYCNY).toBe('JPYCNY')
    expect(Object.keys(FOREX_PAIRS).length).toBeGreaterThanOrEqual(7)
  })
})
