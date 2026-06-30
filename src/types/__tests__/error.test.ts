// [WHY] 统一 API 错误类型定义 单元测试
// [WHAT] 测试 createApiError、isApiError、inferErrorCode、mapCodeToContext

import { describe, test, expect } from 'vitest'
import {
  createApiError,
  isApiError,
  inferErrorCode,
  mapCodeToContext,
  type ApiErrorCode,
  type ApiError,
} from '@/types/error'

describe('error.ts', () => {
  // ─── createApiError ──────────────────────────────────────────

  describe('createApiError', () => {
    test('创建基础 ApiError', () => {
      const err = createApiError('NETWORK', '网络错误')
      expect(err).toBeInstanceOf(Error)
      expect(err.message).toBe('网络错误')
      expect(err.code).toBe('NETWORK')
      expect(err.endpoint).toBe('')
      expect(err.recoverable).toBe(true)
      expect(err.timestamp).toBeGreaterThan(0)
    })

    test('创建带完整选项的 ApiError', () => {
      const err = createApiError('PARSE', '数据解析失败', {
        endpoint: '/api/fund',
        fundCode: '001',
        recoverable: false,
        fallbackData: { nav: 1.0 },
        userMessage: '数据加载失败',
      })
      expect(err.code).toBe('PARSE')
      expect(err.endpoint).toBe('/api/fund')
      expect(err.fundCode).toBe('001')
      expect(err.recoverable).toBe(false)
      expect(err.fallbackData).toEqual({ nav: 1.0 })
      expect(err.userMessage).toBe('数据加载失败')
    })

    test('recoverable 默认为 true', () => {
      const err = createApiError('TIMEOUT', '超时')
      expect(err.recoverable).toBe(true)
    })

    test('originalError 设置 cause', () => {
      const original = new Error('原始错误')
      const err = createApiError('NETWORK', '网络错误', {
        originalError: original,
      })
      expect(err.cause).toBe(original)
    })

    test('userMessage 默认使用 getDefaultUserMessage', () => {
      const codes: ApiErrorCode[] = [
        'TIMEOUT', 'NETWORK', 'PARSE', 'INVALID_DATA', 'NOT_FOUND',
        'RATE_LIMIT', 'SERVER_ERROR', 'CORS', 'SCRIPT_INJECT', 'UNKNOWN',
      ]
      codes.forEach(code => {
        const err = createApiError(code, 'msg')
        expect(err.userMessage).not.toBe('')
        expect(err.userMessage).not.toBe('msg')
      })
    })
  })

  // ─── isApiError ──────────────────────────────────────────────

  describe('isApiError', () => {
    test('识别 ApiError', () => {
      const err = createApiError('NETWORK', '网络错误')
      expect(isApiError(err)).toBe(true)
    })

    test('普通 Error 不是 ApiError', () => {
      expect(isApiError(new Error('普通错误'))).toBe(false)
    })

    test('null/undefined 不是 ApiError', () => {
      expect(isApiError(null)).toBe(false)
      expect(isApiError(undefined)).toBe(false)
    })

    test('非 Error 对象不是 ApiError', () => {
      expect(isApiError('string')).toBe(false)
      expect(isApiError(123)).toBe(false)
      expect(isApiError({})).toBe(false)
    })
  })

  // ─── inferErrorCode ─────────────────────────────────────────

  describe('inferErrorCode', () => {
    test('AbortError 推断为 TIMEOUT', () => {
      const err = new DOMException('Aborted', 'AbortError')
      expect(inferErrorCode(err)).toBe('TIMEOUT')
    })

    test('TimeoutError 推断为 TIMEOUT', () => {
      const err = new DOMException('Timeout', 'TimeoutError')
      expect(inferErrorCode(err)).toBe('TIMEOUT')
    })

    test('fetch 网络错误推断为 NETWORK', () => {
      const err = new TypeError('Failed to fetch')
      expect(inferErrorCode(err)).toBe('NETWORK')
    })

    test('network 错误推断为 NETWORK', () => {
      const err = new TypeError('network request failed')
      expect(inferErrorCode(err)).toBe('NETWORK')
    })

    test('JSON 解析错误推断为 PARSE', () => {
      const err = new SyntaxError('Unexpected token')
      expect(inferErrorCode(err)).toBe('PARSE')
    })

    test('未知错误推断为 UNKNOWN', () => {
      expect(inferErrorCode(new Error('something else'))).toBe('UNKNOWN')
    })

    test('null/undefined 推断为 UNKNOWN', () => {
      expect(inferErrorCode(null)).toBe('UNKNOWN')
      expect(inferErrorCode(undefined)).toBe('UNKNOWN')
    })
  })

  // ─── mapCodeToContext ────────────────────────────────────────

  describe('mapCodeToContext', () => {
    test('TIMEOUT/NETWORK/CORS 映射为 network', () => {
      expect(mapCodeToContext('TIMEOUT')).toBe('network')
      expect(mapCodeToContext('NETWORK')).toBe('network')
      expect(mapCodeToContext('CORS')).toBe('network')
    })

    test('PARSE/INVALID_DATA/SCRIPT_INJECT 映射为 parse', () => {
      expect(mapCodeToContext('PARSE')).toBe('parse')
      expect(mapCodeToContext('INVALID_DATA')).toBe('parse')
      expect(mapCodeToContext('SCRIPT_INJECT')).toBe('parse')
    })

    test('NOT_FOUND/RATE_LIMIT/SERVER_ERROR 映射为 api', () => {
      expect(mapCodeToContext('NOT_FOUND')).toBe('api')
      expect(mapCodeToContext('RATE_LIMIT')).toBe('api')
      expect(mapCodeToContext('SERVER_ERROR')).toBe('api')
    })

    test('UNKNOWN 映射为 unknown', () => {
      expect(mapCodeToContext('UNKNOWN')).toBe('unknown')
    })
  })
})
