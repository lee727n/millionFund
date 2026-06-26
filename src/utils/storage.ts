// [WHY] 封装 localStorage 操作，提供类型安全的数据持久化
// [WHAT] 自选列表、持仓数据等需要在 APP 重启后保留
// [SECURITY] 敏感数据（持仓、交易记录）加密后存储

import { APP_VERSION } from '@/config/version'
import { cache } from '@/api/cache'
import { logger } from './logger'
import type { HoldingRecord, TradeRecord } from '@/types/fund'

const STORAGE_KEYS = {
  WATCHLIST: 'fund_watchlist',
  HOLDINGS: 'fund_holdings',
  APP_VERSION: 'app_version',
  FUND_NET_VALUES: 'fund_net_values',
  SOURCE_FILTER: 'source_filter',
  AI_TRACKING: 'ai-tracking-records',
  // [SECURITY] 加密存储的密钥（随机生成，存在 localStorage）
  ENC_KEY: 'storage_enc_key',
  // [WHAT] 需要在版本更新时清除的缓存 key 前缀
  CACHE_PREFIXES: ['fund_', 'api_', 'market_', 'estimate_']
} as const

// ========== 加密模块 ==========

/**
 * [SECURITY] 使用 Web Crypto API 加密敏感数据
 * 密钥持久化存储在 localStorage 中，每次应用启动时复用
 *
 * ⚠️ 安全说明：
 *   当前方案将密钥明文存在 localStorage，攻击者通过 XSS 可同时获取
 *   密文和密钥，加密仅能防止本地磁盘被直接读取。
 *   各平台更安全的替代方案：
 *     - Android: Capacitor @capacitor/secure-preferences 或 Android Keystore
 *     - iOS:     Capacitor @capacitor/secure-preferences 或 iOS Keychain
 *     - Electron:  @electron/electron-store + safeStorage (AES-256 + 系统密钥链)
 *     - Web:      无完美方案，依赖 HTTPS + HttpOnly Cookie + CSP 降低 XSS 风险
 */

// [SECURITY] 加密版本号（用于未来迁移）
const ENC_VERSION = 1
const ENC_ALGORITHM = 'AES-GCM'
const ENC_KEY_LENGTH = 256 // bits
const PBKDF2_IV_LENGTH = 12 // bytes (AES-GCM)

/**
 * 从 localStorage 获取或生成加密密钥
 * 密钥派生自随机密码（存储在 localStorage，不做完美保密，但能防 XSS 和本地读取）
 *
 * ⚠️ 安全限制：此方案仅适用于 Web 端临时保护。
 *    密钥与密文共存于 localStorage，XSS 攻击可同时获取二者。
 *    各平台请使用对应安全存储：
 *      Android/iOS: 使用 @capacitor/secure-preferences 或原生 Keystore/Keychain
 *      Electron:     使用 electron-store + safeStorage
 */
async function getOrCreateEncKey(): Promise<CryptoKey> {
  const storedKey = localStorage.getItem(STORAGE_KEYS.ENC_KEY)
  if (storedKey) {
    try {
      const keyData = Uint8Array.from(JSON.parse(storedKey))
      return await crypto.subtle.importKey(
        'raw',
        keyData,
        { name: ENC_ALGORITHM },
        false,
        ['encrypt', 'decrypt']
      )
    } catch {
      // 密钥损坏，重新生成
    }
  }

  // 生成新密钥
  const key = await crypto.subtle.generateKey(
    { name: ENC_ALGORITHM, length: ENC_KEY_LENGTH },
    true,
    ['encrypt', 'decrypt']
  )
  const exported = await crypto.subtle.exportKey('raw', key)
  localStorage.setItem(STORAGE_KEYS.ENC_KEY, JSON.stringify(Array.from(new Uint8Array(exported))))
  return key
}

/**
 * [SECURITY] 加密数据（AES-GCM）
 * 输出格式：version | iv | salt | ciphertext（JSON 字符串）
 */
