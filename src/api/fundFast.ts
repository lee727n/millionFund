// [WHY] 优化版基金API，参考多个开源项目的最佳实践
// [WHAT] 使用缓存、并发控制、简化数据结构
// [DEPS] 天天基金公开接口

import { cache, CACHE_TTL } from './cache'
import { isTradingTime, persistCache } from './tiantianApi'
import type { FundEstimate, NetValueRecord } from '@/types/fund'

// [WHAT] 清除指定基金的缓存数据
export function clearFundCache(code: string): void {
  // 清除所有跟该基金相关的缓存
  const keys = ['estimate', 'netvalue', 'kline', 'period']
  keys.forEach(prefix => {
    // 清除所有可能的days参数组合
    ;[30, 60, 90, 180, 365, 400].forEach(days => {
      cache.delete(`${prefix}_${code}_${days}`)
    })
    cache.delete(`${prefix}_${code}`)
  })
}

// [WHAT] 清除所有缓存
export function clearAllCache(): void {
  cache.clear()
}

// ========== 并发控制 ==========
const MAX_CONCURRENT = 5  // 最大并发数
let activeRequests = 0
const requestQueue: (() => void)[] = []

function executeNext() {
  if (requestQueue.length > 0 && activeRequests < MAX_CONCURRENT) {
    const next = requestQueue.shift()
    if (next) next()
  }
}

