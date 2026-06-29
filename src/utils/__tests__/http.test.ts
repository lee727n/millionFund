import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest'

describe('http.ts', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  test('http.get 发送 GET 请求', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ data: 'test' }),
    })
    ;(global as any).fetch = mockFetch

    const { http } = await import('@/utils/http')
    const result = await http.get('/api/test')

    expect(mockFetch).toHaveBeenCalledWith('/api/test', expect.objectContaining({
      method: 'GET',
    }))
    expect(result).toEqual({ data: 'test' })
  })

  test('http.post 发送 POST 请求', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ success: true }),
    })
    ;(global as any).fetch = mockFetch

    const { http } = await import('@/utils/http')
    const result = await http.post('/api/test', { foo: 'bar' })

    expect(mockFetch).toHaveBeenCalledWith('/api/test', expect.objectContaining({
      method: 'POST',
      headers: expect.objectContaining({
        'Content-Type': 'application/json',
      }),
      body: JSON.stringify({ foo: 'bar' }),
    }))
    expect(result).toEqual({ success: true })
  })

  test('http.json HTTP 错误时抛出错误', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      statusText: 'Not Found',
    })
    ;(global as any).fetch = mockFetch

    const { http } = await import('@/utils/http')
    await expect(http.json('/api/test')).rejects.toThrow('HTTP 404')
  })

  test('http.json 网络错误时重试', async () => {
    const mockFetch = vi.fn()
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ data: 'success' }),
      })
    ;(global as any).fetch = mockFetch

    const { http } = await import('@/utils/http')
    const result = await http.json('/api/test', { retries: 1, retryDelay: 10 })

    expect(mockFetch).toHaveBeenCalledTimes(2)
    expect(result).toEqual({ data: 'success' })
  })

  test('http.json 超过重试次数后抛出错误', async () => {
    const mockFetch = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'))
    ;(global as any).fetch = mockFetch

    const { http } = await import('@/utils/http')
    await expect(http.json('/api/test', { retries: 1, retryDelay: 10 })).rejects.toThrow()
    expect(mockFetch).toHaveBeenCalledTimes(2)
  })

  test('http.text 返回文本内容', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      text: () => Promise.resolve('response text'),
    })
    ;(global as any).fetch = mockFetch

    const { http } = await import('@/utils/http')
    const result = await http.text('/api/test')

    expect(result).toBe('response text')
  })

  test('http.text HTTP 错误时抛出错误', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
    })
    ;(global as any).fetch = mockFetch

    const { http } = await import('@/utils/http')
    await expect(http.text('/api/test')).rejects.toThrow('HTTP 500')
  })

  test('createHttpClient 创建自定义客户端', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ custom: true }),
    })
    ;(global as any).fetch = mockFetch

    const { createHttpClient } = await import('@/utils/http')
    const client = createHttpClient({ timeout: 5000 })
    const result = await client.get('/api/custom')

    expect(result).toEqual({ custom: true })
  })
})
