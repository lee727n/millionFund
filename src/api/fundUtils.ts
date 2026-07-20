// [WHAT] 基金API公共工具函数
// [NOTE] 抽取共享逻辑，避免循环依赖

import { cache, CACHE_TTL } from './cache'
import { http } from '@/utils/http'
import { logger } from '@/utils/logger'
import { parseJsVariable } from './fund/request'

// ========== 缓存管理 ==========

// [WHAT] 清除指定基金的缓存数据
export function clearFundCache(code: string): void {
  const keys = ['estimate', 'netvalue', 'kline', 'period']
  keys.forEach(prefix => {
    ;[30, 60, 90, 180, 365, 400].forEach(days => {
      cache.delete(`${prefix}_${code}_${days}`)
    })
    cache.delete(`${prefix}_${code}`)
  })
  // [WHY] 同时清除沪深300缓存，防止之前加载到错误数据
  ;[30, 60, 90, 180, 365, 400].forEach(days => {
    cache.delete(`hs300_history_${days}`)
  })
}

// [WHAT] 清除所有缓存
export function clearAllCache(): void {
  cache.clear()
}

// ========== 全局变量型脚本请求串行化队列 ==========
// [WHY] pingzhongdata/*.js 这类脚本会在 window 上设置固定名字的全局变量
//       （如 Data_netWorthTrend / Data_currentFundManager / apidata 等）
//       当并发请求不同基金时，后加载的脚本会覆盖先加载的变量，导致读错数据
// [HOW] 所有这类请求都通过这个队列串行化执行

const globalVarScriptQueue: (() => void)[] = []
let globalVarScriptActive = false

function runNextGlobalVarScript() {
  if (globalVarScriptActive) return
  const runner = globalVarScriptQueue.shift()
  if (!runner) return
  globalVarScriptActive = true
  runner()
}

export function queueGlobalVarScript<T>(
  url: string,
  extract: () => T | Promise<T>,
  cleanupVars: string[],
  emptyResult: T,
  timeoutMs = 15000
): Promise<T> {
  return new Promise<T>((resolve) => {
    const runner = async () => {
      // [M6] 迁移到 fetch + new Function（替代 JSONP）
      // scriptId 已移除 - 不再需要动态脚本标签

      // 请求前清零旧数据，防止读到上一个脚本残留
      cleanupVars.forEach((v) => {
        ;(window as any)[v] = null
      })

      const timeout = setTimeout(() => finish(emptyResult), timeoutMs)

      let finished = false
      async function finish(data: T) {
        // [H4] 幂等：超时定时器与异步完成都可能调用 finish，确保只 resolve 一次
        if (finished) return
        finished = true
        clearTimeout(timeout)
        // 请求结束后清掉自己占的全局变量
        cleanupVars.forEach((v) => {
          try { delete (window as any)[v] } catch { /* */ }
        })
        resolve(data)
        globalVarScriptActive = false
        runNextGlobalVarScript()
      }

      try {
        const text = await http.text(url)
        // [FIX] 安全解析：用正则提取变量，避免 new Function
        for (const varName of cleanupVars) {
          const value = parseJsVariable<any>(text, varName)
          if (value !== null) {
            ;(window as any)[varName] = value
          }
        }
        const result = await extract()
        finish(result)
      } catch (e) {
        logger.warn('[fundUtils] queueGlobalVarScript failed', { url, error: e })
        finish(emptyResult)
      }
    }

    globalVarScriptQueue.push(runner)
    runNextGlobalVarScript()
  })
}
