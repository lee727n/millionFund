// [WHY] 天天基金 API 增强版 — 只保留被业务代码真正调用的函数
// [WHAT] 交易日判断、基金期间涨幅、费率、分红、公告、初始化工具
// [DEPS] HTTP 请求 + 正则解析（替代 JSONP script 注入） + unifiedCache 双层缓存

import { fetchJsData, parseJsVariable } from './fund/request'
import { unifiedCache, UNIFIED_CACHE_TTL } from './unifiedCache'
import { logger } from '@/utils/logger'
import { http } from '@/utils/http'
import { handleApiError } from '@/utils/errorHandler'

// ========== 交易时段类型 ==========

export type TradingSession = 'morning' | 'noon_break' | 'afternoon' | 'closed' | 'weekend' | 'holiday' | 'pre_market' | 'post_market'

// ========== 节假日动态获取 ==========

const FALLBACK_HOLIDAYS: Record<string, string[]> = {
  '2025': [
    '2025-01-28', '2025-01-29', '2025-01-30', '2025-01-31', '2025-02-03', '2025-02-04',
    '2025-04-04', '2025-04-07',
    '2025-05-01', '2025-05-02', '2025-05-05',
    '2025-05-30', '2025-06-02',
    '2025-10-01', '2025-10-02', '2025-10-03', '2025-10-06', '2025-10-07', '2025-10-08',
  ],
  '2026': [
    '2026-01-01', '2026-01-02', '2026-01-03',
    '2026-02-16', '2026-02-17', '2026-02-18', '2026-02-19', '2026-02-20', '2026-02-23', '2026-02-24',
    '2026-04-06',
    '2026-05-01', '2026-05-04', '2026-05-05',
    '2026-06-19', '2026-06-22',
    '2026-10-01', '2026-10-02', '2026-10-05', '2026-10-06', '2026-10-07', '2026-10-08',
  ],
}

const holidaySet = new Set<string>()
let holidayInitialized = false

function initFallbackHolidays(): void {
  const thisYear = String(new Date().getFullYear())
  const nextYear = String(new Date().getFullYear() + 1)
  for (const year of [thisYear, nextYear]) {
    FALLBACK_HOLIDAYS[year]?.forEach(d => holidaySet.add(d))
  }
  logger.info(`[holiday] 兜底数据加载完成`)
}

async function fetchYearHolidaysFromApi(year: number): Promise<void> {
  const cacheKey = `holiday_year_${year}`
  const cached = unifiedCache.getMemory<string[]>(cacheKey)
  if (cached) {
    cached.forEach(d => holidaySet.add(d))
    return
  }

  const apiSources = [
    `https://timor.tech/api/holiday/year/${year}`,
    `https://api.apihubs.cn/holiday/get?year=${year}`,
    `https://www.mxnz.cn/api/holiday?year=${year}`
  ]

  for (const apiUrl of apiSources) {
    try {
      const data = await http.json<Record<string, any>>(apiUrl)
      let holidayDates: string[] = []

      if (apiUrl.includes('timor.tech')) {
        if (data?.code === 0 && data?.holiday) {
          for (const [dateStr, info] of Object.entries(data.holiday)) {
            if ((info as any).holiday) {
              holidaySet.add(dateStr)
              holidayDates.push(dateStr)
            }
          }
        }
      } else if (apiUrl.includes('apihubs.cn')) {
        if (data?.code === 200 && Array.isArray(data?.data)) {
          for (const item of data.data) {
            if (item.holiday === 1 || item.holiday === true) {
              holidaySet.add(item.date)
              holidayDates.push(item.date)
            }
          }
        }
      } else if (apiUrl.includes('mxnz.cn')) {
        if (data?.code === 0 && data?.data?.holiday) {
          for (const item of data.data.holiday) {
            const d = typeof item === 'string' ? item : (item.date ?? item.d)
            if (d) {
              holidaySet.add(d)
              holidayDates.push(d)
            }
          }
        }
      }

      if (holidayDates.length > 0) {
        unifiedCache.setMemory(cacheKey, holidayDates, 86400000)
        logger.info(`[holiday] ${year} 年获取成功`, { count: holidayDates.length, source: apiUrl })
        return
      }
    } catch (err) {
      logger.warn(`[holiday] API 获取 ${year} 年失败`, {
        url: apiUrl,
        error: err instanceof Error ? err.message : String(err)
      })
    }
  }
  logger.warn(`[holiday] 所有 API 源均失败 ${year}，使用兜底数据`)
}

export async function initHolidayData(): Promise<void> {
  if (holidayInitialized) return
  holidayInitialized = true
  initFallbackHolidays()
  const thisYear = new Date().getFullYear()
  await Promise.all([
    fetchYearHolidaysFromApi(thisYear),
    fetchYearHolidaysFromApi(thisYear + 1),
  ])
}

