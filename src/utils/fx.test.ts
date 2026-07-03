import { describe, test, expect, vi, beforeEach } from 'vitest'

vi.mock('@/utils/http', () => ({
  http: {
    get: vi.fn(),
  },
}))

vi.mock('@/utils/logger', () => ({
  logger: {
    warn: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
  },
}))

import { http } from '@/utils/http'
import {
  FxManager,
  convertToCNY,
  formatCurrency,
} from './fx'

describe('fx.ts 汇率换算', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.clearAllMocks()
  })

  // ─── convert ──────────────────────────────────────────────────

  describe('convert', () => {
    test('相同币种返回相同金额', () => {
      const fx = new FxManager()
      expect(fx.convert(100, 'CNY', 'CNY')).toBe(100)
      expect(fx.convert(50, 'USD', 'USD')).toBe(50)
      expect(fx.convert(30, 'HKD', 'HKD')).toBe(30)
    })

    test('不同币种使用正确汇率换算', () => {
      const fx = new FxManager()
      // 兜底汇率：1 USD = 7.25 CNY，1 USD = 7.79 HKD
      // USD → CNY：100 * 7.25 / 1 = 725
      expect(fx.convert(100, 'USD', 'CNY')).toBeCloseTo(725, 2)
      // CNY → USD：725 * 1 / 7.25 = 100
      expect(fx.convert(725, 'CNY', 'USD')).toBeCloseTo(100, 2)
      // USD → HKD：100 * 7.79 / 1 = 779
      expect(fx.convert(100, 'USD', 'HKD')).toBeCloseTo(779, 2)
    })
  })

  // ─── getRate ─────────────────────────────────────────────────

  describe('getRate', () => {
    test('返回正确的汇率', () => {
      const fx = new FxManager()
      expect(fx.getRate('USD', 'CNY')).toBeCloseTo(7.25, 4)
      expect(fx.getRate('CNY', 'USD')).toBeCloseTo(1 / 7.25, 4)
      expect(fx.getRate('USD', 'HKD')).toBeCloseTo(7.79, 4)
      expect(fx.getRate('CNY', 'CNY')).toBe(1)
    })
  })

  // ─── fetchRates 兜底 ─────────────────────────────────────────

  describe('fetchRates 兜底', () => {
    test('API 不可用时使用兜底汇率', async () => {
      http.get.mockRejectedValue(new Error('network error'))
      const fx = new FxManager()
      await fx.fetchRates()
      // 兜底汇率仍然可用
      expect(fx.getRate('USD', 'CNY')).toBeCloseTo(7.25, 4)
      expect(fx.getRate('USD', 'HKD')).toBeCloseTo(7.79, 4)
    })

    test('API 成功时使用实时汇率', async () => {
      http.get.mockResolvedValue({
        rates: { USD: 1, CNY: 7.1, HKD: 7.8 },
      })
      const fx = new FxManager()
      await fx.fetchRates()
      expect(fx.getRate('USD', 'CNY')).toBeCloseTo(7.1, 4)
      expect(fx.getRate('USD', 'HKD')).toBeCloseTo(7.8, 4)
    })
  })

  // ─── helper 函数 ─────────────────────────────────────────────

  describe('helper 函数', () => {
    test('convertToCNY 将外币换算为人民币', () => {
      // 100 USD = 725 CNY（兜底汇率）
      expect(convertToCNY(100, 'USD')).toBeCloseTo(725, 2)
      expect(convertToCNY(100, 'CNY')).toBe(100)
    })

    test('formatCurrency 添加正确的货币符号', () => {
      expect(formatCurrency(123.456, 'CNY')).toBe('¥123.46')
      expect(formatCurrency(99.5, 'USD')).toBe('$99.50')
      expect(formatCurrency(1000, 'HKD')).toBe('HK$1000.00')
    })
  })
})
