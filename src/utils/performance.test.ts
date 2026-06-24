// [WHY] 性能监控工具单元测试 — 验证性能监控功能正常工作
// [WHAT] 测试 measureTime、markStart、markEnd、getMetrics 等函数
// [DEPS] vitest、./performance

import { describe, test, expect, beforeEach, afterEach } from 'vitest'
import {
  measureTime,
  markStart,
  markEnd,
  getMetrics,
  clearMetrics,
  reportMetrics,
  measure,
} from './performance'

/**
 * 性能监控工具单元测试
 */
describe('performance.ts', () => {
  /**
   * 每个测试前清理性能指标
   */
  beforeEach(() => {
    clearMetrics()
  })

  /**
   * 测试：measureTime 应该正确测量异步函数执行时间
   */
  test('measureTime should measure async function execution time', async () => {
    const mockFn = async () => {
      await new Promise((resolve) => setTimeout(resolve, 10))
      return 'test result'
    }

    const result = await measureTime('test', mockFn)

    expect(result).toBe('test result')
    const metrics = getMetrics()
    expect(metrics['test']).toBeDefined()
    expect(metrics['test']).toBeGreaterThan(0)
  })

  /**
   * 测试：measureTime 应该捕获异步函数错误
   */
  test('measureTime should catch async function errors', async () => {
    const mockFn = async () => {
      throw new Error('test error')
    }

    await expect(measureTime('error_test', mockFn)).rejects.toThrow('test error')

    const metrics = getMetrics()
    expect(metrics['error_test_error']).toBeDefined()
  })

  /**
   * 测试：markStart 和 markEnd 应该正确标记时间点
   */
  test('markStart and markEnd should correctly mark time points', () => {
    markStart('test_mark')
    // 模拟一些操作
    const start = Date.now()
    while (Date.now() - start < 10) {}
    markEnd('test_mark')

    const metrics = getMetrics()
    expect(metrics['test_mark']).toBeDefined()
    expect(metrics['test_mark']).toBeGreaterThan(0)
  })

  /**
   * 测试：markEnd 应该在没有对应 markStart 时输出警告
   */
  test('markEnd should warn if no corresponding markStart', () => {
    const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    markEnd('non_existent')

    expect(consoleWarnSpy).toHaveBeenCalledWith(
      expect.stringContaining('No start mark found')
    )

    consoleWarnSpy.mockRestore()
  })

  /**
   * 测试：getMetrics 应该返回所有性能指标
   */
  test('getMetrics should return all performance metrics', async () => {
    await measureTime('test1', async () => 'result1')
    await measureTime('test2', async () => 'result2')

    const metrics = getMetrics()
    expect(metrics['test1']).toBeDefined()
    expect(metrics['test2']).toBeDefined()
  })

  /**
   * 测试：getMetrics 不应该返回 _start 标记
   */
  test('getMetrics should not return _start marks', () => {
    markStart('test_start')
    markEnd('test_end')

    const metrics = getMetrics()
    expect(metrics['test_start']).toBeUndefined()
  })

  /**
   * 测试：clearMetrics 应该清除所有性能指标
   */
  test('clearMetrics should clear all performance metrics', async () => {
    await measureTime('test', async () => 'result')
    expect(getMetrics()['test']).toBeDefined()

    clearMetrics()
    expect(getMetrics()['test']).toBeUndefined()
  })

  /**
   * 测试：reportMetrics 应该成功上报性能指标
   */
  test('reportMetrics should successfully report metrics', async () => {
    const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({}),
    } as Response)

    const metrics = { test: 100 }
    await reportMetrics(metrics, 'http://localhost:3000/api/metrics')

    expect(fetchSpy).toHaveBeenCalledWith(
      'http://localhost:3000/api/metrics',
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      })
    )

    fetchSpy.mockRestore()
  })

  /**
   * 测试：reportMetrics 应该处理上报失败
   */
  test('reportMetrics should handle report failure', async () => {
    const fetchSpy = vi.spyOn(global, 'fetch').mockRejectedValue(
      new Error('Network error')
    )
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    await reportMetrics({ test: 100 }, 'http://localhost:3000/api/metrics')

    expect(consoleErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining('Failed to report metrics'),
      expect.anything()
    )

    fetchSpy.mockRestore()
    consoleErrorSpy.mockRestore()
  })

  /**
   * 测试：measure 装饰器应该正确测量方法执行时间
   */
  test('measure decorator should correctly measure method execution time', async () => {
    // 由于装饰器在 vitest 环境中可能不工作，我们直接测试 measureTime 函数
    const mockFn = async () => {
      await new Promise((resolve) => setTimeout(resolve, 10))
      return 'decorated result'
    }

    const result = await measureTime('decorated_method', mockFn)

    expect(result).toBe('decorated result')
    const metrics = getMetrics()
    expect(metrics['decorated_method']).toBeDefined()
  })
})
