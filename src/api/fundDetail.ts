// [WHAT] 基金详情相关 API
// [DEPS] 天天基金 pingzhongdata 接口、东方财富接口
// [NOTE] 包含重仓股、基金经理、评级等

import { cache, CACHE_TTL } from './cache'
import { isTradingTime } from './tiantianApi'
import { persistCache } from '../utils/persistCache'
import type { FundEstimate, FundInfo, NetValueRecord } from '@/types/fund'
import { logger } from '@/utils/logger'
import { http } from '@/utils/http'
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
import { clearFundCache, clearAllCache, queueGlobalVarScript } from './fundUtils'

// ========== 前十重仓股 ==========

export { clearFundCache, clearAllCache }

export async function fetchTopHoldings(code: string): Promise<HoldingStock[]> {
  const cacheKey = `topholdings_${code}`
  const cached = cache.get<HoldingStock[]>(cacheKey)
  if (cached) return cached

  const top10 = await queueGlobalVarScript<HoldingStock[]>(
    `https://fundf10.eastmoney.com/FundArchivesDatas.aspx?type=jjcc&code=${code}&topline=10&year=&month=&_=${Date.now()}`,
    async () => {
      const html = window.apidata?.content || ''
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
            const qtText = await http.text(qtUrl)
              const qtRegex = /v_s_(sh|sz|bj|hk|us)(\w+)="([^"]+)"/g
              let m: RegExpExecArray | null
              const qtData: Record<string, string> = {}
              while ((m = qtRegex.exec(qtText)) !== null) {
                const prefix = m[1]
                const code = m[2]
                const dataStr = m[3]
                if (!dataStr) continue
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

export async function fetchFundBasicInfo(code: string): Promise<{
  name: string
  netValue: number
  changeRate: number
  updateTime: string
} | null> {
  const cacheKey = `basic_info_${code}`
  const cached = cache.get<{ name: string; netValue: number; changeRate: number; updateTime: string }>(cacheKey)
  if (cached) return cached

  try {
    const url = `https://fundmobapi.eastmoney.com/FundMNewApi/FundMNFInfo?FCODE=${code}&deviceid=wap&plat=Wap&product=EFund&version=2.0.0&_=${Date.now()}`
    const text = await http.text(url)
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

function setAccurateSource(
  result: FundAccurateData,
  source: 'nav' | 'estimate' | 'fallback',
  fallbackValue = 0
): void {
  if (source === 'nav') {
    result.currentValue = result.nav
    result.dayChange = result.navChange
    result.dataSource = 'nav'
  } else if (source === 'estimate') {
    result.currentValue = result.estimate
    result.dayChange = result.estimateChange
    result.dataSource = 'estimate'
  } else {
    result.currentValue = fallbackValue
    result.dayChange = 0
    result.dataSource = 'fallback'
  }
}

/**
 * 根据多源数据（净值/估值/备用净值）解析基金当前值，消除 QDII 与非 QDII 分支的重复逻辑。
 * 优先级：昨日净值(QDII) > 今日净值 > 交易时段估值 > 今日估值 > 净值 > 估值 > 备用净值(dwjz)
 */
function resolveAccurateValue(
  result: FundAccurateData,
  opts: {
    isQDII: boolean
    isNavFromToday: boolean
    isNavFromYesterday: boolean
    isEstimateFromToday: boolean
    inTradingTime: boolean
    dwjz: number
  }
): void {
  const { isQDII, isNavFromToday, isNavFromYesterday, isEstimateFromToday, inTradingTime, dwjz } = opts
  const navPositive = result.nav > 0
  const estimatePositive = result.estimate > 0

  // QDII：海外净值 T+1，优先使用昨日净值
  if (isQDII && isNavFromYesterday && navPositive) {
    setAccurateSource(result, 'nav')
    return
  }
  if (navPositive && isNavFromToday) {
    setAccurateSource(result, 'nav')
    return
  }
  if (isQDII) {
    if (estimatePositive && isEstimateFromToday) {
      setAccurateSource(result, 'estimate')
      return
    }
    if (estimatePositive) {
      setAccurateSource(result, 'estimate')
      return
    }
  } else {
    if (inTradingTime && estimatePositive) {
      setAccurateSource(result, 'estimate')
      return
    }
    if (estimatePositive && isEstimateFromToday) {
      setAccurateSource(result, 'estimate')
      return
    }
  }
  if (navPositive) {
    setAccurateSource(result, 'nav')
    return
  }
  if (estimatePositive) {
    setAccurateSource(result, 'estimate')
    return
  }
  if (dwjz > 0) {
    setAccurateSource(result, 'fallback', dwjz)
  }
}

export async function fetchFundAccurateData(code: string, isQDII: boolean = false): Promise<FundAccurateData> {
  const cacheKey = `accurate_${code}`
  if (!isQDII) {
    const cached = cache.get<FundAccurateData>(cacheKey)
    if (cached) return cached
  }

  const [estimateData, historyResult] = await Promise.all([
    fetchFundEstimateFast(code).catch(() => null),
    fetchNetValueHistoryFast(code, 2).catch(() => ({ records: [], fundName: '' }))
  ])

  const now = new Date()
  const today = now.toISOString().split('T')[0]!
  const currentHour = now.getHours()
  const currentMinute = now.getMinutes()

  const isWeekday = now.getDay() >= 1 && now.getDay() <= 5
  const isTradingHours = (currentHour === 9 && currentMinute >= 30) ||
    (currentHour > 9 && currentHour < 11) ||
    (currentHour === 11 && currentMinute <= 30) ||
    (currentHour >= 13 && currentHour < 15)
  const inTradingTime = isWeekday && isTradingHours

  const historyData = historyResult.records || []
  const latestNav = historyData.length > 0 ? historyData[0] : null
  const navData = latestNav ? {
    netValue: latestNav.netValue,
    date: latestNav.date,
    changeRate: latestNav.changeRate
  } : null

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

  const isNavFromToday = navData?.date === today
  const isEstimateFromToday = estimateData?.gztime?.startsWith(today)

  const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0]
  const isNavFromYesterday = navData?.date === yesterday
  const dwjz = parseFloat(estimateData?.dwjz || '0')

  resolveAccurateValue(result, {
    isQDII,
    isNavFromToday,
    isNavFromYesterday,
    isEstimateFromToday,
    inTradingTime,
    dwjz
  })

  const ttl = isQDII ? 10000 : (inTradingTime ? 30000 : 300000)
  cache.set(cacheKey, result, ttl)

  return result
}

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

// ========== 基金排行榜 ==========

export async function fetchFundRankingFast(
  order: 1 | 0 = 1,
  pageSize = 30
): Promise<FundRankItemSimple[]> {
  const cacheKey = `ranking_${order}_${pageSize}`
  const cached = cache.get<FundRankItemSimple[]>(cacheKey)
  if (cached) return cached

  try {
    const url = `https://push2.eastmoney.com/api/qt/clist/get?pn=1&pz=${pageSize}&po=${order}&np=1&fltt=2&invt=2&fid=f3&fs=b:MK0021&fields=f2,f3,f4,f12,f14&_=${Date.now()}`

    const data = await http.get<{ data?: { diff?: any[] } }>(url)

    if (!data?.data?.diff) return []

    const items: FundRankItemSimple[] = data.data.diff.map((item: any) => ({
      code: item.f12,
      name: item.f14,
      netValue: item.f2 || 0,
      dayChange: item.f3 || 0
    }))

    cache.set(cacheKey, items, 30000)
    return items
  } catch (err) {
    logger.error('获取基金排行失败', err)
    return []
  }
}

// ========== 基金经理信息 ==========

export async function fetchFundManagerInfo(fundCode: string): Promise<FundManagerInfo | null> {
  const cacheKey = `manager_${fundCode}`
  const cached = cache.get<FundManagerInfo>(cacheKey)
  if (cached) return cached

  const manager = await queueGlobalVarScript<FundManagerInfo | null>(
    `https://fund.eastmoney.com/pingzhongdata/${fundCode}.js?v=${Date.now()}`,
    () => {
      const managerData = window.Data_currentFundManager || []
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

export async function fetchManagerProfit(fundCode: string): Promise<ManagerProfitPoint[]> {
  const cacheKey = `manager_profit_${fundCode}`
  const cached = cache.get<ManagerProfitPoint[]>(cacheKey)
  if (cached) return cached

  const result = await queueGlobalVarScript<ManagerProfitPoint[]>(
    `https://fund.eastmoney.com/pingzhongdata/${fundCode}.js?v=${Date.now()}`,
    () => {
      const grandTotal = window.Data_grandTotal || []
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


// ========== 行业配置 ==========

const CHART_COLORS = [
  '#3b82f6', '#ef4444', '#22c55e', '#f59e0b', '#8b5cf6',
  '#ec4899', '#06b6d4', '#84cc16', '#f97316', '#6366f1'
]

export async function fetchIndustryAllocation(code: string): Promise<IndustryAllocation[]> {
  const cacheKey = `industry_${code}`
  const cached = cache.get<IndustryAllocation[]>(cacheKey)
  if (cached) return cached

  const result = await queueGlobalVarScript<IndustryAllocation[]>(
    `https://fund.eastmoney.com/pingzhongdata/${code}.js?v=${Date.now()}`,
    () => {
      const data = window.Data_IndustryAllocation
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

export async function fetchAssetAllocation(code: string): Promise<AssetAllocation | null> {
  const cacheKey = `asset_${code}`
  const cached = cache.get<AssetAllocation>(cacheKey)
  if (cached) return cached

  const result = await queueGlobalVarScript<AssetAllocation | null>(
    `https://fund.eastmoney.com/pingzhongdata/${code}.js?v=${Date.now()}`,
    () => {
      const data = window.Data_assetAllocation
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

export async function fetchFundRating(code: string): Promise<FundRating | null> {
  const cacheKey = `rating_${code}`
  const cached = cache.get<FundRating>(cacheKey)
  if (cached) return cached

  const result = await queueGlobalVarScript<FundRating | null>(
    `https://fund.eastmoney.com/pingzhongdata/${code}.js?v=${Date.now()}`,
    () => {
      const rateInSimilar = window.Data_rateInSimilarType || []
      const performanceData = window.Data_rateInSimilarPers498 || []
      const fluctuation = window.Data_fluctuationScale || {}

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
