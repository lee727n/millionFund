// [WHY] 优化版基金API，参考多个开源项目的最佳实践
// [WHAT] 使用缓存、并发控制、简化数据结构
// [DEPS] 天天基金公开接口

import { cache, CACHE_TTL } from './cache'
import { push2Fetch } from '@/utils/http'
import { isMobile } from '@/utils/platform'
import { isTradingTime, persistCache, fetchETFRank } from './tiantianApi'
import type { FundEstimate, NetValueRecord } from '@/types/fund'
import { getPrevWorkdaySync, isHolidaySync, clearHolidayCache } from '../utils/holiday'

function getTradingDateStr(date: Date = new Date()): string {
  const hour = date.getHours()
  if (hour < 9) {
    date = new Date(date.getTime() - 24 * 60 * 60 * 1000)
  }
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

// [WHAT] 清除指定基金的缓存数据（不包括持仓缓存）
// [FIX] 持仓缓存保持持久化，只有手动刷新时才清除
export function clearFundCache(code: string): void {
  const prefixes = ['estimate', 'netvalue', 'kline', 'period', 'accurate']

  // [FIX] 清除内存缓存中所有匹配的键
  prefixes.forEach(prefix => {
    cache.delete(`${prefix}_${code}`)
      ;[1, 2, 30, 60, 90, 180, 365, 400].forEach(days => {
        cache.delete(`${prefix}_${code}_${days}`)
      })
  })

  // [FIX] 遍历 localStorage 清除所有持久化缓存（包括 days=1, 2 等之前遗漏的键）
  if (typeof localStorage !== 'undefined') {
    const keysToRemove: string[] = []
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (!key) continue
      // 匹配 fund_estimate_020640, fund_netvalue_020640_2 等所有变体
      prefixes.forEach(prefix => {
        if (key === `fund_${prefix}_${code}` || key.startsWith(`fund_${prefix}_${code}_`)) {
          keysToRemove.push(key)
        }
      })
    }
    keysToRemove.forEach(key => localStorage.removeItem(key))
  }

  // [WHY] 同时清除沪深300缓存，防止之前加载到错误数据
  ;[30, 60, 90, 180, 365, 400].forEach(days => {
    cache.delete(`hs300_history_${days}`)
    persistCache.delete(`hs300_history_${days}`)
  })
}

// [WHAT] 清除指定基金的持仓缓存
// [WHY] 只有用户手动刷新持仓页面时才调用此函数
export function clearHoldingsCache(code: string): void {
  cache.delete(`topholdings_${code}`)
  persistCache.delete(`topholdings_persist_${code}`)
  // 同时从 localStorage 中删除
  if (typeof localStorage !== 'undefined') {
    localStorage.removeItem(`fund_topholdings_persist_${code}`)
  }
  console.log(`[clearHoldingsCache] ${code} - 持仓缓存已清除`)
}

// [WHAT] 清除所有缓存
export function clearAllCache(): void {
  cache.clear()
}

// ========== 并发控制 ==========
const MAX_CONCURRENT = 5
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

// ========== pingzhongdata请求：真正串行队列 ==========
// [FIX] 旧版只做了速率限制但 fn 内部是异步 Promise，多个 script 会并发覆盖全局变量
// 新版：前一个 Promise resolve 后才调下一个，彻底隔离全局变量
let pingzhongChain: Promise<any> = Promise.resolve()

function runPingzhongSerialized<T>(fn: () => Promise<T>): Promise<T> {
  const next = pingzhongChain.then(() => fn())
  pingzhongChain = next.catch(() => { }) // 吞掉错误不阻塞队列
  return next
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

        // [WHY] 优先使用 dwjz（最新公布净值），而非 gsz（实时估值）
        // [WHY] 交易时间内账户显示的收益是基于昨日净值计算的，使用估值会导致成本净值和份额计算不准确
        const result = {
          netValue: parseFloat(data.dwjz || data.gsz || '0') || 0,
          date: data.jzrq || '',
          changeRate: parseFloat(data.gszzl || '0') || 0
        }
        req.resolve(result)
      }
      // [NOTE] 未匹配的响应静默忽略，可能是重复响应或超时后的响应
    }
}

function extractIndustryKeywords(fundName: string): string[] {
  const keywords: string[] = []

  const industryPatterns = [
    '半导体', '芯片', '集成电路', '电子设备', '电子制造', '电子元器件',
    '新能源', '光伏', '锂电', '电池', '储能', '风电', '氢能',
    '医药', '医疗', '生物', '健康', '创新药', '医疗器械',
    '消费', '食品', '饮料', '白酒', '零售', '家电',
    '科技', '互联网', '通信', '计算机', '软件', '云计算', 'AI', '人工智能',
    '金融', '银行', '证券', '保险', '券商',
    '军工', '国防', '航天', '航空',
    '地产', '房地产', '建筑', '建材',
    '汽车', '新能源汽车', '智能汽车',
    '环保', '碳中和', '碳达峰',
    '稀土', '有色', '钢铁', '煤炭', '石油', '化工',
    '农业', '种业', '养殖',
    '物流', '运输', '航空', '铁路',
    '传媒', '娱乐', '游戏', '教育',
    '银行', '证券', '保险', '金融科技',
    '黄金', '贵金属',
    '港股', '美股', '海外', '全球',
    '沪深300', '上证50', '创业板', '中证500', '中证1000', '科创',
    '红利', '价值', '成长', '质量', '低波',
    '基建', '央企', '国企',
    '消费电子', '面板', 'LED', 'OLED',
    '机械', '高端制造', '智能制造',
    '电力', '电网', '特高压',
    '元宇宙', 'NFT', '区块链',
    '半导体材料', '半导体设备',
    '物联网', '车联网',
    '大数据', '数据中心', 'IDC',
    '半导体芯片', '芯片设计', '芯片制造',
    '医药健康', '医疗健康',
    '食品饮料', '餐饮旅游',
    '文化传媒', '体育',
    '环保工程', '水务', '固废',
    '光伏设备', '光伏材料',
    '锂电池', '动力电池',
    '新能源发电', '新能源材料',
    '通信设备', '5G', '光通信',
    '计算机应用', '软件开发', '信息技术',
    '电子元件', 'PCB', '半导体封测',
    '仪器仪表', '检测服务',
    '汽车零部件', '汽车电子',
    '工程机械', '工业机械',
    '化工原料', '化工新材料',
    '煤炭开采', '有色金属', '钢铁行业',
    '银行板块', '证券板块', '保险板块',
    '房地产开发', '物业管理',
    '交通运输', '物流仓储',
    '商业贸易', '电商',
    '纺织服装', '服装家纺',
    '家用电器', '智能家居',
    '农林牧渔', '农产品',
    '国防军工', '军工电子',
    '公用事业', '电力热力',
    '综合', '其他'
  ]

  for (const pattern of industryPatterns) {
    if (fundName.includes(pattern)) {
      keywords.push(pattern)
    }
  }

  return keywords
}

function findMatchedETF(etfList: any[], keywords: string[]): any | null {
  let bestMatch: any = null
  let bestScore = 0

  for (const etf of etfList) {
    let score = 0
    for (const keyword of keywords) {
      if (etf.name.includes(keyword)) {
        score += keyword.length
      }
    }

    if (score > bestScore) {
      bestScore = score
      bestMatch = etf
    }
  }

  return bestMatch
}

// ========== 实时估值API（优化版） ==========

/**
 * 获取基金实时估值（带缓存）
 * [NOTE] 开盘前使用缓存数据，开盘后获取实时数据
 * @param code 基金代码
 * @param forceRefresh 是否强制刷新（忽略缓存）
 */
