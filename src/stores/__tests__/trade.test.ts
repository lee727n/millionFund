import { describe, test, expect, vi, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'

vi.mock('@/utils/storage', () => ({
  getTrades: vi.fn(() => []),
  addTrade: vi.fn(),
  deleteTrade: vi.fn(),
}))

describe('trade.ts', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  test('loadTrades 加载交易记录', async () => {
    const { getTrades } = await import('@/utils/storage')
    ;(getTrades as any).mockReturnValue([{ id: '1', fundCode: '000001' }])

    const { useTradeStore } = await import('@/stores/trade')
    const store = useTradeStore()
    store.loadTrades()

    expect(getTrades).toHaveBeenCalled()
    expect(store.trades.length).toBe(1)
  })

  test('addTrade 添加交易记录', async () => {
    const { addTrade } = await import('@/utils/storage')
    const { useTradeStore } = await import('@/stores/trade')
    const store = useTradeStore()

    const trade = { id: '1', fundCode: '000001', tradeType: 'buy', amount: 1000, nav: 1.0, date: '2024-01-01' }
    store.addTrade(trade)

    expect(addTrade).toHaveBeenCalledWith(trade)
  })

  test('deleteTrade 删除交易记录', async () => {
    const { deleteTrade } = await import('@/utils/storage')
    const { useTradeStore } = await import('@/stores/trade')
    const store = useTradeStore()

    store.deleteTrade('1')
    expect(deleteTrade).toHaveBeenCalledWith('1')
  })
})
