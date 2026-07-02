// [WHAT] 基金详情相关 API
// [DEPS] 天天基金 pingzhongdata 接口、东方财富接口
// [NOTE] 包含缓存管理、全局脚本队列、重仓股、基金经理、评级等

import { cache, CACHE_TTL } from './cache'
import { isTradingTime } from './tiantianApi'
import { persistCache } from '../utils/persistCache'
import type { FundEstimate, FundInfo, NetValueRecord } from '@/types/fund'
import { logger } from '@/utils/logger'
import { http } from '@/utils/http'
import { parseJsVariable } from './fund/request'
import type {
  IntradayPoint,
  HoldingStock,
  FundAccurateData,
  MarketIndexSimple,
  FundRankItemSimple,
  FundManagerInfo,
  ManagerProfitPoint,
  GlobalIndex,
  IndustryAllocation,
  AssetAllocation,
  FundRating
} from './fundTypes'
import { fetchFundEstimateFast } from './fundEstimate'
import { fetchNetValueHistoryFast, fetchHS300History } from './fundNetValue'

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
        logger.warn('[fundDetail] queueGlobalVarScript failed', { url, error: e })
        finish(emptyResult)
      }
    }

    globalVarScriptQueue.push(runner)
    runNextGlobalVarScript()
  })
}

// ========== 前十重仓股 ==========