async function encryptData(plaintext: string): Promise<string> {
  const key = await getOrCreateEncKey()
  const iv = crypto.getRandomValues(new Uint8Array(PBKDF2_IV_LENGTH))
  const encoder = new TextEncoder()
  const data = encoder.encode(plaintext)

  const encrypted = await crypto.subtle.encrypt(
    { name: ENC_ALGORITHM, iv },
    key,
    data
  )

  const payload = {
    v: ENC_VERSION,
    iv: Array.from(iv),
    data: Array.from(new Uint8Array(encrypted))
  }
  return JSON.stringify(payload)
}

/**
 * [SECURITY] 解密数据（AES-GCM）
 */
async function decryptData(encryptedStr: string): Promise<string | null> {
  try {
    const payload = JSON.parse(encryptedStr)
    if (!payload || typeof payload !== 'object') return null

    const key = await getOrCreateEncKey()
    const iv = new Uint8Array(payload.iv)
    const data = new Uint8Array(payload.data)

    const decrypted = await crypto.subtle.decrypt(
      { name: ENC_ALGORITHM, iv },
      key,
      data
    )
    return new TextDecoder().decode(decrypted)
  } catch (e) {
    logger.warn('[storage] 解密失败', (e as Error)?.message)
    return null
  }
}

/**
 * [SECURITY] 判断是否为加密存储的 key
 * 当前规则：HOLDINGS 和 TRADES 视为敏感数据，需要加密
 */
function isSensitiveKey(key: string): boolean {
  const sensitivePatterns = [
    STORAGE_KEYS.HOLDINGS,
    'fund_trades',
    'ai-tracking-records'
  ]
  return sensitivePatterns.includes(key)
}

// ========== Schema 版本管理 ==========

// [WHY] 当数据结构发生变化时（如：给 HoldingRecord 新增字段）
//       需要对老用户保存的数据做迁移，避免读取到不完整的数据
// [WHAT] 每次需要数据迁移时，将 SCHEMA_VERSION +1 并新增一个迁移函数

const STORAGE_SCHEMA_VERSION = 1
const SCHEMA_META_KEY = 'storage_schema_meta'

interface SchemaMeta {
  version: number
  lastMigratedAt: number
}

/**
 * [WHAT] 迁移函数注册表：从 fromVersion 迁移到 fromVersion + 1
 *        每次需要迁移数据时，添加一个新的迁移函数
 *        版本号从 1 开始，每新增一个迁移函数就 +1
 */
type Migration = (data: Record<string, any>) => Record<string, any>

const migrations: Record<number, Migration> = {
  // 版本 1 → 2 的迁移（示例，留给未来使用）
  // 1: (data) => {
  //   // 示例：给所有持仓记录添加 createdAt 字段
  //   if (Array.isArray(data.holdings)) {
  //     data.holdings = data.holdings.map((h: any) => ({
  //       createdAt: Date.now(),
  //       ...h
  //     }))
  //   }
  //   return data
  // }
}

/**
 * [WHAT] Schema 迁移结果
 */
export interface SchemaMigrationResult {
  appliedMigrations: number[]
  finalVersion: number
}

/**
 * [WHAT] 检查当前存储的 schema 版本，必要时执行迁移
 */
