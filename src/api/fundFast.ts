// [WHY] 优化版基金API，参考多个开源项目的最佳实践
// [WHAT] 估值、历史净值、搜索、批量请求、并发控制、缓存管理
// [DEPS] 天天基金公开接口
// [NOTE] 职责边界（架构设计 v1.0）：
//   - 本模块负责：估值获取、历史净值、基金搜索、批量请求、并发控制、缓存管理
//   - 不负责：交易日判断（使用 tiantianApi.isTradingTime）、阶段涨幅API（使用 tiantianApi.fetchPeriodReturnExt）
//   - 不允许直接调用 tiantianApi.ts 的复杂函数，必须使用公共模块（http.ts、cache.ts）

import { cache, CACHE_TTL } from './cache'
import { isTradingTime } from './tiantianApi'
import { persistCache } from '../utils/persistCache'
import type { FundEstimate, FundInfo, NetValueRecord } from '@/types/fund'
import { logger } from '@/utils/logger'
import { http } from '@/utils/http'
import { parseJsVariable, ConcurrencyController } from './fund/request'

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
const requestConcurrency = new ConcurrencyController(5)

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
        logger.warn('[fundFast] queueGlobalVarScript failed', { url, error: e })
        finish(emptyResult)
      }
    }

    globalVarScriptQueue.push(runner)
    runNextGlobalVarScript()
  })
}




// ========== 实时估值API（优化版） ==========

/**
 * 获取基金实时估值（带缓存）
 * [NOTE] 开盘前使用缓存数据，开盘后获取实时数据
 * [M6] 迁移到 fetch + 正则解析（移除 JSONP）
 */
