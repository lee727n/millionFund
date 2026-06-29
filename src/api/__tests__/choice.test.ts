import { describe, test, expect, vi, beforeEach } from 'vitest'
import type { NorthFlowData, SectorFlow, MainForceFlow } from '@/api/choice'

vi.mock('@/api/cache', () => ({
  getCache: vi.fn(() => null),
  setCache: vi.fn(),
}))

const mockHttp = { get: vi.fn() }

vi.mock('@/utils/http', () => ({
  http: mockHttp,
}))

describe('choice.ts API', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  test('fetchNorthFlow 成功获取数据时返回解析结果', async () => {
    const mockData = {
      data: {
        klines: ['2026-06-29,1.5,2.3,3.8,476.1']
      }
    }
    mockHttp.get.mockResolvedValue(mockData)
    const { fetchNorthFlow } = await import('@/api/choice')
    const result = await fetchNorthFlow()
    expect(result).not.toBeNull()
    expect(result!.totalNetInflow).toBe(3.8)
    expect(result!.shNetInflow).toBe(1.5)
  })

  test('fetchNorthFlow HTTP 失败时返回 fallback', async () => {
    mockHttp.get.mockRejectedValue(new Error('network error'))
    const { fetchNorthFlow } = await import('@/api/choice')
    const result = await fetchNorthFlow()
    expect(result).not.toBeNull()
    expect(result!.totalNetInflow).toBe(43.9) // fallback 数据
  })

  test('fetchSectorFlows 成功获取数据时返回解析结果', async () => {
    mockHttp.get.mockResolvedValue({
      data: {
        diff: [
          { f14: '半导体', f62: 2850000000, f184: 1, f66: '北方华创' },
        ]
      }
    })
    const { fetchSectorFlows } = await import('@/api/choice')
    const result = await fetchSectorFlows(10)
    expect(result).toHaveLength(1)
    expect(result[0]!.sectorName).toBe('半导体')
  })

  test('fetchSectorFlows HTTP 失败时返回 fallback', async () => {
    mockHttp.get.mockRejectedValue(new Error('network error'))
    const { fetchSectorFlows } = await import('@/api/choice')
    const result = await fetchSectorFlows(5)
    expect(result).toHaveLength(5)
    expect(result[0]!.sectorName).toBe('半导体')
  })

  test('fetchMainForceFlow 成功获取数据时返回解析结果', async () => {
    mockHttp.get.mockResolvedValue({
      data: {
        klines: [',8500000000,6500000000,2020000000,-3250000000,-5270000000']
      }
    })
    const { fetchMainForceFlow } = await import('@/api/choice')
    const result = await fetchMainForceFlow()
    expect(result).toHaveLength(5)
    expect(result[0]!.label).toBe('主力净流入')
  })

  test('fetchMainForceFlow HTTP 失败时返回 fallback', async () => {
    mockHttp.get.mockRejectedValue(new Error('network error'))
    const { fetchMainForceFlow } = await import('@/api/choice')
    const result = await fetchMainForceFlow()
    expect(result).toHaveLength(5)
    expect(result[0]!.netInflow).toBe(85.2)
  })

  test('fetchNorthFlow 使用缓存时直接返回', async () => {
    const { getCache } = await import('@/api/cache')
    vi.mocked(getCache).mockReturnValue({
      shNetInflow: 10, szNetInflow: 20, totalNetInflow: 30,
      balance: 100, date: '2026-06-29', recent5Day: [],
    } as NorthFlowData)
    mockHttp.get.mockClear()
    const { fetchNorthFlow } = await import('@/api/choice')
    const result = await fetchNorthFlow()
    expect(result!.totalNetInflow).toBe(30)
    expect(mockHttp.get).not.toHaveBeenCalled()
  })
})
