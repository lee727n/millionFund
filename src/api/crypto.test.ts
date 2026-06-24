// [WHY] 加密货币 API 测试
// [WHAT] 测试 CoinGecko API 对接函数

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fetchCryptoPrice, fetchSingleCrypto, symbolToCoinId, fetchCryptoBySymbols } from '../api/crypto'
import type { CryptoQuote } from '../types/crypto'

// Mock http 模块
vi.mock('@/utils/http', () => ({
  http: {
    get: vi.fn(),
    text: vi.fn()
  }
}))

describe('crypto API', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('symbolToCoinId', () => {
    it('应该将 BTC 转换为 bitcoin', () => {
      const result = symbolToCoinId('BTC')
      expect(result).toBe('bitcoin')
    })

    it('应该将 ETH 转换为 ethereum', () => {
      const result = symbolToCoinId('ETH')
      expect(result).toBe('ethereum')
    })

    it('应该将 USDT 转换为 tether', () => {
      const result = symbolToCoinId('USDT')
      expect(result).toBe('tether')
    })

    it('应该将小写符号转换为 CoinGecko ID', () => {
      const result = symbolToCoinId('btc')
      expect(result).toBe('bitcoin')
    })

    it('应该直接返回已有的 CoinGecko ID', () => {
      const result = symbolToCoinId('bitcoin')
      expect(result).toBe('bitcoin')
    })

    it('应该处理未知符号（转小写返回）', () => {
      const result = symbolToCoinId('UNKNOWN')
      expect(result).toBe('unknown')
    })
  })

  describe('fetchCryptoPrice', () => {
    it('应该批量查询加密货币价格', async () => {
      const { http } = await import('@/utils/http')
      const mockData = {
        bitcoin: {
          usd: 67234,
          cny: 487656,
          usd_24h_change: 2.5,
          last_updated_at: 1719200000
        },
        ethereum: {
          usd: 3521,
          cny: 25543,
          usd_24h_change: -1.2,
          last_updated_at: 1719200000
        }
      }
      ;(http.get as any).mockResolvedValue(mockData)

      const results = await fetchCryptoPrice(['bitcoin', 'ethereum'])

      expect(results.size).toBe(2)
      expect(results.get('bitcoin')?.usd).toBe(67234)
      expect(results.get('bitcoin')?.symbol).toBe('BTC')
      expect(results.get('bitcoin')?.usd24hChange).toBe(2.5)
      expect(results.get('ethereum')?.usd).toBe(3521)
      expect(results.get('ethereum')?.usd24hChange).toBe(-1.2)
    })

    it('应该返回空 Map 当输入空数组', async () => {
      const results = await fetchCryptoPrice([])
      expect(results.size).toBe(0)
    })

    it('应该处理 API 错误', async () => {
      const { http } = await import('@/utils/http')
      ;(http.get as any).mockRejectedValue(new Error('Network error'))

      await expect(fetchCryptoPrice(['bitcoin'])).rejects.toThrow('Network error')
    })
  })

  describe('fetchSingleCrypto', () => {
    it('应该查询单个加密货币（按符号）', async () => {
      const { http } = await import('@/utils/http')
      const mockData = {
        bitcoin: {
          usd: 67234,
          cny: 487656,
          usd_24h_change: 2.5,
          last_updated_at: 1719200000
        }
      }
      ;(http.get as any).mockResolvedValue(mockData)

      const result = await fetchSingleCrypto('BTC')

      expect(result).not.toBeNull()
      expect(result?.id).toBe('bitcoin')
      expect(result?.usd).toBe(67234)
    })

    it('应该查询单个加密货币（按 CoinGecko ID）', async () => {
      const { http } = await import('@/utils/http')
      const mockData = {
        bitcoin: {
          usd: 67234,
          cny: 487656,
          usd_24h_change: 2.5,
          last_updated_at: 1719200000
        }
      }
      ;(http.get as any).mockResolvedValue(mockData)

      const result = await fetchSingleCrypto('bitcoin')

      expect(result).not.toBeNull()
      expect(result?.id).toBe('bitcoin')
    })

    it('应该返回 null 当 API 失败', async () => {
      const { http } = await import('@/utils/http')
      ;(http.get as any).mockRejectedValue(new Error('Network error'))

      const result = await fetchSingleCrypto('BTC')
      expect(result).toBeNull()
    })
  })

  describe('fetchCryptoBySymbols', () => {
    it('应该按符号批量查询', async () => {
      const { http } = await import('@/utils/http')
      const mockData = {
        bitcoin: {
          usd: 67234,
          cny: 487656,
          usd_24h_change: 2.5,
          last_updated_at: 1719200000
        },
        ethereum: {
          usd: 3521,
          cny: 25543,
          usd_24h_change: -1.2,
          last_updated_at: 1719200000
        }
      }
      ;(http.get as any).mockResolvedValue(mockData)

      const results = await fetchCryptoBySymbols(['BTC', 'ETH'])

      expect(results.size).toBe(2)
      expect(results.get('BTC')?.usd).toBe(67234)
      expect(results.get('ETH')?.usd).toBe(3521)
    })
  })
})
