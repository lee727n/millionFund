// [WHY] 全局缓存管理器，参考 fishing-funds 的缓存策略
// [WHAT] 提供内存缓存，避免重复请求，提升加载速度
// [REF] v1.10: 缓存键版本化 - 不同版本使用不同命名空间，防版本升级冲突

import { APP_VERSION } from '@/config/version'

interface CacheItem<T> {
  data: T
  timestamp: number
  ttl: number  // 生存时间(ms)
}

class CacheManager {
  private cache = new Map<string, CacheItem<any>>()
  private version: string

  constructor() {
    this.version = APP_VERSION
  }

  private getVersionedKey(key: string): string {
    return `v${this.version}:${key}`
  }
  
  set<T>(key: string, data: T, ttlMs = 30000): void {
    this.cache.set(this.getVersionedKey(key), {
      data,
      timestamp: Date.now(),
      ttl: ttlMs
    })
  }
  
  get<T>(key: string): T | null {
    const item = this.cache.get(this.getVersionedKey(key))
    if (!item) return null
    
    if (Date.now() - item.timestamp > item.ttl) {
      this.cache.delete(this.getVersionedKey(key))
      return null
    }
    
    return item.data as T
  }
  
  has(key: string): boolean {
    return this.get(key) !== null
  }
  
  delete(key: string): void {
    this.cache.delete(this.getVersionedKey(key))
  }
  
  clear(): void {
    this.cache.clear()
  }

  clearOldVersions(): void {
    const currentPrefix = `v${this.version}:`
    const keysToDelete: string[] = []
    for (const key of this.cache.keys()) {
      if (!key.startsWith(currentPrefix)) {
        keysToDelete.push(key)
      }
    }
    keysToDelete.forEach(key => this.cache.delete(key))
  }
  
  get size(): number {
    const currentPrefix = `v${this.version}:`
    let count = 0
    for (const key of this.cache.keys()) {
      if (key.startsWith(currentPrefix)) count++
    }
    return count
  }

  getTotalSize(): number {
    return this.cache.size
  }
}

export const cache = new CacheManager()

// [WHAT] 兼容 utils/cache 的接口（秒级 TTL）
export function getCache<T>(key: string): T | undefined {
  return cache.get<T>(key) ?? undefined
}

export function setCache<T>(key: string, data: T, ttlSeconds: number): void {
  cache.set(key, data, ttlSeconds * 1000)
}

export function clearCache(): void {
  cache.clear()
}

export function removeCache(key: string): void {
  cache.delete(key)
}

// [WHAT] 缓存TTL常量（秒级刷新优化）
export const CACHE_TTL = {
  ESTIMATE: 800,        // 实时估值 0.8秒（秒级刷新）
  NET_VALUE: 60000,     // 历史净值 1分钟
  FUND_LIST: 3600000,   // 基金列表 1小时
  FUND_DETAIL: 300000,  // 基金详情 5分钟
  MARKET_INDEX: 3000,   // 大盘指数 3秒
  FUND_INFO: 300000,    // 基金/经理信息 5分钟
  SHORT: 60000,         // 短期缓存 1分钟
  LONG: 3600000,        // 长期缓存 1小时
}
