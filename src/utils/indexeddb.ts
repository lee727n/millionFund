// [WHY] IndexedDB 存储层 - 替代 localStorage，支持大容量和结构化数据
// [WHAT] 提供通用的 IndexedDB CRUD 操作，支持 Promise 和类型安全

import { logger } from './logger'

// [WHAT] Object Store 的 schema 定义
export interface IDBStoreSchema {
  name: string
  keyPath: string
  indexes?: { name: string; keyPath: string; unique?: boolean }[]
}

export class IndexedDBManager {
  private dbName: string
  private version: number
  private db: IDBDatabase | null = null
  private stores: IDBStoreSchema[]

  constructor(dbName: string, version: number, stores: IDBStoreSchema[]) {
    this.dbName = dbName
    this.version = version
    this.stores = stores
  }

  // [WHAT] 初始化数据库，在版本升级时创建 object store 和索引
  // [EDGE] IndexedDB 不可用或初始化失败时不崩溃，后续操作返回安全默认值
  async init(): Promise<void> {
    if (!IndexedDBManager.isSupported()) {
      logger.warn('[indexeddb] IndexedDB 在当前环境不可用')
      return
    }
    if (this.db) return

    try {
      await new Promise<void>((resolve, reject) => {
        const request = indexedDB.open(this.dbName, this.version)

        // [WHAT] 版本升级时创建 object store 和索引
        request.onupgradeneeded = () => {
          const db = request.result
          for (const schema of this.stores) {
            if (!db.objectStoreNames.contains(schema.name)) {
              const store = db.createObjectStore(schema.name, { keyPath: schema.keyPath })
              if (schema.indexes) {
                for (const idx of schema.indexes) {
                  if (!store.indexNames.contains(idx.name)) {
                    store.createIndex(idx.name, idx.keyPath, { unique: idx.unique ?? false })
                  }
                }
              }
            }
          }
        }

        request.onsuccess = () => {
          this.db = request.result
          resolve()
        }

        request.onerror = () => {
          reject(request.error)
        }
      })
    } catch (e) {
      // [EDGE] 初始化失败时不崩溃，后续操作会返回安全默认值
      logger.warn('[indexeddb] init 失败', (e as Error)?.message)
    }
  }

  // [WHAT] 插入或更新一条记录（按 keyPath 自动去重）
  async put<T>(storeName: string, record: T): Promise<void> {
    const db = this.db
    if (!db) {
      logger.warn('[indexeddb] put 调用时数据库未初始化')
      return
    }

    return new Promise<void>((resolve, reject) => {
      const tx = db.transaction(storeName, 'readwrite')
      const store = tx.objectStore(storeName)
      const req = store.put(record)
      req.onsuccess = () => resolve()
      req.onerror = () => {
        logger.warn('[indexeddb] put 失败', req.error)
        reject(req.error)
      }
      tx.onerror = () => reject(tx.error)
      tx.onabort = () => reject(tx.error)
    })
  }

  // [WHAT] 在单个事务中批量插入记录，提升写入性能
  async bulkPut<T>(storeName: string, records: T[]): Promise<void> {
    const db = this.db
    if (!db) {
      logger.warn('[indexeddb] bulkPut 调用时数据库未初始化')
      return
    }
    if (records.length === 0) return

    return new Promise<void>((resolve, reject) => {
      const tx = db.transaction(storeName, 'readwrite')
      const store = tx.objectStore(storeName)
      for (const record of records) {
        store.put(record)
      }
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
      tx.onabort = () => reject(tx.error)
    })
  }

  // [WHAT] 按主键获取一条记录
  async get<T>(storeName: string, key: IDBValidKey): Promise<T | undefined> {
    const db = this.db
    if (!db) {
      logger.warn('[indexeddb] get 调用时数据库未初始化')
      return undefined
    }

    return new Promise<T | undefined>((resolve, reject) => {
      const tx = db.transaction(storeName, 'readonly')
      const store = tx.objectStore(storeName)
      const req = store.get(key)
      req.onsuccess = () => resolve(req.result as T | undefined)
      req.onerror = () => {
        logger.warn('[indexeddb] get 失败', req.error)
        reject(req.error)
      }
    })
  }