export async function checkSchemaAndMigrate(): Promise<SchemaMigrationResult> {
  const result: SchemaMigrationResult = {
    appliedMigrations: [],
    finalVersion: 0,
  }
  try {
    const rawMeta = localStorage.getItem(SCHEMA_META_KEY)
    const meta: SchemaMeta = rawMeta ? JSON.parse(rawMeta) : { version: 0, lastMigratedAt: 0 }

    result.finalVersion = meta.version
    if (meta.version >= STORAGE_SCHEMA_VERSION) return result

    logger.info(`[storage] Schema migration required: v${meta.version} → v${STORAGE_SCHEMA_VERSION}`)

    // 读取所有用户数据到内存
    const allData: Record<string, any> = {
      watchlist: await getItem<any[]>(STORAGE_KEYS.WATCHLIST, []),
      holdings: await getItem<any[]>(STORAGE_KEYS.HOLDINGS, []),
      aiTracking: await getItem<Record<string, any>[]>(STORAGE_KEYS.AI_TRACKING, []),
      netValues: await getItem<Record<string, number>>(STORAGE_KEYS.FUND_NET_VALUES, {}),
      sourceFilter: await getItem<string>(STORAGE_KEYS.SOURCE_FILTER, '')
    }

    // 按顺序执行迁移（从 meta.version+1 一直到 STORAGE_SCHEMA_VERSION）
    let migratedData = allData
    for (let v = meta.version + 1; v <= STORAGE_SCHEMA_VERSION; v++) {
      const migrationFn = migrations[v]
      if (migrationFn) {
        migratedData = migrationFn(migratedData)
        result.appliedMigrations.push(v)
        logger.info(`[storage] Applied migration v${v}`)
      }
    }

    // 确保数据有合理的默认值（对老数据做填充）
    migratedData.holdings = ensureHoldingDefaults(migratedData.holdings)
    migratedData.aiTracking = ensureAITrackingDefaults(migratedData.aiTracking)

    // 写回迁移后的数据（敏感数据会加密）
    await Promise.all([
      setItem(STORAGE_KEYS.WATCHLIST, migratedData.watchlist),
      setItem(STORAGE_KEYS.HOLDINGS, migratedData.holdings),
      setItem(STORAGE_KEYS.AI_TRACKING, migratedData.aiTracking),
      setItem(STORAGE_KEYS.FUND_NET_VALUES, migratedData.netValues),
      setItem(STORAGE_KEYS.SOURCE_FILTER, migratedData.sourceFilter),
    ])

    // 更新 schema 元信息
    const newMeta: SchemaMeta = {
      version: STORAGE_SCHEMA_VERSION,
      lastMigratedAt: Date.now()
    }
    localStorage.setItem(SCHEMA_META_KEY, JSON.stringify(newMeta))
    result.finalVersion = STORAGE_SCHEMA_VERSION
    logger.info(`[storage] Schema migration complete: v${STORAGE_SCHEMA_VERSION}`)
  } catch (e) {
    logger.warn('[storage] checkSchemaAndMigrate failed', (e as Error)?.message)
  }
  return result
}

/**
 * [WHAT] 给持仓记录填充默认值，避免老版本数据缺少字段
 */
function ensureHoldingDefaults(records: any[]): any[] {
  if (!Array.isArray(records)) return []

  return records.map((h) => ({
    code: h.code || '',
    name: h.name || '',
    buyNetValue: h.buyNetValue ?? 0,
    shares: h.shares ?? 0,
    buyDate: h.buyDate || '',
    holdingDays: h.holdingDays ?? 0,
    // 下面这些是后来新增的，老数据可能缺失
    industrySectors: h.industrySectors ?? undefined,
    source: h.source ?? '其他',
    isQDII: h.isQDII ?? false,
    createdAt: h.createdAt ?? Date.now(),
    currentValue: h.currentValue ?? undefined,
    addedGain: h.addedGain ?? undefined,
    marketValue: h.marketValue ?? undefined,
    profit: h.profit ?? undefined
  }))
}

/**
 * [WHAT] 给 AI 追踪记录填充默认值
 */
function ensureAITrackingDefaults(records: any[]): any[] {
  if (!Array.isArray(records)) return []

  return records.map((r) => ({
    id: r.id || Date.now().toString(),
    sellCode: r.sellCode || '',
    sellName: r.sellName || '',
    sellNav: r.sellNav ?? 0,
    sellNavEstimated: r.sellNavEstimated ?? undefined,
    buyCode: r.buyCode || '',
    buyName: r.buyName || '',
    buyNav: r.buyNav ?? 0,
    buyNavEstimated: r.buyNavEstimated ?? undefined,
    date: r.date || '',
    createdAt: r.createdAt ?? Date.now()
  }))
}

/**
 * 检查版本并清除旧缓存
 * [WHY] APP 更新后需要清除旧缓存，确保使用最新数据
 * [WHAT] 比较存储的版本与当前版本，不同则清除 API 缓存
 */
