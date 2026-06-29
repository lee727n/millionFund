import { setActivePinia, createPinia } from 'pinia'
import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest'
import type { AITrackingRecord } from '@/stores/aiTracking'

const mockRecords: AITrackingRecord[] = []

vi.mock('@/utils/storage', () => ({
  getAITrackingRecords: vi.fn(() => mockRecords),
  saveAITrackingRecords: vi.fn(),
}))

describe('aiTracking store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    mockRecords.length = 0
    vi.clearAllMocks()
  })

  test('addRecord 添加记录', async () => {
    const { useAITrackingStore } = await import('@/stores/aiTracking')
    const store = useAITrackingStore()
    const record = store.addRecord({
      sellCode: '000001',
      sellName: '测试基金A',
      sellNav: 1.5,
      sellNavEstimated: true,
      buyCode: '000002',
      buyName: '测试基金B',
      buyNav: 2.0,
      buyNavEstimated: true,
      date: '2026-06-29',
    })
    expect(record.id).toBeDefined()
    expect(record.sellCode).toBe('000001')
    expect(store.records.length).toBe(1)
  })

  test('removeRecord 删除记录', async () => {
    const { useAITrackingStore } = await import('@/stores/aiTracking')
    const store = useAITrackingStore()
    const record = store.addRecord({
      sellCode: '000001', sellName: 'A', sellNav: 1,
      buyCode: '000002', buyName: 'B', buyNav: 2, date: '2026-06-29',
    })
    expect(store.records.length).toBe(1)
    store.removeRecord(record.id)
    expect(store.records.length).toBe(0)
  })

  test('removeRecord 不存在的 id 不报错', async () => {
    const { useAITrackingStore } = await import('@/stores/aiTracking')
    const store = useAITrackingStore()
    expect(() => store.removeRecord('nonexistent')).not.toThrow()
    expect(store.records.length).toBe(0)
  })

  test('updateRecordNav 更新净值', async () => {
    const { useAITrackingStore } = await import('@/stores/aiTracking')
    const store = useAITrackingStore()
    const record = store.addRecord({
      sellCode: '000001', sellName: 'A', sellNav: 1,
      buyCode: '000002', buyName: 'B', buyNav: 2, date: '2026-06-29',
    })
    store.updateRecordNav(record.id, 1.2, 2.5)
    const updated = store.records.find(r => r.id === record.id)
    expect(updated?.sellNav).toBe(1.2)
    expect(updated?.buyNav).toBe(2.5)
  })

  test('confirmRecordNav 确认净值并清除 estimated 标记', async () => {
    const { useAITrackingStore } = await import('@/stores/aiTracking')
    const store = useAITrackingStore()
    const record = store.addRecord({
      sellCode: '000001', sellName: 'A', sellNav: 1, sellNavEstimated: true,
      buyCode: '000002', buyName: 'B', buyNav: 2, buyNavEstimated: true,
      date: '2026-06-29',
    })
    store.confirmRecordNav(record.id, 1.1, 2.2)
    const updated = store.records.find(r => r.id === record.id)
    expect(updated?.sellNav).toBe(1.1)
    expect(updated?.sellNavEstimated).toBe(false)
    expect(updated?.buyNavEstimated).toBe(false)
  })

  test('importRecords 导入记录', async () => {
    const { useAITrackingStore } = await import('@/stores/aiTracking')
    const store = useAITrackingStore()
    const imported: AITrackingRecord[] = [
      { id: '1', sellCode: 'A', sellName: 'A', sellNav: 1, buyCode: 'B', buyName: 'B', buyNav: 2, date: '2026-06-29', createdAt: '2026-06-29' },
    ]
    store.importRecords(imported)
    expect(store.records.length).toBe(1)
    expect(store.records[0].id).toBe('1')
  })

  test('clearAll 清空所有记录', async () => {
    const { useAITrackingStore } = await import('@/stores/aiTracking')
    const store = useAITrackingStore()
    store.addRecord({ sellCode: 'A', sellName: 'A', sellNav: 1, buyCode: 'B', buyName: 'B', buyNav: 2, date: '2026-06-29' })
    store.addRecord({ sellCode: 'C', sellName: 'C', sellNav: 1, buyCode: 'D', buyName: 'D', buyNav: 2, date: '2026-06-29' })
    expect(store.records.length).toBe(2)
    store.clearAll()
    expect(store.records.length).toBe(0)
  })

  test('reorderRecords 拖拽排序', async () => {
    const { useAITrackingStore } = await import('@/stores/aiTracking')
    const store = useAITrackingStore()
    store.addRecord({ sellCode: 'A', sellName: 'A', sellNav: 1, buyCode: 'B', buyName: 'B', buyNav: 2, date: 'd1' })
    store.addRecord({ sellCode: 'C', sellName: 'C', sellNav: 1, buyCode: 'D', buyName: 'D', buyNav: 2, date: 'd2' })
    store.addRecord({ sellCode: 'E', sellName: 'E', sellNav: 1, buyCode: 'F', buyName: 'F', buyNav: 2, date: 'd3' })
    expect(store.records[0].sellCode).toBe('A')
    store.reorderRecords(0, 2)
    // 移动后：[C, A, E] → A 在 index 1
    expect(store.records[1].sellCode).toBe('A')
    expect(store.records[2].sellCode).toBe('E')
    expect(store.records[0].sellCode).toBe('C')
  })

  test('reorderRecords 边界检查', async () => {
    const { useAITrackingStore } = await import('@/stores/aiTracking')
    const store = useAITrackingStore()
    store.addRecord({ sellCode: 'A', sellName: 'A', sellNav: 1, buyCode: 'B', buyName: 'B', buyNav: 2, date: 'd1' })
    expect(() => store.reorderRecords(-1, 0)).not.toThrow()
    expect(() => store.reorderRecords(0, 5)).not.toThrow()
    expect(() => store.reorderRecords(0, 0)).not.toThrow()
  })

  test('recordCount 计算属性', async () => {
    const { useAITrackingStore } = await import('@/stores/aiTracking')
    const store = useAITrackingStore()
    expect(store.recordCount).toBe(0)
    store.addRecord({ sellCode: 'A', sellName: 'A', sellNav: 1, buyCode: 'B', buyName: 'B', buyNav: 2, date: 'd1' })
    expect(store.recordCount).toBe(1)
  })
})