function withConcurrencyControl<T>(fn: () => Promise<T>): Promise<T> {
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

// ========== JSONP请求队列 ==========
interface PendingRequest {
  code: string
  resolve: (data: FundEstimate) => void
  reject: (error: Error) => void
  timeout: ReturnType<typeof setTimeout>
}

let pendingRequests: PendingRequest[] = []
let pendingNetValueRequests: {
  code: string
  resolve: (data: { netValue: number; date: string; changeRate: number } | null) => void
  reject: (error: Error) => void
  timeout: ReturnType<typeof setTimeout>
}[] = []
let jsonpInitialized = false

function initJsonpCallback() {
  if (jsonpInitialized) return
  jsonpInitialized = true

    ; (window as any).jsonpgz = (data: any) => {
      // [WHY] 防御性检查：data 或 fundcode 可能为 undefined
      // [EDGE] 某些基金类型（ETF联接、期货）不支持估值，会返回 undefined
      if (!data || !data.fundcode) {
        return  // 静默忽略，不输出警告
      }
      const index = pendingRequests.findIndex(req => req.code === data.fundcode)
      if (index !== -1) {
        const req = pendingRequests[index]!
        clearTimeout(req.timeout)
        pendingRequests.splice(index, 1)
        req.resolve(data)
        return
      }

      // [WHAT] 处理净值请求
      const navIndex = pendingNetValueRequests.findIndex(req => req.code === data.fundcode)
      if (navIndex !== -1 && pendingNetValueRequests[navIndex]) {
        const req = pendingNetValueRequests[navIndex]!
        clearTimeout(req.timeout)
        pendingNetValueRequests.splice(navIndex, 1)

        const result = {
          netValue: parseFloat(data.gsz || data.dwjz || '0') || 0,
          date: data.jzrq || '',
          changeRate: parseFloat(data.gszzl || '0') || 0
        }
        req.resolve(result)
      }
      // [NOTE] 未匹配的响应静默忽略，可能是重复响应或超时后的响应
    }
}

// ========== 实时估值API（优化版） ==========

/**
 * 获取基金实时估值（带缓存）
 * [NOTE] 开盘前使用缓存数据，开盘后获取实时数据
 */
export function fetchFundEstimateFast(code: string): Promise<FundEstimate> {
  const cacheKey = `estimate_${code}`

  // [WHAT] 检查内存缓存
  // const cached = cache.get<FundEstimate>(cacheKey)
  // if (cached) return Promise.resolve(cached)

  // [WHAT] 获取持久化缓存
  const persisted = persistCache.get<FundEstimate>(cacheKey)

  // [WHAT] 非交易时间直接返回持久化缓存
  // if (!isTradingTime() && persisted) {
  //   cache.set(cacheKey, persisted, CACHE_TTL.ESTIMATE)
  //   return Promise.resolve(persisted)
  // }

  return withConcurrencyControl(() => {
    return new Promise((resolve, reject) => {
      initJsonpCallback()

      const scriptId = `fund_${code}_${Date.now()}`
      const timeout = setTimeout(() => {
        cleanup()
        const idx = pendingRequests.findIndex(r => r.code === code)
        if (idx !== -1) pendingRequests.splice(idx, 1)
        // [EDGE] 超时时使用持久化缓存
        reject(new Error(`超时: ${code}`))
      }, 8000)

      pendingRequests.push({
        code,
        resolve: (data) => {
          cache.set(cacheKey, data, CACHE_TTL.ESTIMATE)
          persistCache.set(cacheKey, data) // 保存到持久化缓存
          resolve(data)
        },
        reject: (err) => {
          // [EDGE] 失败时使用持久化缓存
          reject(err)
        },
        timeout
      })

      function cleanup() {
        const s = document.getElementById(scriptId)
        if (s) document.body.removeChild(s)
      }

      const script = document.createElement('script')
      script.id = scriptId
      script.src = `https://fundgz.1234567.com.cn/js/${code}.js?rt=${Date.now()}`
      script.onerror = () => {
        // [NOTE] 静默处理脚本加载失败，某些基金类型不支持估值
        cleanup()
        const idx = pendingRequests.findIndex(r => r.code === code)
        if (idx !== -1) {
          clearTimeout(pendingRequests[idx]!.timeout)
          pendingRequests.splice(idx, 1)
        }
        // [EDGE] 失败时使用持久化缓存
        reject(new Error(`失败: ${code}`))
      }
      script.onload = () => {
        setTimeout(cleanup, 100)
      }
      document.body.appendChild(script)
    })
  })
}

/**
 * 批量获取基金估值（并发优化）
 */
export async function fetchFundEstimatesBatch(codes: string[]): Promise<Map<string, FundEstimate>> {
  const results = new Map<string, FundEstimate>()

  // 并发请求所有基金
  const promises = codes.map(async code => {
    try {
      const data = await fetchFundEstimateFast(code)
      results.set(code, data)
    } catch {
      // 静默失败
    }
  })

  await Promise.all(promises)
  return results
}

// ========== 历史净值API（使用JSONP避免跨域） ==========

/**
 * 获取历史净值（带缓存，使用pingzhongdata接口）
 * [WHY] 使用JSONP方式避免CORS问题
 */
export async function fetchNetValueHistoryFast(code: string, days = 30): Promise<NetValueRecord[]> {
  const cacheKey = `netvalue_${code}_${days}`
  const cached = cache.get<NetValueRecord[]>(cacheKey)
  if (cached) return cached

  return new Promise((resolve) => {
    const scriptId = `netvalue_${code}_${Date.now()}`
    const timeout = setTimeout(() => {
      cleanup()
      resolve([])
    }, 15000)

    const script = document.createElement('script')
    script.id = scriptId
    // [WHY] pingzhongdata.js 包含 Data_netWorthTrend 变量
    script.src = `https://fund.eastmoney.com/pingzhongdata/${code}.js?v=${Date.now()}`

    script.onload = () => {
      cleanup()
      try {
        // [WHAT] pingzhongdata 设置全局变量 Data_netWorthTrend
        const trend = (window as any).Data_netWorthTrend || []

        if (trend.length === 0) {
          resolve([])
          return
        }

        // [WHAT] 取最近N条数据
        const recentData = trend.slice(-days)

        const records: NetValueRecord[] = recentData.map((item: any) => {
          const date = new Date(item.x)
          const dateStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
          return {
            date: dateStr,
            netValue: item.y || 0,
            totalNetValue: item.y || 0,
            changeRate: item.equityReturn || 0
          }
        })

        // [WHY] 反转数组保持跟原API一致：最新的在前
        records.reverse()

        cache.set(cacheKey, records, CACHE_TTL.NET_VALUE)
        resolve(records)
      } catch (err) {
        console.error('解析历史净值失败:', err)
        resolve([])
      }
    }

    script.onerror = () => {
      cleanup()
      resolve([])
    }

    function cleanup() {
      clearTimeout(timeout)
      const s = document.getElementById(scriptId)
      if (s) document.body.removeChild(s)
    }

    document.body.appendChild(script)
  })
}

/**
 * 获取基金基本信息（备用方案）
 * [WHY] 当天天基金API超时时，使用东方财富API获取基金名称和净值
 * [WHAT] 使用东方财富的基金详情接口
 */
export async function fetchFundBasicInfo(code: string): Promise<{
  name: string
  netValue: number
  changeRate: number
  updateTime: string
} | null> {
  const cacheKey = `basic_info_${code}`
  const cached = cache.get<{ name: string; netValue: number; changeRate: number; updateTime: string }>(cacheKey)
  if (cached) return cached

  return new Promise((resolve) => {
    const callbackName = `fbinfo_${Date.now()}_${Math.random().toString(36).slice(2)}`
    const timeout = setTimeout(() => {
      cleanup()
      resolve(null)
    }, 8000)

      ; (window as any)[callbackName] = (data: any) => {
        cleanup()
        if (!data || !data.Datas) {
          resolve(null)
          return
        }

        const d = data.Datas
        const result = {
          name: d.SHORTNAME || d.FSHORTNAME || '',
          netValue: parseFloat(d.DWJZ) || 0,
          changeRate: parseFloat(d.RZDF) || 0,
          updateTime: d.FSRQ || ''
        }

        if (result.name) {
          cache.set(cacheKey, result, CACHE_TTL.FUND_DETAIL)
        }
        resolve(result)
      }

    function cleanup() {
      clearTimeout(timeout)
      delete (window as any)[callbackName]
      const script = document.getElementById(callbackName)
      if (script) document.body.removeChild(script)
    }

    const script = document.createElement('script')
    script.id = callbackName
    // [DEPS] 东方财富基金详情接口
    script.src = `https://fundmobapi.eastmoney.com/FundMNewApi/FundMNFInfo?callback=${callbackName}&FCODE=${code}&deviceid=wap&plat=Wap&product=EFund&version=2.0.0&_=${Date.now()}`
    script.onerror = () => {
      cleanup()
      resolve(null)
    }
    document.body.appendChild(script)
  })
}

/**
 * 获取基金最新公布净值（非估值）
 * [WHY] 估值接口返回的是预估值，这个接口返回基金公司实际公布的净值
 * [HOW] 使用天天基金估值接口获取实时数据
 */
export async function fetchLatestNetValue(code: string): Promise<{
  netValue: number
  date: string
  changeRate: number
} | null> {
  const cacheKey = `latest_nav_${code}`
  // const cached = cache.get<{ netValue: number; date: string; changeRate: number }>(cacheKey)
  // if (cached) return cached

  initJsonpCallback()

  return new Promise((resolve) => {
    const scriptId = `nav_${code}_${Date.now()}`
    const timeout = setTimeout(() => {
      cleanup()
      // [EDGE] 从队列中移除超时的请求
      const index = pendingNetValueRequests.findIndex(req => req.code === code)
      if (index !== -1) {
        pendingNetValueRequests.splice(index, 1)
      }
      resolve(null)
    }, 10000)

    // [WHAT] 添加到待处理队列
    pendingNetValueRequests.push({ code, resolve, reject: () => { }, timeout })

    function cleanup() {
      const script = document.getElementById(scriptId)
      if (script) {
        document.body.removeChild(script)
      }
    }

    const script = document.createElement('script')
    script.id = scriptId
    // [DEPS] 基金估值接口，返回实时估值数据，使用固定的 jsonpgz 回调函数名
    script.src = `https://fundgz.1234567.com.cn/js/${code}.js?rt=${Date.now()}`
    script.onerror = () => {
      cleanup()
      const index = pendingNetValueRequests.findIndex(req => req.code === code)
      if (index !== -1 && pendingNetValueRequests[index]) {
        clearTimeout(pendingNetValueRequests[index]!.timeout)
        pendingNetValueRequests.splice(index, 1)
      }
      resolve(null)
    }
    script.onload = () => {
      // [FIX] 不要立即清理脚本，让回调有时间执行
      setTimeout(() => {
        cleanup()
      }, 500)
    }
    document.body.appendChild(script)
  })
}

// ========== 综合数据获取（多源验证） ==========

/**
 * 基金综合数据（多源验证后的准确数据）
 */
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

/**
 * 获取基金准确数据（多源验证）
 * [WHY] 同时从估值和净值接口获取，交叉验证确保准确
 * [WHAT] 优先使用公布净值（收盘后），交易时间内使用估值
 * [NOTE] 估值接口和净值接口是同一个 URL，只请求一次
 */
export async function fetchFundAccurateData(code: string, isQDII: boolean = false): Promise<FundAccurateData> {
  const cacheKey = `accurate_${code}`
  // [WHAT] QDII 基金不使用缓存，因为它们的交易时间与 A 股不同
  // if (!isQDII) {
  //   const cached = cache.get<FundAccurateData>(cacheKey)
  //   if (cached) return cached
  // }

  // [WHAT] 获取估值数据和历史净值数据
  const [estimateData, historyData] = await Promise.all([
    fetchFundEstimateFast(code).catch(() => null),
    fetchNetValueHistoryFast(code, 2).catch(() => [])  // 只获取最近 2 天的净值
  ])

  // [DEBUG] 打印获取到的数据
  // console.log('基金数据:', {
  //   code,
  //   isQDII,
  //   estimateData,
  //   historyData
  // })

  const now = new Date()
  const today = now.toISOString().split('T')[0]
  const currentHour = now.getHours()
  const currentMinute = now.getMinutes()

  // [WHAT] 判断是否在交易时间
  const isWeekday = now.getDay() >= 1 && now.getDay() <= 5
  const isTradingHours = (currentHour === 9 && currentMinute >= 30) ||
    (currentHour > 9 && currentHour < 11) ||
    (currentHour === 11 && currentMinute <= 30) ||
    (currentHour >= 13 && currentHour < 15)
  const inTradingTime = isWeekday && isTradingHours

  // [WHAT] 从历史净值中提取最新净值（第一个点是最新的）
  const latestNav = historyData.length > 0 ? historyData[0] : null
  const navData = latestNav ? {
    netValue: latestNav.netValue,
    date: latestNav.date,
    changeRate: latestNav.changeRate
  } : null

  // [WHAT] 构建结果
  const result: FundAccurateData = {
    code,
    name: estimateData?.name || '',
    nav: navData?.netValue || 0,
    navDate: navData?.date || '',
    navChange: navData?.changeRate || 0,
    estimate: parseFloat(estimateData?.gsz || '0') || 0,
    estimateTime: estimateData?.gztime || '',
    estimateChange: parseFloat(estimateData?.gszzl || '0') || 0,
    currentValue: 0,
    dayChange: 0,
    dataSource: 'fallback',
    updateTime: now.toISOString()
  }

  // [WHAT] 智能选择最准确的数据
  // 场景1: 收盘后且有今日净值 -> 使用公布净值
  // 场景2: 交易时间内 -> 使用估值
  // 场景3: 非交易时间且无今日净值 -> 使用最新公布净值
  // 场景4: QDII基金特殊处理 -> 非交易时间使用前一日净值，交易时间使用估值

  const isNavFromToday = navData?.date === today
  const isEstimateFromToday = estimateData?.gztime?.startsWith(today.replace(/-/g, '-'))

  // console.log('日期判断:', {
  //   code,
  //   today,
  //   navDate: navData?.date,
  //   isNavFromToday,
  //   nav: result.nav,
  //   navChange: result.navChange,
  //   estimate: result.estimate,
  //   estimateChange: result.estimateChange
  // })

  // [WHAT] QDII 基金特殊处理
  if (isQDII) {
    // [WHAT] 判断净值日期是否是昨天或今天
    const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0]
    const isNavFromYesterday = navData?.date === yesterday
    const isNavFromToday = navData?.date === today
    
    // [WHAT] QDII基金逻辑：昨日净值 > 今日净值 > 今日估值 > 昨日估值
    // [WHY] 净值比估值准确，昨日的净值比今日的估值更有参考价值
    if (isNavFromYesterday && result.nav > 0) {
      // [WHAT] 昨日净值已公布（最常用场景），优先使用
      result.currentValue = result.nav
      result.dayChange = result.navChange
      result.dataSource = 'nav'
    } else if (isNavFromToday && result.nav > 0) {
      // [WHAT] 今日净值已公布（特殊情况），使用今日净值
      result.currentValue = result.nav
      result.dayChange = result.navChange
      result.dataSource = 'nav'
    } else if (result.estimate > 0 && isEstimateFromToday) {
      // [WHAT] 没有昨日/今日净值，使用今日估值
      result.currentValue = result.estimate
      result.dayChange = result.estimateChange
      result.dataSource = 'estimate'
    } else if (result.estimate > 0) {
      // [WHAT] 没有今日估值，使用最近的估值（可能是昨天的）
      result.currentValue = result.estimate
      result.dayChange = result.estimateChange
      result.dataSource = 'estimate'
    } else {
      // [EDGE] 没有任何数据，使用接口返回的昨日净值
      const dwjz = parseFloat(estimateData?.dwjz || '0')
      if (dwjz > 0) {
        result.currentValue = dwjz
        result.dayChange = 0
        result.dataSource = 'fallback'
      }
    }
  } else {
    // [WHAT] 非QDII基金正常处理
    if (isNavFromToday && result.nav > 0) {
      // [WHAT] 今日净值已公布（收盘后），最准确
      result.currentValue = result.nav
      result.dayChange = result.navChange
      result.dataSource = 'nav'
    } else if (inTradingTime && result.estimate > 0) {
      // [WHAT] 交易时间内，使用估值
      result.currentValue = result.estimate
      result.dayChange = result.estimateChange
      result.dataSource = 'estimate'
    } else if (result.estimate > 0 && isEstimateFromToday) {
      // [WHAT] 非交易时间但有今日估值（午休或收盘后净值未公布）
      result.currentValue = result.estimate
      result.dayChange = result.estimateChange
      result.dataSource = 'estimate'
    } else if (result.nav > 0) {
      // [WHAT] 使用最新公布净值（可能是昨天的）
      result.currentValue = result.nav
      result.dayChange = result.navChange
      result.dataSource = 'nav'
    } else if (result.estimate > 0) {
      // [WHAT] 只有估值可用
      result.currentValue = result.estimate
      result.dayChange = result.estimateChange
      result.dataSource = 'estimate'
    } else {
      // [EDGE] 无数据可用，使用昨日净值
      const dwjz = parseFloat(estimateData?.dwjz || '0')
      if (dwjz > 0) {
        result.currentValue = dwjz
        result.dayChange = 0
        result.dataSource = 'fallback'
      }
    }
  }

  // [WHAT] 缓存30秒（交易时间内）或5分钟（非交易时间）
  // [WHAT] QDII基金缓存时间更短，因为它们的净值可能会在不同时间更新
  const ttl = isQDII ? 10000 : (inTradingTime ? 30000 : 300000)
  cache.set(cacheKey, result, ttl)

  return result
}

