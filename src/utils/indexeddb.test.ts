// @ts-nocheck
// [WHY] IndexedDB 在 Node.js 测试环境中不可用，需要 mock 全局对象
// [WHAT] 实现一个最小的 fake-indexeddb，支持 CRUD 操作和版本升级

import { beforeEach, describe, expect, it } from 'vitest'
import { IndexedDBManager, idb, isIndexedDBSupported } from '@/utils/indexeddb'

// ========== Fake IndexedDB 实现 ==========

// [WHAT] 深拷贝工具 - 模拟 IndexedDB 的结构化克隆语义
function deepClone(value) {
  if (value === undefined || value === null) return value
  return JSON.parse(JSON.stringify(value))
}

// [WHAT] 模拟 DOMStringList，用于 objectStoreNames 和 indexNames
class FakeDOMStringList {
  private items: Set<string> = new Set()
  contains(name: string): boolean {
    return this.items.has(name)
  }
  _add(name: string): void {
    this.items.add(name)
  }
}

// [WHAT] 模拟 IDBRequest - 异步触发 onsuccess/onerror
class FakeRequest {
  result: any = undefined
  error: any = null
  source: any = null
  transaction: any = null
  readyState = 'pending'
  onsuccess: ((ev: any) => any) | null = null
  onerror: ((ev: any) => any) | null = null
  onupgradeneeded: ((ev: any) => any) | null = null

  _success(result?: any) {
    this.result = result
    this.readyState = 'done'
    if (this.onsuccess) this.onsuccess({ target: this })
  }
}

// [WHAT] 模拟 IDBObjectStore - 用 Map 存储记录，通过微任务异步触发回调
class FakeObjectStore {
  name: string
  keyPath: string
  indexes: Map<string, { keyPath: string; unique: boolean }> = new Map()
  indexNames = new FakeDOMStringList()
  records: Map<any, any> = new Map()

  constructor(name: string, keyPath: string) {
    this.name = name
    this.keyPath = keyPath
  }

  put(value: any): FakeRequest {
    const req = new FakeRequest()
    const key = value[this.keyPath]
    queueMicrotask(() => {
      this.records.set(key, deepClone(value))
      req._success(key)
    })
    return req
  }

  get(key: any): FakeRequest {
    const req = new FakeRequest()
    queueMicrotask(() => {
      const record = this.records.get(key)
      req._success(record !== undefined ? deepClone(record) : undefined)
    })
    return req
  }

  getAll(): FakeRequest {
    const req = new FakeRequest()
    queueMicrotask(() => {
      req._success(Array.from(this.records.values()).map((v) => deepClone(v)))
    })
    return req
  }

  delete(key: any): FakeRequest {
    const req = new FakeRequest()
    queueMicrotask(() => {
      this.records.delete(key)
      req._success(undefined)
    })
    return req
  }

  clear(): FakeRequest {
    const req = new FakeRequest()
    queueMicrotask(() => {
      this.records.clear()
      req._success(undefined)
    })
    return req
  }

  count(): FakeRequest {
    const req = new FakeRequest()
    queueMicrotask(() => {
      req._success(this.records.size)
    })
    return req
  }

  createIndex(name: string, keyPath: string, options?: any): any {
    const unique = options?.unique ?? false
    this.indexes.set(name, { keyPath, unique })
    this.indexNames._add(name)
    return { name, keyPath, unique }
  }
}

// [WHAT] 模拟 IDBTransaction - oncomplete 在所有微任务（请求回调）完成后触发
class FakeTransaction {
  db: FakeDatabase
  mode: string
  error: any = null
  oncomplete: ((ev: any) => any) | null = null
  onerror: ((ev: any) => any) | null = null
  onabort: ((ev: any) => any) | null = null

  constructor(db: FakeDatabase, mode: string) {
    this.db = db
    this.mode = mode
    // [WHAT] 用 setTimeout(0) 确保 oncomplete 在所有 queueMicrotask 回调之后触发
    setTimeout(() => {
      if (this.oncomplete) this.oncomplete({ target: this })
    }, 0)
  }

  objectStore(name: string): FakeObjectStore {
    const store = this.db.stores.get(name)
    if (!store) throw new Error(`Object store "${name}" not found`)
    return store
  }
}

// [WHAT] 模拟 IDBDatabase - 管理多个 object store
class FakeDatabase {
  name: string
  version: number
  objectStoreNames = new FakeDOMStringList()
  stores: Map<string, FakeObjectStore> = new Map()

  constructor(name: string, version: number) {
    this.name = name
    this.version = version
  }

  createObjectStore(name: string, options?: any): FakeObjectStore {
    const keyPath = options?.keyPath || 'id'
    const store = new FakeObjectStore(name, keyPath)
    this.stores.set(name, store)
    this.objectStoreNames._add(name)
    return store
  }

  transaction(storeNames: string | string[], mode?: string): FakeTransaction {
    return new FakeTransaction(this, mode || 'readonly')
  }
}

