import { describe, test, expect, vi, beforeEach } from 'vitest'

const mockHttp = { get: vi.fn() }
const mockGetCache = vi.fn(() => null)
const mockSetCache = vi.fn()

vi.mock('@/api/cache', () => ({ getCache: mockGetCache, setCache: mockSetCache }))
vi.mock('@/utils/http', () => ({ http: mockHttp }))

describe('cls.ts', () => {
  beforeEach(() => { vi.clearAllMocks(); mockGetCache.mockReturnValue(null) })

  test('fetchClsTelegram 成功返回数据', async () => {
    mockHttp.get.mockResolvedValue({ data: [{ id: '1', content: 'test', ctime: '14:30' }] })
    const { fetchClsTelegram } = await import('@/api/cls')
    const r = await fetchClsTelegram(10)
    expect(r).toHaveLength(1)
    expect(r[0]!.content).toBe('test')
  })

  test('fetchClsTelegram 失败返回 fallback', async () => {
    mockHttp.get.mockRejectedValue(new Error('err'))
    const { fetchClsTelegram } = await import('@/api/cls')
    const r = await fetchClsTelegram(8)
    expect(r).toHaveLength(8)
    expect(r[0]!.type).toBe('normal')
  })

  test('fetchClsHotTopics 成功返回数据', async () => {
    mockHttp.get.mockResolvedValue({ data: [{ name: 'AI', hot_value: 980000 }] })
    const { fetchClsHotTopics } = await import('@/api/cls')
    const r = await fetchClsHotTopics()
    expect(r[0]!.name).toBe('AI')
  })

  test('fetchClsHotTopics 失败返回 fallback', async () => {
    mockHttp.get.mockRejectedValue(new Error('err'))
    const { fetchClsHotTopics } = await import('@/api/cls')
    const r = await fetchClsHotTopics()
    expect(r).toHaveLength(5)
    expect(r[0]!.name).toBe('人工智能')
  })

  test('fetchClsPlateMovement 成功返回数据', async () => {
    mockHttp.get.mockResolvedValue({ data: [{ name: '半导体', change: '3.2' }] })
    const { fetchClsPlateMovement } = await import('@/api/cls')
    const r = await fetchClsPlateMovement()
    expect(r[0]!.plateName).toBe('半导体')
    expect(r[0]!.direction).toBe('up')
  })

  test('fetchClsPlateMovement 失败返回 fallback', async () => {
    mockHttp.get.mockRejectedValue(new Error('err'))
    const { fetchClsPlateMovement } = await import('@/api/cls')
    const r = await fetchClsPlateMovement()
    expect(r).toHaveLength(4)
  })

  test('CACHE_TTL 常量存在', async () => {
    const { CACHE_TTL } = await import('@/api/cls')
    expect(CACHE_TTL.TELEGRAM).toBe(20)
    expect(CACHE_TTL.HOT_TOPICS).toBe(60)
  })
})
