// [WHY] 性能监控工具 — 测量异步函数执行时间，开发环境输出到控制台，生产环境可上报
// [WHAT] 提供 measureTime、markStart、markEnd、getMetrics 等性能监控方法
// [DEPS] performance.now()、console.log、可选的上报接口

import { logger } from './logger'

/**
 * 性能指标存储
 */
const metrics = new Map<string, number>()

/**
 * 测量异步函数执行时间
 * @param label - 性能标记名称
 * @param fn - 要测量的异步函数
 * @returns 函数执行结果
 */
export async function measureTime<T>(label: string, fn: () => Promise<T>): Promise<T> {
  const start = performance.now()
  try {
    const result = await fn()
    const duration = performance.now() - start
    metrics.set(label, duration)
    if (import.meta.env.DEV) {
      logger.warn(`[Performance] ${label}: ${duration.toFixed(2)}ms`)
    }
    return result
  } catch (error) {
    const duration = performance.now() - start
    metrics.set(`${label}_error`, duration)
    if (import.meta.env.DEV) {
      logger.error(`[Performance] ${label} failed after ${duration.toFixed(2)}ms`, error)
    }
    throw error
  }
}

/**
 * 标记开始时间点
 * @param label - 性能标记名称
 */
export function markStart(label: string): void {
  const start = performance.now()
  metrics.set(`${label}_start`, start)
  if (import.meta.env.DEV) {
    logger.warn(`[Performance] ${label} started`)
  }
}

/**
 * 标记结束时间点并输出耗时
 * @param label - 性能标记名称（必须与 markStart 使用相同的 label）
 */
export function markEnd(label: string): void {
  const end = performance.now()
  const startKey = `${label}_start`
  const startTime = metrics.get(startKey)

  if (startTime !== undefined) {
    const duration = end - startTime
    metrics.set(label, duration)
    metrics.delete(startKey) // 清理开始标记
    if (import.meta.env.DEV) {
      logger.warn(`[Performance] ${label}: ${duration.toFixed(2)}ms`)
    }
  } else {
    if (import.meta.env.DEV) {
      logger.warn(`[Performance] No start mark found for "${label}"`)
    }
  }
}

/**
 * 获取所有性能指标
 * @returns 性能指标记录（label -> duration in ms）
 */
export function getMetrics(): Record<string, number> {
  const result: Record<string, number> = {}
  metrics.forEach((value, key) => {
    // 只返回已完成的测量（不包含 _start 和 _error 标记）
    if (!key.endsWith('_start')) {
      result[key] = value
    }
  })
  return result
}

/**
 * 清除所有性能指标
 */
export function clearMetrics(): void {
  metrics.clear()
}

/**
 * 上报性能指标（生产环境使用）
 * @param metrics - 要上报的性能指标
 * @param endpoint - 上报端点 URL
 */
export async function reportMetrics(
  metrics: Record<string, number>,
  endpoint?: string
): Promise<void> {
  if (!endpoint) {
    if (import.meta.env.DEV) {
      logger.warn('[Performance] No endpoint provided, skipping report')
    }
    return
  }

  try {
    await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        timestamp: Date.now(),
        metrics,
        userAgent: navigator.userAgent,
        url: window.location.href,
      }),
    })
  } catch (error) {
    if (import.meta.env.DEV) {
      logger.error('[Performance] Failed to report metrics', error)
    }
  }
}

/**
 * 创建性能装饰器（用于装饰器语法）
 * @param label - 性能标记名称
 */
export function measure(label: string) {
  return function (
    target: any,
    propertyKey: string,
    descriptor: PropertyDescriptor
  ) {
    const originalMethod = descriptor.value
    descriptor.value = async function (...args: any[]) {
      return measureTime(label, () => originalMethod.apply(this, args))
    }
    return descriptor
  }
}
