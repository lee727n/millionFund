// [WHY] 多资产行情统一入口 - 把各市场 API 归一化为统一的行情结构
// [WHAT] 供 AssetQuote.vue 等 UI 复用，兑现"全品种资产管理"定位
// [NOTE] 各 API 返回结构不同，这里用 Record<string, unknown> 做安全映射，
//        避免引入 any 关键字，同时容忍字段差异

import { fetchSingleAStock } from '@/api/astock'
import { fetchSingleHKStock } from '@/api/hkstock'
import { fetchSingleUSStock } from '@/api/usstock'
import { fetchSingleCrypto } from '@/api/crypto'
import { fetchBondQuote } from '@/api/bond'
import { fetchForexRate } from '@/api/forex'
import { fetchFutureRealtime } from '@/api/future'
import { fetchCommodityQuote } from '@/api/commodity'

/** 归一化后的行情结构（UI 统一消费） */
export interface NormalizedQuote {
  symbol: string
  name: string
  price: number
  change: number
  changePercent: number
  currency: string
  open?: number
  high?: number
  low?: number
  prevClose?: number
  volume?: number
  amount?: number
  extra?: Record<string, string | number>
}

/** 单个资产市场定义 */
export interface AssetDef {
  type: string
  label: string
  codeHint: string
  examples: string[]
  currency: string
  /** 单标的查询，返回归一化行情；失败或无数据返回 null */
  fetchQuote: (_code: string) => Promise<NormalizedQuote | null>
}

/** 安全的字段读取：把 API 结果当作未知键值对象读取 */
type AnyRec = Record<string, unknown>

function num(v: unknown): number {
  return typeof v === 'number' && !Number.isNaN(v) ? v : 0
}
function str(v: unknown, fallback = ''): string {
  return typeof v === 'string' ? v : fallback
}

