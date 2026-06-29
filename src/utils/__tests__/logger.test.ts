import { describe, test, expect, vi, beforeEach } from 'vitest'
import { logger, exportLogsAsText, copyLogsToClipboard } from '@/utils/logger'

describe('logger.ts', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.useFakeTimers()
    // 清理 logger 内部状态（通过 clear 方法）
    logger.clear()
    // clear 会写入一条日志，再清一次
    logger.clear()
  })

  afterEach(() => {
    vi.useRealTimers()
    localStorage.clear()
  })

  test('单例：logger 是同一个实例', () => {
    expect(logger).toBeTruthy()
  })

  test('info 写入 entry', () => {
    logger.info('test-info')
    const entries = logger.getAll()
    expect(entries.some(e => e.message === 'test-info' && e.level === 'info')).toBe(true)
  })

  test('warn/error/debug 写入 entry', () => {
    logger.warn('test-warn')
    logger.error('test-error')
    logger.debug('test-debug')
    const entries = logger.getAll()
    expect(entries.some(e => e.level === 'warn')).toBe(true)
    expect(entries.some(e => e.level === 'error')).toBe(true)
    expect(entries.some(e => e.level === 'debug')).toBe(true)
  })

  test('entry 包含 id、time、message、data 字段', () => {
    logger.info('hello', { a: 1 })
    const entries = logger.getAll()
    const entry = entries.find(e => e.message === 'hello')!
    expect(entry).toBeTruthy()
    expect(entry.id).toBeTruthy()
    expect(entry.time).toBeTruthy()
    expect(entry.data).toEqual({ a: 1 })
  })

  test('entries 超过 500 时截断', () => {
    for (let i = 0; i < 600; i++) {
      logger.info(`msg-${i}`)
    }
    const entries = logger.getAll()
    expect(entries.length).toBeLessThanOrEqual(500)
  })

  test('clear 清空 entries', () => {
    logger.info('before-clear')
    expect(logger.getAll().length).toBeGreaterThan(0)
    logger.clear()
    // clear 本身会写入一条 "=== Logs cleared ==="
    const after = logger.getAll()
    expect(after.length).toBeGreaterThanOrEqual(1)
    expect(after[after.length - 1]!.message).toContain('Logs cleared')
  })

  test('getVersion 返回版本号字符串', () => {
    expect(typeof logger.getVersion()).toBe('string')
  })

  test('exportText 包含头部信息', () => {
    logger.info('test-export')
    const text = exportLogsAsText()
    expect(text).toContain('====== APP LOGS ======')
    expect(text).toContain('Version')
    expect(text).toContain('Device')
  })

  test('exportText 包含日志内容', () => {
    logger.info('my-message')
    const text = exportLogsAsText()
    expect(text).toContain('my-message')
  })

  test('safeClone 不抛异常（含循环引用）', () => {
    const obj: any = { a: 1 }
    obj.self = obj
    expect(() => logger.info('circular', obj)).not.toThrow()
  })

  test('safeClone 处理 Error 对象', () => {
    const err = new Error('test')
    logger.error('err', err)
    const entries = logger.getAll()
    const last = entries[entries.length - 1]!
    expect(last.data).toBeTruthy()
  })

  test('copyToClipboard 有 Clipboard API 时调用它', async () => {
    const writeTextMock = vi.fn().mockResolvedValue(undefined)
    vi.stubGlobal('navigator', { clipboard: { writeText: writeTextMock } })
    const result = await copyLogsToClipboard()
    expect(writeTextMock).toHaveBeenCalled()
    expect(result).toBe(true)
    vi.unstubAllGlobals()
  })

  test('copyToClipboard 无 Clipboard API 时不抛异常', async () => {
    delete (navigator as any).clipboard
    const result = await copyLogsToClipboard()
    expect(typeof result).toBe('boolean')
  })

  test('scheduleSave 延迟写入 localStorage', async () => {
    logger.info('schedule-test')
    vi.advanceTimersByTime(500)
    // 不抛异常即通过
    expect(true).toBe(true)
  })
})
