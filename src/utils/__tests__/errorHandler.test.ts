import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest'
import { createApiError, isApiError } from '@/types/error'

// Mock vant toast
vi.mock('vant', () => ({
  showToast: vi.fn(),
}))

// Mock logger
vi.mock('@/utils/logger', () => ({
  logger: {
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
  },
}))

describe('errorHandler.ts', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  test('createAppError 创建标准错误对象', async () => {
    const { createAppError } = await import('@/utils/errorHandler')
    const error = createAppError('测试错误', 'api', {
      endpoint: '/api/test',
      fundCode: '000001',
      recoverable: true,
      userMessage: '用户提示',
    })
    expect(error.message).toBe('测试错误')
    expect(error.code).toBe('SERVER_ERROR')
    expect(error.endpoint).toBe('/api/test')
    expect(error.recoverable).toBe(true)
    expect(error.userMessage).toBe('用户提示')
  })

  test('createAppError 默认 recoverable 为 true', async () => {
    const { createAppError } = await import('@/utils/errorHandler')
    const error = createAppError('测试', 'network')
    expect(error.recoverable).toBe(true)
  })

  test('createAppError 默认 userMessage 根据 context 生成', async () => {
    const { createAppError } = await import('@/utils/errorHandler')
    const error = createAppError('测试', 'network')
    expect(error.userMessage).toBe('网络连接异常，请检查网络')
  })

  test('handleError 处理 ApiError', async () => {
    const { handleError } = await import('@/utils/errorHandler')
    const { showToast } = await import('vant')
    const { logger } = await import('@/utils/logger')

    const error = createApiError('TEST_ERROR', '测试错误', {
      endpoint: '/api/test',
      userMessage: '用户提示',
    })

    handleError(error, 'api')

    expect(logger.error).toHaveBeenCalled()
    expect(showToast).toHaveBeenCalledWith(expect.objectContaining({
      message: '用户提示',
    }))
  })

  test('handleError 处理普通 Error', async () => {
    const { handleError } = await import('@/utils/errorHandler')
    const { showToast } = await import('vant')
    const { logger } = await import('@/utils/logger')

    const error = new Error('普通错误')
    handleError(error, 'api')

    expect(logger.error).toHaveBeenCalled()
    expect(showToast).toHaveBeenCalled()
  })

  test('handleError silent 模式不展示 toast', async () => {
    const { handleError } = await import('@/utils/errorHandler')
    const { showToast } = await import('vant')

    const error = createApiError('TEST', '测试')
    handleError(error, 'api', { silent: true })

    expect(showToast).not.toHaveBeenCalled()
  })

  test('handleError fallback 降级处理被调用', async () => {
    const { handleError } = await import('@/utils/errorHandler')
    const fallback = vi.fn()

    const error = createApiError('TEST', '测试')
    handleError(error, 'api', { fallback })

    expect(fallback).toHaveBeenCalled()
  })

  test('withErrorHandling 成功时返回结果', async () => {
    const { withErrorHandling } = await import('@/utils/errorHandler')

    const result = await withErrorHandling(async () => 'success', 'api')
    expect(result).toBe('success')
  })

  test('withErrorHandling 失败时返回 undefined', async () => {
    const { withErrorHandling } = await import('@/utils/errorHandler')

    const result = await withErrorHandling(async () => {
      throw new Error('失败')
    }, 'api')
    expect(result).toBeUndefined()
  })

  test('withErrorHandling 失败时调用 fallback', async () => {
    const { withErrorHandling } = await import('@/utils/errorHandler')
    const fallback = vi.fn(() => 'fallback' as any)

    // fallback 被调用但其返回值不被 withErrorHandling 使用
    const result = await withErrorHandling(async () => {
      throw new Error('失败')
    }, 'api', { fallback })
    expect(fallback).toHaveBeenCalled()
    expect(result).toBeUndefined()
  })

  test('handleApiError 处理网络错误', async () => {
    const { handleApiError } = await import('@/utils/errorHandler')
    const { logger } = await import('@/utils/logger')

    const error = new TypeError('Failed to fetch')
    handleApiError(error, '/api/test')

    expect(logger.error).toHaveBeenCalled()
  })

  test('handleApiError 处理 AbortError', async () => {
    const { handleApiError } = await import('@/utils/errorHandler')
    const { logger } = await import('@/utils/logger')

    const error = new DOMException('Aborted', 'AbortError')
    handleApiError(error, '/api/test')

    expect(logger.error).toHaveBeenCalled()
  })

  test('handleApiError 处理 SyntaxError', async () => {
    const { handleApiError } = await import('@/utils/errorHandler')
    const { logger } = await import('@/utils/logger')

    const error = new SyntaxError('Unexpected token')
    handleApiError(error, '/api/test')

    expect(logger.error).toHaveBeenCalled()
  })

  test('handleViewError 成功时返回结果', async () => {
    const { handleViewError } = await import('@/utils/errorHandler')

    const result = await handleViewError(Promise.resolve('success'))
    expect(result).toBe('success')
  })

  test('handleViewError 失败时返回 fallback', async () => {
    const { handleViewError } = await import('@/utils/errorHandler')

    const result = await handleViewError(Promise.reject(new Error('失败')), {
      fallback: 'fallback',
    })
    expect(result).toBe('fallback')
  })

  test('handleViewError 失败时返回 undefined（无 fallback）', async () => {
    const { handleViewError } = await import('@/utils/errorHandler')

    const result = await handleViewError(Promise.reject(new Error('失败')))
    expect(result).toBeUndefined()
  })
})
