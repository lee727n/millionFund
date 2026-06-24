// [WHY] 美股行情 API 单元测试
// [WHAT] 测试 usstock.ts 的各项功能
// [DEPS] 依赖 vitest

import { describe, it, expect, vi, beforeEach } from 'vitest'

// 在导入模块之前设置 mock
vi.mock('@/utils/http', () => ({
  http: {
    json: vi.fn(),
    text: vi.fn(),
    get: vi.fn()
  }
}))

// Mock cache 模块，禁用缓存
vi.mock('../api/cache', () => ({
  cache: {
    get: vi.fn().mockReturnValue(undefined),
    set: vi.fn()
  },
  CACHE_TTL: {
    QUOTE: 60,
    LIST: 300
  }
}))

import { fetchUSStockQuote, fetchSingleUSStock, formatUSSymbol, formatUSSymbols } from '../api/usstock'

describe('usstock.ts - 美股行情 API', () => {
  let mockHttpJson: any

  beforeEach(async () => {
    vi.clearAllMocks()
    
    // 获取 mock 函数
    const { http } = await import('@/utils/http')
    mockHttpJson = vi.mocked(http.json)
    
    // 重置 mock 状态，确保每次测试都是干净的
    mockHttpJson.mockReset()
    mockHttpJson.mockResolvedValue({}) // 默认返回空对象
  })

  describe('formatUSSymbol - 格式化美股代码', () => {
    it('应该将小写代码转换为大写', () => {
      expect(formatUSSymbol('aapl')).toBe('AAPL')
    })

    it('应该将混合大小写代码转换为大写', () => {
      expect(formatUSSymbol('TsLa')).toBe('TSLA')
    })

    it('应该保持大写代码不变', () => {
      expect(formatUSSymbol('GOOGL')).toBe('GOOGL')
    })

    it('应该处理空字符串', () => {
      expect(formatUSSymbol('')).toBe('')
    })

    it('应该处理带空格的代码', () => {
      expect(formatUSSymbol('  aapl  ')).toBe('AAPL')
    })

    it('应该处理特殊代码（如 BRK.B）', () => {
      expect(formatUSSymbol('brk.b')).toBe('BRK.B')
    })
  })

  describe('formatUSSymbols - 批量格式化', () => {
    it('应该批量格式化多个代码', () => {
      const codes = ['aapl', 'tsla', 'googl']
      const formatted = formatUSSymbols(codes)
      expect(formatted).toEqual(['AAPL', 'TSLA', 'GOOGL'])
    })

    it('应该过滤空字符串', () => {
      const codes = ['AAPL', '', 'TSLA']
      const formatted = formatUSSymbols(codes)
      expect(formatted).toEqual(['AAPL', 'TSLA'])
    })
  })

  describe('fetchUSStockQuote - 批量查询美股行情', () => {
    it('应该返回空数组当输入为空', async () => {
      const result = await fetchUSStockQuote([])
      expect(result).toEqual([])
    })

    it('应该成功获取美股行情', async () => {
      // Mock HTTP 响应
      const mockResponse = {
        chart: {
          result: [{
            meta: {
              symbol: 'AAPL',
              regularMarketPrice: 150.00,
              previousClose: 149.00,
              shortName: 'Apple Inc.',
              regularMarketDayHigh: 151.00,
              regularMarketDayLow: 148.00,
              regularMarketVolume: 50000000,
              regularMarketOpen: 149.50,
              marketState: 'REGULAR',
              currency: 'USD'
            }
          }]
        }
      }
      
      mockHttpJson.mockResolvedValueOnce(mockResponse)
      
      const result = await fetchUSStockQuote(['AAPL'])
      
      expect(result).toBeInstanceOf(Array)
      expect(result.length).toBe(1)
      expect(result[0]!.symbol).toBe('AAPL')
      expect(result[0]!.name).toBe('Apple Inc.')
      expect(result[0]!.currentPrice).toBe(150.00)
    })

    it('应该处理 API 错误', async () => {
      mockHttpJson.mockRejectedValueOnce(new Error('Network error'))

      await expect(fetchUSStockQuote(['AAPL'])).rejects.toThrow()
    })
  })

  describe('fetchSingleUSStock - 查询单只美股', () => {
    it('应该成功获取单只美股行情', async () => {
      const mockResponse = {
        chart: {
          result: [{
            meta: {
              symbol: 'AAPL',
              regularMarketPrice: 150.00,
              previousClose: 149.00,
              shortName: 'Apple Inc.',
              regularMarketDayHigh: 151.00,
              regularMarketDayLow: 148.00,
              regularMarketVolume: 50000000,
              regularMarketOpen: 149.50,
              marketState: 'REGULAR',
              currency: 'USD'
            }
          }]
        }
      }
      
      mockHttpJson.mockResolvedValueOnce(mockResponse)

      const result = await fetchSingleUSStock('AAPL')
      
      expect(result).not.toBeNull()
      expect(result!.symbol).toBe('AAPL')
      expect(result!.name).toBe('Apple Inc.')
      expect(result!.currentPrice).toBe(150.00)
    })

    it('应该返回 null 当股票不存在', async () => {
      mockHttpJson.mockResolvedValueOnce({ chart: { result: [] } })

      const result = await fetchSingleUSStock('INVALID')
      expect(result).toBeNull()
    })
  })

  describe('错误处理', () => {
    it('应该正确处理网络错误', async () => {
      mockHttpJson.mockRejectedValueOnce(new Error('Network error'))

      await expect(fetchUSStockQuote(['AAPL'])).rejects.toThrow('Network error')
    })

    it('应该正确处理 API 返回空数据', async () => {
      mockHttpJson.mockResolvedValueOnce({})

      const result = await fetchSingleUSStock('AAPL')
      expect(result).toBeNull()
    })
  })
})
