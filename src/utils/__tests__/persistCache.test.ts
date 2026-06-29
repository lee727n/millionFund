import { describe, test, expect, vi, beforeEach } from 'vitest'

describe('persistCache.ts', () => {
  beforeEach(() => {
    // 清空 localStorage
    localStorage.clear()
    vi.clearAllMocks()
  })

  test('get 缓存未命中时返回 null', async () => {
    const { persistCache } = await import('@/utils/persistCache')
    const result = persistCache.get('test_key')
    expect(result).toBeNull()
  })

  test('set 和 get 正常读写', async () => {
    const { persistCache } = await import('@/utils/persistCache')
    const data = { name: 'test', value: 123 }
    persistCache.set('test_key', data)
    const result = persistCache.get('test_key')
    expect(result).toEqual(data)
  })

  test('get 版本不匹配时返回 null 并清除', async () => {
    const { persistCache } = await import('@/utils/persistCache')
    // 手动写入旧版本数据
    localStorage.setItem('fund_test_key', JSON.stringify({
      v: 999, // 错误的版本号
      ts: Date.now(),
      ttl: 86400000,
      data: { name: 'old' }
    }))
    const result = persistCache.get('test_key')
    expect(result).toBeNull()
    expect(localStorage.getItem('fund_test_key')).toBeNull()
  })

  test('get TTL 过期时返回 null 并清除', async () => {
    const { persistCache } = await import('@/utils/persistCache')
    // 写入过期数据
    localStorage.setItem('fund_test_key', JSON.stringify({
      v: 1,
      ts: Date.now() - 100000000, // 过期
      ttl: 1,
      data: { name: 'expired' }
    }))
    const result = persistCache.get('test_key')
    expect(result).toBeNull()
  })

  test('get 带 validator 且校验失败时返回 null', async () => {
    const { persistCache } = await import('@/utils/persistCache')
    persistCache.set('test_key', { name: 'test' })
    const result = persistCache.get('test_key', (data: any) => data.name === 'wrong')
    expect(result).toBeNull()
  })

  test('delete 正确删除', async () => {
    const { persistCache } = await import('@/utils/persistCache')
    persistCache.set('test_key', { name: 'test' })
    persistCache.delete('test_key')
    const result = persistCache.get('test_key')
    expect(result).toBeNull()
  })

  test('clear 清空所有 fund_ 前缀的缓存', async () => {
    const { persistCache } = await import('@/utils/persistCache')
    persistCache.set('key1', { a: 1 })
    persistCache.set('key2', { b: 2 })
    localStorage.setItem('other_key', 'should_not_be_cleared')
    persistCache.clear()
    expect(persistCache.get('key1')).toBeNull()
    expect(persistCache.get('key2')).toBeNull()
    expect(localStorage.getItem('other_key')).toBe('should_not_be_cleared')
  })

  test('getCacheSchemaVersion 返回当前版本号', async () => {
    const { getCacheSchemaVersion } = await import('@/utils/persistCache')
    expect(getCacheSchemaVersion()).toBe(1)
  })

  test('set 自定义 TTL', async () => {
    const { persistCache } = await import('@/utils/persistCache')
    persistCache.set('test_key', { name: 'test' }, 5000)
    const result = persistCache.get('test_key')
    expect(result).toEqual({ name: 'test' })
  })
})
