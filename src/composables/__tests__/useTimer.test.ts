import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest'

describe('useTimer.ts', () => {
  let useTimer: any

  beforeEach(async () => {
    vi.useFakeTimers()
    vi.clearAllTimers()
    const mod = await import('@/composables/useTimer')
    useTimer = mod.useTimer
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  test('safeTimeout 延迟执行回调', () => {
    const timer = useTimer()
    const fn = vi.fn()

    timer.safeTimeout(fn, 1000)
    expect(fn).not.toHaveBeenCalled()

    vi.advanceTimersByTime(1000)
    expect(fn).toHaveBeenCalledTimes(1)
  })

  test('safeTimeout 带参数', () => {
    const timer = useTimer()
    const fn = vi.fn()

    timer.safeTimeout(fn, 100, 'arg1', 42)
    vi.advanceTimersByTime(100)

    expect(fn).toHaveBeenCalledWith('arg1', 42)
  })

  test('safeTimeout 执行后自动从 Set 中移除', () => {
    const timer = useTimer()
    const fn = vi.fn()

    timer.safeTimeout(fn, 100)
    expect(timer.timeouts.size).toBe(1)

    vi.advanceTimersByTime(100)
    expect(timer.timeouts.size).toBe(0)
  })

  test('clearSafeTimeout 取消定时', () => {
    const timer = useTimer()
    const fn = vi.fn()

    const id = timer.safeTimeout(fn, 1000)
    timer.clearSafeTimeout(id)
    vi.advanceTimersByTime(1000)

    expect(fn).not.toHaveBeenCalled()
  })

  test('safeInterval 重复执行回调', () => {
    const timer = useTimer()
    const fn = vi.fn()

    timer.safeInterval(fn, 500)
    vi.advanceTimersByTime(1500)

    expect(fn).toHaveBeenCalledTimes(3)
  })

  test('clearSafeInterval 取消间隔', () => {
    const timer = useTimer()
    const fn = vi.fn()

    const id = timer.safeInterval(fn, 500)
    vi.advanceTimersByTime(600)
    expect(fn).toHaveBeenCalledTimes(1)

    timer.clearSafeInterval(id)
    vi.advanceTimersByTime(1000)
    expect(fn).toHaveBeenCalledTimes(1)
  })

  test('cleanup 清除所有定时器', () => {
    const timer = useTimer()
    const fn = vi.fn()

    timer.safeTimeout(fn, 1000)
    timer.safeInterval(fn, 500)
    expect(timer.timeouts.size).toBeGreaterThan(0)
    expect(timer.intervals.size).toBeGreaterThan(0)

    timer.cleanup()
    expect(timer.timeouts.size).toBe(0)
    expect(timer.intervals.size).toBe(0)
  })

  test('cleanup 后定时器不再触发', () => {
    const timer = useTimer()
    const fn = vi.fn()

    timer.safeTimeout(fn, 1000)
    timer.cleanup()
    vi.advanceTimersByTime(1000)

    expect(fn).not.toHaveBeenCalled()
  })
})
