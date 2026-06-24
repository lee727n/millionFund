// [WHY] 加密货币相关类型定义
// [WHAT] 定义 CryptoQuote 等接口，用于 CoinGecko API 对接

/**
 * 加密货币行情数据
 * [WHAT] CoinGecko API 返回的加密货币价格数据
 */
export interface CryptoQuote {
  /** CoinGecko ID（如 'bitcoin'） */
  id: string
  /** 交易对符号（如 'BTC'） */
  symbol: string
  /** 名称（如 'Bitcoin'） */
  name: string
  /** 当前价格（USD） */
  usd: number
  /** 当前价格（CNY） */
  cny: number
  /** 24小时涨跌幅（%） */
  usd24hChange: number
  /** 24小时价格变动（USD） */
  usd24hPriceChange: number
  /** 最后更新时间 */
  lastUpdated: string
}

/**
 * CoinGecko API 响应格式
 */
export interface CoinGeckoPriceResponse {
  [coinId: string]: {
    usd?: number
    cny?: number
    usd_24h_change?: number
    last_updated_at?: number
  }
}

/**
 * 常用加密货币 CoinGecko ID 映射
 */
export const SYMBOL_TO_COIN_ID: Record<string, string> = {
  'BTC': 'bitcoin',
  'ETH': 'ethereum',
  'USDT': 'tether',
  'BNB': 'binancecoin',
  'SOL': 'solana',
  'XRP': 'ripple',
  'ADA': 'cardano',
  'DOGE': 'dogecoin',
  'AVAX': 'avalanche-2',
  'DOT': 'polkadot',
  'MATIC': 'matic-network',
  'LINK': 'chainlink',
  'UNI': 'uniswap',
  'ATOM': 'cosmos',
  'LTC': 'litecoin',
  'FIL': 'filecoin',
  'APT': 'aptos',
  'NEAR': 'near',
  'ARB': 'arbitrum',
  'OP': 'optimism'
}

/**
 * 反向映射：CoinGecko ID -> 符号
 */
export const COIN_ID_TO_SYMBOL: Record<string, string> = {}
for (const [symbol, id] of Object.entries(SYMBOL_TO_COIN_ID)) {
  COIN_ID_TO_SYMBOL[id] = symbol
}
