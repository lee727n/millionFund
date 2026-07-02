// [WHY] 基金API工具模块 - 缓存、并发控制、全局变量脚本队列
// [WHAT] 提供所有基金API模块共享的工具函数和类型定义

import { cache, CACHE_TTL } from './cache'
import { persistCache } from '@/utils/persistCache'
import { logger } from '@/utils/logger'
import { http } from '@/utils/http'
import { parseJsVariable, ConcurrencyController } from './fund/request'
import type { FundEstimate, FundInfo, NetValueRecord } from '@/types/fund'

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

// ========== 并发控制 ==========

export const requestConcurrency = new ConcurrencyController(5)

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
      // 请求前清零旧数据，防止读到上一个脚本残留
      cleanupVars.forEach((v) => {
        ;(window as any)[v] = null
      })

      const timeout = setTimeout(() => finish(emptyResult), timeoutMs)

      async function finish(data: T) {
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

// ========== 通用类型定义 ==========

export interface MarketIndexSimple {
  code: string
  name: string
  current: number
  change: number
  changePercent: number
}

export interface GlobalIndex {
  name: string
  code: string
  price: number
  change: number
  changePercent: number
  region: 'cn' | 'hk' | 'us' | 'asia' | 'eu'
}

export interface IntradayPoint {
  time: string
  value: number
  growth: number
}

export interface HoldingStock {
  code: string
  name: string
  weight: string
  change: number | null
}

export interface FundAccurateData {
  code: string
  name: string
  // 公布净值（基金公司官方，最准确）
  nav: number
  navDate: string
  navChange: number
  // 估算净值（交易时间内参考）
  estimate: number
  estimateTime: string
  estimateChange: number
  // 推荐使用值（自动选择最准确的）
  currentValue: number
  dayChange: number
  // 数据源状态
  dataSource: 'nav' | 'estimate' | 'fallback'
  updateTime: string
}

export interface SimpleKLineData {
  time: string
  value: number
  change: number
  volume?: number
}

export interface PeriodReturn {
  period: string
  label: string
  days: number
  change: number
}

export interface FundRankItemSimple {
  code: string
  name: string
  netValue: number
  dayChange: number
}

export interface FundManagerInfo {
  name: string
  photo: string
  workTime: string
  fundSize: string
  bestReturn: string
  experience: string
  funds: {
    code: string
    name: string
    type: string
    size: string
    returnRate: string
    startDate: string
  }[]
}

export interface ManagerProfitPoint {
  date: string
  profit: number
}

export interface IndustryAllocation {
  name: string
  ratio: number
  color: string
}

export interface AssetAllocation {
  stock: number
  bond: number
  cash: number
  other: number
}

export interface FundRating {
  rating: number
  riskLevel: string
  sharpeRatio: number
  maxDrawdown: number
  volatility: number
  rankInSimilar: string
}