export async function fetchTopHoldings(code: string): Promise<HoldingStock[]> {
  const cacheKey = `topholdings_${code}`
  const cached = cache.get<HoldingStock[]>(cacheKey)
  if (cached) return cached

  const top10 = await queueGlobalVarScript<HoldingStock[]>(
    `https://fundf10.eastmoney.com/FundArchivesDatas.aspx?type=jjcc&code=${code}&topline=10&year=&month=&_=${Date.now()}`,
    async () => {
      const html = (window as any).apidata?.content || ''
      if (!html) return []

      const headerRow = (html.match(/<thead[\s\S]*?<tr[\s\S]*?<\/tr>[\s\S]*?<\/thead>/i) || [])[0] || ''
      const headerCells = (headerRow.match(/<th[\s\S]*?>([\s\S]*?)<\/th>/gi) || []).map((th: string) => th.replace(/<[^>]*>/g, '').trim())
      let idxCode = -1, idxName = -1, idxWeight = -1
      headerCells.forEach((h: string, i: number) => {
        const t = h.replace(/\s+/g, '')
        if (idxCode < 0 && (t.includes('股票代码') || t.includes('证券代码'))) idxCode = i
        if (idxName < 0 && (t.includes('股票名称') || t.includes('证券名称'))) idxName = i
        if (idxWeight < 0 && (t.includes('占净值比例') || t.includes('占比'))) idxWeight = i
      })

      const rows = html.match(/<tbody[\s\S]*?<\/tbody>/i) || []
      const dataRows = rows.length ? rows[0].match(/<tr[\s\S]*?<\/tr>/gi) || [] : html.match(/<tr[\s\S]*?<\/tr>/gi) || []

      const holdings: HoldingStock[] = []
      for (const r of dataRows) {
        const tds = (r.match(/<td[\s\S]*?>([\s\S]*?)<\/td>/gi) || []).map((td: string) => td.replace(/<[^>]*>/g, '').trim())
        if (!tds.length) continue

        let stockCode = ''
        let stockName = ''
        let stockWeight = ''

        if (idxCode >= 0 && tds[idxCode]) {
          const m = tds[idxCode].match(/(\d{6})/)
          stockCode = m ? m[1] : tds[idxCode]
        } else {
          const codeIdx = tds.findIndex((txt: string) => /^\d{6}$/.test(txt))
          if (codeIdx >= 0) stockCode = tds[codeIdx]
        }

        if (idxName >= 0 && tds[idxName]) {
          stockName = tds[idxName]
        } else if (stockCode) {
          const i = tds.findIndex((txt: string) => txt && txt !== stockCode && !/%$/.test(txt))
          stockName = i >= 0 ? tds[i] : ''
        }

        if (idxWeight >= 0 && tds[idxWeight]) {
          const wm = tds[idxWeight].match(/([\d.]+)\s*%/)
          stockWeight = wm ? `${wm[1]}%` : tds[idxWeight]
        } else {
          const wIdx = tds.findIndex((txt: string) => /\d+(?:\.\d+)?\s*%/.test(txt))
          stockWeight = wIdx >= 0 ? (tds[wIdx].match(/([\d.]+)\s*%/)?.[1] + '%') : ''
        }

        if (stockCode || stockName || stockWeight) {
          holdings.push({ code: stockCode, name: stockName, weight: stockWeight, change: null })
        }
      }

      const topH = holdings.slice(0, 10)
      const needQuotes = topH.filter((h) => /^\d{6}$/.test(h.code) || /^\d{5}$/.test(h.code) || /^[A-Z]{1,6}$/.test(h.code))

      if (needQuotes.length > 0) {
        const tencentCodes = needQuotes.map((h) => {
          const cd = String(h.code || '')
          if (/^\d{6}$/.test(cd)) {
            const pfx = cd.startsWith('6') || cd.startsWith('9') ? 'sh' : ((cd.startsWith('4') || cd.startsWith('8')) ? 'bj' : 'sz')
            return `s_${pfx}${cd}`
          }
          if (/^\d{5}$/.test(cd)) return `s_hk${cd}`
          if (/^[A-Z]{1,6}$/.test(cd)) return `s_us${cd}`
          return null
        }).filter(Boolean).join(',')

        if (tencentCodes) {
          try {
            const qtUrl = `https://qt.gtimg.cn/q?q=${tencentCodes}`
            const qtRes = await fetch(qtUrl)
            if (qtRes.ok) {
              const qtText = await qtRes.text()
              // 解析 qt.gtimg.cn 返回格式：v_s_sh600000="1~贵州茅台~600519~1800.00~1.5%~..."
              const qtRegex = /v_s_(sh|sz|bj|hk|us)(\w+)="([^"]+)"/g
              let m: RegExpExecArray | null
              const qtData: Record<string, string> = {}
              while ((m = qtRegex.exec(qtText)) !== null) {
                const prefix = m[1]
                const code = m[2]
                const dataStr = m[3]
                if (!dataStr) continue
                // 统一 key 格式与下方查找一致
                let key = ''
                if (prefix === 'sh' || prefix === 'sz' || prefix === 'bj') key = `${prefix}${code}`
                else if (prefix === 'hk') key = `hk${code}`
                else if (prefix === 'us') key = `us${code}`
                if (key) qtData[key] = dataStr
              }
              needQuotes.forEach((h) => {
                const cd = String(h.code || '')
                let lookup = ''
                if (/^\d{6}$/.test(cd)) {
                  const pfx = cd.startsWith('6') || cd.startsWith('9') ? 'sh' : ((cd.startsWith('4') || cd.startsWith('8')) ? 'bj' : 'sz')
                  lookup = `${pfx}${cd}`
                } else if (/^\d{5}$/.test(cd)) {
                  lookup = `hk${cd}`
                } else if (/^[A-Z]{1,6}$/.test(cd)) {
                  lookup = `us${cd}`
                } else return
                const dataStr = qtData[lookup]
                if (dataStr) {
                  const parts = dataStr.split('~')
                  if (parts.length > 5 && parts[5]) h.change = parseFloat(parts[5])
                }
              })
            } else {
              // [M6] 已移除 JSONP 降级，fetch 失败时跳过股票行情获取
              logger.warn('[fundDetail] 获取股票行情失败，跳过', { url: qtUrl })
            }
          } catch {
            // 静默忽略行情获取失败
          }
        }
      }

      return topH
    },
    ['apidata'],
    []
  )

  cache.set(cacheKey, top10, CACHE_TTL.NET_VALUE)
  return top10
}

// ========== 基金基本信息 ==========

/**
 * 获取基金基本信息（备用方案）
 * [WHY] 当天天基金API超时时，使用东方财富API获取基金名称和净值
 * [WHAT] 使用东方财富的基金详情接口
 * [M6] 已迁移到 fetch + new Function（移除 JSONP）
 * [DEPS] http.ts 统一发送请求
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

  // [FIX] 安全解析 JSONP 响应，避免 new Function
  try {
    const url = `https://fundmobapi.eastmoney.com/FundMNewApi/FundMNFInfo?FCODE=${code}&deviceid=wap&plat=Wap&product=EFund&version=2.0.0&_=${Date.now()}`
    const text = await http.text(url)

    // 直接解析 JSON 响应（该接口实际返回 JSON，不需要 JSONP）
    const data = JSON.parse(text)
    if (!data || !data.Datas) {
      logger.warn('[fundDetail] 基金详情数据格式错误', { code })
      return null
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
    return result
  } catch (fetchErr) {
    logger.warn('[fundDetail] fetchFundBasicInfo 失败', { code, error: fetchErr })
    return null
  }
}

// ========== 综合数据获取（多源验证） ==========

/**
 * 获取基金准确数据（多源验证）
 * [WHY] 同时从估值和净值接口获取，交叉验证确保准确
 * [WHAT] 优先使用公布净值（收盘后），交易时间内使用估值
 * [NOTE] 估值接口和净值接口是同一个 URL，只请求一次
 */