export const ASSET_REGISTRY: Record<string, AssetDef> = {
  astock: {
    type: 'astock',
    label: 'A股',
    codeHint: '输入代码，如 sh600519 / sz000001',
    examples: ['sh600519', 'sz000001', 'sh601318'],
    currency: '¥',
    async fetchQuote(code) {
      const q = await fetchSingleAStock(code)
      if (!q) return null
      const r = q as unknown as AnyRec
      return {
        symbol: str(r.symbol),
        name: str(r.name),
        price: num(r.currentPrice),
        change: num(r.change),
        changePercent: num(r.changePercent),
        currency: '¥',
        open: num(r.open),
        high: num(r.high),
        low: num(r.low),
        prevClose: num(r.prevClose),
        volume: num(r.volume),
        amount: num(r.amount),
      }
    },
  },
  hkstock: {
    type: 'hkstock',
    label: '港股',
    codeHint: '输入代码，如 hk00700 / hk09988',
    examples: ['hk00700', 'hk09988', 'hk03690'],
    currency: 'HK$',
    async fetchQuote(code) {
      const q = await fetchSingleHKStock(code)
      if (!q) return null
      const r = q as unknown as AnyRec
      return {
        symbol: str(r.symbol),
        name: str(r.name),
        price: num(r.currentPrice),
        change: num(r.change),
        changePercent: num(r.changePercent),
        currency: 'HK$',
        open: num(r.open),
        high: num(r.high),
        low: num(r.low),
        prevClose: num(r.prevClose),
        volume: num(r.volume),
        amount: num(r.amount),
      }
    },
  },
  usstock: {
    type: 'usstock',
    label: '美股',
    codeHint: '输入代码，如 AAPL / TSLA',
    examples: ['AAPL', 'TSLA', 'NVDA'],
    currency: '$',
    async fetchQuote(code) {
      const q = await fetchSingleUSStock(code)
      if (!q) return null
      const r = q as unknown as AnyRec
      return {
        symbol: str(r.symbol),
        name: str(r.name),
        price: num(r.currentPrice),
        change: num(r.change),
        changePercent: num(r.changePercent),
        currency: str(r.currency, 'USD'),
        open: num(r.open),
        high: num(r.high),
        low: num(r.low),
        prevClose: num(r.prevClose),
        volume: num(r.volume),
        amount: num(r.amount),
        extra: r.marketState ? { 市场状态: str(r.marketState) } : undefined,
      }
    },
  },
  crypto: {
    type: 'crypto',
    label: '加密货币',
    codeHint: '输入符号或 CoinGecko ID，如 BTC / ETH / bitcoin',
    examples: ['BTC', 'ETH', 'bitcoin'],
    currency: '$',
    async fetchQuote(code) {
      const q = await fetchSingleCrypto(code)
      if (!q) return null
      const r = q as unknown as AnyRec
      const usd = num(r.usd)
      const chgPct = num(r.usd24hChange)
      return {
        symbol: str(r.symbol),
        name: str(r.name),
        price: usd,
        change: (chgPct / 100) * usd,
        changePercent: chgPct,
        currency: 'USD',
        extra: typeof r.cny === 'number' ? { CNY: (r.cny as number).toFixed(2) } : undefined,
      }
    },
  },
  bond: {
    type: 'bond',
    label: '可转债',
    codeHint: '输入可转债代码，如 113050',
    examples: ['113050', '113619', '123111'],
    currency: '¥',
    async fetchQuote(code) {
      const q = await fetchBondQuote(code)
      if (!q) return null
      const r = q as unknown as AnyRec
      return {
        symbol: str(r.code, code),
        name: str(r.name),
        price: num(r.price) || num(r.currentPrice),
        change: num(r.change),
        changePercent: num(r.changePercent),
        currency: '¥',
        extra: r.bondType ? { 类型: str(r.bondType) } : undefined,
      }
    },
  },
  forex: {
    type: 'forex',
    label: '外汇',
    codeHint: '输入货币对，如 USD/CNY / EUR/USD',
    examples: ['USD/CNY', 'EUR/USD', 'USD/JPY'],
    currency: '',
    async fetchQuote(code) {
      const q = await fetchForexRate(code)
      if (!q) return null
      const r = q as unknown as AnyRec
      return {
        symbol: str(r.pair, code),
        name: str(r.pair, code),
        price: num(r.rate),
        change: num(r.change),
        changePercent: num(r.changePercent),
        currency: '',
        extra: r.time ? { 时间: str(r.time) } : undefined,
      }
    },
  },
  future: {
    type: 'future',
    label: '期货',
    codeHint: '输入合约代码，如 GC2506 / CL2506',
    examples: ['GC2506', 'CL2506', 'cu2506'],
    currency: '',
    async fetchQuote(code) {
      const q = await fetchFutureRealtime(code)
      if (!q) return null
      const r = q as unknown as AnyRec
      return {
        symbol: str(r.symbol),
        name: str(r.name),
        price: num(r.price),
        change: num(r.change),
        changePercent: num(r.changeRate),
        currency: '',
        open: num(r.open),
        high: num(r.high),
        low: num(r.low),
        volume: num(r.volume),
        extra: typeof r.openInterest === 'number' ? { 持仓: r.openInterest } : undefined,
      }
    },
  },
  commodity: {
    type: 'commodity',
    label: '大宗商品',
    codeHint: '输入商品代码，如 Au9999 / Ag9999',
    examples: ['Au9999', 'Ag9999', 'BRENT'],
    currency: '¥',
    async fetchQuote(code) {
      const list = await fetchCommodityQuote([code])
      const q = list[0]
      if (!q) return null
      const r = q as unknown as AnyRec
      return {
        symbol: str(r.symbol),
        name: str(r.name),
        price: num(r.price),
        change: num(r.change),
        changePercent: num(r.changePercent),
        currency: '¥',
        volume: num(r.volume),
        extra:
          typeof r.bidPrice === 'number' || typeof r.askPrice === 'number'
            ? { 买一: num(r.bidPrice), 卖一: num(r.askPrice) }
            : undefined,
      }
    },
  },
}

export const ASSET_LIST: AssetDef[] = Object.values(ASSET_REGISTRY)