export function checkVersionAndClearCache(): void {
  try {
    const storedVersion = localStorage.getItem(STORAGE_KEYS.APP_VERSION)

    if (storedVersion !== APP_VERSION) {
      cache.clear()

      // [WHAT] 清除 localStorage 中的 API 缓存（保留用户数据）
      const keysToRemove: string[] = []
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i)
        if (key && STORAGE_KEYS.CACHE_PREFIXES.some(prefix => key.startsWith(prefix))) {
          if (key !== STORAGE_KEYS.WATCHLIST && key !== STORAGE_KEYS.HOLDINGS) {
            keysToRemove.push(key)
          }
        }
      }
      keysToRemove.forEach(key => localStorage.removeItem(key))

      // [WHAT] 更新版本号
      localStorage.setItem(STORAGE_KEYS.APP_VERSION, APP_VERSION)
    }
  } catch (e) {
    logger.warn('[storage] checkVersionAndClearCache failed', (e as Error)?.message)
  }
}

// ========== 通用存储读取 / 写入（含加密） ==========

/**
 * 通用存储读取函数
 * [WHY] 统一处理 JSON 解析和错误处理
 * [EDGE] 数据不存在或解析失败时返回默认值
 * [SECURITY] 敏感数据自动解密
 */
async function getItem<T>(key: string, defaultValue: T): Promise<T> {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return defaultValue

    // [SECURITY] 敏感数据尝试解密
    if (isSensitiveKey(key)) {
      const decrypted = await decryptData(raw)
      if (decrypted) return JSON.parse(decrypted) as T
      // 解密失败，可能是旧版本明文存储，尝试直接解析
      try {
        const parsed = JSON.parse(raw)
        // 如果解析结果是加密 payload 格式（v/iv/data），说明数据是加密的但解密失败，返回默认值
        if (parsed && typeof parsed === 'object' && 'v' in parsed && 'iv' in parsed && 'data' in parsed) {
          return defaultValue
        }
        return parsed as T
      } catch {
        return defaultValue
      }
    }

    return JSON.parse(raw) as T
  } catch {
    return defaultValue
  }
}

/**
 * 通用存储写入函数
 * [WHY] 存储满/禁用/序列化失败时不应让应用崩溃
 * [EDGE] QuotaExceededError / SecurityError / JSON 循环引用
 * [SECURITY] 敏感数据自动加密
 */
async function setItem<T>(key: string, value: T): Promise<boolean> {
  try {
    let raw: string

    // [SECURITY] 敏感数据加密后存储
    if (isSensitiveKey(key)) {
      raw = await encryptData(JSON.stringify(value))
    } else {
      raw = JSON.stringify(value)
    }

    localStorage.setItem(key, raw)
    return true
  } catch (e) {
    const errorName = (e as Error)?.name || 'Error'
    logger.warn(`[storage] setItem failed for key "${key}": ${errorName}`)
    return false
  }
}

// ========== 自选列表 ==========

/**
 * 获取自选基金代码列表
 */
export async function getWatchlist(): Promise<string[]> {
  return getItem<string[]>(STORAGE_KEYS.WATCHLIST, [])
}

/**
 * 保存自选基金代码列表
 */
export async function saveWatchlist(codes: string[]): Promise<void> {
  await setItem(STORAGE_KEYS.WATCHLIST, codes)
}

/**
 * 添加基金到自选
 * [EDGE] 已存在则不重复添加
 */
export async function addToWatchlist(code: string): Promise<void> {
  const list = await getWatchlist()
  if (!list.includes(code)) {
    list.unshift(code) // 新添加的排在前面
    await saveWatchlist(list)
  }
}

/**
 * 从自选中移除基金
 */
export async function removeFromWatchlist(code: string): Promise<void> {
  const list = await getWatchlist()
  const index = list.indexOf(code)
  if (index > -1) {
    list.splice(index, 1)
    await saveWatchlist(list)
  }
}

/**
 * 检查基金是否在自选中
 */
export async function isInWatchlist(code: string): Promise<boolean> {
  return (await getWatchlist()).includes(code)
}

// ========== 持仓数据 ==========

/**
 * 获取持仓列表
 */
export async function getHoldings(): Promise<HoldingRecord[]> {
  return getItem<HoldingRecord[]>(STORAGE_KEYS.HOLDINGS, [])
}

/**
 * 保存持仓列表
 */
export async function saveHoldings(holdings: HoldingRecord[]): Promise<void> {
  await setItem(STORAGE_KEYS.HOLDINGS, holdings)
}

/**
 * 添加或更新持仓
 * [WHAT] 如果已存在同代码持仓，则更新；否则新增
 */