export async function fetchFundAccurateData(code: string, isQDII: boolean = false): Promise<FundAccurateData> {
  const cacheKey = `accurate_${code}`
  // [WHAT] QDII 基金不使用缓存，因为它们的交易时间与 A 股不同
  if (!isQDII) {
    const cached = cache.get<FundAccurateData>(cacheKey)
    if (cached) return cached
  }

  // [WHAT] 获取估值数据和历史净值数据
  const [estimateData, historyResult] = await Promise.all([
    fetchFundEstimateFast(code).catch(() => null),
    fetchNetValueHistoryFast(code, 2).catch(() => ({ records: [], fundName: '' }))  // 只获取最近 2 天的净值
  ])

  const now = new Date()
  const today = now.toISOString().split('T')[0]!
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
  const historyData = historyResult.records || []
  const latestNav = historyData.length > 0 ? historyData[0] : null
  const navData = latestNav ? {
    netValue: latestNav.netValue,
    date: latestNav.date,
    changeRate: latestNav.changeRate
  } : null

  // [WHAT] 构建结果，优先使用历史净值中的基金名称
  const result: FundAccurateData = {
    code,
    name: estimateData?.name || historyResult.fundName || '',
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
    } catch (err) {
      logger.error('批量获取准确数据失败', { code, error: err })
    }
  }))

  return results
}

// ========== 大盘指数 ==========

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
    const data = await http.get<{ data?: { diff?: any[] } }>(url)

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
  } catch (e) {
    logger.warn('[fundDetail] 获取大盘指数失败', e)
    return getFallbackMarketIndices()
  }
}

/**
 * 大盘指数兜底数据
 * [WHY] API 失败时使用，避免首页指标区域空白
 */
function getFallbackMarketIndices(): MarketIndexSimple[] {
  return [
    { code: '000001', name: '上证指数', current: 3150, change: 12.5, changePercent: 0.40 },
    { code: '399001', name: '深证成指', current: 9850, change: 45.2, changePercent: 0.46 },
    { code: '399006', name: '创业板指', current: 2050, change: 8.6, changePercent: 0.42 },
    { code: '000300', name: '沪深300', current: 3780, change: 15.8, changePercent: 0.42 },
  ]
}

// ========== 基金排行榜 ==========

/**
 * 获取基金排行榜（使用push2接口）
 * @param order 排序方向：1（降序/涨幅榜）、0（升序/跌幅榜）
 * @param pageSize 返回数量
 */
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

    const data = await http.get<{ data?: { diff?: any[] } }>(url)

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
    logger.error('获取基金排行失败', err)
    return []
  }
}

// ========== 基金经理信息 ==========

/**
 * 获取基金经理信息
 * [WHY] 从天天基金 pingzhongdata 提取经理数据
 */
export async function fetchFundManagerInfo(fundCode: string): Promise<FundManagerInfo | null> {
  const cacheKey = `manager_${fundCode}`
  const cached = cache.get<FundManagerInfo>(cacheKey)
  if (cached) return cached

  const manager = await queueGlobalVarScript<FundManagerInfo | null>(
    `https://fund.eastmoney.com/pingzhongdata/${fundCode}.js?v=${Date.now()}`,
    () => {
      const managerData = (window as any).Data_currentFundManager || []
      if (managerData.length === 0) return null

      const main = managerData[0]

      let bestReturn = '--'
      if (main.profit && typeof main.profit === 'object') {
        const val = main.profit.series?.[0]?.data?.[0]?.y
        if (val !== undefined && val !== null) bestReturn = `${val.toFixed(2)}%`
      }

      let experience = ''
      if (main.power?.categories && main.power?.data) {
        const abilities = main.power.categories.map((cat: string, i: number) =>
          `${cat}: ${main.power.data[i]?.toFixed?.(1) || main.power.data[i] || '--'}分`
        ).join('、')
        experience = `综合能力评分 ${main.power.avr || '--'}。${abilities}`
      }

      return {
        name: main.name || '未知',
        photo: main.pic || '',
        workTime: main.workTime || '--',
        fundSize: main.fundSize || '--',
        bestReturn,
        experience,
        funds: []
      }
    },
    ['Data_currentFundManager'],
    null
  )

  if (manager) cache.set(cacheKey, manager, CACHE_TTL.FUND_INFO)
  return manager
}

