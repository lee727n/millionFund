// [WHY] 统一的 HTTP 请求工具 - 双通道自适应策略
// [WHAT] 根据环境自动选择 fetch（Vite 代理）或 JSONP（绕过 CORS）
// [NOTE] push2delay.eastmoney.com 不支持 CORS，生产环境必须用 JSONP

import { isMobile } from './platform'

let jsonpCounter = 0

export interface RequestOptions {
  timeout?: number
  retries?: number
  retryDelay?: number
}

/**
 * 检测是否为开发模式（有 Vite 代理可用）
 */
function isDevMode(): boolean {
  try {
    const host = window.location.hostname
    return host === 'localhost' || host === '127.0.0.1' || host === '0.0.0.0' || host.endsWith('.local')
  } catch {
    return false
  }
}

/**
 * fetch 请求（优先使用，走 Vite 代理或直接请求）
 * [WHY] 开发模式下 fetch 走 Vite 代理，请求稳定且带有正确的请求头
 */
async function fetchRequest<T = any>(url: string, timeout = 10000): Promise<T> {
  const sep = url.includes('?') ? '&' : '?'
  const fullUrl = `${url}${sep}_=${Date.now()}`

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), timeout)

  try {
    const response = await fetch(fullUrl, {
      signal: controller.signal,
      cache: 'no-store'
    })
    clearTimeout(timeoutId)

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`)
    }

    return await response.json() as T
  } catch (err) {
    clearTimeout(timeoutId)
    throw err
  }
}

/**
 * JSONP 请求（绕过 CORS 的备选方案）
 * [WHY] push2.eastmoney.com 不支持 CORS，JSONP 是移动端唯一可行方案
 */
export function jsonpFetch<T = any>(url: string, timeout = 10000): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const callbackName = `__jsonp_${Date.now()}_${(++jsonpCounter)}`
    let settled = false

    const cleanup = () => {
      clearTimeout(timeoutId)
      const script = document.getElementById(callbackName)
      if (script) {
        script.removeEventListener('error', handleError)
        script.removeEventListener('load', handleLoad)
        if (script.parentNode) script.parentNode.removeChild(script)
      }
      try { delete (window as any)[callbackName] } catch { (window as any)[callbackName] = undefined }
    }

    const finish = (err?: Error) => {
      if (settled) return
      settled = true
      cleanup()
      if (err) reject(err)
    }

    const timeoutId = setTimeout(() => {
      finish(new Error(`JSONP 超时 (${timeout}ms)`))
    }, timeout)

    ;(window as any)[callbackName] = (data: T) => {
      if (settled) return
      settled = true
      clearTimeout(timeoutId)
      cleanupScriptOnly()
      resolve(data)
    }

    const cleanupScriptOnly = () => {
      const script = document.getElementById(callbackName)
      if (script) {
        script.removeEventListener('error', handleError)
        script.removeEventListener('load', handleLoad)
        if (script.parentNode) script.parentNode.removeChild(script)
      }
      try { delete (window as any)[callbackName] } catch { (window as any)[callbackName] = undefined }
    }

    const handleError = () => finish(new Error('JSONP 脚本加载失败'))
    const handleLoad = () => {
      setTimeout(() => {
        if (!settled) finish(new Error('JSONP 无回调响应'))
      }, 800)
    }

    const sep = url.includes('?') ? '&' : '?'
    const fullUrl = `${url}${sep}cb=${callbackName}&_=${Date.now()}`

    const script = document.createElement('script')
    script.id = callbackName
    script.src = fullUrl
    script.async = true
    script.addEventListener('error', handleError)
    script.addEventListener('load', handleLoad)

    const target = document.head || document.body
    if (target) {
      target.appendChild(script)
    } else {
      setTimeout(() => document.body?.appendChild(script), 0)
    }
  })
}

/**
 * 统一请求入口：双通道自适应 + 自动重试
 * [WHY] 开发模式用 fetch 走代理（稳定），生产/移动端用 JSONP（绕过 CORS）
 * [WHAT] 失败时自动切换通道并重试，最多 retries 次
 */
export async function push2Fetch<T = any>(url: string, options: RequestOptions = {}): Promise<T> {
  const { timeout = 10000, retries = 2, retryDelay = 500 } = options
  const useFetchFirst = isDevMode()

  let lastError: Error | null = null

  for (let attempt = 0; attempt <= retries; attempt++) {
    if (attempt > 0) {
      await new Promise(r => setTimeout(r, retryDelay * attempt))
    }

    const strategies = useFetchFirst
      ? [() => fetchRequest<T>(url, timeout), () => jsonpFetch<T>(url, timeout)]
      : [() => jsonpFetch<T>(url, timeout), () => fetchRequest<T>(url, timeout)]

    for (const strategy of strategies) {
      try {
        const result = await strategy()
        if (result != null && result !== undefined) {
          return result
        }
      } catch (err: any) {
        lastError = err
        // CORS 或网络错误时立即切换通道，不等待超时
        const errMsg = err?.message || ''
        const isCorsOrNetwork = errMsg.includes('Failed to fetch') || 
                                errMsg.includes('NetworkError') ||
                                errMsg.includes('ERR_EMPTY_RESPONSE') ||
                                errMsg.includes('load failed')
        if (isCorsOrNetwork) break
      }
    }
  }

  throw lastError || new Error(`请求失败: ${url.substring(0, 80)}`)
}

/**
 * 便捷方法：仅用 JSONP 请求（特定场景强制使用）
 */
export function jsonpOnlyFetch<T = any>(url: string, timeout = 10000): Promise<T> {
  return jsonpFetch<T>(url, timeout)
}

/**
 * 提取 JSONP 响应中的 data.diff
 */
export function extractDiff<T = any>(response: any): T[] {
  if (!response) return []
  if (Array.isArray(response)) return response as T[]
  if (response.data && response.data.diff) return response.data.diff as T[]
  if (response.result) return response.result as T[]
  return []
}

/**
 * 调试信息
 */
export function getHttpDebugInfo() {
  const Capacitor = (window as any).Capacitor
  return {
    isDev: isDevMode(),
    isMobile: isMobile(),
    isCapacitor: !!(Capacitor?.isNativePlatform?.()),
    platform: Capacitor?.getPlatform?.() || 'web',
    userAgent: navigator.userAgent,
  }
}
