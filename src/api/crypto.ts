// [WHY] 加密货币行情 API，使用 CoinGecko 免费接口
// [WHAT] 支持批量查询加密货币价格，无需 API Key
// [DEPS] CoinGecko 免费 API（速率限制约 10-50 次/分钟）

import type { CryptoQuote, CoinGeckoPriceResponse } from '@/types/crypto'
import { SYMBOL_TO_COIN_ID, COIN_ID_TO_SYMBOL } from '@/types/crypto'
import { logger } from '@/utils/logger'
import { http } from '@/utils/http'
import { ConcurrencyController } from '@/api/fund/request'

// ========== 并发控制 ==========
// [WHY] CoinGecko 免费 API 有速率限制，需要控制并发
const requestConcurrency = new ConcurrencyController(3)

// ========== CoinGecko API ==========

/**
 * CoinGecko 免费 API 基础 URL
 */
const COINGECKO_BASE = 'https://api.coingecko.com/api/v3'

/**
 * 批量查询加密货币价格
 * @param ids CoinGecko ID 数组（如 ['bitcoin', 'ethereum']）
 * @returns Map<coinId, CryptoQuote>
 *
 * @example
 * const prices = await fetchCryptoPrice(['bitcoin', 'ethereum'])
 * const btcPrice = prices.get('bitcoin')?.usd
 */
export async function fetchCryptoPrice(ids: string[]): Promise<Map<string, CryptoQuote>> {
  if (ids.length === 0) return new Map()

  const idsParam = ids.join(',')
  const url = `${COINGECKO_BASE}/simple/price?ids=${idsParam}&vs_currencies=usd,cny&include_24hr_change=true&include_last_updated_at=true`

  return requestConcurrency.execute(async () => {
    try {
      const data = await http.get<CoinGeckoPriceResponse>(url)

      const results = new Map<string, CryptoQuote>()

      for (const [coinId, priceData] of Object.entries(data)) {
        if (!priceData) continue

        const symbol = COIN_ID_TO_SYMBOL[coinId] || coinId.toUpperCase()
        const quote: CryptoQuote = {
          id: coinId,
          symbol,
          name: coinId.charAt(0).toUpperCase() + coinId.slice(1),
          usd: priceData.usd || 0,
          cny: priceData.cny || 0,
          usd24hChange: priceData.usd_24h_change || 0,
          usd24hPriceChange: priceData.usd ? (priceData.usd * (priceData.usd_24h_change || 0)) / 100 : 0,
          lastUpdated: priceData.last_updated_at ? new Date(priceData.last_updated_at * 1000).toISOString() : new Date().toISOString()
        }

        results.set(coinId, quote)
      }

      return results
    } catch (err) {
      logger.error('[crypto] 批量查询加密货币价格失败', { ids, error: err })
      throw err // 直接抛出错误，不降级
    }
  }, 3)
}

/**
 * 查询单个加密货币
 * @param id CoinGecko ID（如 'bitcoin'）或符号（如 'BTC'）
 * @returns CryptoQuote 或 null
 *
 * @example
 * const btc = await fetchSingleCrypto('BTC')
 * const eth = await fetchSingleCrypto('ethereum')
 */
export async function fetchSingleCrypto(id: string): Promise<CryptoQuote | null> {
  // 如果是符号（如 'BTC'），转换为 CoinGecko ID
  const coinId = symbolToCoinId(id)

  try {
    const results = await fetchCryptoPrice([coinId])
    return results.get(coinId) || null
  } catch (err) {
    logger.error('[crypto] 查询单个加密货币失败', { id, coinId, error: err })
    return null
  }
}

/**
 * 将交易对符号（BTC、ETH）转换为 CoinGecko ID
 * @param symbol 交易对符号（如 'BTC'、'ETH'）或 CoinGecko ID（如 'bitcoin'）
 * @returns CoinGecko ID
 *
 * @example
 * symbolToCoinId('BTC')   // => 'bitcoin'
 * symbolToCoinId('ETH')   // => 'ethereum'
 * symbolToCoinId('bitcoin') // => 'bitcoin'（已经是 ID，直接返回）
 */
export function symbolToCoinId(symbol: string): string {
  // 如果已经是 CoinGecko ID（小写，包含连字符），直接返回
  if (symbol === symbol.toLowerCase() && !symbol.includes(' ')) {
    // 检查是否是已知的 CoinGecko ID
    if (COIN_ID_TO_SYMBOL[symbol] || Object.values(SYMBOL_TO_COIN_ID).includes(symbol)) {
      return symbol
    }
  }

  // 转换为大写后查找
  const upperSymbol = symbol.toUpperCase()
  if (SYMBOL_TO_COIN_ID[upperSymbol]) {
    return SYMBOL_TO_COIN_ID[upperSymbol]!
  }

  // 找不到映射，假设输入就是 ID（转小写）
  return symbol.toLowerCase()
}

/**
 * 批量查询加密货币（按符号）
 * @param symbols 交易对符号数组（如 ['BTC', 'ETH', 'SOL']）
 * @returns Map<symbol, CryptoQuote>
 *
 * @example
 * const prices = await fetchCryptoBySymbols(['BTC', 'ETH'])
 * const btcPrice = prices.get('BTC')?.usd
 */
export async function fetchCryptoBySymbols(symbols: string[]): Promise<Map<string, CryptoQuote>> {
  // 转换为 CoinGecko ID
  const ids = symbols.map(s => symbolToCoinId(s))

  try {
    const results = await fetchCryptoPrice(ids)

    // 转换为以符号为 key 的 Map
    const bySymbol = new Map<string, CryptoQuote>()
    for (const [coinId, quote] of results.entries()) {
      const symbol = COIN_ID_TO_SYMBOL[coinId] || quote.symbol
      bySymbol.set(symbol, quote)
    }

    return bySymbol
  } catch (err) {
    logger.error('[crypto] 批量查询加密货币失败', { symbols, error: err })
    throw err
  }
}

/**
 * 获取热门加密货币列表
 * @param limit 数量限制（默认 20）
 * @returns CryptoQuote 数组
 */
export async function fetchTopCrypto(limit = 20): Promise<CryptoQuote[]> {
  const url = `${COINGECKO_BASE}/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=${limit}&page=1&sparkline=false&price_change_percentage=24h`

  try {
    const data = await http.get<any[]>(url)

    return data.map((coin) => ({
      id: coin.id,
      symbol: coin.symbol.toUpperCase(),
      name: coin.name,
      usd: coin.current_price || 0,
      cny: coin.current_price ? coin.current_price * 7.25 : 0, // 粗略汇率
      usd24hChange: coin.price_change_percentage_24h || 0,
      usd24hPriceChange: coin.price_change_24h || 0,
      lastUpdated: new Date().toISOString()
    }))
  } catch (err) {
    logger.error('[crypto] 获取热门加密货币失败', { error: err })
    return []
  }
}