  // [WHAT] 获取 store 中的所有记录
  async getAll<T>(storeName: string): Promise<T[]> {
    const db = this.db
    if (!db) {
      logger.warn('[indexeddb] getAll 调用时数据库未初始化')
      return []
    }

    return new Promise<T[]>((resolve, reject) => {
      const tx = db.transaction(storeName, 'readonly')
      const store = tx.objectStore(storeName)
      const req = store.getAll()
      req.onsuccess = () => resolve(req.result as T[])
      req.onerror = () => {
        logger.warn('[indexeddb] getAll 失败', req.error)
        reject(req.error)
      }
    })
  }

  // [WHAT] 按主键删除一条记录
  async delete(storeName: string, key: IDBValidKey): Promise<void> {
    const db = this.db
    if (!db) {
      logger.warn('[indexeddb] delete 调用时数据库未初始化')
      return
    }

    return new Promise<void>((resolve, reject) => {
      const tx = db.transaction(storeName, 'readwrite')
      const store = tx.objectStore(storeName)
      const req = store.delete(key)
      req.onsuccess = () => resolve()
      req.onerror = () => {
        logger.warn('[indexeddb] delete 失败', req.error)
        reject(req.error)
      }
    })
  }

  // [WHAT] 清空 store 中的所有记录
  async clear(storeName: string): Promise<void> {
    const db = this.db
    if (!db) {
      logger.warn('[indexeddb] clear 调用时数据库未初始化')
      return
    }

    return new Promise<void>((resolve, reject) => {
      const tx = db.transaction(storeName, 'readwrite')
      const store = tx.objectStore(storeName)
      const req = store.clear()
      req.onsuccess = () => resolve()
      req.onerror = () => {
        logger.warn('[indexeddb] clear 失败', req.error)
        reject(req.error)
      }
    })
  }

  // [WHAT] 统计 store 中的记录数
  async count(storeName: string): Promise<number> {
    const db = this.db
    if (!db) {
      logger.warn('[indexeddb] count 调用时数据库未初始化')
      return 0
    }

    return new Promise<number>((resolve, reject) => {
      const tx = db.transaction(storeName, 'readonly')
      const store = tx.objectStore(storeName)
      const req = store.count()
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => {
        logger.warn('[indexeddb] count 失败', req.error)
        reject(req.error)
      }
    })
  }

  // [WHAT] 检查当前环境是否支持 IndexedDB
  static isSupported(): boolean {
    try {
      return typeof indexedDB !== 'undefined' && indexedDB !== null
    } catch {
      return false
    }
  }
}

// [WHAT] 默认实例的 schema 配置 - 覆盖持仓、交易、新闻缓存、基金缓存、历史净值
const defaultStores: IDBStoreSchema[] = [
  {
    name: 'holdings',
    keyPath: 'code',
    indexes: [{ name: 'assetClass', keyPath: 'assetClass' }]
  },
  {
    name: 'trades',
    keyPath: 'id',
    indexes: [
      { name: 'code', keyPath: 'code' },
      { name: 'date', keyPath: 'date' }
    ]
  },
  {
    name: 'news_cache',
    keyPath: 'id',
    indexes: [
      { name: 'source', keyPath: 'source' },
      { name: 'publishedAt', keyPath: 'publishedAt' }
    ]
  },
  {
    name: 'fund_cache',
    keyPath: 'code',
    indexes: [{ name: 'type', keyPath: 'type' }]
  },
  {
    name: 'history',
    keyPath: 'date'
  }
]

// [WHAT] 默认实例 - 供应用直接使用
export const idb = new IndexedDBManager('millionFundDB', 1, defaultStores)

// [WHAT] 便捷函数 - 检查 IndexedDB 是否可用
export function isIndexedDBSupported(): boolean {
  return IndexedDBManager.isSupported()
}
