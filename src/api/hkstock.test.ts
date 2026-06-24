// [WHY] 港股行情 API 单元测试
// [WHAT] 测试 hkstock.ts 的各项功能
// [DEPS] 依赖 vitest

import { describe, it, expect, vi, beforeEach } from 'vitest'

// 在导入模块之前设置 mock
vi.mock('@/utils/http', () => ({
  http: {
    text: vi.fn()
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

import { fetchHKStockQuote, fetchSingleHKStock, formatHKSymbol, formatHKSymbols } from '../api/hkstock'

describe('hkstock.ts - 港股行情 API', () => {
  let mockHttpText: any

  beforeEach(async () => {
    vi.clearAllMocks()
    
    // 获取 mock 函数
    const { http } = await import('@/utils/http')
    mockHttpText = vi.mocked(http.text)
    
    // 重置 mock 状态，确保每次测试都是干净的
    mockHttpText.mockReset()
    mockHttpText.mockResolvedValue('') // 默认返回空字符串
  })

  describe('formatHKSymbol - 格式化港股代码', () => {
    it('应该为 4 位数字代码添加 hk 前缀并补零', () => {
      expect(formatHKSymbol('0700')).toBe('hk00700')
    })

    it('应该为 5 位数字代码添加 hk 前缀', () => {
      expect(formatHKSymbol('00700')).toBe('hk00700')
    })

    it('应该处理已包含 hk 前缀的代码', () => {
      expect(formatHKSymbol('hk00700')).toBe('hk00700')
      expect(formatHKSymbol('HK00700')).toBe('hk00700')
    })

    it('应该处理腾讯控股代码', () => {
      expect(formatHKSymbol('700')).toBe('hk00700')
    })

    it('应该处理阿里巴巴代码', () => {
      expect(formatHKSymbol('9988')).toBe('hk09988')
    })

    it('应该处理空字符串', () => {
      expect(formatHKSymbol('')).toBe('')
    })

    it('应该处理带空格的代码', () => {
      expect(formatHKSymbol(' 0700 ')).toBe('hk00700')
    })
  })

  describe('formatHKSymbols - 批量格式化', () => {
    it('应该批量格式化多个代码', () => {
      const codes = ['0700', '9988', '1810']
      const formatted = formatHKSymbols(codes)
      expect(formatted).toEqual(['hk00700', 'hk09988', 'hk01810'])
    })

    it('应该过滤空字符串', () => {
      const codes = ['0700', '', '9988']
      const formatted = formatHKSymbols(codes)
      expect(formatted).toEqual(['hk00700', 'hk09988'])
    })
  })

  describe('fetchHKStockQuote - 批量查询港股行情', () => {
    it('应该返回空数组当输入为空', async () => {
      const result = await fetchHKStockQuote([])
      expect(result).toEqual([])
    })

    it('应该成功获取港股行情', async () => {
      // Mock HTTP 响应
      const mockResponse = `var hq_str_hk00700="腾讯控股,345.00,1.23,0.10,100,1234567,344.50,345.50,344.00,343.77,50000,17283345,...";`
      
      mockHttpText.mockResolvedValueOnce(mockResponse)
      
      const result = await fetchHKStockQuote(['hk00700'])
      
      expect(result).toBeInstanceOf(Array)
      expect(result.length).toBe(1)
      expect(result[0]!.symbol).toBe('hk00700')
      expect(result[0]!.name).toBe('腾讯控股')
    })

    it('应该处理 API 错误', async () => {
      mockHttpText.mockRejectedValueOnce(new Error('Network error'))

      await expect(fetchHKStockQuote(['hk00700'])).rejects.toThrow('Network error')
    })
  })

  describe('fetchSingleHKStock - 查询单只港股', () => {
    it('应该成功获取单只港股行情', async () => {
      const mockResponse = `var hq_str_hk00700="腾讯控股,345.00,1.23,0.10,100,1234567,344.50,345.50,344.00,343.77,50000,17283345,...";`
      mockHttpText.mockResolvedValueOnce(mockResponse)

      const result = await fetchSingleHKStock('hk00700')
      
      expect(result).not.toBeNull()
      expect(result!.symbol).toBe('hk00700')
      expect(result!.name).toBe('腾讯控股')
    })

    it('应该返回 null 当股票不存在', async () => {
      mockHttpText.mockResolvedValueOnce('')

      const result = await fetchSingleHKStock('hk99999')
      expect(result).toBeNull()
    })
  })

  describe('错误处理', () => {
    it('应该正确处理网络错误', async () => {
      mockHttpText.mockRejectedValueOnce(new Error('Network error'))

      await expect(fetchHKStockQuote(['hk00700'])).rejects.toThrow('Network error')
    })
  })
})