function isStockHoliday(date: Date): boolean {
  return holidaySet.has(formatDateKey(date))
}

function formatDateKey(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

// ========== 交易时段判断（纯函数） ==========

export function getTradingSession(): TradingSession {
  const now = new Date()
  const hour = now.getHours()
  const minute = now.getMinutes()
  const day = now.getDay()
  const timeMinutes = hour * 60 + minute

  if (day === 0 || day === 6) return 'weekend'
  if (isStockHoliday(now)) return 'holiday'
  if (timeMinutes < 570) return 'pre_market'
  if (timeMinutes >= 570 && timeMinutes < 690) return 'morning'
  if (timeMinutes >= 690 && timeMinutes < 780) return 'noon_break'
  if (timeMinutes >= 780 && timeMinutes < 900) return 'afternoon'
  return 'post_market'
}

export function isTradingTime(): boolean {
  const session = getTradingSession()
  return session === 'morning' || session === 'afternoon'
}

// ========== 初始化移动端默认缓存 ==========

export function initMobileDefaultCache(): void {
  const cacheKey = 'market_overview_v2'
  const existing = unifiedCache.getPersistent<{ totalUp: number }>(cacheKey)
  if (existing && existing.totalUp > 0) return

  const defaultData = {
    updateTime: '等待更新',
    totalUp: 3000,
    totalDown: 5000,
    distribution: [
      { range: '≤-5', count: 150, min: -Infinity, max: -5 },
      { range: '-5~-3', count: 200, min: -5, max: -3 },
      { range: '-3~-1', count: 1500, min: -3, max: -1 },
      { range: '-1~0', count: 3000, min: -1, max: -0.001 },
      { range: '0~1', count: 4000, min: -0.001, max: 1 },
      { range: '1~3', count: 1000, min: 1, max: 3 },
      { range: '3~5', count: 100, min: 3, max: 5 },
      { range: '≥5', count: 50, min: 5, max: Infinity }
    ]
  }

  unifiedCache.setPersistent(cacheKey, defaultData, 3600000)
}

// ========== 类型定义 ==========

export interface PeriodReturnExt {
  period: string
  label: string
  fundReturn: number
  avgReturn: number
  hs300Return: number
  rank: number
  totalCount: number
}

export interface DividendRecord {
  date: string
  exDate: string
  payDate: string
  amount: number
  type: '红利再投' | '现金分红'
}

export interface FundFeeInfo {
  purchaseFees: Array<{ minAmount: number; maxAmount: number; rate: number; discountRate: number }>
  redemptionFees: Array<{ minDays: number; maxDays: number; rate: number }>
  managementFee: number
  custodianFee: number
  salesServiceFee: number
}

export interface FundAnnouncement {
  id: string
  title: string
  date: string
  type: '分红公告' | '定期报告' | '人事变动' | '其他公告'
  url: string
}

// ========== 基金期间涨幅（HTTP + 正则解析，非 JSONP） ==========

export async function fetchPeriodReturnExt(code: string): Promise<PeriodReturnExt[]> {
  const cacheKey = `period_ext_${code}`

  return unifiedCache.getOrSet(
    cacheKey,
    async () => {
      const url = `https://pingzhongdata.eastmoney.com/pingzhongdata/${code}.js?v=${Date.now()}`
      const text = await http.text(url, { timeout: 15000 })
      const periodData = parseJsVariable<any[]>(text, 'Data_rateInSimilarPers498') || []

      const periodConfig: Record<string, { period: string; label: string }> = {
        'Z': { period: '1w', label: '近1周' },
        'Y': { period: '1m', label: '近1月' },
        '3Y': { period: '3m', label: '近3月' },
        '6Y': { period: '6m', label: '近6月' },
        '1N': { period: '1y', label: '近1年' },
        '2N': { period: '2y', label: '近2年' },
        '3N': { period: '3y', label: '近3年' },
        '5N': { period: '5y', label: '近5年' },
        'JN': { period: 'ytd', label: '今年来' },
        'LN': { period: 'all', label: '成立来' }
      }

      const items: PeriodReturnExt[] = []
      if (Array.isArray(periodData)) {
        periodData.forEach((item: any) => {
          const config = periodConfig[item.title]
          if (config) {
            items.push({
              period: config.period,
              label: config.label,
              fundReturn: parseFloat(item.syl) || 0,
              avgReturn: parseFloat(item.avg) || 0,
              hs300Return: parseFloat(item.hs300) || 0,
              rank: parseInt(item.rank) || 0,
              totalCount: parseInt(item.sc) || 0
            })
          }
        })
      }
      return items
    },
    { memoryTTL: UNIFIED_CACHE_TTL.FUND_INFO, persist: true }
  )
}

// ========== 分红记录（HTTP + 正则解析 JSONP） ==========

export async function fetchDividendRecords(fundCode: string): Promise<DividendRecord[]> {
  const cacheKey = `dividend_${fundCode}`

  return unifiedCache.getOrSet(
    cacheKey,
    async () => {
      const cbName = `de_cb_${Date.now()}`
      const url = `https://api.fund.eastmoney.com/f10/fhsp?fundcode=${fundCode}&callback=${cbName}&_=${Date.now()}`
      const text = await http.text(url)

      const jsonStart = text.indexOf('({') + 1
      const jsonEnd = text.lastIndexOf('})')
      if (jsonStart < 0 || jsonEnd < 0) return []

      const jsonStr = text.substring(jsonStart, jsonEnd + 1)
      const jsonResp = JSON.parse(jsonStr)

      const records: DividendRecord[] = []
      if (jsonResp?.Datas?.fhspList) {
        for (const item of jsonResp.Datas.fhspList) {
          records.push({
            date: item.DJRQ || '',
            exDate: item.CXRQ || '',
            payDate: item.FFRQ || '',
            amount: item.FHFCZ || 0,
            type: '现金分红'
          })
        }
      }
      return records
    },
    { memoryTTL: UNIFIED_CACHE_TTL.DIVIDEND, persist: true }
  )
}

// ========== 基金费率（估算值，非联网请求） ==========

export async function fetchFundFees(fundCode: string): Promise<FundFeeInfo> {
  const cacheKey = `fees_${fundCode}`

  const cached = unifiedCache.getMemory<FundFeeInfo>(cacheKey)
  if (cached) return cached

  const lastChar = fundCode.slice(-1).toUpperCase()
  const isClassC = lastChar === 'C' || lastChar === 'E' || lastChar === 'Y'

  const classAFees: FundFeeInfo = {
    purchaseFees: [
      { minAmount: 0, maxAmount: 100, rate: 1.5, discountRate: 0.15 },
      { minAmount: 100, maxAmount: 300, rate: 1.2, discountRate: 0.12 },
      { minAmount: 300, maxAmount: 500, rate: 0.8, discountRate: 0.08 },
      { minAmount: 500, maxAmount: Infinity, rate: 1000, discountRate: 1000 }
    ],
    redemptionFees: [
      { minDays: 0, maxDays: 7, rate: 1.5 },
      { minDays: 7, maxDays: 30, rate: 0.5 },
      { minDays: 30, maxDays: 365, rate: 0.5 },
      { minDays: 365, maxDays: 730, rate: 0.25 },
      { minDays: 730, maxDays: Infinity, rate: 0 }
    ],
    managementFee: 1.5,
    custodianFee: 0.25,
    salesServiceFee: 0
  }

  const classCFees: FundFeeInfo = {
    purchaseFees: [{ minAmount: 0, maxAmount: Infinity, rate: 0, discountRate: 0 }],
    redemptionFees: [
      { minDays: 0, maxDays: 7, rate: 1.5 },
      { minDays: 7, maxDays: 30, rate: 0.5 },
      { minDays: 30, maxDays: Infinity, rate: 0 }
    ],
    managementFee: 1.5,
    custodianFee: 0.25,
    salesServiceFee: 0.4
  }

  const result = isClassC ? classCFees : classAFees
  unifiedCache.setMemory(cacheKey, result, UNIFIED_CACHE_TTL.FEES)
  return result
}

export function calculateRedemptionFee(
  holdingDays: number,
  redemptionAmount: number,
  fees: FundFeeInfo['redemptionFees']
): { rate: number; fee: number } {
  const tier = fees.find(f => holdingDays >= f.minDays && holdingDays < f.maxDays)
  const rate = tier?.rate || 0
  const fee = redemptionAmount * (rate / 100)
  return { rate, fee }
}

// ========== 基金公告（返回模拟数据，CORS 限制下的兜底） ==========

export async function fetchFundAnnouncements(fundCode: string): Promise<FundAnnouncement[]> {
  const cacheKey = `announcements_${fundCode}`
  const cached = unifiedCache.getMemory<FundAnnouncement[]>(cacheKey)
  if (cached) return cached

  const now = new Date()
  const formatDate = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

  const announcements: FundAnnouncement[] = [
    { id: '1', title: '投资有风险，理财需谨慎', date: formatDate(now), type: '其他公告', url: '' },
    { id: '2', title: '数据刷新有延迟，仅供学习和参考', date: formatDate(now), type: '其他公告', url: '' }
  ]

  unifiedCache.setMemory(cacheKey, announcements, UNIFIED_CACHE_TTL.FUND_LIST)
  return announcements
}