export async function fetchFundEstimateFast(code: string): Promise<FundEstimate> {
  const cacheKey = `estimate_${code}`

  // [WHAT] 检查内存缓存
  const cached = cache.get<FundEstimate>(cacheKey)
  if (cached) return Promise.resolve(cached)

  // [WHAT] 获取持久化缓存
  const persisted = persistCache.get<FundEstimate>(cacheKey)

  // [WHAT] 非交易时间直接返回持久化缓存
  if (!isTradingTime() && persisted) {
    cache.set(cacheKey, persisted, CACHE_TTL.ESTIMATE)
    return Promise.resolve(persisted)
  }

  return requestConcurrency.execute(() => {
    return new Promise(async (resolve, reject) => {
      try {
        // [M6] 使用 fetch + 正则解析，替代 JSONP
        // 直接请求外部 API，避免代理 404
        const url = `https://fundgz.eastmoney.com/js/${code}.js?rt=${Date.now()}`
        const text = await http.text(url)

        // 解析 jsonpgz({...}) 格式
        const match = text.match(/jsonpgz\(([\s\S]*)\)/)
        if (!match) {
          // [EDGE] 解析失败时返回持久化缓存或 reject
          if (persisted) {
            cache.set(cacheKey, persisted, CACHE_TTL.ESTIMATE)
            resolve(persisted)
            return
          }
          reject(new Error(`解析估值数据失败: ${code}`))
          return
        }

        const jsonStr = match[1] as string
        const data = JSON.parse(jsonStr)
        const result: FundEstimate = {
          fundcode: data.fundcode || code,
          name: data.name || '',
          gsz: data.gsz || '0',
          gszzl: data.gszzl || '0',
          gztime: data.gztime || '',
          dwjz: data.dwjz || '0',
          jzrq: data.jzrq || '',
        }

        cache.set(cacheKey, result, CACHE_TTL.ESTIMATE)
        persistCache.set(cacheKey, result)
        resolve(result)
      } catch (err) {
        // [EDGE] 失败时返回持久化缓存
        if (persisted) {
          cache.set(cacheKey, persisted, CACHE_TTL.ESTIMATE)
          resolve(persisted)
          return
        }
        reject(err)
      }
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
    } catch (err) {
      logger.error('批量获取估值失败', { code, error: err })
    }
  })

  await Promise.all(promises)
  return results
}

// ========== 估值API别名（与原 fund.ts 兼容） ==========

/** 与 fetchFundEstimateFast 功能一致，保持 API 兼容 */
export function fetchFundEstimate(code: string): Promise<FundEstimate> {
  return fetchFundEstimateFast(code)
}

// ========== 基金列表 & 搜索 ==========

// 基金列表缓存
let _fundListCache: FundInfo[] | null = null

/** 加载全量基金列表（本地 JSON），失败时回退到远程 */
export async function fetchFundList(): Promise<FundInfo[]> {
  if (_fundListCache) return _fundListCache

  const paths = ['./fund-list.json', '/fund-list.json', 'fund-list.json']

  for (const path of paths) {
    try {
      const data = await http.get<FundInfo[]>(path)
      if (Array.isArray(data) && data.length > 0) {
        _fundListCache = data
        return _fundListCache
      }
    } catch (e) {
      logger.warn('[fundFast] 加载本地基金列表失败', { path, error: e })
    }
  }

  // [M6] 已移除 JSONP 降级代码，使用 http.text() + 安全解析
  // 尝试远程接口获取基金列表
  try {
    const url = `/api/fund/fund/js/fundcode_search.js?rt=${Date.now()}`
    const text = await http.text(url)
    // [FIX] 安全解析：用正则提取数组，避免 new Function
    const rMatch = text.match(/var\s+r\s*=\s*(\[[\s\S]*?\])\s*;/)
    if (!rMatch) {
      logger.warn('[fundFast] 无法从响应中提取基金列表')
      return []
    }
    const raw = JSON.parse(rMatch[1])
    if (!Array.isArray(raw)) {
      throw new Error('基金列表数据格式错误')
    }
    _fundListCache = raw.map((item: string[]) => ({
      code: item[0] || '',
      pinyin: item[1] || '',
      name: item[2] || '',
      type: item[3] || ''
    }))
    return _fundListCache!
  } catch (fetchErr) {
    logger.warn('[fundFast] 获取远程基金列表失败，返回空数组', { error: fetchErr })
    return []
  }
}

/** 搜索基金（本地过滤 + 板块关键词映射） */
export async function searchFund(keyword: string, limit = 50): Promise<FundInfo[]> {
  const list = await fetchFundList()
  if (!keyword.trim()) return []
  const kw = keyword.toLowerCase().trim()

  const sectorKeywords: Record<string, string[]> = {
    // === 科技板块 ===
    '半导体': ['半导体', '芯片', '集成电路', '科技', '电子', 'IC', '晶圆'],
    '软件开发': ['软件', '计算机', '信息技术', '科技', '云计算', '数字'],
    '计算机': ['计算机', '软件', '信息', '科技', '数据', '互联网'],
    '人工智能': ['人工智能', 'AI', '智能', '机器人', '科技', '算力'],
    '云计算': ['云计算', '云', '数据中心', '大数据', '科技'],
    '大数据': ['大数据', '数据', '云', '信息', '科技'],
    '物联网': ['物联网', 'IOT', '智能', '信息', '科技'],
    '网络安全': ['网络安全', '安全', '信息安全', '科技'],
    '通信设备': ['通信', '5G', '设备', '网络', '互联网', '信息', '电信', '光纤', '光缆', '基站', '卫星', '移动', '联通', '电信运营'],
    '消费电子': ['消费电子', '电子', '智能', '手机', '科技'],
    '电子元件': ['电子', '元件', '元器件', '科技', '半导体'],

    // === 消费板块 ===
    '白酒': ['白酒', '酒', '消费', '食品饮料', '茅台'],
    '食品饮料': ['食品', '饮料', '消费', '酒', '乳业', '调味品'],
    '家用电器': ['家电', '电器', '消费', '家居', '智能家居'],
    '纺织服装': ['纺织', '服装', '消费', '服饰', '鞋'],
    '商业零售': ['零售', '商业', '消费', '百货', '超市', '电商'],
    '电商': ['电商', '电子商务', '互联网', '消费', '零售'],
    '旅游酒店': ['旅游', '酒店', '餐饮', '消费', '休闲', '服务', '景区', '度假', '民宿', '航空', '出行', '文旅', '免税'],
    '餐饮': ['餐饮', '食品', '消费', '酒店'],
    '教育': ['教育', '培训', '学校', '消费'],
    '美容护理': ['美容', '护理', '化妆品', '消费', '医美'],

    // === 金融板块 ===
    '银行': ['银行', '金融', '理财'],
    '证券': ['证券', '券商', '金融', '投资'],
    '保险': ['保险', '金融', '寿险'],
    '多元金融': ['金融', '信托', '租赁', '投资'],

    // === 医药健康板块 ===
    '医药生物': ['医药', '生物', '医疗', '健康', '制药', '创新药'],
    '中药': ['中药', '医药', '中医', '健康'],
    '医疗器械': ['医疗器械', '器械', '医疗', '医药', '健康'],
    '医疗服务': ['医疗', '医院', '健康', '医药', '服务'],
    '创新药': ['创新药', '医药', '生物', '制药'],

    // === 新能源板块 ===
    '新能源': ['新能源', '光伏', '锂电', '风电', '储能', '电池', '太阳能', '清洁能源'],
    '光伏': ['光伏', '太阳能', '新能源', '组件'],
    '锂电池': ['锂电', '电池', '新能源', '储能', '动力电池'],
    '风电': ['风电', '风能', '新能源', '风机'],
    '储能': ['储能', '电池', '新能源', '能源'],
    '氢能源': ['氢能', '燃料电池', '新能源', '氢'],

    // === 制造业板块 ===
    '汽车': ['汽车', '新能源车', '智能汽车', '车', '整车', '零部件'],
    '新能源汽车': ['新能源车', '电动车', '汽车', '智能汽车'],
    '机械设备': ['机械', '设备', '制造', '工程机械', '自动化'],
    '电气设备': ['电气', '设备', '电力', '输配电'],
    '工程机械': ['工程机械', '机械', '挖掘机', '起重机'],
    '军工': ['军工', '国防', '航空', '航天', '军民融合', '船舶'],
    '航空航天': ['航空', '航天', '飞机', '军工', '卫星'],
    '船舶': ['船舶', '航运', '造船', '军工', '海洋'],

    // === 周期板块 ===
    '钢铁': ['钢铁', '钢', '金属', '有色'],
    '有色金属': ['有色', '金属', '铜', '铝', '锂', '稀土', '黄金'],
    '煤炭': ['煤炭', '能源', '煤', '焦炭'],
    '石油石化': ['石油', '石化', '化工', '油气', '能源'],
    '化工': ['化工', '化学', '材料', '石化'],
    '电子化学品': ['电子', '化学', '化工', '材料', '新材料', '特种', '精细化工', '半导体材料', '光刻胶', '电解液', '正极', '负极'],
    '基础化学': ['化学', '化工', '基础化工'],

    // === 基建地产板块 ===
    '房地产': ['房地产', '地产', '房产', '建筑', '基建', '物业'],
    '建筑': ['建筑', '基建', '工程', '建材', '房地产'],
    '建材': ['建材', '水泥', '玻璃', '建筑', '装修'],
    '装修装饰': ['装修', '装饰', '建材', '家居', '家装', '家电', '地产', '建筑', '房地产', '基建'],
    '基建': ['基建', '基础设施', '建筑', '工程', '铁路', '公路'],

    // === 交通运输板块 ===
    '港口航运': ['港口', '航运', '船舶', '物流', '海运'],
    '航空机场': ['航空', '机场', '飞机', '民航'],
    '铁路公路': ['铁路', '公路', '高铁', '交通'],
    '物流': ['物流', '快递', '仓储', '供应链', '运输'],

    // === 公用事业板块 ===
    '电力': ['电力', '电网', '发电', '能源', '公用事业'],
    '水务': ['水务', '水利', '供水', '环保', '公用事业'],
    '燃气': ['燃气', '天然气', '能源', '公用事业'],
    '环保': ['环保', '环境', '污染治理', '绿色', '碳中和'],

    // === 传媒娱乐板块 ===
    '传媒': ['传媒', '媒体', '广告', '影视', '文化'],
    '游戏': ['游戏', '网游', '手游', '娱乐', '互联网'],
    '影视': ['影视', '电影', '电视', '娱乐', '传媒'],
    '广告': ['广告', '营销', '传媒', '互联网'],

    // === 农业板块 ===
    '农牧饲渔': ['农业', '养殖', '畜牧', '渔业', '饲料', '农产品', '种植', '粮食', '猪', '鸡', '生猪', '肉鸡', '水产', '牧业', '兽药', '动保', '种子', '化肥', '农药'],
    '种植业': ['种植', '农业', '粮食', '农产品', '种子'],
    '养殖业': ['养殖', '畜牧', '猪', '鸡', '农业'],

    // === 其他板块 ===
    '造纸印刷': ['造纸', '印刷', '纸业', '包装', '纸', '林业', '木材', '森林', '浆纸', '纸板', '出版'],
    '纺织': ['纺织', '服装', '棉', '丝绸'],
    '贵金属': ['贵金属', '黄金', '白银', '金', '银'],
    '稀土': ['稀土', '稀有金属', '有色']
  }

  const mappedKeywords = sectorKeywords[kw]

  const results = list.filter(
    (item) =>
      item.code.includes(kw) ||
      item.name.toLowerCase().includes(kw) ||
      item.pinyin.toLowerCase().includes(kw)
  )

  if (mappedKeywords) {
    const keywordResults = list.filter((item) => {
      const name = item.name.toLowerCase()
      return mappedKeywords.some((k) => name.includes(k.toLowerCase()))
    })
    const existingCodes = new Set(results.map((r) => r.code))
    keywordResults.forEach((item) => {
      if (!existingCodes.has(item.code)) {
        results.push(item)
        existingCodes.add(item.code)
      }
    })
  }

  if (results.length < 10 && kw.length >= 2 && !mappedKeywords) {
    const chars = kw.split('')
    const charResults = list.filter((item) => {
      const name = item.name.toLowerCase()
      const matchCount = chars.filter((c) => name.includes(c)).length
      return matchCount >= Math.min(2, chars.length)
    })
    const existingCodes = new Set(results.map((r) => r.code))
    charResults.forEach((item) => {
      if (!existingCodes.has(item.code)) {
        results.push(item)
        existingCodes.add(item.code)
      }
    })
  }

  return results.slice(0, limit)
}

// ========== 历史净值API（使用JSONP避免跨域） ==========

/**
 * 获取历史净值（带缓存，使用pingzhongdata接口）
 * [WHY] 使用JSONP方式避免CORS问题
 */
export async function fetchNetValueHistoryFast(code: string, days = 30): Promise<{ records: NetValueRecord[], fundName: string }> {
  const cacheKey = `netvalue_${code}_${days}`
  const cached = cache.get<{ records: NetValueRecord[], fundName: string }>(cacheKey)
  if (cached) return cached

  // [M6] 迁移到 fetch + new Function（替代 JSONP）
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
      logger.warn('[fundFast] JSON.parse 解析 Data_netWorthTrend 失败，尝试清理后重试', { code, error: parseErr })
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
        logger.warn('[fundFast] 清理后仍解析失败', { code, error: cleanErr })
      }
    }
  }

  const result = { records, fundName }
  cache.set(cacheKey, result, CACHE_TTL.NET_VALUE)
  return result
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

      // [WHY] 交易时间缓存30秒，非交易时间缓存5分钟
      cache.set(cacheKey, points, isTradingTime ? 30 : 300)
      return points
    }
    return null
  } catch (e) {
    logger.error('获取分时数据失败', { code, error: e })
    return null
  }
}

// ========== 前十重仓股 ==========

export interface HoldingStock {
  code: string
  name: string
  weight: string
  change: number | null
}

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
              logger.warn('[fundFast] 获取股票行情失败，跳过', { url: qtUrl })
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
      logger.warn('[fundFast] 基金详情数据格式错误', { code })
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
    logger.warn('[fundFast] fetchFundBasicInfo 失败', { code, error: fetchErr })
    return null
  }
}

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
      logger.warn('[fundFast] 解析最新净值失败', { code })
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
    logger.error('[fundFast] 获取最新净值失败', { code, error: err })
    return null
  }
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
    logger.warn('[fundFast] 获取大盘指数失败', e)
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
    logger.warn('[fundFast] fetchGlobalIndices 失败', { error: err })
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
