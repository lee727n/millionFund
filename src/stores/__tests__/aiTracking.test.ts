import { describe, test, expect, vi, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'

vi.mock('@/utils/storage', () => ({
  getAITrackingRecords: vi.fn(() => []),
  saveAITrackingRecords: vi.fn(),
}))

describe('aiTracking.ts', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  test('addRecord 添加记录', async () => {
    const { useAITrackingStore } = await import('@/stores/aiTracking')
    const store = useAITrackingStore()

    const record = store.addRecord({
      sellCode: '000001',
      sellName: '测试基金A',
      sellNav: 1.0,
      buyCode: '000002',
      buyName: '测试基金B',
      buyNav: 2.0,
      date: '2024-01-01',
    })

    expect(record.id).toBeDefined()
    expect(record.sellCode).toBe('000001')
    expect(store.records.length).toBe(1)
  })

  test('removeRecord 删除记录', async () => {
    const { useAITrackingStore } = await import('@/stores/aiTracking')
    const store = useAITrackingStore()

    const record = store.addRecord({
      sellCode: '000001',
      sellName: '测试',
      sellNav: 1.0,
      buyCode: '000002',
      buyName: '测试',
      buyNav: 2.0,
      date: '2024-01-01',
    })

    store.removeRecord(record.id)
    expect(store.records.length).toBe(0)
  })

  test('updateRecordNav 更新净值', async () => {
    const { useAITrackingStore } = await import('@/stores/aiTracking')
    const store = useAITrackingStore()

    const record = store.addRecord({
      sellCode: '000001',
      sellName: '测试',
      sellNav: 1.0,
      buyCode: '000002',
      buyName: '测试',
      buyNav: 2.0,
      date: '2024-01-01',
    })

    store.updateRecordNav(record.id, 1.1, 2.2)
    expect(store.records[0]!.sellNav).toBe(1.1)
    expect(store.records[0]!.buyNav).toBe(2.2)
  })

  test('confirmRecordNav 确认净值（清除 estimated 标记）', async () => {
    const { useAITrackingStore } = await import('@/stores/aiTracking')
    const store = useAITrackingStore()

    const record = store.addRecord({
      sellCode: '000001',
      sellName: '测试',
      sellNav: 1.0,
      sellNavEstimated: true,
      buyCode: '000002',
      buyName: '测试',
      buyNav: 2.0,
      buyNavEstimated: true,
      date: '2024-01-01',
    })

    store.confirmRecordNav(record.id, 1.1, 2.2)
    expect(store.records[0]!.sellNavEstimated).toBe(false)
    expect(store.records[0]!.buyNavEstimated).toBe(false)
  })

  test('clearAll 清空所有记录', async () => {
    const { useAITrackingStore } = await import('@/stores/aiTracking')
    const store = useAITrackingStore()

    store.addRecord({
      sellCode: '000001',
      sellName: '测试',
      sellNav: 1.0,
      buyCode: '000002',
      buyName: '测试',
      buyNav: 2.0,
      date: '2024-01-01',
    })

    store.clearAll()
    expect(store.records.length).toBe(0)
  })

  test.skip('reorderRecords 移动记录', async () => {
    const { useAITrackingStore } = await import('@/stores/aiTracking')
    const store = useAITrackingStore()

    const r1 = store.addRecord({ sellCode: 'A', sellName: 'A', sellNav: 1, buyCode: 'B', buyName: 'B', buyNav: 2, date: '2024-01-01' })
    const r2 = store.addRecord({ sellCode: 'C', sellName: 'C', sellNav: 1, buyCode: 'D', buyName: 'D', buyNav: 2, date: '2024-01-02' })

    store.reorderRecords(0, 1)
    expect(store.records[0]!.id).toBe(r2.id)
    expect(store.records[1]!.id).toBe(r1.id)
  })

  test('reorderRecords 边界检查', async () => {
    const { useAITrackingStore } = await import('@/stores/aiTracking')
    const store = useAITrackingStore()

    store.reorderRecords(-1, 0)
    store.reorderRecords(0, 100)
    expect(store.records.length).toBe(0)
  })

  test('recordCount 计算属性', async () => {
    const { useAITrackingStore } = await import('@/stores/aiTracking')
    const store = useAITrackingStore()

    expect(store.recordCount).toBe(0)

    store.addRecord({
      sellCode: '000001',
      sellName: '测试',
      sellNav: 1.0,
      buyCode: '000002',
      buyName: '测试',
      buyNav: 2.0,
      date: '2024-01-01',
    })

    expect(store.recordCount).toBe(1)
  })
})