export async function fetchFundEstimateFast(code: string, forceRefresh: boolean = false): Promise<FundEstimate> {
  const cacheKey = `estimate_${code}`

  const persisted = persistCache.get<FundEstimate>(cacheKey)

  try {
    // 如果强制刷新，先清除缓存
    if (forceRefresh) {
      cache.delete(cacheKey)
      persistCache.delete(cacheKey)
    }

    const holdings = await fetchTopHoldings(code, forceRefresh)

    if (holdings.length === 0) {
      if (persisted) {
        return persisted
      }
      throw new Error('No holdings data')
    }

    const isQDII = await checkIsQDII(code)

    let totalWeight = 0
    let weightedChange = 0
    let validHoldingsCount = 0

    holdings.forEach(h => {
      const weight = parseFloat(h.weight.replace('%', '')) || 0
      const change = h.change || 0

      if (weight > 0 && change !== null && change !== undefined && !isNaN(change)) {
        totalWeight += weight
        weightedChange += weight * change
        validHoldingsCount++
      }
    })

    let estimatedChange: number
    if (totalWeight > 0) {
      estimatedChange = weightedChange / 100
    } else if (validHoldingsCount > 0) {
      const avgChange = weightedChange / validHoldingsCount / 10
      estimatedChange = avgChange
    } else {
      estimatedChange = 0
    }

    if (isQDII) {
      const fxAdjustment = await getFXAdjustment()
      estimatedChange = estimatedChange + fxAdjustment
    }

    const nameCacheKey = `fund_name_${code}`
    const cachedName = cache.get<string>(nameCacheKey)

    // [FIX] 传递 forceRefresh 确保获取最新净值作为计算基准
    const historyResult = await fetchNetValueHistoryFast(code, 1, forceRefresh)
    const latestRecord = historyResult.records.length > 0 ? historyResult.records[0] : null
    const prevNav = latestRecord ? latestRecord.netValue : 0
    const prevNavDate = latestRecord ? latestRecord.date : ''
    const fundName = cachedName || historyResult.fundName || ''

    // [FIX] 如果 prevNav=0（JSONP 获取净值历史失败），不要用 0 计算估值
    // [WHY] prevNav=0 会导致 estimatedNav=0，gsz="0.0000" 被写入 persistCache
    //       之后刷新时 fetchFundAccurateData 拿到 estimate=0，回退到旧净值，市值计算错误
    //       应该返回旧的 persisted 估值（如果有）或抛出错误，避免污染缓存
    if (prevNav <= 0) {
      console.log(`[fetchFundEstimateFast] ${code} prevNav=0（JSONP失败），返回持久化缓存或抛错`)
      if (persisted) {
        return persisted
      }
      throw new Error('Failed to get net value history for estimate calculation')
    }

    if (/ETF/i.test(fundName)) {
      const validChanges = holdings
        .map(h => h.change)
        .filter(c => c !== null && c !== undefined && !isNaN(c))

      if (validChanges.length > 0) {
        const avgChange = validChanges.reduce((sum, c) => sum + c, 0) / validChanges.length
        estimatedChange = avgChange
      }
    }

    const estimatedNav = prevNav * (1 + estimatedChange / 100)

    // [DEBUG] 打印估值计算过程
    console.log('[fetchFundEstimateFast] 估值计算:', {
      code,
      prevNav,
      prevNavDate,
      estimatedChange: estimatedChange.toFixed(2) + '%',
      estimatedNav: estimatedNav.toFixed(4),
      forceRefresh
    })

    const now = new Date()
    const estimateTime = now.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })

    const result: FundEstimate = {
      fundcode: code,
      name: fundName,
      dwjz: prevNav.toFixed(4),
      gsz: estimatedNav.toFixed(4),
      gszzl: estimatedChange.toFixed(2),
      gztime: estimateTime
    }

    cache.set(cacheKey, result, CACHE_TTL.ESTIMATE)
    persistCache.set(cacheKey, result)

    return result
  } catch (err) {
    if (persisted) {
      return persisted
    }
    throw err
  }
}

async function checkIsQDII(code: string): Promise<boolean> {
  const cacheKey = `is_qdii_${code}`
  const cached = cache.get<boolean>(cacheKey)
  if (cached !== undefined) return cached

  const persistCached = persistCache.get<boolean>(cacheKey)
  if (persistCached !== null) {
    cache.set(cacheKey, persistCached, CACHE_TTL.FUND_INFO)
    return persistCached
  }

  return runPingzhongSerialized(() => new Promise((resolve) => {
    const scriptId = `qdii_check_${code}_${Date.now()}`
    const timeout = setTimeout(() => {
      cleanup()
      cache.set(cacheKey, false, CACHE_TTL.FUND_INFO)
      persistCache.set(cacheKey, false)
      resolve(false)
    }, 8000)

    const script = document.createElement('script')
    script.id = scriptId
    script.src = `https://fund.eastmoney.com/pingzhongdata/${code}.js?v=${Date.now()}`
    script.onload = () => {
      cleanup()
      try {
        const fundType = (window as any).Data_fundType || ''
        const isQDII = fundType.includes('QDII') ||
          fundType.includes('qdii') ||
          fundType.includes('海外') ||
          fundType.includes('全球')
        cache.set(cacheKey, isQDII, CACHE_TTL.FUND_INFO)
        persistCache.set(cacheKey, isQDII)
        resolve(isQDII)
      } catch {
        cache.set(cacheKey, false, CACHE_TTL.FUND_INFO)
        persistCache.set(cacheKey, false)
        resolve(false)
      }
    }
    script.onerror = () => {
      cleanup()
      cache.set(cacheKey, false, CACHE_TTL.FUND_INFO)
      persistCache.set(cacheKey, false)
      resolve(false)
    }

    function cleanup() {
      clearTimeout(timeout)
      const s = document.getElementById(scriptId)
      if (s) document.body.removeChild(s)
    }

    document.body.appendChild(script)
  }))
}

async function getFXAdjustment(): Promise<number> {
  const cacheKey = 'fx_adjustment'
  const cached = cache.get<{ value: number; timestamp: number }>(cacheKey)
  if (cached && Date.now() - cached.timestamp < 300000) {
    return cached.value
  }

  try {
    const indices = await fetchGlobalIndices()
    const usdIndex = indices.find(i => i.name === '纳斯达克' || i.name === '标普500')
    if (usdIndex) {
      const adjustment = usdIndex.changePercent * 0.15
      cache.set(cacheKey, { value: adjustment, timestamp: Date.now() }, 300000)
      return adjustment
    }
  } catch { /* ignore */ }

  cache.set(cacheKey, { value: 0, timestamp: Date.now() }, 300000)
  return 0
}

