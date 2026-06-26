// [WHY] 大宗商品/贵金属行情 API，使用新浪财经免费接口
// [WHAT] 获取黄金、白银、原油等大宗商品实时行情数据
// [DEPS] 新浪财经 hq.sinajs.cn

import { getCache, setCache } from '@/api/cache'
import { http } from '@/utils/http'
import type { CommodityQuote, GoldPrice } from '@/types/commodity'
import { logger } from '@/utils/logger'

const CACHE_TTL = 5 // 缓存 5 秒（大宗商品价格变化较快）

// ========== 新浪财经 API 响应解析 ==========

/**
 * 解析新浪财经行情响应文本（大宗商品）
 * [WHAT] 响应格式：var hq_str_Au9999="上海黄金,560.50,2.50,0.45,100,560.00,561.00";
 */
export function parseSinaCommodityResponse(text: string, _symbols: string[]): CommodityQuote[] {
  const results: CommodityQuote[] = []

  // 按行分割，每行对应一个商品的响应
  const lines = text.split('\n').filter(line => line.trim())

  for (const line of lines) {
    // 匹配 var hq_str_xxxx="..." 格式
    const match = line.match(/var hq_str_([^=]+)="([^"]*)"/)
    if (!match) continue

    const symbol = match[1]!
    const dataStr = match[2]!

    if (!dataStr) continue

    const parts = dataStr.split(',')

    // 确保数据足够
    if (parts.length < 7) continue

    const name = parts[0] || ''
    const price = parseFloat(parts[1] || '0') || 0
    const change = parseFloat(parts[2] || '0') || 0
    const changePercent = parseFloat(parts[3] || '0') || 0
    const volume = parseInt(parts[4] || '0') || 0
    const bidPrice = parseFloat(parts[5] || '0') || 0
    const askPrice = parseFloat(parts[6] || '0') || 0

    results.push({
      symbol,
      name,
      price,
      change,
      changePercent,
      volume,
      bidPrice,
      askPrice,
      updateTime: new Date().toISOString()
    })
  }

  return results
}

// ========== 主要 API 函数 ==========

/**
 * 获取大宗商品实时行情（批量查询）
 * [WHAT] 支持同时查询多个大宗商品，逗号分隔代码
 * @param symbols 商品代码数组（如：['Au9999', 'Ag9999']）
 * @returns 大宗商品行情数据数组
 */
export async function fetchCommodityQuote(symbols: string[]): Promise<CommodityQuote[]> {
  if (!symbols || symbols.length === 0) {
    return []
  }

  // 检查缓存
  const cacheKey = `commodity_${symbols.join(',')}`
  const cached = getCache<CommodityQuote[]>(cacheKey)
  if (cached) return cached

  try {
    // 拼接商品代码（逗号分隔）
    const symbolStr = symbols.join(',')
    const url = `https://hq.sinajs.cn/list=${symbolStr}`

    const text = await http.text(url)

    if (!text) {
      throw new Error('新浪财经 API 返回为空')
    }

    const results = parseSinaCommodityResponse(text, symbols)

    // 缓存 5 秒
    setCache(cacheKey, results, CACHE_TTL)

    return results
  } catch (err) {
    logger.error('[commodity] 获取大宗商品行情失败', { symbols, error: err })
    // 返回兜底数据
    return fallbackCommodityQuotes(symbols)
  }
}

/**
 * 获取黄金价格（快捷方法）
 * [WHAT] 获取上海黄金交易所 Au9999 实时价格
 * @returns 黄金价格数据
 */
export async function fetchGoldPrice(): Promise<GoldPrice | null> {
  try {
    const quotes = await fetchCommodityQuote(['Au9999'])

    if (quotes.length === 0) {
      return fallbackGoldPrice()
    }

    const gold = quotes[0]!

    return {
      price: gold.price,
      change: gold.change,
      changePercent: gold.changePercent,
      updateTime: gold.updateTime || new Date().toISOString()
    }
  } catch (err) {
    logger.error('[commodity] 获取黄金价格失败', { error: err })
    return fallbackGoldPrice()
  }
}

/**
 * 获取白银价格（快捷方法）
 * [WHAT] 获取上海黄金交易所 Ag9999 实时价格
 * @returns 白银价格数据
 */
export async function fetchSilverPrice(): Promise<GoldPrice | null> {
  try {
    const quotes = await fetchCommodityQuote(['Ag9999'])

    if (quotes.length === 0) {
      return null
    }

    const silver = quotes[0]!

    return {
      price: silver.price,
      change: silver.change,
      changePercent: silver.changePercent,
      updateTime: silver.updateTime || new Date().toISOString()
    }
  } catch (err) {
    logger.error('[commodity] 获取白银价格失败', { error: err })
    return null
  }
}

/**
 * 获取原油价格（快捷方法）
 * [WHAT] 获取 WTI 原油期货实时价格
 * @returns 原油价格数据
 */
export async function fetchCrudeOilPrice(): Promise<GoldPrice | null> {
  try {
    // CL 是 WTI 原油期货代码（需要带合约月份，如 CL2506）
    const quotes = await fetchCommodityQuote(['CL2506'])

    if (quotes.length === 0) {
      return null
    }

    const oil = quotes[0]!

    return {
      price: oil.price,
      change: oil.change,
      changePercent: oil.changePercent,
      updateTime: oil.updateTime || new Date().toISOString()
    }
  } catch (err) {
    logger.error('[commodity] 获取原油价格失败', { error: err })
    return null
  }
}

// ========== 兜底数据 ==========

/**
 * 大宗商品兜底数据
 */
function fallbackCommodityQuotes(symbols: string[]): CommodityQuote[] {
  const fallbackData: Record<string, CommodityQuote> = {
    'Au9999': {
      symbol: 'Au9999',
      name: '上海黄金',
      price: 560.50,
      change: 2.50,
      changePercent: 0.45,
      volume: 100,
      bidPrice: 560.00,
      askPrice: 561.00,
      updateTime: new Date().toISOString()
    },
    'Ag9999': {
      symbol: 'Ag9999',
      name: '上海白银',
      price: 8200.00,
      change: 50.00,
      changePercent: 0.61,
      volume: 50,
      bidPrice: 8190.00,
      askPrice: 8210.00,
      updateTime: new Date().toISOString()
    },
    'CL2506': {
      symbol: 'CL2506',
      name: 'WTI原油期货',
      price: 78.50,
      change: 0.85,
      changePercent: 1.09,
      volume: 1000,
      bidPrice: 78.45,
      askPrice: 78.55,
      updateTime: new Date().toISOString()
    }
  }

  return symbols
    .map(symbol => fallbackData[symbol])
    .filter((quote): quote is CommodityQuote => quote !== undefined)
}

/**
 * 黄金价格兜底数据
 */
function fallbackGoldPrice(): GoldPrice {
  return {
    price: 560.50,
    change: 2.50,
    changePercent: 0.45,
    updateTime: new Date().toISOString()
  }
}