// [WHAT] 模拟 IDBFactory - open() 时触发 onupgradeneeded 和 onsuccess
class FakeIndexedDB {
  databases: Map<string, FakeDatabase> = new Map()

  open(name: string, version?: number): FakeRequest {
    const req = new FakeRequest()
    // [WHAT] 用 setTimeout 确保回调在调用方设置 onupgradeneeded/onsuccess 之后触发
    setTimeout(() => {
      let db = this.databases.get(name)
      const isNew = !db
      if (isNew) {
        db = new FakeDatabase(name, version || 1)
        this.databases.set(name, db)
      }
      // [WHAT] 新数据库或版本升级时触发 onupgradeneeded
      if (isNew || (version && db.version < version)) {
        if (version) db.version = version
        req.result = db
        if (req.onupgradeneeded) {
          req.onupgradeneeded({ target: req, oldVersion: 0, newVersion: version })
        }
      }
      req.result = db
      if (req.onsuccess) req.onsuccess({ target: req })
    }, 0)
    return req
  }

  deleteDatabase(name: string): FakeRequest {
    const req = new FakeRequest()
    setTimeout(() => {
      this.databases.delete(name)
      if (req.onsuccess) req.onsuccess({ target: req })
    }, 0)
    return req
  }
}

// ========== 测试用例 ==========

