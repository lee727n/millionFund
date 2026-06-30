// [WHY] 智能刷新 composable — 根据交易时间自动刷新估值，非交易时间停止刷新，节省资源和 API 调用
// [WHAT] 提供刷新数据、自动刷新管理、刷新状态管理功能
// [DEPS] vue、@/api/tiantianApi、@/utils/performance、@/api/unifiedCache

import { ref, onUnmounted, type Ref } from 'vue'
import { isTradingTime, getTradingSession } from '@/api/tiantianApi'
import { measureTime, markStart, markEnd } from '@/utils/performance'
import { unifiedCache, UNIFIED_CACHE_TTL } from '@/api/unifiedCache'
import { logger } from '@/utils/logger'

/**
 * 智能刷新配置选项
 */
export interface UseSmartRefreshOptions {
  /** 刷新间隔（毫秒），默认 30000 */
  interval?: number
  /** 是否立即开始自动刷新，默认 false */
  immediate?: boolean
  /** 缓存 TTL（毫秒），默认使用 UNIFIED_CACHE_TTL.TRADING_ESTIMATE */
  cacheTTL?: number
  /** 缓存键前缀，用于区分不同的数据源 */
  cacheKeyPrefix?: string
  /**
   * [FIX] 手动指定缓存 Key，最稳定，推荐在 options 中传入
   * 若不传，则自动根据 fetchFn 源码生成稳定哈希
   */
  cacheKey?: string
}

/**
 * 智能刷新返回值
 */
export interface UseSmartRefreshReturn<T> {
  /** 刷新得到的数据 */
  data: Ref<T | null>
  /** 是否正在加载 */
  loading: Ref<boolean>
  /** 错误信息 */
  error: Ref<Error | null>
  /** 最后更新时间 */
  lastUpdateTime: Ref<Date | null>
  /** 是否处于自动刷新状态 */
  isAutoRefreshing: Ref<boolean>
  /** 手动刷新 */
  refresh: () => Promise<void>
  /** 开始自动刷新 */
  startAutoRefresh: (interval?: number) => void
  /** 停止自动刷新 */
  stopAutoRefresh: () => void
  /** 销毁定时器（组件卸载时自动调用） */
  dispose: () => void
}

/**
 * 简单哈希函数，对相同输入始终产生相同输出
 * 用于根据函数源码生成稳定缓存键
 */
function simpleHash(str: string): string {
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i)
    hash = ((hash << 5) - hash) + char
    hash = hash & hash // 转换为 32 位整数
  }
  return Math.abs(hash).toString(36)
}

/**
 * 智能刷新 composable
 * @param fetchFn - 获取数据的异步函数
 * @param options - 配置选项
 */
