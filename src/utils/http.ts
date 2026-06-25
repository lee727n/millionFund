// [WHY] 统一网络请求层 - 提供错误处理、重试、超时、缓存等能力
// [WHAT] 封装 fetch，支持 JSON/JSONP/Script 请求
// [USAGE] import { http } from '@/utils/http'

import { logger } from './logger'

export interface HttpOptions extends RequestInit {
  timeout?: number
  retries?: number
  retryDelay?: number
  cacheKey?: string
  cacheTTL?: number
}

export interface HttpResponse<T> {
  data: T
  status: number
  ok: boolean
}

// 默认配置
const DEFAULT_TIMEOUT = 10000
const DEFAULT_RETRIES = 0
const DEFAULT_RETRY_DELAY = 1000

/**
 * 统一网络请求封装
 */
export const http = {
  /**
   * 发送 JSON 请求
   */
  async json<T = unknown>(url: string, options: HttpOptions = {}): Promise<T> {
    const { timeout = DEFAULT_TIMEOUT, retries = DEFAULT_RETRIES, retryDelay = DEFAULT_RETRY_DELAY, ...fetchOptions } = options
    
    let lastError: Error | null = null
    
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const controller = new AbortController()
        // [FIX] 移除 DOMException 参数，兼容所有浏览器（Firefox < 57 不支持该参数）
        const timeoutId = setTimeout(() => controller.abort(), timeout)
        
        const response = await fetch(url, {
          ...fetchOptions,
          signal: controller.signal,
        })
        
        clearTimeout(timeoutId)
        
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`)
        }
        
        const data = await response.json() as T
        return data
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err))
        
        // [FIX] 同时匹配 AbortError 和 TimeoutError，确保超时后正确触发重试
        const isAbort = lastError.name === 'AbortError' || lastError.name === 'TimeoutError'
        const isNetError = lastError.message.includes('fetch') || lastError.message.includes('network') || lastError.message.includes('Failed to fetch')
        
        if (attempt < retries && (isAbort || isNetError)) {
          logger.warn(`HTTP 请求失败，准备重试`, { url, attempt: attempt + 1, retries })
          await new Promise(resolve => setTimeout(resolve, retryDelay))
          continue
        }
        
        logger.error('HTTP 请求失败', { url, error: lastError.message })
        throw lastError
      }
    }
    
    throw lastError || new Error('Unknown error')
  },

  /**
   * 发送文本请求
   */
  async text(url: string, options: HttpOptions = {}): Promise<string> {
    const { timeout = DEFAULT_TIMEOUT, ...fetchOptions } = options
    
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), timeout)
    
    try {
      const response = await fetch(url, {
        ...fetchOptions,
        signal: controller.signal,
      })
      
      clearTimeout(timeoutId)
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`)
      }
      
      return await response.text()
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err))
      logger.error('HTTP 请求失败', { url, error: error.message })
      throw error
    }
  },

  /**
   * GET 请求
   */
  get<T = unknown>(url: string, options?: HttpOptions): Promise<T> {
    return this.json<T>(url, { ...options, method: 'GET' })
  },

  /**
   * POST 请求
   */
  post<T = unknown>(url: string, body?: unknown, options?: HttpOptions): Promise<T> {
    return this.json<T>(url, {
      ...options,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...options?.headers,
      },
      body: body ? JSON.stringify(body) : undefined,
    })
  },
}

/**
 * 创建带默认配置的 HTTP 客户端
 */
export function createHttpClient(defaultOptions: HttpOptions) {
  return {
    json<T = unknown>(url: string, options?: HttpOptions): Promise<T> {
      return http.json<T>(url, { ...defaultOptions, ...options })
    },
    text(url: string, options?: HttpOptions): Promise<string> {
      return http.text(url, { ...defaultOptions, ...options })
    },
    get<T = unknown>(url: string, options?: HttpOptions): Promise<T> {
      return this.json<T>(url, { ...defaultOptions, ...options, method: 'GET' })
    },
    post<T = unknown>(url: string, body?: BodyInit, options?: HttpOptions): Promise<T> {
      return this.json<T>(url, { ...defaultOptions, ...options, method: 'POST', body })
    },
  }
}
