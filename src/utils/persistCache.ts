// [WHY] 持久化缓存模块，支持版本控制 + TTL 过期
// [WHAT] 替代 tiantianApi.ts 中的 persistCache，数据格式 { v, ts, ttl, data }
// [DEPS] 使用 localStorage，未来可迁至 IndexedDB（保持同步 API 不变）

const SCHEMA_VERSION = 1

interface CacheEntry<T> {
  v: number
  ts: number
  ttl: number
  data: T
}

/**
 * [WHAT] 带版本 + TTL 的持久化缓存
 *        读取时自动校验版本和过期时间，失效则清除并返回 null
 *
 *  版本号规则：SCHEMA_VERSION +1 时，所有旧缓存自动失效
 *  TTL 默认值：24 小时（86400000 ms）
 */
export const persistCache = {
  get<T>(key: string, validator?: (_data: T) => boolean): T | null {
    try {
      const raw = localStorage.getItem(`fund_${key}`)
      if (!raw) return null

      const entry: CacheEntry<T> = JSON.parse(raw)

      // 版本不匹配 → 旧格式或旧版本，直接失效
      if (entry.v !== SCHEMA_VERSION) {
        localStorage.removeItem(`fund_${key}`)
        return null
      }

      // TTL 过期 → 自动清除
      if (Date.now() - entry.ts > entry.ttl) {
        localStorage.removeItem(`fund_${key}`)
        return null
      }

      // 自定义校验（可选，如数据格式升级后做额外检查）
      if (validator && !validator(entry.data)) {
        localStorage.removeItem(`fund_${key}`)
        return null
      }

      return entry.data
    } catch {
      return null
    }
  },

  set<T>(key: string, data: T, ttlMs = 86400000): void {
    try {
      const entry: CacheEntry<T> = {
        v: SCHEMA_VERSION,
        ts: Date.now(),
        ttl: ttlMs,
        data,
      }
      localStorage.setItem(`fund_${key}`, JSON.stringify(entry))
    } catch {
      /* localStorage 满或禁用，静默失败 */
    }
  },

  delete(key: string): void {
    try {
      localStorage.removeItem(`fund_${key}`)
    } catch {
      /* ignore */
    }
  },

  clear(): void {
    try {
      const keysToRemove: string[] = []
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i)
        if (key?.startsWith('fund_')) {
          keysToRemove.push(key)
        }
      }
      keysToRemove.forEach(k => localStorage.removeItem(k))
    } catch {
      /* ignore */
    }
  },
}

/**
 * [WHAT] 获取当前缓存 schema 版本号（供外部在迁移时参考）
 */
export function getCacheSchemaVersion(): number {
  return SCHEMA_VERSION
}