// ========== 经理业绩走势 ==========

/**
 * 获取经理任职期间业绩走势
 * [WHY] 展示经理管理该基金的累计收益曲线
 * [HOW] 从 pingzhongdata.js 获取 Data_grandTotal（累计收益走势）
 */
export async function fetchManagerProfit(fundCode: string): Promise<ManagerProfitPoint[]> {
  const cacheKey = `manager_profit_${fundCode}`
  const cached = cache.get<ManagerProfitPoint[]>(cacheKey)
  if (cached) return cached

  const result = await queueGlobalVarScript<ManagerProfitPoint[]>(
    `https://fund.eastmoney.com/pingzhongdata/${fundCode}.js?v=${Date.now()}`,
    () => {
      const grandTotal = (window as any).Data_grandTotal || []
      if (!Array.isArray(grandTotal) || grandTotal.length === 0) return []

      const step = Math.max(1, Math.floor(grandTotal.length / 200))
      const points: ManagerProfitPoint[] = []

      for (let i = 0; i < grandTotal.length; i += step) {
        const item = grandTotal[i]
        if (Array.isArray(item) && item.length >= 2) {
          const date = new Date(item[0])
          points.push({
            date: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`,
            profit: item[1] || 0
          })
        }
      }

      const last = grandTotal[grandTotal.length - 1]
      const lastResult = points[points.length - 1]
      if (last && lastResult && lastResult.date !== new Date(last[0]).toISOString().split('T')[0]) {
        const date = new Date(last[0])
        points.push({
          date: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`,
          profit: last[1] || 0
        })
      }
      return points
    },
    ['Data_grandTotal'],
    []
  )

  cache.set(cacheKey, result, CACHE_TTL.NET_VALUE)
  return result
}

// ========== 全球指数 ==========

/**
 * 获取全球主要指数行情
 * [WHY] 帮助投资者了解全球市场走势
 * [DEPS] 使用东方财富 push2 接口（直接返回 JSON）
 * [M6] 已迁移到 http.get()（移除 JSONP）
 */
export async function fetchGlobalIndices(): Promise<GlobalIndex[]> {
  const cacheKey = 'global_indices'
  const cached = cache.get<GlobalIndex[]>(cacheKey)
  if (cached) return cached

  // [WHAT] 东方财富全球指数代码
  // 格式：市场代码.指数代码
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

  try {
    const codes = indices.map(i => i.code).join(',')

    // [M6] 直接使用 http.get()，不再使用 JSONP
    const url = `https://push2.eastmoney.com/api/qt/ulist.np/get?secids=${codes}&fields=f2,f3,f4,f12,f14&_=${Date.now()}`
    const data = await http.get<{ data?: { diff?: any[] } }>(url)

    const results: GlobalIndex[] = []

    if (data?.data?.diff) {
      data.data.diff.forEach((item: any, idx: number) => {
        if (indices[idx] && item.f2 > 0) {
          results.push({
            name: indices[idx].name,
            code: indices[idx].code,
            price: item.f2,
            change: item.f4,
            changePercent: item.f3,
            region: indices[idx].region
          })
        }
      })
    }

    if (results.length === 0) return getDefaultGlobalIndices()

    cache.set(cacheKey, results, CACHE_TTL.MARKET_INDEX)
    return results
  } catch (err) {
    logger.warn('[fundDetail] fetchGlobalIndices 失败', { error: err })
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

  const result = await queueGlobalVarScript<IndustryAllocation[]>(
    `https://fund.eastmoney.com/pingzhongdata/${code}.js?v=${Date.now()}`,
    () => {
      const data = (window as any).Data_IndustryAllocation
      if (!data?.series?.[0]?.data) return []

      return data.series[0].data
        .filter((item: any) => item.y > 0)
        .slice(0, 10)
        .map((item: any, idx: number) => ({
          name: item.name || '其他',
          ratio: parseFloat(item.y?.toFixed(2)) || 0,
          color: CHART_COLORS[idx % CHART_COLORS.length]
        }))
    },
    ['Data_IndustryAllocation'],
    []
  )

  cache.set(cacheKey, result, CACHE_TTL.FUND_INFO)
  return result
}

/**
 * 获取基金资产配置
 * [WHY] 展示股票/债券/现金比例
 */
export async function fetchAssetAllocation(code: string): Promise<AssetAllocation | null> {
  const cacheKey = `asset_${code}`
  const cached = cache.get<AssetAllocation>(cacheKey)
  if (cached) return cached

  const result = await queueGlobalVarScript<AssetAllocation | null>(
    `https://fund.eastmoney.com/pingzhongdata/${code}.js?v=${Date.now()}`,
    () => {
      const data = (window as any).Data_assetAllocation
      if (!data?.series) return null

      const getSeries = (name: string) => {
        const s = data.series.find((item: any) => item.name === name)
        if (!s?.data?.length) return 0
        return s.data[s.data.length - 1] || 0
      }

      return {
        stock: parseFloat(getSeries('股票占净比').toFixed(2)),
        bond: parseFloat(getSeries('债券占净比').toFixed(2)),
        cash: parseFloat(getSeries('现金占净比').toFixed(2)),
        other: parseFloat(getSeries('其他占净比').toFixed(2))
      }
    },
    ['Data_assetAllocation'],
    null
  )

  if (result) cache.set(cacheKey, result, CACHE_TTL.FUND_INFO)
  return result
}

/**
 * 获取基金评级和风险指标
 * [WHY] 帮助用户评估基金质量和风险
 */
export async function fetchFundRating(code: string): Promise<FundRating | null> {
  const cacheKey = `rating_${code}`
  const cached = cache.get<FundRating>(cacheKey)
  if (cached) return cached

  const result = await queueGlobalVarScript<FundRating | null>(
    `https://fund.eastmoney.com/pingzhongdata/${code}.js?v=${Date.now()}`,
    () => {
      const rateInSimilar = (window as any).Data_rateInSimilarType || []
      const performanceData = (window as any).Data_rateInSimilarPers498 || []
      const fluctuation = (window as any).Data_fluctuationScale || {}

      let rating = 3
      if (rateInSimilar.length > 0) {
        const latestRank = rateInSimilar[rateInSimilar.length - 1]
        if (latestRank) {
          const rankPercent = (latestRank.rank / latestRank.total) * 100
          if (rankPercent <= 20) rating = 5
          else if (rankPercent <= 40) rating = 4
          else if (rankPercent <= 60) rating = 3
          else if (rankPercent <= 80) rating = 2
          else rating = 1
        }
      }

      let sharpeRatio = 0, maxDrawdown = 0, volatility = 0
      if (fluctuation?.series) {
        const sharpe = fluctuation.series.find((s: any) => s.name?.includes('夏普'))
        if (sharpe?.data?.length) sharpeRatio = sharpe.data[sharpe.data.length - 1] || 0
        const vol = fluctuation.series.find((s: any) => s.name?.includes('标准差') || s.name?.includes('波动'))
        if (vol?.data?.length) volatility = vol.data[vol.data.length - 1] || 0
      }

      if (performanceData.length > 0) {
        const values = performanceData.map((d: any) => d.y || d)
        const max = Math.max(...values)
        const min = Math.min(...values)
        maxDrawdown = max > 0 ? ((max - min) / max) * 100 : 0
      }

      let riskLevel = '中风险'
      if (volatility < 10) riskLevel = '低风险'
      else if (volatility < 20) riskLevel = '中低风险'
      else if (volatility < 30) riskLevel = '中风险'
      else if (volatility < 40) riskLevel = '中高风险'
      else riskLevel = '高风险'

      let rankInSimilar = '--'
      if (rateInSimilar.length > 0) {
        const latest = rateInSimilar[rateInSimilar.length - 1]
        if (latest && latest.rank !== undefined && latest.total !== undefined) {
          rankInSimilar = `${latest.rank}/${latest.total}`
        }
      }

      return {
        rating,
        riskLevel,
        sharpeRatio: parseFloat(sharpeRatio.toFixed(2)),
        maxDrawdown: parseFloat(maxDrawdown.toFixed(2)),
        volatility: parseFloat(volatility.toFixed(2)),
        rankInSimilar
      }
    },
    ['Data_rateInSimilarType', 'Data_rateInSimilarPers498', 'Data_fluctuationScale'],
    null
  )

  if (result) cache.set(cacheKey, result, CACHE_TTL.FUND_INFO)
  return result
}
