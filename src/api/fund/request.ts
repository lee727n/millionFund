// [WHY] 统一请求工具 - 替代 JSONP 和 queueGlobalVarScript
// [WHAT] 提供 HTTP 请求 + 正则解析，消除 script 注入安全风险
// [DEPS] 使用 http.ts 封装 fetch，支持代理和超时

import { http } from '@/utils/http'
import { logger } from '@/utils/logger'
import { createApiError, type ApiError } from '@/types/error'

/**
 * 并发控制配置
 */
const MAX_CONCURRENT = 5
let activeRequests = 0
const requestQueue: (() => void)[] = []

function executeNext() {
  if (requestQueue.length > 0 && activeRequests < MAX_CONCURRENT) {
    const next = requestQueue.shift()
    if (next) next()
  }
}

/**
 * 并发控制包装器
 */
export function withConcurrencyControl<T>(fn: () => Promise<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    const execute = async () => {
      activeRequests++
      try {
        const result = await fn()
        resolve(result)
      } catch (err) {
        reject(err)
      } finally {
        activeRequests--
        executeNext()
      }
    }

    if (activeRequests < MAX_CONCURRENT) {
      execute()
    } else {
      requestQueue.push(execute)
    }
  })
}

/**
 * 解析 JS 变量赋值格式的数据
 * [WHAT] 从文本中提取 var varName = {...}; 格式的数据
 * 
 * @example
 * const text = 'var Data_netWorthTrend = [{...}];'
 * const data = parseJsVariable(text, 'Data_netWorthTrend')
 */
export function parseJsVariable<T>(text: string, varName: string): T | null {
  try {
    // [WHAT] 匹配 var varName = {...}; 或 var varName = [...];
    const patterns = [
      // 标准 var 格式
      new RegExp(`var\\s+${varName}\\s*=\\s*(\\{[\\s\\S]*?\\}|\\[[\\s\\S]*?\\]);`, 'i'),
      // window.varName 格式
      new RegExp(`(?:window\\.|this\\.)?${varName}\\s*=\\s*(\\{[\\s\\S]*?\\}|\\[[\\s\\S]*?\\]);`, 'i'),
      // JSONP 回调格式
      new RegExp(`${varName}\\s*\\(\\s*(\\{[\\s\\S]*?\\}|\\[[\\s\\S]*?\\})\\s*\\)`, 'i'),
    ]

    for (const pattern of patterns) {
      const match = text.match(pattern)
      if (match && match[1]) {
        try {
          return JSON.parse(match[1]) as T
        } catch {
          // [EDGE] JSON 解析失败，尝试清理后重试
          const cleaned = match[1]
            .replace(/,\s*}/g, '}')  // 移除末尾多余逗号
            .replace(/,\s*]/g, ']')
          return JSON.parse(cleaned) as T
        }
      }
    }
    
    return null
  } catch (e) {
    logger.warn(`[request] parseJsVariable failed: ${varName}`, e)
    return null
  }
}

/**
 * 解析 JSONP 回调格式的数据
 * [WHAT] 从文本中提取 callback({...}) 格式的数据
 */
export function parseJsonpResponse<T>(text: string, callbackName?: string): T | null {
  try {
    // [WHAT] 如果指定了回调名，精确匹配
    if (callbackName) {
      const pattern = new RegExp(`${callbackName}\\s*\\(\\s*(\\{[\\s\\S]*?\\}|\\[[\\s\\S]*?\\})\\s*\\)`)
      const match = text.match(pattern)
      if (match && match[1]) {
        return JSON.parse(match[1]) as T
      }
    }
    
    // [WHAT] 通用 JSONP 匹配：匹配任何 callback({...}) 格式
    const genericPattern = /^[a-zA-Z0-9_]+\s*\(\s*(\{[\s\S]*?\}|\[[\s\S]*?\])\s*\)$/
    const match = text.match(genericPattern)
    if (match && match[1]) {
      return JSON.parse(match[1]) as T
    }
    
    return null
  } catch (e) {
    logger.warn('[request] parseJsonpResponse failed', e)
    return null
  }
}

/**
 * 解析 JS 变量赋值语句（返回字符串）
 * [WHAT] 从文本中提取 var varName = "value"; 格式的字符串值
 */
export function parseJsStringVariable(text: string, varName: string): string | null {
  try {
    const patterns = [
      // 单引号字符串
      new RegExp(`var\\s+${varName}\\s*=\\s*'([^']*)';`, 'i'),
      // 双引号字符串
      new RegExp(`var\\s+${varName}\\s*=\\s*"([^"]*)";`, 'i'),
      // 无引号（数字或简单值）
      new RegExp(`var\\s+${varName}\\s*=\\s*([^;\\n]+);`, 'i'),
    ]

    for (const pattern of patterns) {
      const match = text.match(pattern)
      if (match && match[1]) {
        return match[1].trim()
      }
    }
    
    return null
  } catch {
    return null
  }
}

/**
 * 安全获取 JS 数据（替代 queueGlobalVarScript）
 * [WHAT] 使用 HTTP 请求获取 JS 文件，解析变量数据
 * 
 * @param url - JS 文件 URL
 * @param varNames - 需要提取的变量名列表
 * @param timeoutMs - 超时时间（毫秒）
 */