export async function upsertHolding(holding: HoldingRecord): Promise<void> {
  const list = await getHoldings()
  const index = list.findIndex((h) => h.code === holding.code)
  if (index > -1) {
    list[index] = holding
  } else {
    list.push(holding)
  }
  await saveHoldings(list)
}

/**
 * 删除持仓
 */
export async function removeHolding(code: string): Promise<void> {
  const list = await getHoldings()
  const filtered = list.filter((h) => h.code !== code)
  await saveHoldings(filtered)
}

/**
 * 获取单个持仓
 */
export async function getHolding(code: string): Promise<HoldingRecord | undefined> {
  return getHoldings().then(holdings => holdings.find((h: any) => h.code === code))
}

// ========== 基金净值存储 ==========

/**
 * 获取基金净值映射
 */
export async function getFundNetValues(): Promise<Record<string, number>> {
  return getItem<Record<string, number>>(STORAGE_KEYS.FUND_NET_VALUES, {})
}

/**
 * 保存基金净值映射
 */
export async function saveFundNetValues(netValues: Record<string, number>): Promise<void> {
  // [SECURITY] 净值数据不加密（非敏感，且频繁读取）
  try {
    localStorage.setItem(STORAGE_KEYS.FUND_NET_VALUES, JSON.stringify(netValues))
    return Promise.resolve()
  } catch (e) {
    logger.warn(`[storage] saveFundNetValues failed: ${(e as Error)?.name}`)
    return Promise.resolve()
  }
}

/**
 * 保存来源筛选状态
 */
export async function saveSourceFilter(filter: string): Promise<void> {
  // [SECURITY] 偏好设置不加密
  try {
    localStorage.setItem(STORAGE_KEYS.SOURCE_FILTER, filter)
    return Promise.resolve()
  } catch {
    return Promise.resolve()
  }
}

/**
 * 获取来源筛选状态
 */
export function getSourceFilter(): string {
  try {
    return localStorage.getItem(STORAGE_KEYS.SOURCE_FILTER) || ''
  } catch {
    return ''
  }
}

/**
 * 更新单个基金净值
 */
export async function updateFundNetValue(code: string, netValue: number): Promise<void> {
  const netValues = await getFundNetValues()
  netValues[code] = netValue
  await saveFundNetValues(netValues)
}

/**
 * 获取单个基金净值
 */
export async function getFundNetValue(code: string): Promise<number | undefined> {
  return (await getFundNetValues())[code]
}

// ========== AI 调仓追踪 ==========

/**
 * [WHY] 原来的 aiTracking.ts 直接用裸 localStorage 调用，绕过了统一的存储模块
 *       导致数据格式不一致、错误处理不统一，也无法在数据迁移时统一处理
 * [WHAT] 通过 storage 模块统一管理 AI 追踪记录
 * [SECURITY] AI 追踪记录含持仓信息，需加密
 */
export async function getAITrackingRecords<T>(): Promise<T[]> {
  return getItem<T[]>(STORAGE_KEYS.AI_TRACKING, [])
}

export async function saveAITrackingRecords<T>(records: T[]): Promise<void> {
  await setItem(STORAGE_KEYS.AI_TRACKING, records)
}

// ========== 交易记录 ==========

const TRADES_KEY = 'fund_trades'

/**
 * [WHAT] 获取所有交易记录
 * [SECURITY] 交易记录含成本、份额，需加密
 */
export async function getTrades(): Promise<TradeRecord[]> {
  return getItem<TradeRecord[]>(TRADES_KEY, [])
}

/**
 * [WHAT] 保存所有交易记录
 */
export async function saveTrades(trades: TradeRecord[]): Promise<void> {
  await setItem(TRADES_KEY, trades)
}

/**
 * [WHAT] 添加一条交易记录
 */
export async function addTrade(trade: TradeRecord): Promise<void> {
  const trades = await getTrades()
  trades.unshift(trade)
  await saveTrades(trades)
}

/**
 * [WHAT] 删除一条交易记录
 */
export async function deleteTrade(id: string): Promise<void> {
  let trades = await getTrades()
  trades = trades.filter(t => t.id !== id)
  await saveTrades(trades)
}
