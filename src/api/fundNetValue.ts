// [WHAT] 基金净值相关 API
// [DEPS] 天天基金 pingzhongdata 接口
// [NOTE] 包含历史净值、分时数据、K线数据、阶段涨幅计算

import { cache, CACHE_TTL } from './cache'
import { http } from '@/utils/http'
import { logger } from '@/utils/logger'
import type { NetValueRecord } from '@/types/fund'
import type { SimpleKLineData, PeriodReturn } from './fundTypes'
import { queueGlobalVarScript } from './fundUtils'

// ========== 历史净值API ==========

/**
 * 获取历史净值（带缓存，使用pingzhongdata接口）
 * [WHY] 使用 fetch 方式避免 CORS 问题
 */
export async function fetchNetValueHistoryFast(code: string, days = 30): Promise<{ records: NetValueRecord[], fundName: string }> {
  const cacheKey = `netvalue_${code}_${days}`
  const cached = cache.get<{ records: NetValueRecord[], fundName: string }>(cacheKey)
  if (cached) return cached

  // [M6] 迁移到 fetch + 正则解析（替代 JSONP）
  // 直接请求外部 API
  const url = `https://pingzhongdata.eastmoney.com/pingzhongdata/${code}.js?v=${Date.now()}`
  const text = await http.text(url)

  // 用正则提取 Data_netWorthTrend 数组
  const trendMatch = text.match(/Data_netWorthTrend\s*=\s*(\[[\s\S]*?\]);/)
  const nameMatch = text.match(/fS_name\s*=\s*"([^"]*)"/)

  const fundName = nameMatch ? nameMatch[1] || '' : ''
  let records: NetValueRecord[] = []

  if (trendMatch) {
    try {
      // [FIX] 直接用 JSON.parse 解析数组字符串，避免 new Function
      const trend = JSON.parse(trendMatch[1]) as any[]
      const recentData = trend.slice(-days)
      records = recentData.map((item: any) => {
        // item.x 可能是时间戳或 Date 字符串
        const date = new Date(item.x)
        const dateStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
        return {
          date: dateStr,
          netValue: item.y || 0,
          totalValue: item.y || 0,
          changeRate: item.equityReturn || 0
        }
      })
      records.reverse()
    } catch (parseErr) {
      logger.warn('[fundNetValue] JSON.parse 解析 Data_netWorthTrend 失败，尝试清理后重试', { code, error: parseErr })
      try {
        // 清理可能的 JS 特有语法（单引号、尾随逗号等）
        const cleaned = trendMatch[1]
          .replace(/'/g, '"')
          .replace(/,\s*]/g, ']')
          .replace(/,\s*}/g, '}')
        const trend = JSON.parse(cleaned) as any[]
        const recentData = trend.slice(-days)
        records = recentData.map((item: any) => {
          const date = new Date(item.x)
          const dateStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
          return {
            date: dateStr,
            netValue: item.y || 0,
            totalValue: item.y || 0,
            changeRate: item.equityReturn || 0
          }
        })
        records.reverse()
      } catch (cleanErr) {
        logger.warn('[fundNetValue] 清理后仍解析失败', { code, error: cleanErr })
      }
    }
  }

  const result = { records, fundName }
  cache.set(cacheKey, result, CACHE_TTL.NET_VALUE)
  return result
}

// ========== 分时数据 ==========

/**
 * 获取基金当日分时估值数据
 * [WHY] 参考 fund-baby 实现，使用腾讯财经接口
 * [WHAT] 返回每分钟估值数据，用于绘制分时图
 */
export async function fetchIntradayData(code: string, forceRefresh = false): Promise<IntradayPoint[] | null> {
  // [WHY] 分时数据实时性要求高，交易时间不做缓存，非交易时间可短暂缓存
  const now = new Date()
  const hour = now.getHours()
  const minute = now.getMinutes()
  const isTradingTime = (hour === 9 && minute >= 30) ||
    (hour === 10) ||
    (hour === 11 && minute <= 30) ||
    (hour === 13) ||
    (hour === 14)

  const cacheKey = `intraday_${code}`
  // [WHY] 强制刷新时跳过缓存，确保获取最新数据
  if (!forceRefresh && !isTradingTime) {
    const cached = cache.get<IntradayPoint[]>(cacheKey)
    if (cached) return cached
  }

  try {
    // [WHY] 添加时间戳避免浏览器缓存，确保获取最新数据
    const url = `https://web.ifzq.gtimg.cn/fund/newfund/fundSsgz/getSsgz?app=web&symbol=jj${code}&_=${Date.now()}`
    const result = await http.get<{ code: number; data?: { data?: any[]; yesterdayDwjz?: string } }>(url)
    if (result.code === 0 && result.data && Array.isArray(result.data.data)) {
      const { data: list, yesterdayDwjz } = result.data
      const yDwjz = parseFloat(yesterdayDwjz || '0')
      if (!yDwjz) return null

      const points = list.map((item: any[]) => {
        const timeStr = item[0] as string
        const value = Number(item[1])
        const growth = ((value - yDwjz) / yDwjz * 100)

        return {
          time: `${timeStr.slice(0, 2)}:${timeStr.slice(2)}`,
          value,
          growth: parseFloat(growth.toFixed(2))
        }
      })

      // [WHY] 交易时间缓存30秒，非交易时间缓存5分钟；TTL 单位为毫秒，故传 30000 / 300000
      cache.set(cacheKey, points, isTradingTime ? 30000 : 300000)
      return points
    }
    return null
  } catch (e) {
    logger.error('获取分时数据失败', { code, error: e })
    return null
  }
}

