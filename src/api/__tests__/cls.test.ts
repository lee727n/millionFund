import { describe, test, expect, vi, beforeEach } from 'vitest'
import type { TelegramItem, HotTopic, PlateMovement } from '@/api/cls'

const mockHttp = { get: vi.fn() }
const mockGetCache = vi.fn(() => null)
const mockSetCache = vi.fn()

vi.mock('@/api/cache', () => ({
  getCache: mockGetCache,
  setCache: mockSetCache,
}))

vi.mock('@/utils/http', () => ({
  http: mockHttp,
}))

describe('cls.ts API', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetCache.mockReturnValue(null)
  })

  test('fetchClsTelegram 成功获取数据时返回列表', async () => {
    mockHttp.get.mockResolvedValue({
      data: [
        { id: '1', content: 'test', ctime: '14:30' },
      ],
    })
    const { fetchClsTelegram } = await import('@/api/cls')
    const result = await fetchClsTelegram(10)
    expect(result).toHaveLength(1)
    expect(result[0]!.content).toBe('test')
  })

  test('fetchClsTelegram HTTP 失败时返回 fallback', async () => {
    mockHttp.get.mockRejectedValue(new Error('network error'))
    const { fetchClsTelegram } = await import('@/api/cls')
    const result = await fetchClsTelegram(8)
    expect(result).toHaveLength(8)
    expect(result[0]!.type).toBe('normal')
  })

  test('fetchClsTelegram 使用缓存', async () => {
    mockGetCache.mockReturnValue([{ id: '1', content: 'cached', time: '12:00', type: 'normal', tags: [] }])
    const { fetchClsTelegram } = await import('@/api/cls')
    const result = await fetchClsTelegram(10)
    expect(result).toHaveLength(1)
    expect(mockHttp.get).not.toHaveBeenCalled()
  })

  test('fetchClsHotTopics 成功获取数据时返回列表', async () => {
    mockHttp.get.mockResolvedValue({
      data: [{ name: 'AI', hot_value: 980000 }],
    })
    const { fetchClsHotTopics } = await import('@/api/cls')
    const result = await fetchClsHotTopics()
    expect(result.length).toBeGreaterThan(0)
    expect(result[0]!.name).toBe('AI')
  })

  test('fetchClsHotTopics HTTP 失败时返回 fallback', async () => {
    mockHttp.get.mockRejectedValue(new Error('network error'))
    const { fetchClsHotTopics } = await import('@/api/cls')
    const result = await fetchClsHotTopics()
    expect(result).toHaveLength(5)
    expect(result[0]!.name).toBe('人工智能')
  })

  test('fetchClsPlateMovement 成功获取数据时返回列表', async () => {
    mockHttp.get.mockResolvedValue({
      data: [{ name: '半导体', change: '3.2' }],
    })
    const { fetchClsPlateMovement } = await import('@/api/cls')
    const result = await fetchClsPlateMovement()
    expect(result.length).toBeGreaterThan(0)
    expect(result[0]!.plateName).toBe('半导体')
    expect(result[0]!.direction).toBe('up')
  })

  test('fetchClsPlateMovement HTTP 失败时返回 fallback', async () => {
    mockHttp.get.mockRejectedValue(new Error('network error'))
    const { fetchClsPlateMovement } = await import('@/api/cls')
    const result = await fetchClsPlateMovement()
    expect(result).toHaveLength(4)
    expect(result[0]!.plateName).toBe('半导体')
  })
})