export async function fetchJsData<T>(
  url: string,
  varNames: string[],
  parser: (vars: Record<string, any>) => T,
  fallback: T,
  timeoutMs = 15000
): Promise<T> {
  return withConcurrencyControl(async () => {
    try {
      const text = await http.text(url, { timeout: timeoutMs })
      
      // [WHAT] 提取所有需要的变量
      const vars: Record<string, any> = {}
      for (const varName of varNames) {
        const value = parseJsVariable<any>(text, varName)
        if (value !== null) {
          vars[varName] = value
        }
        
        // [WHAT] 尝试解析字符串变量
        const strValue = parseJsStringVariable(text, varName)
        if (strValue !== null) {
          vars[varName] = strValue
        }
      }
      
      // [WHAT] 使用解析器转换数据
      return parser(vars)
    } catch (e) {
      logger.warn(`[request] fetchJsData failed: ${url}`, e)
      return fallback
    }
  })
}

/**
 * 安全获取 JSONP 数据（替代动态 script 注入）
 * [WHAT] 使用 HTTP 请求获取 JSONP 响应，解析数据
 */
export async function fetchJsonpData<T>(
  url: string,
  callbackParam: string,
  callbackPrefix: string,
  parser: (data: any) => T,
  fallback: T,
  timeoutMs = 10000
): Promise<T> {
  return withConcurrencyControl(async () => {
    try {
      // [WHAT] 生成回调名（用于解析，实际请求不需要）
      const callbackName = `${callbackPrefix}_${Date.now()}`
      
      // [WHAT] 构建完整 URL（某些 API 需要 callback 参数）
      const sep = url.includes('?') ? '&' : '?'
      const fullUrl = `${url}${sep}${callbackParam}=${callbackName}&_=${Date.now()}`
      
      const text = await http.text(fullUrl, { timeout: timeoutMs })
      
      // [WHAT] 解析 JSONP 响应
      const data = parseJsonpResponse<any>(text, callbackName)
      if (data) {
        return parser(data)
      }
      
      // [EDGE] 尝试通用解析
      const genericData = parseJsonpResponse<any>(text)
      if (genericData) {
        return parser(genericData)
      }
      
      return fallback
    } catch (e) {
      logger.warn(`[request] fetchJsonpData failed: ${url}`, e)
      return fallback
    }
  })
}

/**
 * 获取基金估值数据（替代 JSONP script 注入）
 * [WHAT] 使用 HTTP 请求获取估值接口数据
 */
export async function fetchFundEstimateViaHttp(
  code: string,
  timeoutMs = 8000
): Promise<{
  fundcode: string
  name: string
  gsz: string
  gszzl: string
  gztime: string
  dwjz: string
} | null> {
  const url = `https://fundgz.eastmoney.com/js/${code}.js?rt=${Date.now()}`
  
  try {
    const text = await http.text(url, { timeout: timeoutMs })
    
    // [WHAT] 解析 jsonpgz({...}) 格式
    const data = parseJsonpResponse<{
      fundcode: string
      name: string
      gsz: string
      gszzl: string
      gztime: string
      dwjz: string
    }>(text, 'jsonpgz')
    
    if (data && data.fundcode) {
      return data
    }
    
    // [EDGE] 尝试解析 var jsonpgz = {...}; 格式
    const varData = parseJsVariable<{
      fundcode: string
      name: string
      gsz: string
      gszzl: string
      gztime: string
      dwjz: string
    }>(text, 'jsonpgz')
    
    return varData
  } catch (e) {
    logger.warn(`[request] fetchFundEstimateViaHttp failed: ${code}`, e)
    return null
  }
}

/**
 * 获取 pingzhongdata 数据（替代 queueGlobalVarScript）
 * [WHAT] 使用 HTTP 请求获取基金详情 JS 文件，解析多个变量
 */
export async function fetchPingzhongData<T>(
  code: string,
  varNames: string[],
  parser: (vars: Record<string, any>) => T,
  fallback: T,
  timeoutMs = 15000
): Promise<T> {
  const url = `https://pingzhongdata.eastmoney.com/pingzhongdata/${code}.js?v=${Date.now()}`
  return fetchJsData(url, varNames, parser, fallback, timeoutMs)
}

/**
 * 批量请求包装器
 * [WHAT] 并发请求多个数据，自动处理失败
 */
export async function fetchBatch<T>(
  items: string[],
  fetcher: (item: string) => Promise<T>,
  options: {
    concurrency?: number
    continueOnError?: boolean
  } = {}
): Promise<Map<string, T>> {
  const results = new Map<string, T>()
  const concurrency = options.concurrency ?? MAX_CONCURRENT
  const continueOnError = options.continueOnError ?? true
  
  // [WHAT] 分批处理
  const batches: string[][] = []
  for (let i = 0; i < items.length; i += concurrency) {
    batches.push(items.slice(i, i + concurrency))
  }
  
  for (const batch of batches) {
    const promises = batch.map(async item => {
      try {
        const result = await fetcher(item)
        results.set(item, result)
      } catch (e) {
        if (!continueOnError) {
          throw e
        }
        logger.warn(`[request] fetchBatch item failed: ${item}`, e)
      }
    })
    
    await Promise.all(promises)
  }
  
  return results
}