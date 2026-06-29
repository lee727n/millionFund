import { describe, test, expect, vi, beforeEach } from 'vitest'

vi.mock('@/api/cache', () => ({ getCache: vi.fn(() => null), setCache: vi.fn() }))
vi.mock('@/utils/http', () => ({ http: { get: vi.fn() } }))

describe('choice.ts', () => {
  beforeEach(() => { vi.clearAllMocks() })

  test('fetchNorthFlow 成功返回数据', async () => {
    const { http } = await import('@/utils/http')
    http.get.mockResolvedValue({ data: { klines: ['2026-06-29,1.5,2.3,3.8,476.1'] } })
    const { fetchNorthFlow } = await import('@/api/choice')
    const r = await fetchNorthFlow()
    expect(r).not.toBeNull()
    expect(r!.totalNetInflow).toBe(3.8)
  })

  test('fetchNorthFlow 失败返回 fallback', async () => {
    const { http } = await import('@/utils/http')
    http.get.mockRejectedValue(new Error('err'))
    const { fetchNorthFlow } = await import('@/api/choice')
    const r = await fetchNorthFlow()
    expect(r!.totalNetInflow).toBe(43.9)
  })

  test('fetchSectorFlows 成功返回数据', async () => {
    const { http } = await import('@/utils/http')
    http.get.mockResolvedValue({ data: { diff: [{ f14: '半导体', f62: 2850000000, f184: 1, f66: '北方华创' }] } })
    const { fetchSectorFlows } = await import('@/api/choice')
    const r = await fetchSectorFlows(10)
    expect(r).toHaveLength(1)
    expect(r[0]!.sectorName).toBe('半导体')
  })

  test('fetchSectorFlows 失败返回 fallback', async () => {
    const { http } = await import('@/utils/http')
    http.get.mockRejectedValue(new Error('err'))
    const { fetchSectorFlows } = await import('@/api/choice')
    const r = await fetchSectorFlows(5)
    expect(r).toHaveLength(5)
  })

  test('fetchMainForceFlow 成功返回数据', async () => {
    const { http } = await import('@/utils/http')
    http.get.mockResolvedValue({ data: { klines: [',8500000000,6500000000,2020000000,-3250000000,-5270000000'] } })
    const { fetchMainForceFlow } = await import('@/api/choice')
    const r = await fetchMainForceFlow()
    expect(r).toHaveLength(5)
    expect(r[0]!.label).toBe('主力净流入')
  })

  test('fetchMainForceFlow 失败返回 fallback', async () => {
    const { http } = await import('@/utils/http')
    http.get.mockRejectedValue(new Error('err'))
    const { fetchMainForceFlow } = await import('@/api/choice')
    const r = await fetchMainForceFlow()
    expect(r[0]!.netInflow).toBe(85.2)
  })

  test('CACHE_TTL 常量存在', async () => {
    const { CACHE_TTL } = await import('@/api/choice')
    expect(CACHE_TTL.NORTH_FLOW).toBe(30)
    expect(CACHE_TTL.SECTOR_FLOW).toBe(60)
  })
})
