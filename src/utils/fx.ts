// [WHY] 汇率换算模块 - 支持多币种资产统一换算为人民币，用于跨市场资产汇总
// [WHAT] 提供汇率获取、localStorage 缓存（1小时 TTL）、币种转换与格式化能力
// [DEPS] 使用 exchangerate-api 免费接口获取 USD 基准汇率，失败时回退到兜底数据

import { http } from '@/utils/http'
import { logger } from '@/utils/logger'

/**
 * 货币类型
 */
export type Currency = 'CNY' | 'USD' | 'HKD'

/**
 * 汇率记录
 */
export interface ExchangeRate {
  /** 源货币 */
  from: Currency
  /** 目标货币 */
  to: Currency
  /** 汇率（1 from = rate to） */
  rate: number
  /** 更新时间戳（ms） */
  updatedAt: number
}

// [WHAT] 兜底汇率（USD 基准）：1 USD = X 目标货币
// [EDGE] API 不可用或网络异常时使用，保证基础功能可用
const FALLBACK_RATES: Record<Currency, number> = {
  USD: 1,
  CNY: 7.25,
  HKD: 7.79,
}

const CACHE_KEY = 'fx_rates_v1'
const CACHE_TTL = 60 * 60 * 1000 // 1 小时

const API_URL = 'https://api.exchangerate-api.com/v4/latest/USD'

/**
 * 汇率管理器
 * [WHAT] 负责汇率获取、缓存与币种换算
 * [NOTE] rates 以 USD 为基准存储：rates.get('CNY') 表示 1 USD = ? CNY
 *        换算公式：amount * (rateOf(to) / rateOf(from))
 */
export class FxManager {
  private rates: Map<string, number> = new Map()
  private lastUpdated: number = 0

  constructor() {
    this.loadFromCache()
  }

  /**
   * 从 localStorage 加载缓存汇率
   * [EDGE] 缓存过期、损坏或 localStorage 不可用时静默丢弃
   */
  private loadFromCache(): void {
    if (typeof localStorage === 'undefined') return
    try {
      const raw = localStorage.getItem(CACHE_KEY)
      if (!raw) return
      const data = JSON.parse(raw) as { rates: Record<string, number>; updatedAt: number }
      if (!data || typeof data.updatedAt !== 'number') return
      // [EDGE] 超过 TTL 视为过期，不加载
      if (Date.now() - data.updatedAt > CACHE_TTL) return
      this.rates = new Map(Object.entries(data.rates))
      this.lastUpdated = data.updatedAt
    } catch (e) {
      logger.warn('[fx] 加载缓存汇率失败', (e as Error)?.message)
    }
  }

  /**
   * 写入缓存
   */
  private saveToCache(): void {
    if (typeof localStorage === 'undefined') return
    try {
      const payload = {
        rates: Object.fromEntries(this.rates),
        updatedAt: this.lastUpdated,
      }
      localStorage.setItem(CACHE_KEY, JSON.stringify(payload))
    } catch (e) {
      logger.warn('[fx] 保存缓存汇率失败', (e as Error)?.message)
    }
  }

  /**
   * 应用兜底汇率
   */
  private applyFallbackRates(): void {
    this.rates = new Map(Object.entries(FALLBACK_RATES))
    this.lastUpdated = Date.now()
  }

  /**
   * 获取最新汇率
   * [WHAT] 从 exchangerate-api 获取 USD 基准汇率，失败时回退到兜底数据
   * [EDGE] 缓存未过期时直接跳过请求
   */
  async fetchRates(): Promise<void> {
    // 缓存未过期则跳过
    if (this.lastUpdated && Date.now() - this.lastUpdated < CACHE_TTL) {
      return
    }

    try {
      const response = await http.get<{ rates: Record<string, number> }>(API_URL)

      if (response?.rates) {
        const cny = response.rates.CNY
        const hkd = response.rates.HKD
        if (typeof cny === 'number' && typeof hkd === 'number' && cny > 0 && hkd > 0) {
          this.rates = new Map([
            ['USD', 1],
            ['CNY', cny],
            ['HKD', hkd],
          ])
          this.lastUpdated = Date.now()
          this.saveToCache()
          return
        }
      }

      // 数据不完整，使用兜底
      this.applyFallbackRates()
      this.saveToCache()
    } catch (e) {
      logger.warn('[fx] 获取汇率失败，使用兜底数据', (e as Error)?.message)
      this.applyFallbackRates()
      this.saveToCache()
    }
  }

  /**
   * 获取 from → to 的汇率
   * [WHAT] 返回 1 from = ? to 的换算比率
   * [EDGE] 未加载汇率时使用兜底数据，确保返回有效数值
   */
  getRate(from: Currency, to: Currency): number {
    const fromRate = this.rates.get(from) ?? FALLBACK_RATES[from]
    const toRate = this.rates.get(to) ?? FALLBACK_RATES[to]
    if (!fromRate || !toRate || fromRate === 0) return 0
    return toRate / fromRate
  }

  /**
   * 换算金额
   * [WHAT] 将 amount 从 from 币种换算为 to 币种
   */
  convert(amount: number, from: Currency, to: Currency): number {
    return amount * this.getRate(from, to)
  }
}

// 单例
export const fxManager = new FxManager()

/**
 * 换算为人民币
 * [WHAT] 便捷函数，将外币金额换算为人民币
 */
export function convertToCNY(amount: number, from: Currency): number {
  return fxManager.convert(amount, from, 'CNY')
}

/**
 * 格式化货币展示
 * [WHAT] 根据币种添加对应符号，保留2位小数
 */
export function formatCurrency(amount: number, currency: Currency): string {
  const symbols: Record<Currency, string> = {
    CNY: '¥',
    USD: '$',
    HKD: 'HK$',
  }
  const symbol = symbols[currency]
  if (isNaN(amount)) return `${symbol}--`
  return `${symbol}${amount.toFixed(2)}`
}
