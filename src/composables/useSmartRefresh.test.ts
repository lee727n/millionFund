// [WHY] useSmartRefresh composable 单元测试 — 验证智能刷新功能正常工作
// [WHAT] 测试刷新数据、自动刷新管理、刷新状态管理
// [DEPS] vitest、vue、./useSmartRefresh

import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { ref } from 'vue'
import { useSmartRefresh, isTradingTime, getTradingTimeDescription } from './useSmartRefresh'
import { isTradingTime as tiantianIsTradingTime } from '@/api/tiantianApi'

/**
 * Mock @/api/tiantianApi
 */
vi.mock('@/api/tiantianApi', () => ({
  isTradingTime: vi.fn(() => true),
  getTradingSession: vi.fn(() => 'morning'),
}))

/**
 * Mock @/utils/performance
 */
vi.mock('@/utils/performance', () => ({
  measureTime: vi.fn(async (label: string, fn: () => Promise<any>) => fn()),
  markStart: vi.fn(),
  markEnd: vi.fn(),
}))

/**
 * Mock @/api/unifiedCache
 */
vi.mock('@/api/unifiedCache', () => ({
  unifiedCache: {
    getMemory: vi.fn(),
    setMemory: vi.fn(),
  },
  UNIFIED_CACHE_TTL: {
    REALTIME: 3000,
  },
}))

/**
 * useSmartRefresh composable 单元测试
 */
describe('useSmartRefresh.ts', () => {
  /**
   * 每个测试前的设置
   */
  beforeEach(() => {
    vi.clearAllMocks()
    // 模拟交易时间
    ;(tiantianIsTradingTime as any).mockReturnValue(true)
  })

  /**
   * 测试：应该正确初始化状态
   */
  test('should initialize state correctly', () => {
    const fetchFn = vi.fn(async () => ({ value: 100 }))
    const { data, loading, error, lastUpdateTime, isAutoRefreshing } = useSmartRefresh(fetchFn)

    expect(data.value).toBeNull()
    expect(loading.value).toBe(false)
    expect(error.value).toBeNull()
    expect(lastUpdateTime.value).toBeNull()
    expect(isAutoRefreshing.value).toBe(false)
  })

  /**
   * 测试：refresh 应该调用 fetchFn 并更新数据
   */
  test('refresh should call fetchFn and update data', async () => {
    const mockData = { value: 100 }
    const fetchFn = vi.fn(async () => mockData)
    const { data, refresh, loading, lastUpdateTime } = useSmartRefresh(fetchFn)

    await refresh()

    expect(fetchFn).toHaveBeenCalledOnce()
    expect(data.value).toEqual(mockData)
    expect(loading.value).toBe(false)
    expect(lastUpdateTime.value).toBeInstanceOf(Date)
  })

  /**
   * 测试：refresh 应该处理错误
   */
  test('refresh should handle errors', async () => {
    const fetchFn = vi.fn(async () => {
      throw new Error('Fetch error')
    })
    const { refresh, error } = useSmartRefresh(fetchFn)

    await refresh()

    expect(error.value).toBeInstanceOf(Error)
    expect(error.value?.message).toBe('Fetch error')
  })

  /**
   * 测试：startAutoRefresh 应该在交易时间开始自动刷新
   */
  test('startAutoRefresh should start auto refresh during trading time', async () => {
    const fetchFn = vi.fn(async () => ({ value: 100 }))
    const { startAutoRefresh, isAutoRefreshing } = useSmartRefresh(fetchFn)

    startAutoRefresh(100) // 100ms 间隔，用于测试

    expect(isAutoRefreshing.value).toBe(true)
    expect(fetchFn).toHaveBeenCalledOnce() // 立即刷新一次

    // 等待自动刷新
    await new Promise((resolve) => setTimeout(resolve, 150))
    expect(fetchFn).toHaveBeenCalledTimes(2) // 至少调用两次

    // 清理
    const { stopAutoRefresh } = useSmartRefresh(fetchFn)
    stopAutoRefresh()
  })

  /**
   * 测试：startAutoRefresh 应该在非交易时间不开始自动刷新
   */
  test('startAutoRefresh should not start auto refresh during non-trading time', () => {
    ;(tiantianIsTradingTime as any).mockReturnValue(false)

    const fetchFn = vi.fn(async () => ({ value: 100 }))
    const { startAutoRefresh, isAutoRefreshing } = useSmartRefresh(fetchFn)

    startAutoRefresh()

    expect(isAutoRefreshing.value).toBe(false)
    expect(fetchFn).not.toHaveBeenCalled()
  })

  /**
   * 测试：stopAutoRefresh 应该停止自动刷新
   */
  test('stopAutoRefresh should stop auto refresh', async () => {
    const fetchFn = vi.fn(async () => ({ value: 100 }))
    const { startAutoRefresh, stopAutoRefresh, isAutoRefreshing } = useSmartRefresh(fetchFn)

    startAutoRefresh(100)
    expect(isAutoRefreshing.value).toBe(true)

    stopAutoRefresh()
    expect(isAutoRefreshing.value).toBe(false)
  })

  /**
   * 测试：dispose 应该清理所有定时器
   */
  test('dispose should clean up all timers', () => {
    const fetchFn = vi.fn(async () => ({ value: 100 }))
    const { startAutoRefresh, dispose, isAutoRefreshing } = useSmartRefresh(fetchFn)

    startAutoRefresh(100)
    expect(isAutoRefreshing.value).toBe(true)

    dispose()
    expect(isAutoRefreshing.value).toBe(false)
  })

  /**
   * 测试：应该使用缓存数据
   */
  test('should use cached data', async () => {
    const mockData = { value: 100 }
    const fetchFn = vi.fn(async () => mockData)

    // Mock unifiedCache.getMemory 返回缓存数据
    const { unifiedCache } = await import('@/api/unifiedCache')
    ;(unifiedCache.getMemory as any).mockReturnValue(mockData)

    const { refresh, data } = useSmartRefresh(fetchFn)

    await refresh()

    // 应该使用缓存数据，但仍然调用 fetchFn（在开发环境下）
    expect(data.value).toEqual(mockData)
  })

  /**
   * 测试：getTradingTimeDescription 应该返回正确的描述
   */
  test('getTradingTimeDescription should return correct description', () => {
    const description = getTradingTimeDescription()
    expect(description).toBeTruthy()
    expect(typeof description).toBe('string')
  })
})