// ========== 最新净值 ==========

/**
 * 获取基金最新公布净值（非估值）
 * [WHY] 估值接口返回的是预估值，这个接口返回基金公司实际公布的净值
 * [HOW] 使用天天基金估值接口获取实时数据
 * [M6] 迁移到 fetch + 正则解析（移除 JSONP）
 */
export async function fetchLatestNetValue(code: string): Promise<{
  netValue: number
  date: string
  changeRate: number
} | null> {
  // [WHAT] 恢复缓存逻辑，避免重复请求
  const cacheKey = `latest_nav_${code}`
  const cached = cache.get<{ netValue: number; date: string; changeRate: number }>(cacheKey)
  if (cached) return cached

  // [M6] 使用 fetch + 正则解析，替代 JSONP
  try {
    const url = `https://fundgz.eastmoney.com/js/${code}.js?rt=${Date.now()}`
    const text = await http.text(url)

    // 解析 jsonpgz({...}) 格式
    const match = text.match(/jsonpgz\(([\s\S]*)\)/)
    if (!match) {
      logger.warn('[fundNetValue] 解析最新净值失败', { code })
      return null
    }

    const jsonStr = match[1] as string
    const data = JSON.parse(jsonStr)
    const result = {
      netValue: parseFloat(data.dwjz) || 0,  // 单位净值（公布）
      date: data.jzrq || '',               // 净值日期
      changeRate: parseFloat(data.rzdf) || 0, // 日增长率
    }

    cache.set(cacheKey, result, CACHE_TTL.ESTIMATE)
    return result
  } catch (err) {
    logger.error('[fundNetValue] 获取最新净值失败', { code, error: err })
    return null
  }
}

// ========== 沪深300指数历史数据 ==========

/**
 * 获取沪深300指数历史净值数据
 * [WHY] 用于与基金走势对比分析
 * [WHAT] 沪深300指数基金代码 000300，使用与普通基金相同的接口
 * @param days 获取天数，默认90天
 */
export async function fetchHS300History(days = 90): Promise<NetValueRecord[]> {
  const cacheKey = `hs300_history_${days}`
  const cached = cache.get<NetValueRecord[]>(cacheKey)
  if (cached) return cached

  const hs300Code = '510300'

  const records = await queueGlobalVarScript<NetValueRecord[]>(
    `https://fund.eastmoney.com/pingzhongdata/${hs300Code}.js?v=${Date.now()}`,
    () => {
      const trend = (window as any).Data_netWorthTrend || []
      if (trend.length === 0) return []

      const recentData = trend.slice(-days)
      const result: NetValueRecord[] = recentData.map((item: any) => {
        const date = new Date(item.x)
        const dateStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
        return {
          date: dateStr,
          netValue: item.y || 0,
          totalValue: item.y || 0,
          changeRate: item.equityReturn || 0
        }
      })
      result.reverse()
      return result
    },
    ['Data_netWorthTrend'],
    []
  )

  cache.set(cacheKey, records, CACHE_TTL.NET_VALUE)
  return records
}

// ========== K线数据 ==========

/**
 * 获取简化K线数据（直接使用净值，不模拟OHLC）
 */
export async function fetchSimpleKLineData(code: string, days = 60): Promise<SimpleKLineData[]> {
  const cacheKey = `kline_${code}_${days}`
  const cached = cache.get<SimpleKLineData[]>(cacheKey)
  if (cached) return cached

  const historyResult = await fetchNetValueHistoryFast(code, days)
  const history = historyResult.records || []

  // 转换为K线格式（按时间正序）
  const klineData = history
    .map(item => ({
      time: item.date,
      value: item.netValue,
      change: item.changeRate
    }))
    .reverse()

  cache.set(cacheKey, klineData, CACHE_TTL.NET_VALUE)
  return klineData
}

// ========== 阶段涨幅（直接计算，不依赖外部API） ==========

/**
 * 计算阶段涨幅（从历史净值直接计算）
 */
export async function calculatePeriodReturns(code: string): Promise<PeriodReturn[]> {
  const cacheKey = `period_${code}`
  const cached = cache.get<PeriodReturn[]>(cacheKey)
  if (cached) return cached

  // 获取足够长的历史数据
  const historyResult = await fetchNetValueHistoryFast(code, 400)
  const history = historyResult.records || []
  if (history.length < 2) return []

  const latest = history[0]!

  // [EDGE] 如果最新净值为0或无效，跳过计算
  if (!latest || latest.netValue <= 0) {
    return []
  }

  const results: PeriodReturn[] = []

  const periods = [
    { period: 'Z', label: '近1周', days: 7 },
    { period: 'Y', label: '近1月', days: 30 },
    { period: '3Y', label: '近3月', days: 90 },
    { period: '6Y', label: '近6月', days: 180 },
    { period: '1N', label: '近1年', days: 365 },
  ]

  for (const p of periods) {
    // 找到对应日期的净值
    const targetDate = new Date()
    targetDate.setDate(targetDate.getDate() - p.days)

    // 找最接近的历史记录
    let found: NetValueRecord | null = null
    for (const record of history) {
      const recordDate = new Date(record.date)
      if (recordDate <= targetDate) {
        found = record
        break
      }
    }

    if (found && found.netValue > 0) {
      const change = ((latest.netValue - found.netValue) / found.netValue) * 100
      results.push({
        period: p.period,
        label: p.label,
        days: p.days,
        change: parseFloat(change.toFixed(2))
      })
    }
  }

  cache.set(cacheKey, results, CACHE_TTL.NET_VALUE)
  return results
}
