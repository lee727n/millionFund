import { setActivePinia, createPinia } from 'pinia'
import { describe, test, expect, beforeEach, vi } from 'vitest'
import type { TradeRecord } from '@/types/fund'

// 用可变引用来控制 mock 返回值
const mockTrades: TradeRecord[] = []

vi.mock('@/utils/storage', () => ({
  getTrades: vi.fn(() => mockTrades),
  addTrade: vi.fn((t: TradeRecord) => { mockTrades.push(t) }),
  deleteTrade: vi.fn((id: string) => {
    const idx = mockTrades.findIndex(t => t.id === id)
    if (idx > -1) mockTrades.splice(idx, 1)
  }),
}))

describe('trade store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    mockTrades.length = 0
    vi.clearAllMocks()
  })

  test('loadTrades 加载交易记录', async () => {
    mockTrades.push({ id: '1', fundCode: '000001', fundName: '测试', tradeType: 'buy', amount: 1000, date: '2026-06-29' } as TradeRecord)
    const { useTradeStore } = await import('@/stores/trade')
    const store = useTradeStore()
    store.loadTrades()
    expect(store.trades.length).toBe(1)
  })

  test('addTrade 添加交易记录', async () => {
    const { useTradeStore } = await import('@/stores/trade')
    const store = useTradeStore()
    store.loadTrades()
    expect(store.trades.length).toBe(0)
    const trade: TradeRecord = { id: '1', fundCode: '000001', fundName: '测试', tradeType: 'buy', amount: 1000, date: '2026-06-29' }
    store.addTrade(trade)
    expect(store.trades.length).toBe(1)
  })

  test('deleteTrade 删除交易记录', async () => {
    mockTrades.push({ id: '1', fundCode: '000001', fundName: '测试', tradeType: 'buy', amount: 1000, date: '2026-06-29' } as TradeRecord)
    const { useTradeStore } = await import('@/stores/trade')
    const store = useTradeStore()
    store.loadTrades()
    expect(store.trades.length).toBe(1)
    store.deleteTrade('1')
    expect(store.trades.length).toBe(0)
  })

  test('state 初始化为空数组', async () => {
    const { useTradeStore } = await import('@/stores/trade')
    const store = useTradeStore()
    expect(store.trades).toEqual([])
  })
})