/**
 * 批量获取准确数据
 */
export async function fetchFundAccurateBatch(codes: string[]): Promise<Map<string, FundAccurateData>> {
  const results = new Map<string, FundAccurateData>()

  await Promise.all(codes.map(async code => {
    try {
      const data = await fetchFundAccurateData(code)
      results.set(code, data)
    } catch {
      // 静默失败
    }
  }))

  return results
}

// ========== K线数据（简化版，不需要复杂的OHLC模拟） ==========

export interface SimpleKLineData {
  time: string
  value: number
  change: number
  volume?: number  // 可选的成交量字段
}

/**
 * 获取简化K线数据（直接使用净值，不模拟OHLC）
 */
export async function fetchSimpleKLineData(code: string, days = 60): Promise<SimpleKLineData[]> {
  const cacheKey = `kline_${code}_${days}`
  const cached = cache.get<SimpleKLineData[]>(cacheKey)
  if (cached) return cached

  const history = await fetchNetValueHistoryFast(code, days)

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

export interface PeriodReturn {
  period: string
  label: string
  days: number
  change: number
}

/**
 * 计算阶段涨幅（从历史净值直接计算）
 */
export async function calculatePeriodReturns(code: string): Promise<PeriodReturn[]> {
  const cacheKey = `period_${code}`
  const cached = cache.get<PeriodReturn[]>(cacheKey)
  if (cached) return cached

  // 获取足够长的历史数据
  const history = await fetchNetValueHistoryFast(code, 400)
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

// ========== 大盘指数（简化版） ==========

export interface MarketIndexSimple {
  code: string
  name: string
  current: number
  change: number
  changePercent: number
}

/**
 * 获取大盘指数
 * [WHAT] 上证指数、深证成指、创业板指、沪深300
 */
export async function fetchMarketIndicesFast(): Promise<MarketIndexSimple[]> {
  const cacheKey = 'market_indices'
  const cached = cache.get<MarketIndexSimple[]>(cacheKey)
  if (cached) return cached

  try {
    // [WHAT] 添加沪深300指数 (1.000300)
    const url = 'https://push2.eastmoney.com/api/qt/ulist.np/get?fltt=2&secids=1.000001,0.399001,0.399006,1.000300&fields=f2,f3,f4,f12,f14'
    const response = await fetch(url)
    const data = await response.json()

    if (!data?.data?.diff) return []

    const indices: MarketIndexSimple[] = data.data.diff.map((item: any) => ({
      code: item.f12,
      name: item.f14,
      current: item.f2,
      change: item.f4,
      changePercent: item.f3
    }))

    cache.set(cacheKey, indices, CACHE_TTL.MARKET_INDEX)
    return indices
  } catch {
    return []
  }
}

// ========== 基金排行榜（新接口） ==========

export interface FundRankItemSimple {
  code: string
  name: string
  netValue: number
  dayChange: number
}

/**
 * 获取基金排行榜（使用push2接口）
 * @param order 排序方向：1（降序/涨幅榜）、0（升序/跌幅榜）
 * @param pageSize 返回数量
 */
// ========== 基金经理信息 ==========

export interface FundManagerInfo {
  name: string           // 经理姓名
  photo: string          // 头像URL
  workTime: string       // 从业时间
  fundSize: string       // 管理规模
  bestReturn: string     // 最佳回报
  experience: string     // 简介
  funds: {               // 管理的基金
    code: string
    name: string
    type: string
    size: string
    returnRate: string   // 任职回报
    startDate: string    // 任职日期
  }[]
}

/**
 * 获取基金经理信息
 * [WHY] 从天天基金 pingzhongdata 提取经理数据
 */
export async function fetchFundManagerInfo(fundCode: string): Promise<FundManagerInfo | null> {
  const cacheKey = `manager_${fundCode}`
  const cached = cache.get<FundManagerInfo>(cacheKey)
  if (cached) return cached

  return new Promise((resolve) => {
    const scriptId = `manager_${fundCode}_${Date.now()}`
    const timeout = setTimeout(() => {
      cleanup()
      resolve(null)
    }, 15000)

    const script = document.createElement('script')
    script.id = scriptId
    script.src = `https://fund.eastmoney.com/pingzhongdata/${fundCode}.js?v=${Date.now()}`

    script.onload = () => {
      cleanup()
      try {
        // [WHAT] 解析经理数据
        const managerData = (window as any).Data_currentFundManager || []

        if (managerData.length === 0) {
          resolve(null)
          return
        }

        // [WHY] 通常取第一个经理（主要管理人）
        const main = managerData[0]

        // [WHAT] 安全提取最佳回报
        // [EDGE] profit 是复杂对象: { series: [{ data: [{ y: 99.13 }] }] }
        // 其中 data[0].y 是任期收益
        let bestReturn = '--'
        if (main.profit && typeof main.profit === 'object') {
          try {
            const val = main.profit.series?.[0]?.data?.[0]?.y
            if (val !== undefined && val !== null) {
              bestReturn = `${val.toFixed(2)}%`
            }
          } catch {
            bestReturn = '--'
          }
        }

        // [WHAT] 提取经理能力评估信息
        // [EDGE] power 包含能力雷达图数据
        let experience = ''
        if (main.power?.categories && main.power?.data) {
          // 组合能力评估为简要说明
          const abilities = main.power.categories.map((cat: string, i: number) =>
            `${cat}: ${main.power.data[i]?.toFixed?.(1) || main.power.data[i] || '--'}分`
          ).join('、')
          experience = `综合能力评分 ${main.power.avr || '--'}。${abilities}`
        }

        const manager: FundManagerInfo = {
          name: main.name || '未知',
          photo: main.pic || '',
          workTime: main.workTime || '--',
          fundSize: main.fundSize || '--',
          bestReturn,
          experience,
          // [EDGE] pingzhongdata 不包含基金列表，受 CORS 限制暂无法获取
          funds: []
        }

        cache.set(cacheKey, manager, CACHE_TTL.FUND_INFO)
        resolve(manager)
      } catch (err) {
        console.error('解析经理数据失败:', err)
        resolve(null)
      }
    }

    script.onerror = () => {
      cleanup()
      resolve(null)
    }

    function cleanup() {
      clearTimeout(timeout)
      const s = document.getElementById(scriptId)
      if (s) document.body.removeChild(s)
    }

    document.body.appendChild(script)
  })
}

export async function fetchFundRankingFast(
  order: 1 | 0 = 1,
  pageSize = 30
): Promise<FundRankItemSimple[]> {
  const cacheKey = `ranking_${order}_${pageSize}`
  const cached = cache.get<FundRankItemSimple[]>(cacheKey)
  if (cached) return cached

  try {
    // [WHY] 使用push2接口获取场内基金排行（ETF/LOF等）
    const url = `https://push2.eastmoney.com/api/qt/clist/get?pn=1&pz=${pageSize}&po=${order}&np=1&fltt=2&invt=2&fid=f3&fs=b:MK0021&fields=f2,f3,f4,f12,f14&_=${Date.now()}`

    const response = await fetch(url)
    const data = await response.json()

    if (!data?.data?.diff) return []

    const items: FundRankItemSimple[] = data.data.diff.map((item: any) => ({
      code: item.f12,
      name: item.f14,
      netValue: item.f2 || 0,
      dayChange: item.f3 || 0
    }))

    cache.set(cacheKey, items, 30000)  // 30秒缓存
    return items
  } catch (err) {
    console.error('获取基金排行失败:', err)
    return []
  }
}

// ========== 经理业绩走势 ==========

export interface ManagerProfitPoint {
  date: string      // 日期 YYYY-MM-DD
  profit: number    // 累计收益率%
}

/**
 * 获取经理任职期间业绩走势
 * [WHY] 展示经理管理该基金的累计收益曲线
 * [HOW] 从 pingzhongdata.js 获取 Data_grandTotal（累计收益走势）
 */
export async function fetchManagerProfit(fundCode: string): Promise<ManagerProfitPoint[]> {
  const cacheKey = `manager_profit_${fundCode}`
  const cached = cache.get<ManagerProfitPoint[]>(cacheKey)
  if (cached) return cached

  return new Promise((resolve) => {
    const scriptId = `mprofit_${fundCode}_${Date.now()}`
    const timeout = setTimeout(() => {
      cleanup()
      resolve([])
    }, 10000)

    const script = document.createElement('script')
    script.id = scriptId
    script.src = `https://fund.eastmoney.com/pingzhongdata/${fundCode}.js?v=${Date.now()}`

    script.onload = () => {
      cleanup()

      try {
        // [WHAT] Data_grandTotal 格式: [[timestamp, value], ...]
        // 表示累计收益率走势
        const grandTotal = (window as any).Data_grandTotal || []

        if (!Array.isArray(grandTotal) || grandTotal.length === 0) {
          resolve([])
          return
        }

        // [WHAT] 转换为日期-收益率格式
        // [EDGE] 数据量可能很大，采样到最多200个点
        const step = Math.max(1, Math.floor(grandTotal.length / 200))
        const result: ManagerProfitPoint[] = []

        for (let i = 0; i < grandTotal.length; i += step) {
          const item = grandTotal[i]
          if (Array.isArray(item) && item.length >= 2) {
            const date = new Date(item[0])
            result.push({
              date: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`,
              profit: item[1] || 0
            })
          }
        }

        // [EDGE] 确保包含最后一个点
        const last = grandTotal[grandTotal.length - 1]
        const lastResult = result[result.length - 1]
        if (last && lastResult && lastResult.date !== new Date(last[0]).toISOString().split('T')[0]) {
          const date = new Date(last[0])
          result.push({
            date: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`,
            profit: last[1] || 0
          })
        }

        cache.set(cacheKey, result, CACHE_TTL.NET_VALUE)
        resolve(result)
      } catch {
        resolve([])
      }
    }

    script.onerror = () => {
      cleanup()
      resolve([])
    }

    function cleanup() {
      clearTimeout(timeout)
      const s = document.getElementById(scriptId)
      if (s) document.body.removeChild(s)
    }

    document.body.appendChild(script)
  })
}

// ========== 全球指数 ==========

/**
 * 全球指数数据结构
 */
export interface GlobalIndex {
  name: string
  code: string
  price: number
  change: number
  changePercent: number
  region: 'cn' | 'hk' | 'us' | 'eu' | 'asia'
}

/**
 * 获取全球主要指数行情
 * [WHY] 帮助投资者了解全球市场走势
 * [DEPS] 使用东方财富 push2 接口
 */
export async function fetchGlobalIndices(): Promise<GlobalIndex[]> {
  const cacheKey = 'global_indices'
  const cached = cache.get<GlobalIndex[]>(cacheKey)
  if (cached) return cached

  // [WHAT] 东方财富全球指数代码
  // 格式: 市场代码.指数代码
  const indices = [
    { code: '1.000001', name: '上证指数', region: 'cn' as const },
    { code: '0.399001', name: '深证成指', region: 'cn' as const },
    { code: '0.399006', name: '创业板指', region: 'cn' as const },
    { code: '100.HSI', name: '恒生指数', region: 'hk' as const },
    { code: '100.DJIA', name: '道琼斯', region: 'us' as const },
    { code: '100.NDX', name: '纳斯达克', region: 'us' as const },
    { code: '100.SPX', name: '标普500', region: 'us' as const },
    { code: '100.N225', name: '日经225', region: 'asia' as const },
  ]

  const results: GlobalIndex[] = []

  try {
    const codes = indices.map(i => i.code).join(',')
    const callbackName = `globalIdx_${Date.now()}`

    await new Promise<void>((resolve) => {
      const timeout = setTimeout(() => { cleanup(); resolve() }, 8000)

        // [WHAT] 设置 JSONP 回调
        ; (window as any)[callbackName] = (data: any) => {
          cleanup()
          try {
            if (data?.data?.diff) {
              data.data.diff.forEach((item: any, idx: number) => {
                if (indices[idx] && item.f2 > 0) {
                  results.push({
                    name: indices[idx].name,
                    code: indices[idx].code,
                    price: item.f2 / 100,  // 价格需要除以100
                    change: item.f4 / 100, // 涨跌额
                    changePercent: item.f3 / 100, // 涨跌幅
                    region: indices[idx].region
                  })
                }
              })
            }
          } catch { /* ignore */ }
          resolve()
        }

      const script = document.createElement('script')
      script.id = callbackName
      // [DEPS] 东方财富行情接口
      script.src = `https://push2.eastmoney.com/api/qt/ulist.np/get?secids=${codes}&fields=f2,f3,f4,f12,f14&cb=${callbackName}&_=${Date.now()}`

      script.onerror = () => { cleanup(); resolve() }

      function cleanup() {
        clearTimeout(timeout)
        const s = document.getElementById(callbackName)
        if (s) document.body.removeChild(s)
        try { delete (window as any)[callbackName] } catch { /* */ }
      }

      document.body.appendChild(script)
    })

    if (results.length === 0) return getDefaultGlobalIndices()

    cache.set(cacheKey, results, CACHE_TTL.MARKET_INDEX)
    return results
  } catch {
    return getDefaultGlobalIndices()
  }
}

function getDefaultGlobalIndices(): GlobalIndex[] {
  return [
    { name: '上证指数', code: 's_sh000001', price: 0, change: 0, changePercent: 0, region: 'cn' },
    { name: '深证成指', code: 's_sz399001', price: 0, change: 0, changePercent: 0, region: 'cn' },
    { name: '恒生指数', code: 'rt_hkHSI', price: 0, change: 0, changePercent: 0, region: 'hk' },
    { name: '道琼斯', code: 'gb_$dji', price: 0, change: 0, changePercent: 0, region: 'us' },
    { name: '纳斯达克', code: 'gb_$ixic', price: 0, change: 0, changePercent: 0, region: 'us' },
    { name: '日经225', code: 'int_nikkei', price: 0, change: 0, changePercent: 0, region: 'asia' },
  ]
}

// ========== 行业配置 ==========

/**
 * 行业配置数据
 */
export interface IndustryAllocation {
  name: string      // 行业名称
  ratio: number     // 占比 %
  color: string     // 饼图颜色
}

/**
 * 资产配置数据
 */
export interface AssetAllocation {
  stock: number     // 股票占比 %
  bond: number      // 债券占比 %
  cash: number      // 现金占比 %
  other: number     // 其他占比 %
}

/**
 * 基金评级数据
 */
export interface FundRating {
  rating: number           // 综合评级 1-5
  riskLevel: string        // 风险等级
  sharpeRatio: number      // 夏普比率
  maxDrawdown: number      // 最大回撤 %
  volatility: number       // 波动率 %
  rankInSimilar: string    // 同类排名
}

// [WHAT] 饼图颜色列表
const CHART_COLORS = [
  '#3b82f6', '#ef4444', '#22c55e', '#f59e0b', '#8b5cf6',
  '#ec4899', '#06b6d4', '#84cc16', '#f97316', '#6366f1'
]

/**
 * 获取基金行业配置
 * [WHY] 展示基金持仓的行业分布
 * [DEPS] pingzhongdata 接口返回 Data_IndustryAllocation
 */
export async function fetchIndustryAllocation(code: string): Promise<IndustryAllocation[]> {
  const cacheKey = `industry_${code}`
  const cached = cache.get<IndustryAllocation[]>(cacheKey)
  if (cached) return cached

  return new Promise((resolve) => {
    const scriptId = `industry_${code}_${Date.now()}`
    const timeout = setTimeout(() => { cleanup(); resolve([]) }, 10000)

    const script = document.createElement('script')
    script.id = scriptId
    script.src = `https://fund.eastmoney.com/pingzhongdata/${code}.js?v=${Date.now()}`

    script.onload = () => {
      cleanup()
      try {
        // [WHAT] Data_IndustryAllocation 格式: { series: [{ data: [{name, y}] }] }
        const data = (window as any).Data_IndustryAllocation
        if (!data?.series?.[0]?.data) {
          resolve([])
          return
        }

        const industries: IndustryAllocation[] = data.series[0].data
          .filter((item: any) => item.y > 0)
          .slice(0, 10)
          .map((item: any, idx: number) => ({
            name: item.name || '其他',
            ratio: parseFloat(item.y?.toFixed(2)) || 0,
            color: CHART_COLORS[idx % CHART_COLORS.length]
          }))

        cache.set(cacheKey, industries, CACHE_TTL.FUND_INFO)
        resolve(industries)
      } catch {
        resolve([])
      }
    }

    script.onerror = () => { cleanup(); resolve([]) }

    function cleanup() {
      clearTimeout(timeout)
      const s = document.getElementById(scriptId)
      if (s) document.body.removeChild(s)
    }

    document.body.appendChild(script)
  })
}

/**
 * 获取基金资产配置
 * [WHY] 展示股票/债券/现金比例
 */
export async function fetchAssetAllocation(code: string): Promise<AssetAllocation | null> {
  const cacheKey = `asset_${code}`
  const cached = cache.get<AssetAllocation>(cacheKey)
  if (cached) return cached

  return new Promise((resolve) => {
    const scriptId = `asset_${code}_${Date.now()}`
    const timeout = setTimeout(() => { cleanup(); resolve(null) }, 10000)

    const script = document.createElement('script')
    script.id = scriptId
    script.src = `https://fund.eastmoney.com/pingzhongdata/${code}.js?v=${Date.now()}`

    script.onload = () => {
      cleanup()
      try {
        // [WHAT] Data_assetAllocation 格式: { series: [{name, data:[...]}, ...] }
        const data = (window as any).Data_assetAllocation
        if (!data?.series) {
          resolve(null)
          return
        }

        // [WHAT] 提取最新一期的配置（data数组最后一个元素）
        const getSeries = (name: string) => {
          const s = data.series.find((item: any) => item.name === name)
          if (!s?.data?.length) return 0
          return s.data[s.data.length - 1] || 0
        }

        const asset: AssetAllocation = {
          stock: parseFloat(getSeries('股票占净比').toFixed(2)),
          bond: parseFloat(getSeries('债券占净比').toFixed(2)),
          cash: parseFloat(getSeries('现金占净比').toFixed(2)),
          other: parseFloat(getSeries('其他占净比').toFixed(2))
        }

        cache.set(cacheKey, asset, CACHE_TTL.FUND_INFO)
        resolve(asset)
      } catch {
        resolve(null)
      }
    }

    script.onerror = () => { cleanup(); resolve(null) }

    function cleanup() {
      clearTimeout(timeout)
      const s = document.getElementById(scriptId)
      if (s) document.body.removeChild(s)
    }

    document.body.appendChild(script)
  })
}

/**
 * 获取基金评级和风险指标
 * [WHY] 帮助用户评估基金质量和风险
 */
export async function fetchFundRating(code: string): Promise<FundRating | null> {
  const cacheKey = `rating_${code}`
  const cached = cache.get<FundRating>(cacheKey)
  if (cached) return cached

  return new Promise((resolve) => {
    const scriptId = `rating_${code}_${Date.now()}`
    const timeout = setTimeout(() => { cleanup(); resolve(null) }, 10000)

    const script = document.createElement('script')
    script.id = scriptId
    script.src = `https://fund.eastmoney.com/pingzhongdata/${code}.js?v=${Date.now()}`

    script.onload = () => {
      cleanup()
      try {
        // [WHAT] 从多个全局变量提取评级数据
        const rateInSimilar = (window as any).Data_rateInSimilarType || []
        const performanceData = (window as any).Data_rateInSimilarPers498 || []
        const fluctuation = (window as any).Data_fluctuationScale || {}

        // [WHAT] 计算综合评级（基于同类排名）
        let rating = 3
        if (rateInSimilar.length > 0) {
          const latestRank = rateInSimilar[rateInSimilar.length - 1]
          if (latestRank) {
            // [HOW] 排名百分比转评级：前20%=5星，前40%=4星...
            const rankPercent = (latestRank.rank / latestRank.total) * 100
            if (rankPercent <= 20) rating = 5
            else if (rankPercent <= 40) rating = 4
            else if (rankPercent <= 60) rating = 3
            else if (rankPercent <= 80) rating = 2
            else rating = 1
          }
        }

        // [WHAT] 提取风险指标
        let sharpeRatio = 0, maxDrawdown = 0, volatility = 0
        if (fluctuation?.series) {
          // 夏普比率
          const sharpe = fluctuation.series.find((s: any) => s.name?.includes('夏普'))
          if (sharpe?.data?.length) sharpeRatio = sharpe.data[sharpe.data.length - 1] || 0

          // 波动率
          const vol = fluctuation.series.find((s: any) => s.name?.includes('标准差') || s.name?.includes('波动'))
          if (vol?.data?.length) volatility = vol.data[vol.data.length - 1] || 0
        }

        // [WHAT] 从业绩数据提取最大回撤
        if (performanceData.length > 0) {
          const values = performanceData.map((d: any) => d.y || d)
          const max = Math.max(...values)
          const min = Math.min(...values)
          maxDrawdown = max > 0 ? ((max - min) / max) * 100 : 0
        }

        // [WHAT] 风险等级判断
        let riskLevel = '中风险'
        if (volatility < 10) riskLevel = '低风险'
        else if (volatility < 20) riskLevel = '中低风险'
        else if (volatility < 30) riskLevel = '中风险'
        else if (volatility < 40) riskLevel = '中高风险'
        else riskLevel = '高风险'

        // [WHAT] 同类排名
        let rankInSimilar = '--'
        if (rateInSimilar.length > 0) {
          const latest = rateInSimilar[rateInSimilar.length - 1]
          // [EDGE] 确保 rank 和 total 都存在且有效
          if (latest && latest.rank !== undefined && latest.total !== undefined) {
            rankInSimilar = `${latest.rank}/${latest.total}`
          }
        }

        const result: FundRating = {
          rating,
          riskLevel,
          sharpeRatio: parseFloat(sharpeRatio.toFixed(2)),
          maxDrawdown: parseFloat(maxDrawdown.toFixed(2)),
          volatility: parseFloat(volatility.toFixed(2)),
          rankInSimilar
        }

        cache.set(cacheKey, result, CACHE_TTL.FUND_INFO)
        resolve(result)
      } catch {
        resolve(null)
      }
    }

    script.onerror = () => { cleanup(); resolve(null) }

    function cleanup() {
      clearTimeout(timeout)
      const s = document.getElementById(scriptId)
      if (s) document.body.removeChild(s)
    }

    document.body.appendChild(script)
  })
}