export function useSmartRefresh<T>(
  fetchFn: () => Promise<T>,
  options: UseSmartRefreshOptions = {}
): UseSmartRefreshReturn<T> {
  const {
    interval = 30000,
    immediate = false,
    cacheTTL = UNIFIED_CACHE_TTL.TRADING_ESTIMATE,
    cacheKeyPrefix = 'smart_refresh',
    cacheKey: userCacheKey,
  } = options

  // 响应式状态
  const data = ref<T | null>(null) as Ref<T | null>
  const loading = ref(false)
  const error = ref<Error | null>(null)
  const lastUpdateTime = ref<Date | null>(null)
  const isAutoRefreshing = ref(false)

  // 定时器 ID
  let refreshTimer: number | null = null
  let tradingCheckTimer: number | null = null

  /**
   * [FIX] 生成稳定的缓存键
   * 优先级：用户手动传入 cacheKey > cacheKeyPrefix > 函数名 > 函数源码哈希
   */
  function getCacheKey(): string {
    if (userCacheKey) return userCacheKey
    const stableId = cacheKeyPrefix || (fetchFn as any).name || 'anonymous'
    return `${stableId}_${simpleHash(fetchFn.toString())}`
  }

  /**
   * 手动刷新数据
   */
  async function refresh(): Promise<void> {
    if (loading.value) {
      if (import.meta.env.DEV) {
        logger.warn('[SmartRefresh] Already refreshing, skipping')
      }
      return
    }

    loading.value = true
    error.value = null
    markStart('refresh')

    try {
      // 尝试从缓存获取
      const cacheKey = getCacheKey()
      const cached = unifiedCache.getMemory<T>(cacheKey)

      if (cached) {
        data.value = cached
        lastUpdateTime.value = new Date()
        logger.warn('[SmartRefresh] Using cached data')
        return
      }

      // 调用 fetchFn 获取数据（使用性能监控）
      const result = await measureTime('fetch_data', fetchFn)
      data.value = result
      lastUpdateTime.value = new Date()

      // 更新缓存
      unifiedCache.setMemory(cacheKey, result, cacheTTL)
    } catch (err) {
      error.value = err instanceof Error ? err : new Error(String(err))
      if (import.meta.env.DEV) {
        logger.error('[SmartRefresh] Refresh failed', err)
      }

      // 如果获取数据失败，尝试使用缓存数据
      const cacheKey = getCacheKey()
      const cached = unifiedCache.getMemory<T>(cacheKey)
      if (cached) {
        data.value = cached
        if (import.meta.env.DEV) {
          logger.warn('[SmartRefresh] Using cached data after fetch failed')
        }
      }
    } finally {
      loading.value = false
      markEnd('refresh')
    }
  }

  /**
   * 开始自动刷新
   * @param customInterval - 自定义刷新间隔（可选）
   */
  function startAutoRefresh(customInterval?: number): void {
    const actualInterval = customInterval || interval

    // 先停止现有的自动刷新
    stopAutoRefresh()

    // 检查是否在交易时间
    if (!isTradingTime()) {
      if (import.meta.env.DEV) {
        logger.warn('[SmartRefresh] Not in trading time, auto refresh not started')
      }
      return
    }

    // 立即刷新一次
    refresh()

    // 设置定时器
    refreshTimer = window.setInterval(() => {
      if (isTradingTime()) {
        refresh()
      } else {
        if (import.meta.env.DEV) {
          logger.warn('[SmartRefresh] Trading time ended, stopping auto refresh')
        }
        stopAutoRefresh()
      }
    }, actualInterval)

    isAutoRefreshing.value = true

    if (import.meta.env.DEV) {
      logger.warn(`[SmartRefresh] Auto refresh started, interval: ${actualInterval}ms`)
    }
  }

  /**
   * 停止自动刷新
   */
  function stopAutoRefresh(): void {
    if (refreshTimer !== null) {
      clearInterval(refreshTimer)
      refreshTimer = null
      isAutoRefreshing.value = false

      if (import.meta.env.DEV) {
        logger.warn('[SmartRefresh] Auto refresh stopped')
      }
    }
  }

  /**
   * 销毁所有定时器
   */
  function dispose(): void {
    stopAutoRefresh()

    if (tradingCheckTimer !== null) {
      clearInterval(tradingCheckTimer)
      tradingCheckTimer = null
    }
  }

  /**
   * 启动交易时间检查定时器（每分钟检查一次）
   */
  function startTradingCheck(): void {
    if (tradingCheckTimer !== null) return

    tradingCheckTimer = window.setInterval(() => {
      const inTrading = isTradingTime()

      if (inTrading && !isAutoRefreshing.value) {
        // 进入交易时间，开始自动刷新
        if (import.meta.env.DEV) {
          logger.warn('[SmartRefresh] Trading time started, resuming auto refresh')
        }
        startAutoRefresh()
      } else if (!inTrading && isAutoRefreshing.value) {
        // 离开交易时间，停止自动刷新
        if (import.meta.env.DEV) {
          logger.warn('[SmartRefresh] Trading time ended, pausing auto refresh')
        }
        stopAutoRefresh()
      }
    }, 60000) // 每分钟检查一次
  }

  // 组件卸载时清理
  onUnmounted(() => {
    dispose()
  })

  // 如果设置了 immediate，立即开始自动刷新
  if (immediate) {
    if (isTradingTime()) {
      startAutoRefresh()
    }
    startTradingCheck()
  }

  return {
    data,
    loading,
    error,
    lastUpdateTime,
    isAutoRefreshing,
    refresh,
    startAutoRefresh,
    stopAutoRefresh,
    dispose,
  }
}

/**
 * 检查当前是否在交易时间
 * @returns 是否在交易时间
 */
export function useTradingTimeCheck(): Ref<boolean> {
  const isTrading = ref(isTradingTime())

  // 每分钟检查一次
  const checkTimer = setInterval(() => {
    isTrading.value = isTradingTime()
  }, 60000)

  // 组件卸载时清理
  onUnmounted(() => {
    clearInterval(checkTimer)
  })

  return isTrading
}

/**
 * 获取交易时段描述
 * @returns 交易时段描述字符串
 */
export function getTradingTimeDescription(): string {
  const session = getTradingSession()

  switch (session) {
    case 'morning':
      return '交易中（上午 9:30-11:30）'
    case 'noon_break':
      return '午间休市（11:30-13:00）'
    case 'afternoon':
      return '交易中（下午 13:00-15:00）'
    case 'pre_market':
      return '盘前'
    case 'post_market':
      return '盘后'
    case 'weekend':
      return '周末休市'
    case 'holiday':
      return '节假日休市'
    default:
      return '非交易时间'
  }
}