async function fetchOfficialFundEstimate(code: string): Promise<FundEstimate | null> {
  return new Promise((resolve) => {
    const callbackName = `fundgz_${Date.now()}`
    let resolved = false

    const timeout = setTimeout(() => {
      if (!resolved) {
        resolved = true
        try {
          delete (window as any)[callbackName]
          const s = document.getElementById(callbackName)
          if (s) document.body.removeChild(s)
        } catch { /* ignore */ }
        resolve(null)
      }
    }, 5000)

      ; (window as any)[callbackName] = (data: any) => {
        if (resolved) return
        resolved = true
        clearTimeout(timeout)
        try {
          delete (window as any)[callbackName]
          const script = document.getElementById(callbackName)
          if (script) document.body.removeChild(script)
          if (data && data.fundcode === code && data.gszzl !== undefined) {
            resolve({
              fundcode: data.fundcode,
              name: data.name || '',
              dwjz: data.dwjz || '0',
              gsz: data.gsz || '0',
              gszzl: data.gszzl || '0',
              gztime: data.gztime || ''
            })
          } else {
            resolve(null)
          }
        } catch {
          resolve(null)
        }
      }

    const script = document.createElement('script')
    script.id = callbackName
    script.src = `https://fundgz.1234567.com.cn/js/${code}.js?rt=${Date.now()}`
    script.onerror = () => {
      if (!resolved) {
        resolved = true
        clearTimeout(timeout)
        try {
          delete (window as any)[callbackName]
          const s = document.getElementById(callbackName)
          if (s) document.body.removeChild(s)
        } catch { /* ignore */ }
        resolve(null)
      }
    }
    document.body.appendChild(script)
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
 * @param code 基金代码
 * @param days 获取最近N天的数据
 * @param forceRefresh 是否强制刷新（忽略缓存）
 */
export async function fetchNetValueHistoryFast(code: string, days = 30, forceRefresh = false): Promise<{ records: NetValueRecord[], fundName: string }> {
  const cacheKey = `netvalue_${code}_${days}`

  // 如果强制刷新，直接跳过缓存
  if (!forceRefresh) {
    const cached = cache.get<{ records: NetValueRecord[], fundName: string }>(cacheKey)
    if (cached) {
      const tradingDate = getTradingDateStr()
      const latestDate = cached.records[0]?.date
      if (latestDate === tradingDate) {
        return cached
      }
      // [FIX] 交易时间内，只有当缓存包含上一个交易日数据时才使用
      // [WHY] 交易时间内今日净值尚未发布，最新可用的是上一个交易日的净值
      //       如果缓存比上一个交易日还旧（如跨周末/节假日），必须重新获取
      const hour = new Date().getHours()
      if (hour >= 9 && hour < 18) {
        const prevWorkday = getPrevWorkdaySync(tradingDate)
        if (latestDate === prevWorkday) {
          return cached
        }
      }
    }

    const persistCached = persistCache.get<{ records: NetValueRecord[], fundName: string }>(cacheKey)
    if (persistCached && persistCached.records.length > 0) {
      const tradingDate = getTradingDateStr()
      const latestDate = persistCached.records[0]?.date
      if (latestDate === tradingDate) {
        cache.set(cacheKey, persistCached, CACHE_TTL.NET_VALUE)
        return persistCached
      }
      // [FIX] 交易时间内，只有当缓存包含上一个交易日数据时才使用持久化缓存
      // [WHY] 防止跨设备恢复后使用旧缓存导致市值计算错误
      const hour = new Date().getHours()
      if (hour >= 9 && hour < 18) {
        const prevWorkday = getPrevWorkdaySync(tradingDate)
        if (latestDate === prevWorkday) {
          cache.set(cacheKey, persistCached, CACHE_TTL.NET_VALUE)
          return persistCached
        }
      }
    }
  }

  return runPingzhongSerialized(() => new Promise((resolve) => {
    ; (window as any).Data_netWorthTrend = []

    const scriptId = `netvalue_${code}_${Date.now()}`
    const timeout = setTimeout(() => {
      cleanup()
      resolve({ records: [], fundName: '' })
    }, 15000)

    const script = document.createElement('script')
    script.id = scriptId
    script.src = `https://fund.eastmoney.com/pingzhongdata/${code}.js?v=${Date.now()}`

    script.onload = () => {
      cleanup()
      try {
        const trend = (window as any).Data_netWorthTrend || []
        const fundName = (window as any).fS_name || ''

        if (trend.length === 0) {
          // [FIX] 如果API返回空数据，但有缓存数据，返回缓存
          const cached = cache.get<{ records: NetValueRecord[], fundName: string }>(cacheKey)
          if (cached && cached.records.length > 0) {
            resolve(cached)
            return
          }
          const persistCached = persistCache.get<{ records: NetValueRecord[], fundName: string }>(cacheKey)
          if (persistCached && persistCached.records.length > 0) {
            cache.set(cacheKey, persistCached, CACHE_TTL.NET_VALUE)
            resolve(persistCached)
            return
          }
          resolve({ records: [], fundName })
          return
        }

        const recentData = trend.slice(-days)

        const records: NetValueRecord[] = recentData.map((item: any) => {
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

        cache.set(cacheKey, { records, fundName }, CACHE_TTL.NET_VALUE)
        persistCache.set(cacheKey, { records, fundName })
        resolve({ records, fundName })
      } catch (err) {
        resolve({ records: [], fundName: '' })
      }
    }

    script.onerror = () => {
      cleanup()
      resolve({ records: [], fundName: '' })
    }

    function cleanup() {
      clearTimeout(timeout)
      const s = document.getElementById(scriptId)
      if (s) document.body.removeChild(s)
    }

    document.body.appendChild(script)
  }))
}

/**
 * 获取基金当日分时估值数据
 * [WHY] 参考 fund-baby 实现，使用腾讯财经接口
 * [WHAT] 返回每分钟估值数据，用于绘制分时图
 */
export interface IntradayPoint {
  time: string
  value: number
  growth: number
}

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
    const response = await fetch(url)
    if (!response.ok) return null

    const result = await response.json()
    if (result.code === 0 && result.data && Array.isArray(result.data.data)) {
      const { data: list, yesterdayDwjz } = result.data
      const yDwjz = parseFloat(yesterdayDwjz)
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

      // [WHY] 交易时间缓存30秒，非交易时间缓存5分钟
      cache.set(cacheKey, points, isTradingTime ? 30 : 300)
      return points
    }
    return null
  } catch (e) {

    return null
  }
}

// ========== 前十重仓股 ==========

export interface HoldingStock {
  code: string
  name: string
  weight: string
  change: number | null
  market?: string
}

export async function fetchTopHoldings(code: string, forceRefresh: boolean = false): Promise<HoldingStock[]> {
  const cacheKey = `topholdings_${code}`

  // 如果强制刷新，只清除内存缓存，保留持久化缓存
  // [FIX] 持仓结构很少变化，只有用户手动刷新时才需要重新解析
  if (forceRefresh) {
    cache.delete(cacheKey)
    // 注意：不清除 persistCache，让持仓数据保持持久化
  }

  const persisted = persistCache.get<HoldingStock[]>(`topholdings_persist_${code}`)
  if (persisted && persisted.length > 0) {
    const hasDefaultWeights = persisted.some(h => /^(15\.0|13\.5|12\.0|10\.5|9\.0|7\.5|6\.0|4\.5|3\.0|1\.5)%$/.test(h.weight))
    if (hasDefaultWeights) {
      console.log(`[fetchTopHoldings] ${code} - 缓存为默认占比，重新从API获取...`)
      localStorage.removeItem(`fund_topholdings_persist_${code}`)
    } else {
      console.log(`[fetchTopHoldings] ${code} - 使用缓存持仓数据，仅更新股票价格...`)
      const holdings = persisted.map(h => ({ ...h, change: null }))
      const needQuotes = holdings.filter(h => h.market)
      if (needQuotes.length > 0) {
        await fetchStockQuotes(needQuotes)
      }
      return holdings
    }
  }

  console.log(`[fetchTopHoldings] ${code} - 首次获取持仓数据，解析网页中...`)

  const holdingsFromApi = await fetchTopHoldingsFromApi(code)
  if (holdingsFromApi.length > 0) {
    console.log(`[fetchTopHoldings] ${code} - 从网页解析成功，获取${holdingsFromApi.length}只股票`)
    persistCache.set(`topholdings_persist_${code}`, holdingsFromApi)
    const needQuotes = holdingsFromApi.filter(h => h.market)
    if (needQuotes.length > 0) {
      await fetchStockQuotes(needQuotes)
    }
    const persistCacheKey = `topholdings_persist_${code}`
    persistCache.set(persistCacheKey, holdingsFromApi.map(h => ({ ...h })))
    cache.set(cacheKey, holdingsFromApi, CACHE_TTL.NET_VALUE)
    return holdingsFromApi
  }

  console.log(`[fetchTopHoldings] ${code} - 网页解析失败，fallback到pingzhongdata...`)

  const pingzhongData = await runPingzhongSerialized(() => new Promise<{
    stockCodesNew: string[],
    stockCodes: string[],
    fundName: string,
    positions: { code: string; name: string; weight: number }[]
  }>((resolve) => {
    const scriptId = `topholdings_${code}_${Date.now()}`
    const script = document.createElement('script')
    script.id = scriptId
    script.src = `https://fund.eastmoney.com/pingzhongdata/${code}.js?v=${Date.now()}`
    script.onload = () => {
      const s = document.getElementById(scriptId)
      if (s) document.body.removeChild(s)

      const positions: { code: string; name: string; weight: number }[] = []
      const positionData = (window as any).Data_StockPosition

      if (positionData?.series?.[0]?.data) {
        positionData.series[0].data.forEach((item: any) => {
          const posCode = item.code || ''
          const posWeight = parseFloat(item.y || 0) || 0
          positions.push({
            code: posCode,
            name: item.name || '',
            weight: posWeight
          })
        })
      }

      resolve({
        stockCodesNew: (window as any).stockCodesNew || [],
        stockCodes: (window as any).stockCodes || [],
        fundName: (window as any).fS_name || '',
        positions
      })
    }
    script.onerror = () => {
      const s = document.getElementById(scriptId)
      if (s) document.body.removeChild(s)
      resolve({ stockCodesNew: [], stockCodes: [], fundName: '', positions: [] })
    }
    document.body.appendChild(script)
  }))

  const { stockCodesNew, stockCodes, fundName, positions } = pingzhongData

  console.log(`[fetchTopHoldings] ${code} - pingzhongdata返回: stockCodesNew=${stockCodesNew.length}, positions=${positions.length}`)
  if (positions.length > 0) {
    console.log(`[fetchTopHoldings] ${code} - pingzhongdata权重示例: ${positions.slice(0, 3).map(p => `${p.name}(${p.code}) ${p.weight}%`).join(', ')}`)
  }

  if (fundName) {
    const nameCacheKey = `fund_name_${code}`
    cache.set(nameCacheKey, fundName, CACHE_TTL.FUND_DETAIL)
  }

  const positionMap = new Map<string, { name: string; weight: number }>()
  positions.forEach(p => {
    if (p.code) {
      positionMap.set(p.code, { name: p.name, weight: p.weight })
    }
  })

  const holdings: HoldingStock[] = []

  for (let i = 0; i < stockCodesNew.length; i++) {
    const item = String(stockCodesNew[i] || '')
    if (!item) continue

    let cleanCode = ''
    let market = ''
    let mappedCode = ''

    if (item.startsWith('105.')) {
      market = 'us'
      cleanCode = item.substring(4)
      mappedCode = cleanCode
    } else if (item.startsWith('116.')) {
      market = 'hk'
      cleanCode = item.substring(4)
      mappedCode = cleanCode
    } else if (item.startsWith('1.')) {
      market = 'sh'
      cleanCode = item.substring(2)
      mappedCode = cleanCode
    } else if (item.startsWith('0.')) {
      market = 'sz'
      cleanCode = item.substring(2)
      mappedCode = cleanCode
    } else if (/^\d{7}$/.test(item)) {
      cleanCode = item.substring(0, 6)
      market = cleanCode.startsWith('6') || cleanCode.startsWith('9') ? 'sh' : ((cleanCode.startsWith('4') || cleanCode.startsWith('8')) ? 'bj' : 'sz')
      mappedCode = cleanCode
    } else if (/^\d{8}$/.test(item)) {
      const first5 = item.substring(0, 5)
      if (/^0\d{4}$/.test(first5)) {
        cleanCode = first5
        market = 'hk'
        mappedCode = first5
      } else {
        cleanCode = item.substring(0, 6)
        market = cleanCode.startsWith('6') || cleanCode.startsWith('9') ? 'sh' : ((cleanCode.startsWith('4') || cleanCode.startsWith('8')) ? 'bj' : 'sz')
        mappedCode = cleanCode
      }
    } else if (/^[A-Z]+(\d{3})$/.test(item)) {
      const match = item.match(/^([A-Z]+)(\d{3})$/)
      if (match) {
        cleanCode = match[1]
        market = 'us'
        mappedCode = match[1]
      }
    } else if (/^[A-Z]{1,6}$/.test(item)) {
      cleanCode = item
      market = 'us'
      mappedCode = item
    } else if (/^\d{5}$/.test(item)) {
      cleanCode = item
      market = 'hk'
      mappedCode = item
    } else if (/^\d{6}$/.test(item)) {
      cleanCode = item
      market = cleanCode.startsWith('6') || cleanCode.startsWith('9') ? 'sh' : ((cleanCode.startsWith('4') || cleanCode.startsWith('8')) ? 'bj' : 'sz')
      mappedCode = item
    }

    if (cleanCode && market) {
      let weight = ''
      let name = ''

      const positionInfo = positionMap.get(cleanCode)
      if (positionInfo) {
        weight = `${positionInfo.weight}%`
        name = positionInfo.name || ''
      } else if (i < 10) {
        const baseWeight = Math.max(1.5, 15 - i * 1.5)
        weight = `${baseWeight.toFixed(1)}%`
      } else {
        weight = '1.5%'
      }

      holdings.push({
        code: cleanCode,
        name,
        weight,
        change: null,
        market
      })
    }
  }

  if (holdings.length === 0 && stockCodes.length > 0) {
    for (let i = 0; i < stockCodes.length; i++) {
      const item = String(stockCodes[i] || '')
      if (!item) continue

      let cleanCode = item
      let market = ''
      let mappedCode = ''

      if (/^\d{7}$/.test(item)) {
        cleanCode = item.substring(0, 6)
        market = cleanCode.startsWith('6') || cleanCode.startsWith('9') ? 'sh' : ((cleanCode.startsWith('4') || cleanCode.startsWith('8')) ? 'bj' : 'sz')
        mappedCode = cleanCode
      } else if (/^\d{8}$/.test(item)) {
        const first5 = item.substring(0, 5)
        if (/^0\d{4}$/.test(first5)) {
          cleanCode = first5
          market = 'hk'
          mappedCode = first5
        } else {
          cleanCode = item.substring(0, 6)
          market = cleanCode.startsWith('6') || cleanCode.startsWith('9') ? 'sh' : ((cleanCode.startsWith('4') || cleanCode.startsWith('8')) ? 'bj' : 'sz')
          mappedCode = cleanCode
        }
      } else if (/^[A-Z]+(\d{3})$/.test(item)) {
        const match = item.match(/^([A-Z]+)(\d{3})$/)
        if (match) {
          cleanCode = match[1]
          market = 'us'
          mappedCode = match[1]
        }
      } else if (/1$/.test(item)) {
        cleanCode = item.replace(/1$/, '')
        if (/^\d{6}$/.test(cleanCode)) {
          market = cleanCode.startsWith('6') || cleanCode.startsWith('9') ? 'sh' : ((cleanCode.startsWith('4') || cleanCode.startsWith('8')) ? 'bj' : 'sz')
          mappedCode = cleanCode
        } else if (/^\d{5}$/.test(cleanCode)) {
          market = 'hk'
          mappedCode = cleanCode
        } else if (/^[A-Z]{1,6}$/.test(cleanCode)) {
          market = 'us'
          mappedCode = cleanCode
        }
      }

      if ((/^\d{6}$/.test(cleanCode) || /^\d{5}$/.test(cleanCode) || /^[A-Z]{1,6}$/.test(cleanCode)) && !market) {
        if (/^\d{6}$/.test(cleanCode)) {
          market = cleanCode.startsWith('6') || cleanCode.startsWith('9') ? 'sh' : ((cleanCode.startsWith('4') || cleanCode.startsWith('8')) ? 'bj' : 'sz')
        } else if (/^\d{5}$/.test(cleanCode)) {
          market = 'hk'
        } else if (/^[A-Z]{1,6}$/.test(cleanCode)) {
          market = 'us'
        }
        mappedCode = cleanCode
      }

      if ((/^\d{6}$/.test(cleanCode) || /^\d{5}$/.test(cleanCode) || /^[A-Z]{1,6}$/.test(cleanCode)) && market) {
        let weight = ''
        let name = ''

        const positionInfo = positionMap.get(cleanCode)
        if (positionInfo) {
          weight = `${positionInfo.weight}%`
          name = positionInfo.name || ''
        } else if (i < 10) {
          const baseWeight = Math.max(1.5, 15 - i * 1.5)
          weight = `${baseWeight.toFixed(1)}%`
        } else {
          weight = '1.5%'
        }

        holdings.push({
          code: cleanCode,
          name,
          weight,
          change: null,
          market
        })
      }
    }
  }

  const needQuotes = holdings.filter(h => h.market)

  if (needQuotes.length > 0) {
    await fetchStockQuotes(needQuotes)
  }

  const persistCacheKey = `topholdings_persist_${code}`
  persistCache.set(persistCacheKey, holdings.map(h => ({ ...h })))
  cache.set(cacheKey, holdings, CACHE_TTL.NET_VALUE)
  return holdings
}

// [WHAT] 通过 fetch 请求基金持仓页面，解析 HTML 获取重仓股真实占比
// [WHY] pingzhongdata 的 Data_StockPosition 不存在，FundArchivesDatas.aspx 被CORS拦截
//       只能通过 fetch + DOMParser 解析页面 HTML 获取真实占比

async function fetchTopHoldingsFromApi(code: string): Promise<HoldingStock[]> {
  try {
    console.log(`[fetchTopHoldingsFromApi] ${code} - 通过fetch获取持仓页面...`)

    const isDev = import.meta.env.DEV
    const url = `https://fund.eastmoney.com/${code}.html`
    const fetchUrl = isDev ? `/fund-detail/${code}.html` : url

    console.log(`[fetchTopHoldingsFromApi] ${code} - 请求URL: ${fetchUrl}`)

    const response = await fetch(fetchUrl, {
      headers: {
        'Accept': 'text/html',
        'Referer': 'https://fund.eastmoney.com/',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      }
    })
    if (!response.ok) {
      console.log(`[fetchTopHoldingsFromApi] ${code} - fetch失败: ${response.status}`)
      return []
    }
    const html = await response.text()

    console.log(`[fetchTopHoldingsFromApi] ${code} - HTML长度: ${html.length}`)

    if (!html || html.length < 100) {
      console.log(`[fetchTopHoldingsFromApi] ${code} - HTML为空`)
      return []
    }

    const stockHoldingsIndex = html.indexOf('股票持仓')
    if (stockHoldingsIndex === -1) {
      console.log(`[fetchTopHoldingsFromApi] ${code} - 未找到股票持仓部分`)
      return []
    }

    const stockHoldingsSection = html.substring(stockHoldingsIndex, stockHoldingsIndex + 8000)
    const positionSharesIndex = stockHoldingsSection.indexOf('position_shares')
    if (positionSharesIndex === -1) {
      console.log(`[fetchTopHoldingsFromApi] ${code} - 未找到position_shares`)
      return []
    }

    const tableSection = stockHoldingsSection.substring(positionSharesIndex)
    const tableStart = tableSection.indexOf('<table')
    const tableEnd = tableSection.indexOf('</table>')
    if (tableStart === -1 || tableEnd === -1) {
      console.log(`[fetchTopHoldingsFromApi] ${code} - 未找到表格`)
      return []
    }

    const tableHtml = tableSection.substring(tableStart, tableEnd + 8)
    const cleanTableHtml = tableHtml.replace(/[\r\n\t]+/g, ' ')

    const parser = new DOMParser()
    const doc = parser.parseFromString(cleanTableHtml, 'text/html')
    const table = doc.querySelector('table')
    if (!table) {
      console.log(`[fetchTopHoldingsFromApi] ${code} - 解析表格失败`)
      return []
    }

    const rows = table.querySelectorAll('tr')
    const holdings: HoldingStock[] = []

    for (let i = 1; i < rows.length; i++) {
      const row = rows[i]
      const cells = row.querySelectorAll('td')
      if (cells.length < 2) continue

      let stockCode = ''
      let stockName = ''
      let stockWeight = ''
      let market = ''

      const linkCell = cells[0].querySelector('a')
      if (linkCell) {
        const href = linkCell.getAttribute('href') || ''
        const codeMatch = href.match(/\/r\/([^\/]+)$/)
        if (codeMatch) {
          const rawCode = codeMatch[1]
          if (rawCode.startsWith('1.')) {
            stockCode = rawCode.substring(2)
            market = 'sh'
          } else if (rawCode.startsWith('0.')) {
            stockCode = rawCode.substring(2)
            market = 'sz'
          } else if (rawCode.startsWith('116.')) {
            stockCode = rawCode.substring(4)
            market = 'hk'
          } else if (rawCode.startsWith('105.')) {
            stockCode = rawCode.substring(4)
            market = 'us'
          } else {
            stockCode = rawCode
          }
        }
        stockName = linkCell.textContent?.trim() || ''
      }

      if (cells.length >= 2) {
        const weightText = cells[1].textContent?.trim() || ''
        const weightMatch = weightText.match(/([\d.]+)%/)
        if (weightMatch) {
          stockWeight = `${weightMatch[1]}%`
        }
      }

      if (!market && stockCode) {
        if (/^\d{6}$/.test(stockCode)) {
          market = stockCode.startsWith('6') || stockCode.startsWith('9') ? 'sh' : ((stockCode.startsWith('4') || stockCode.startsWith('8')) ? 'bj' : 'sz')
        } else if (/^\d{5}$/.test(stockCode)) {
          market = 'hk'
        } else if (/^[A-Z]{1,6}$/.test(stockCode)) {
          market = 'us'
        }
      }

      if (stockCode && stockName && stockWeight) {
        holdings.push({ code: stockCode, name: stockName, weight: stockWeight, change: null, market })
      }
    }

    console.log(`[fetchTopHoldingsFromApi] ${code} - 解析结果: ${holdings.length}只股票`, holdings.map(h => `${h.name}(${h.code}) ${h.weight}`).join(', '))
    return holdings.slice(0, 10)
  } catch (err: any) {
    console.log(`[fetchTopHoldingsFromApi] ${code} - fetch异常: ${err.message || err}`)
    return []
  }
}

async function fetchStockQuotes(holdings: HoldingStock[]) {
  const cnHoldings = holdings.filter(h => ['sh', 'sz', 'bj'].includes(h.market || '') && !h.change)
  const hkHoldings = holdings.filter(h => h.market === 'hk' && !h.change)
  const usHoldings = holdings.filter(h => h.market === 'us' && !h.change)

  await Promise.all([
    fetchCNStockQuotes(cnHoldings),
    fetchHKStockQuotes(hkHoldings),
    fetchUSStockQuotes(usHoldings)
  ])
}

async function fetchCNStockQuotes(holdings: HoldingStock[]) {
  if (holdings.length === 0) return

  const tencentCodes = holdings.map(h => {
    const cd = String(h.code || '')
    if (h.market === 'sh') return `s_sh${cd}`
    if (h.market === 'sz') return `s_sz${cd}`
    if (h.market === 'bj') return `s_bj${cd}`
    return null
  }).filter(Boolean).join(',')

  if (!tencentCodes) return

  await new Promise<void>((resolve) => {
    const script = document.createElement('script')
    script.src = `https://qt.gtimg.cn/q=${tencentCodes}`
    script.onload = () => {
      holdings.forEach(h => {
        const cd = String(h.code || '')
        let varName = ''
        if (h.market === 'sh') varName = `v_s_sh${cd}`
        else if (h.market === 'sz') varName = `v_s_sz${cd}`
        else if (h.market === 'bj') varName = `v_s_bj${cd}`
        else return

        const dataStr = (window as any)[varName]
        if (dataStr) {
          const parts = dataStr.split('~')
          if (parts.length > 1 && !h.name) {
            h.name = parts[1]
          }
          if (parts.length > 5) {
            h.change = parseFloat(parts[5])
          }
        }
      })
      if (document.body.contains(script)) document.body.removeChild(script)
      resolve()
    }
    script.onerror = () => {
      if (document.body.contains(script)) document.body.removeChild(script)
      resolve()
    }
    document.body.appendChild(script)
  })
}

async function fetchHKStockQuotes(holdings: HoldingStock[]) {
  if (holdings.length === 0) return

  const tencentCodes = holdings.map(h => `s_hk${h.code}`).join(',')

  await new Promise<void>((resolve) => {
    const script = document.createElement('script')
    script.src = `https://qt.gtimg.cn/q=${tencentCodes}`
    script.onload = () => {
      holdings.forEach(h => {
        const varName = `v_s_hk${h.code}`
        const dataStr = (window as any)[varName]
        if (dataStr) {
          const parts = dataStr.split('~')
          if (parts.length > 1 && !h.name) {
            h.name = parts[1]
          }
          if (parts.length > 5) {
            h.change = parseFloat(parts[5])
          }
        }
      })
      if (document.body.contains(script)) document.body.removeChild(script)
      resolve()
    }
    script.onerror = () => {
      if (document.body.contains(script)) document.body.removeChild(script)
      resolve()
    }
    document.body.appendChild(script)
  })

  const missingHk = holdings.filter(h => !h.change)
  if (missingHk.length > 0) {
    await fetchHKQuotesViaEastmoney(missingHk)
  }
}

async function fetchHKQuotesViaEastmoney(holdings: HoldingStock[]) {
  try {
    const secids = holdings.map(h => `116.${h.code}`).join(',')
    const url = `https://push2delay.eastmoney.com/api/qt/ulist.np/get?secids=${secids}&fields=f2,f3,f4,f12,f14`
    const data = await push2Fetch<any>(url, { timeout: 8000 })

    if (data?.data?.diff) {
      data.data.diff.forEach((item: any) => {
        const h = holdings.find(h => h.code === item.f12)
        if (h) {
          if (!h.name) h.name = item.f14
          h.change = item.f3 || 0
        }
      })
    }
  } catch { /* ignore */ }
}

async function fetchUSStockQuotes(holdings: HoldingStock[]) {
  if (holdings.length === 0) return

  const tencentCodes = holdings.map(h => `s_us${h.code}`).join(',')

  await new Promise<void>((resolve) => {
    const script = document.createElement('script')
    script.src = `https://qt.gtimg.cn/q=${tencentCodes}`
    script.onload = () => {
      holdings.forEach(h => {
        const varName = `v_s_us${h.code}`
        const dataStr = (window as any)[varName]
        if (dataStr) {
          const parts = dataStr.split('~')
          if (parts.length > 1 && !h.name) {
            h.name = parts[1]
          }
          if (parts.length > 5) {
            h.change = parseFloat(parts[5])
          }
        }
      })
      if (document.body.contains(script)) document.body.removeChild(script)
      resolve()
    }
    script.onerror = () => {
      if (document.body.contains(script)) document.body.removeChild(script)
      resolve()
    }
    document.body.appendChild(script)
  })

  const missingUs = holdings.filter(h => !h.change)
  if (missingUs.length > 0) {
    await fetchUSQuotesViaEastmoney(missingUs)
  }
}

async function fetchUSQuotesViaEastmoney(holdings: HoldingStock[]) {
  try {
    const secids = holdings.map(h => `105.${h.code}`).join(',')
    const url = `https://push2delay.eastmoney.com/api/qt/ulist.np/get?secids=${secids}&fields=f2,f3,f4,f12,f14`
    const data = await push2Fetch<any>(url, { timeout: 8000 })

    if (data?.data?.diff) {
      data.data.diff.forEach((item: any) => {
        const code = item.f12 || ''
        const h = holdings.find(h => h.code.toUpperCase() === code.toUpperCase())
        if (h) {
          if (!h.name) h.name = item.f14
          h.change = item.f3 || 0
        }
      })
    }
  } catch { /* ignore */ }
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

  // [WHY] 使用沪深300ETF基金代码 510300（华泰柏瑞沪深300ETF）
  // 指数代码 000300 在 pingzhongdata API 上不支持，会读到上一个基金的全局变量
  const hs300Code = '510300'

  return runPingzhongSerialized(() => new Promise((resolve) => {
    // [WHY] 加载前清空全局变量，防止读到上一个基金的数据
    ; (window as any).Data_netWorthTrend = []

    const scriptId = `hs300_${Date.now()}`
    const timeout = setTimeout(() => {
      cleanup()
      console.warn('[fetchHS300History] 加载超时')
      resolve([])
    }, 15000)

    const script = document.createElement('script')
    script.id = scriptId
    script.src = `https://fund.eastmoney.com/pingzhongdata/${hs300Code}.js?v=${Date.now()}`

    script.onload = () => {
      cleanup()
      try {
        const trend = (window as any).Data_netWorthTrend || []

        if (trend.length === 0) {
          resolve([])
          return
        }

        const recentData = trend.slice(-days)

        const records: NetValueRecord[] = recentData.map((item: any) => {
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

        cache.set(cacheKey, records, CACHE_TTL.NET_VALUE)
        resolve(records)
      } catch (err) {
        resolve([])
      }
    }

    script.onerror = () => {
      cleanup()
      console.warn('[fetchHS300History] 脚本加载失败')
      resolve([])
    }

    function cleanup() {
      clearTimeout(timeout)
      const s = document.getElementById(scriptId)
      if (s) document.body.removeChild(s)
    }

    document.body.appendChild(script)
  }))
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
  // 主源：fundgz 估值接口（有实时估值 + 最新公布净值）
  initJsonpCallback()
  const result = await new Promise<{ netValue: number; date: string; changeRate: number } | null>((resolve) => {
    const scriptId = `nav_${code}_${Date.now()}`
    const timeout = setTimeout(() => {
      cleanup()
      const index = pendingNetValueRequests.findIndex(req => req.code === code)
      if (index !== -1) pendingNetValueRequests.splice(index, 1)
      resolve(null)
    }, 8000)

    pendingNetValueRequests.push({ code, resolve, reject: () => { }, timeout })

    function cleanup() {
      const script = document.getElementById(scriptId)
      if (script) document.body.removeChild(script)
    }

    const script = document.createElement('script')
    script.id = scriptId
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
      setTimeout(cleanup, 500)
    }
    document.body.appendChild(script)
  })

  if (result && result.netValue > 0) return result

  // Fallback：pingzhongdata 的 Data_netWorthTrend 取最新净值
  try {
    const history = await fetchNetValueHistoryFast(code, 2, true)
    const latest = history.records[0]
    if (latest && latest.netValue > 0) {
      const prev = history.records[1]
      const changeRate = prev ? ((latest.netValue - prev.netValue) / prev.netValue) * 100 : 0
      console.log(`[fetchLatestNetValue] fundgz失败，pingzhongdata fallback成功: nav=${latest.netValue}, date=${latest.date}`)
      return { netValue: latest.netValue, date: latest.date, changeRate }
    }
  } catch (e) {
    console.warn('[fetchLatestNetValue] pingzhongdata fallback也失败', e)
  }

  return null
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
  dataSource: 'nav' | 'estimate' | 'fallback' | 'local_cache'
  updateTime: string
}

/**
 * 获取基金准确数据（多源验证）
 * [WHY] 同时从估值和净值接口获取，交叉验证确保准确
 * [WHAT] 优先使用公布净值（收盘后），交易时间内使用估值
 * [NOTE] 估值接口和净值接口是同一个 URL，只请求一次
 * @param code 基金代码
 * @param isQDII 是否是QDII基金
 * @param forceRefresh 是否强制刷新（忽略缓存）
 */
export async function fetchFundAccurateData(code: string, isQDII: boolean = false, forceRefresh: boolean = false): Promise<FundAccurateData> {
  const cacheKey = `accurate_${code}`

  // [WHAT] 获取估值数据和历史净值数据
  const [estimateData, historyResult] = await Promise.all([
    fetchFundEstimateFast(code, forceRefresh).catch(() => null),
    fetchNetValueHistoryFast(code, 2, forceRefresh).catch(() => ({ records: [], fundName: '' }))  // 只获取最近 2 天的净值
  ])

  // [DEBUG] 打印获取到的数据
  // console.log('基金数据:', {
  //   code,
  //   isQDII,
  //   estimateData,
  //   historyResult
  // })

  const now = new Date()
  const today = getTradingDateStr(now)
  const currentHour = now.getHours()
  const currentMinute = now.getMinutes()

  // [WHAT] 判断是否在交易时间
  const dayOfWeek = now.getDay()
  // [WHAT] 判断是否是交易日：周一到周五且不是节假日
  const isWeekday = dayOfWeek >= 1 && dayOfWeek <= 5 && !isHolidaySync(today)
  const isTradingHours = (currentHour === 9 && currentMinute >= 30) ||
    (currentHour > 9 && currentHour < 11) ||
    (currentHour === 11 && currentMinute <= 30) ||
    (currentHour >= 13 && currentHour < 15)
  const inTradingTime = isWeekday && isTradingHours

  // console.log(`[交易时间判断] ${code}: dayOfWeek=${dayOfWeek}, isWeekday=${isWeekday}, currentHour=${currentHour}, currentMinute=${currentMinute}, isTradingHours=${isTradingHours}, inTradingTime=${inTradingTime}`)

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
  // 统一使用历史净值，确保导入和刷新使用相同的数据源和日期

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

  // [WHAT] 判断净值日期是否是今日
  const isNavFromToday = navData?.date === today

  // [WHAT] 判断估值是否是今日
  const estimateDate = result.estimateTime?.split(' ')[0]
  const isEstimateFromToday = estimateDate === today

  // [WHAT] 判断净值是否已更新（与holding.ts中的isUpdated逻辑一致）
  // [WHY] QDII基金由于时差问题，净值更新会晚一天，需要判断前一个工作日的净值
  const hasTodayNav = result.nav > 0 && result.navDate === today

  // [WHAT] 计算前一个工作日（用于QDII基金判断）
  // [WHY] 使用节假日API判断，如果是节假日则继续往前推
  const prevWorkday = getPrevWorkdaySync(today)

  const hasPrevWorkdayNavForQDII = isQDII && result.nav > 0 && result.navDate === prevWorkday
  const isNavUpdated = hasTodayNav || hasPrevWorkdayNavForQDII

  // console.log(`[数据源判断] ${code}: isWeekday=${isWeekday}, isNavUpdated=${isNavUpdated}, navDate=${result.navDate}, today=${today}, hasTodayNav=${hasTodayNav}, hasYesterdayNavForQDII=${hasYesterdayNavForQDII}, isQDII=${isQDII}`)
  // console.log(`[数据源判断] ${code}: estimate=${result.estimate}, estimateChange=${result.estimateChange}, estimateTime=${result.estimateTime}, isEstimateFromToday=${isEstimateFromToday}`)

  // [FIX] 根据是否是交易日和净值是否已更新来决定使用估值还是净值
  // [WHY] 交易日：净值已更新用净值，净值未更新用估值
  //       非交易日：使用最新净值
  if (isWeekday && isNavUpdated) {
    // [WHAT] 交易日 + 净值已更新，使用净值
    result.currentValue = result.nav
    result.dayChange = result.navChange
    result.dataSource = 'nav'
  } else if (isWeekday && result.estimate > 0) {
    // [WHAT] 交易日 + 净值未更新，使用估值
    result.currentValue = result.estimate
    // [FIX] 使用最新净值作为基准计算涨跌幅，而不是依赖API的estimateChange
    if (result.nav > 0) {
      result.dayChange = ((result.estimate - result.nav) / result.nav) * 100
    } else {
      result.dayChange = result.estimateChange
    }
    result.dataSource = 'estimate'
  } else if (isWeekday && !isNavUpdated && result.nav > 0) {
    // [FIX] 交易日 + 净值未更新 + 无估值
    // [WHY] 交易时间内估值获取失败时，不能用旧净值覆盖 currentValue
    //       否则会导致市值从 21.6W 变成 17W（用旧净值 2.62 代替估值 3.19）
    //       设置 currentValue=0 让 updateHoldingWithAccurateData 跳过更新，保持之前的数据
    if (inTradingTime) {
      console.log(`[fetchFundAccurateData] ${code} 交易时间内估值失败，跳过更新保持之前数据`)
      result.currentValue = 0
      result.dayChange = 0
      result.dataSource = 'fallback'
    } else {
      // 非交易时间（如盘前），使用上一个净值
      result.currentValue = result.nav
      result.dayChange = result.navChange
      result.dataSource = 'estimate'
    }
  } else if (result.nav > 0) {
    // [WHAT] 非交易日，使用最新净值
    result.currentValue = result.nav
    result.dayChange = result.navChange
    result.dataSource = 'nav'
  } else if (result.estimate > 0) {
    // [EDGE] 无净值但有估值，使用估值
    result.currentValue = result.estimate
    result.dayChange = result.estimateChange
    result.dataSource = 'estimate'
  } else {
    // [EDGE] 无数据可用，按优先级尝试多个fallback
    // 1. 使用estimateData中的dwjz（当前净值）
    const dwjz = parseFloat(estimateData?.dwjz || '0')
    if (dwjz > 0) {
      result.currentValue = dwjz
      result.dayChange = 0
      result.dataSource = 'fallback'
    } else {
      // [FIX] 2. 使用localStorage中保存的净值映射（用于跨设备恢复）
      try {
        const netValuesStr = localStorage.getItem('fund_net_values')
        if (netValuesStr) {
          const netValues = JSON.parse(netValuesStr)
          if (netValues[code] && netValues[code] > 0) {
            result.currentValue = netValues[code]
            result.dayChange = 0
            result.dataSource = 'local_cache'
          }
        }
      } catch (e) {
        // 静默失败
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

  // [WHAT] 腾讯行情代码
  const tencentCodes = [
    { code: 'sh000001', name: '上证指数' },
    { code: 'sz399001', name: '深证成指' },
    { code: 'sz399006', name: '创业板指' },
    { code: 'sh000300', name: '沪深300' },
  ]

  try {
    const results = await new Promise<MarketIndexSimple[]>((resolve, reject) => {
      const scriptId = '__market_indices_fast_' + Date.now()
      const codes = tencentCodes.map(i => i.code).join(',')
      const url = 'https://qt.gtimg.cn/q=' + codes
      const script = document.createElement('script')
      script.id = scriptId
      script.src = url
      script.async = true

      const timeout = setTimeout(() => {
        cleanup()
        reject(new Error('超时'))
      }, 8000)

      const cleanup = () => {
        clearTimeout(timeout)
        const s = document.getElementById(scriptId)
        if (s) {
          s.removeEventListener('load', onLoad)
          s.removeEventListener('error', onError)
          if (s.parentNode) s.parentNode.removeChild(s)
        }
      }

      const onLoad = () => {
        cleanup()
        const list: MarketIndexSimple[] = []
        tencentCodes.forEach(({ code, name }) => {
          const varName = 'v_' + code
          const data = (window as any)[varName]
          if (!data) { delete (window as any)[varName]; return }
          delete (window as any)[varName]

          const parts = data.replace(/^.*?"/, '').replace(/";?\s*$/, '').split('~')
          if (parts.length < 5) return

          const current = parseFloat(parts[3]) || 0
          const prevClose = parseFloat(parts[4]) || 0
          const change = current > 0 && prevClose > 0 ? current - prevClose : 0
          const changePercent = prevClose > 0 ? (change / prevClose) * 100 : 0

          if (current <= 0) return

          list.push({
            code: code.slice(2),
            name,
            current,
            change,
            changePercent
          })
        })
        resolve(list)
      }

      const onError = () => {
        cleanup()
        reject(new Error('加载失败'))
      }

      script.addEventListener('load', onLoad)
      script.addEventListener('error', onError)
      document.head.appendChild(script)
    })

    cache.set(cacheKey, results, CACHE_TTL.MARKET_INDEX)
    return results
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

  // [WHAT] 使用 fund.eastmoney.com JSONP 接口（非 push2）
  return new Promise((resolve) => {
    const callbackName = `rank_fast_${Date.now()}_${Math.random().toString(36).slice(2)}`
    const sortType = 'r'
    const orderStr = order === 1 ? 'desc' : 'asc'
    const url = `https://fund.eastmoney.com/data/rankhandler.aspx?op=ph&dt=kf&ft=all&rs=&gs=0&sc=${sortType}&st=${orderStr}&pi=1&pn=${pageSize}&dx=1&callback=${callbackName}&_=${Date.now()}`

    const timeout = setTimeout(() => {
      cleanup()
      resolve([])
    }, 15000)

      ; (window as any)[callbackName] = (data: any) => {
        cleanup()
        if (!data || !data.Data) {
          resolve([])
          return
        }

        const items: FundRankItemSimple[] = data.Data.map((item: string) => {
          const parts = item.split(',')
          return {
            code: parts[0] || '',
            name: parts[1] || '',
            netValue: parseFloat(parts[4] ?? '0') || 0,
            dayChange: parseFloat(parts[6] ?? '0') || 0
          }
        })

        cache.set(cacheKey, items, 30000)
        resolve(items)
      }

    function cleanup() {
      clearTimeout(timeout)
      delete (window as any)[callbackName]
      const script = document.getElementById(callbackName)
      if (script) document.body.removeChild(script)
    }

    const script = document.createElement('script')
    script.id = callbackName
    script.src = url
    script.onerror = () => {
      cleanup()
      resolve([])
    }
    document.body.appendChild(script)
  })
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
 * 获取全球主要指数行情（腾讯行情接口）
 * [WHY] push2.eastmoney.com 不稳定，改用 qt.gtimg.cn 接口
 * [DEPS] 通过动态 script 标签加载 JSONP 响应
 */
export async function fetchGlobalIndices(): Promise<GlobalIndex[]> {
  const cacheKey = 'global_indices'
  const cached = cache.get<GlobalIndex[]>(cacheKey)
  if (cached) return cached

  // [WHAT] 腾讯行情代码映射
  // PC 端显示日经指数（通过 push2delay 获取），移动端显示国企指数
  const mobile = isMobile()
  const tencentIndices = [
    { code: 'sh000001', name: '上证指数', region: 'cn' as const },
    { code: 'sz399001', name: '深证成指', region: 'cn' as const },
    { code: 'sz399006', name: '创业板指', region: 'cn' as const },
    { code: 'hkHSI', name: '恒生指数', region: 'hk' as const },
    ...(mobile
      ? [{ code: 'hkHSCEI', name: '国企指数', region: 'hk' as const }]
      : []),
    { code: 'hkHSTECH', name: '恒生科技', region: 'hk' as const },
    { code: 'usDJI', name: '道琼斯', region: 'us' as const },
    { code: 'usIXIC', name: '纳斯达克', region: 'us' as const },
    { code: 'usINX', name: '标普500', region: 'us' as const },
  ]

  try {
    const results = await new Promise<GlobalIndex[]>((resolve, reject) => {
      const scriptId = '__global_index_' + Date.now()
      const codes = tencentIndices.map(i => i.code).join(',')
      const url = 'https://qt.gtimg.cn/q=' + codes
      const script = document.createElement('script')
      script.id = scriptId
      script.src = url
      script.async = true

      const timeout = setTimeout(() => {
        cleanup()
        reject(new Error('腾讯行情接口超时'))
      }, 8000)

      const cleanup = () => {
        clearTimeout(timeout)
        const s = document.getElementById(scriptId)
        if (s) {
          s.removeEventListener('load', onLoad)
          s.removeEventListener('error', onError)
          if (s.parentNode) s.parentNode.removeChild(s)
        }
      }

      const onLoad = () => {
        cleanup()
        const list: GlobalIndex[] = []
        tencentIndices.forEach(({ code, name, region }) => {
          const varName = 'v_' + code
          const data = (window as any)[varName]
          if (!data) { delete (window as any)[varName]; return }
          delete (window as any)[varName]

          const parts = data.replace(/^.*?"/, '').replace(/";?\s*$/, '').split('~')
          if (parts.length < 50) return

          const current = parseFloat(parts[3]) || 0
          const prevClose = parseFloat(parts[4]) || 0
          // [WHAT] 用当前价和昨收价计算涨跌额和涨跌幅，避免不同市场字段位置差异
          const change = current > 0 && prevClose > 0 ? current - prevClose : 0
          const changeRate = prevClose > 0 ? (change / prevClose) * 100 : 0

          if (current <= 0) return

          list.push({
            name,
            code,
            price: current,
            change,
            changePercent: changeRate,
            region
          })
        })
        resolve(list)
      }

      const onError = () => {
        cleanup()
        reject(new Error('腾讯行情接口加载失败'))
      }

      script.addEventListener('load', onLoad)
      script.addEventListener('error', onError)
      document.head.appendChild(script)
    })

    // PC 端：通过 push2delay 获取日经225指数并追加
    if (!mobile) {
      try {
        const nikkeiUrl = 'https://push2delay.eastmoney.com/api/qt/stock/get?secid=100.N225&fields=f43,f44,f45,f169,f170,f57,f58'
        const nikkeiData = await push2Fetch<any>(nikkeiUrl, { timeout: 8000 })
        if (nikkeiData?.data?.f43) {
          const current = nikkeiData.data.f43 / 100
          // [WHAT] f169=涨跌额, f170=涨跌幅（已乘100），直接使用，不用昨收盘算
          const change = (nikkeiData.data.f169 || 0) / 100
          const changeRate = (nikkeiData.data.f170 || 0) / 100
          results.push({
            name: '日经225',
            code: 'N225',
            price: current,
            change,
            changePercent: changeRate,
            region: 'asia'
          })
        }
      } catch { /* 忽略日经获取失败 */
      }
    }

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
