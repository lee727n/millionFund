// [WHY] A 股行情 API 单元测试
// [WHAT] 测试批量行情查询、单股查询、代码格式化等

import { describe, test, expect, vi, beforeEach } from 'vitest'

vi.mock('@/api/cache', () => ({
  cache: {
    get: vi.fn(() => null),
    set: vi.fn(),
  },
}))

vi.mock('@/utils/http', () => ({
  http: {
    text: vi.fn(),
    json: vi.fn(),
  },
}))

vi.mock('@/utils/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}))

import { fetchAStockQuote, fetchSingleAStock, formatSymbol, formatSymbols } from '@/api/astock'
import { cache } from '@/api/cache'
import { http } from '@/utils/http'

describe('astock.ts', () => {
  beforeEach(() => {
    // resetAllMocks clears mockReturnValue (unlike clearAllMocks)
    vi.resetAllMocks()
    // Re-set defaults after reset
    cache.get.mockReturnValue(null)
  })

  // ─── formatSymbol ────────────────────────────────────────────

  describe('formatSymbol', () => {
    test('6 开头加上 sh 前缀', () => {
      expect(formatSymbol('600519')).toBe('sh600519')
    })

    test('0 开头加上 sz 前缀', () => {
      expect(formatSymbol('000001')).toBe('sz000001')
    })

    test('3 开头加上 sz 前缀', () => {
      expect(formatSymbol('300750')).toBe('sz300750')
    })

    test('4 开头加上 bj 前缀', () => {
      expect(formatSymbol('430047')).toBe('bj430047')
    })

    test('8 开头加上 bj 前缀', () => {
      expect(formatSymbol('830946')).toBe('bj830946')
    })

    test('已有前缀时不重复添加', () => {
      expect(formatSymbol('sh600519')).toBe('sh600519')
      expect(formatSymbol('SZ000001')).toBe('sz000001')
      expect(formatSymbol('bj430047')).toBe('bj430047')
    })

    test('空字符串返回空', () => {
      expect(formatSymbol('')).toBe('')
    })

    test('9 开头加上 sh 前缀', () => {
      expect(formatSymbol('900001')).toBe('sh900001')
    })
  })

  // ─── formatSymbols ──────────────────────────────────────────

  describe('formatSymbols', () => {
    test('批量格式化代码', () => {
      const result = formatSymbols(['600519', '000001', '300750'])
      expect(result).toEqual(['sh600519', 'sz000001', 'sz300750'])
    })

    test('过滤空字符串', () => {
      const result = formatSymbols(['600519', '', '000001'])
      expect(result).toEqual(['sh600519', 'sz000001'])
    })

    test('空数组返回空数组', () => {
      expect(formatSymbols([])).toEqual([])
    })
  })

  // ─── fetchAStockQuote ───────────────────────────────────────

  describe('fetchAStockQuote', () => {
    test('缓存命中时直接返回', async () => {
      const cached = [{ symbol: 'sh600519', name: '贵州茅台', currentPrice: 1234 }]
      cache.get.mockReturnValue(cached as any)
      const result = await fetchAStockQuote(['sh600519'])
      expect(result).toBe(cached)
      expect(http.text).not.toHaveBeenCalled()
    })

    test('成功获取批量行情', async () => {
      const mockResponse = `var hq_str_sh600519="贵州茅台,1234.56,1220.00,1234.56,1240.00,1210.00,1234.50,1234.60,1000,123456000,1.234,1.20,0.10,";
var hq_str_sz000001="平安银行,11.20,11.10,11.20,11.30,11.00,11.19,11.20,5000,560000,0.10,0.89,0.03,";
`
      http.text.mockResolvedValue(mockResponse)

      const result = await fetchAStockQuote(['sh600519', 'sz000001'])
      expect(result).toHaveLength(2)
      expect(result[0].symbol).toBe('sh600519')
      expect(result[0].name).toBe('贵州茅台')
      expect(result[0].currentPrice).toBeCloseTo(1234.56)
      expect(result[0].change).toBeCloseTo(14.56)
      expect(result[0].changePercent).toBeCloseTo(1.19)

      expect(result[1].symbol).toBe('sz000001')
      expect(result[1].name).toBe('平安银行')
      expect(result[1].currentPrice).toBeCloseTo(11.20)
    })

    test('空数组返回空', async () => {
      const result = await fetchAStockQuote([])
      expect(result).toEqual([])
    })

    test('HTTP 错误时抛出异常', async () => {
      http.text.mockRejectedValue(new Error('network'))
      await expect(fetchAStockQuote(['sh600519'])).rejects.toThrow()
    })

    test('响应中数据行空字符串时跳过', async () => {
      http.text.mockResolvedValue('var hq_str_sh600519="";\n')
      const result = await fetchAStockQuote(['sh600519'])
      expect(result).toEqual([])
    })

    test('数据字段不足时跳过', async () => {
      http.text.mockResolvedValue('var hq_str_sh600519="贵州茅台,1234.56";')
      const result = await fetchAStockQuote(['sh600519'])
      // parts.length < 10 被跳过
      expect(result).toEqual([])
    })

    test('空响应时抛出异常', async () => {
      http.text.mockResolvedValue('')
      // astock.ts throws when text is empty string
      await expect(fetchAStockQuote(['sh600519'])).rejects.toThrow('新浪财经 API 返回为空')
    })
  })

  // ─── fetchSingleAStock ───────────────────────────────────────

  describe('fetchSingleAStock', () => {
    test('成功获取单只股票', async () => {
      const mockResponse = 'var hq_str_sh600519="贵州茅台,1234.56,1220.00,1234.56,1240.00,1210.00,1234.50,1234.60,1000,123456000,1.234,1.20,0.10,";'
      http.text.mockResolvedValue(mockResponse)

      const result = await fetchSingleAStock('sh600519')
      expect(result).not.toBeNull()
      expect(result!.symbol).toBe('sh600519')
      expect(result!.name).toBe('贵州茅台')
      expect(result!.currentPrice).toBeCloseTo(1234.56)
    })

    test('请求失败时返回 null', async () => {
      http.text.mockRejectedValue(new Error('network'))
      const result = await fetchSingleAStock('sh600519')
      expect(result).toBeNull()
    })
  })
})