describe('IndexedDBManager', () => {
  let manager: IndexedDBManager

  beforeEach(() => {
    // [WHAT] 每个测试前创建全新的 fake indexedDB 实例
    globalThis.indexedDB = new FakeIndexedDB()
    manager = new IndexedDBManager('testDB', 1, [
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
      }
    ])
  })

  describe('isSupported', () => {
    it('返回布尔值', () => {
      expect(typeof IndexedDBManager.isSupported()).toBe('boolean')
    })

    it('indexedDB 可用时返回 true', () => {
      expect(IndexedDBManager.isSupported()).toBe(true)
    })

    it('indexedDB 不可用时返回 false', () => {
      const original = globalThis.indexedDB
      globalThis.indexedDB = undefined
      expect(IndexedDBManager.isSupported()).toBe(false)
      globalThis.indexedDB = original
    })
  })

  describe('init', () => {
    it('初始化后创建 object store 和索引', async () => {
      await manager.init()
      const db = (manager as any).db
      expect(db.objectStoreNames.contains('holdings')).toBe(true)
      expect(db.objectStoreNames.contains('trades')).toBe(true)

      // [WHAT] 验证索引也被创建
      const holdingsStore = db.stores.get('holdings')
      expect(holdingsStore.indexNames.contains('assetClass')).toBe(true)

      const tradesStore = db.stores.get('trades')
      expect(tradesStore.indexNames.contains('code')).toBe(true)
      expect(tradesStore.indexNames.contains('date')).toBe(true)
    })

    it('重复调用 init 不会重新创建数据库', async () => {
      await manager.init()
      const db1 = (manager as any).db
      await manager.init()
      const db2 = (manager as any).db
      expect(db2).toBe(db1)
    })

    it('IndexedDB 不可用时 init 不崩溃', async () => {
      globalThis.indexedDB = undefined
      await expect(manager.init()).resolves.toBeUndefined()
      expect((manager as any).db).toBeNull()
    })
  })

  describe('put / get', () => {
    beforeEach(async () => {
      await manager.init()
    })

    it('可以插入并读取记录', async () => {
      await manager.put('holdings', { code: '000001', name: '测试基金', assetClass: 'stock' })
      const record = await manager.get('holdings', '000001')
      expect(record).toEqual({ code: '000001', name: '测试基金', assetClass: 'stock' })
    })

    it('读取不存在的 key 返回 undefined', async () => {
      const record = await manager.get('holdings', '999999')
      expect(record).toBeUndefined()
    })

    it('put 相同 key 时更新已有记录', async () => {
      await manager.put('holdings', { code: '000001', name: '原基金', assetClass: 'stock' })
      await manager.put('holdings', { code: '000001', name: '更新基金', assetClass: 'bond' })
      const record = await manager.get('holdings', '000001')
      expect(record?.name).toBe('更新基金')
      expect(record?.assetClass).toBe('bond')
    })

    it('返回的数据是深拷贝，修改不影响存储', async () => {
      await manager.put('holdings', { code: '000001', name: '测试基金' })
      const record = await manager.get('holdings', '000001')
      record.name = '被修改了'
      const record2 = await manager.get('holdings', '000001')
      expect(record2.name).toBe('测试基金')
    })
  })

  describe('delete', () => {
    beforeEach(async () => {
      await manager.init()
    })

    it('删除指定 key 的记录', async () => {
      await manager.put('holdings', { code: '000001', name: '基金A' })
      await manager.put('holdings', { code: '000002', name: '基金B' })
      await manager.delete('holdings', '000001')
      expect(await manager.get('holdings', '000001')).toBeUndefined()
      expect(await manager.get('holdings', '000002')).toBeDefined()
    })

    it('删除不存在的 key 不报错', async () => {
      await expect(manager.delete('holdings', '999999')).resolves.toBeUndefined()
    })
  })

  describe('getAll', () => {
    beforeEach(async () => {
      await manager.init()
    })

    it('返回 store 中的所有记录', async () => {
      await manager.put('holdings', { code: '000001', name: '基金A' })
      await manager.put('holdings', { code: '000002', name: '基金B' })
      await manager.put('holdings', { code: '000003', name: '基金C' })
      const all = await manager.getAll('holdings')
      expect(all).toHaveLength(3)
      const codes = all.map((r: any) => r.code).sort()
      expect(codes).toEqual(['000001', '000002', '000003'])
    })

    it('空 store 返回空数组', async () => {
      const all = await manager.getAll('holdings')
      expect(all).toEqual([])
    })
  })

  describe('bulkPut', () => {
    beforeEach(async () => {
      await manager.init()
    })

    it('在单个事务中批量插入记录', async () => {
      const records = [
        { code: '000001', name: '基金A' },
        { code: '000002', name: '基金B' },
        { code: '000003', name: '基金C' }
      ]
      await manager.bulkPut('holdings', records)
      expect(await manager.count('holdings')).toBe(3)
    })

    it('空数组不执行任何操作', async () => {
      await manager.bulkPut('holdings', [])
      expect(await manager.count('holdings')).toBe(0)
    })

    it('批量插入会覆盖已存在的记录', async () => {
      await manager.put('holdings', { code: '000001', name: '原基金' })
      await manager.bulkPut('holdings', [
        { code: '000001', name: '更新基金' },
        { code: '000002', name: '新基金' }
      ])
      const all = await manager.getAll('holdings')
      expect(all).toHaveLength(2)
      const updated = await manager.get('holdings', '000001')
      expect(updated?.name).toBe('更新基金')
    })
  })

  describe('clear', () => {
    beforeEach(async () => {
      await manager.init()
    })

    it('清空 store 中的所有记录', async () => {
      await manager.put('holdings', { code: '000001', name: '基金A' })
      await manager.put('holdings', { code: '000002', name: '基金B' })
      await manager.clear('holdings')
      expect(await manager.count('holdings')).toBe(0)
      expect(await manager.getAll('holdings')).toEqual([])
    })

    it('清空空 store 不报错', async () => {
      await expect(manager.clear('holdings')).resolves.toBeUndefined()
    })
  })

  describe('count', () => {
    beforeEach(async () => {
      await manager.init()
    })

    it('返回 store 中的记录数', async () => {
      await manager.put('holdings', { code: '000001', name: '基金A' })
      await manager.put('holdings', { code: '000002', name: '基金B' })
      expect(await manager.count('holdings')).toBe(2)
    })

    it('空 store 返回 0', async () => {
      expect(await manager.count('holdings')).toBe(0)
    })
  })

  describe('未初始化时的安全降级', () => {
    it('数据库未初始化时 get 返回 undefined', async () => {
      const uninitManager = new IndexedDBManager('uninitDB', 1, [
        { name: 'test', keyPath: 'id' }
      ])
      expect(await uninitManager.get('test', '1')).toBeUndefined()
    })

    it('数据库未初始化时 getAll 返回空数组', async () => {
      const uninitManager = new IndexedDBManager('uninitDB', 1, [
        { name: 'test', keyPath: 'id' }
      ])
      expect(await uninitManager.getAll('test')).toEqual([])
    })

    it('数据库未初始化时 count 返回 0', async () => {
      const uninitManager = new IndexedDBManager('uninitDB', 1, [
        { name: 'test', keyPath: 'id' }
      ])
      expect(await uninitManager.count('test')).toBe(0)
    })

    it('数据库未初始化时 put/delete/clear 不崩溃', async () => {
      const uninitManager = new IndexedDBManager('uninitDB', 1, [
        { name: 'test', keyPath: 'id' }
      ])
      await expect(uninitManager.put('test', { id: '1' })).resolves.toBeUndefined()
      await expect(uninitManager.delete('test', '1')).resolves.toBeUndefined()
      await expect(uninitManager.clear('test')).resolves.toBeUndefined()
    })
  })

  describe('默认实例和便捷函数', () => {
    it('idb 是 IndexedDBManager 的实例', () => {
      expect(idb).toBeInstanceOf(IndexedDBManager)
    })

    it('isIndexedDBSupported 返回布尔值', () => {
      expect(typeof isIndexedDBSupported()).toBe('boolean')
    })

    it('isIndexedDBSupported 在 indexedDB 可用时返回 true', () => {
      expect(isIndexedDBSupported()).toBe(true)
    })

    it('默认实例可以正常 init 并执行 CRUD', async () => {
      // [WHAT] 重置默认实例的 db 以确保干净状态
      ;(idb as any).db = null
      await idb.init()
      await idb.put('holdings', { code: '000001', name: '默认实例测试', assetClass: 'stock' })
      const record = await idb.get('holdings', '000001')
      expect(record?.name).toBe('默认实例测试')
      await idb.clear('holdings')
    })
  })
})
