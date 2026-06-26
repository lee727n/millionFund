// [WHY] fund store 单元测试：验证自选列表管理与估值更新流程
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useFundStore } from '@/stores/fund'
import * as storage from '@/utils/storage'

vi.mock('@/api/fundFast', () => ({
  fetchFundEstimateFast: vi.fn((code: string) =>
    Promise.resolve({
      fundcode: code,
      name: `测试基金${code}`,
      gsz: '1.2345',
      gszzl: '1.23',
      gztime: '2024-01-01 15:00',
      dwjz: '1.2199',
    })
  ),
  fetchFundAccurateData: vi.fn(),
  fetchFundBasicInfo: vi.fn(),
}))

beforeEach(() => {
  setActivePinia(createPinia())
  window.localStorage.clear()
  vi.restoreAllMocks()
})

describe('useFundStore - 自选基金管理', () => {
  it('初始状态：watchlist 为空', () => {
    const store = useFundStore()
    expect(store.watchlist).toEqual([])
    expect(store.watchlistCodes).toEqual([])
    expect(store.isRefreshing).toBe(false)
  })

  it('initWatchlist：从 storage 读取并放入 watchlist', async () => {
    await storage.saveWatchlist(['000001', '000002'])
    const store = useFundStore()
    await store.initWatchlist()
    expect(store.watchlist).toHaveLength(2)
    expect(store.watchlist[0]?.code).toBe('000001')
  })

  it('refreshEstimates：空列表时不触发请求', async () => {
    const store = useFundStore()
    await store.refreshEstimates()
    expect(store.isRefreshing).toBe(false)
    expect(store.watchlist).toEqual([])
  })

  it('refreshEstimates：多只基金并发更新', async () => {
    const store = useFundStore()
    // 直接设置两只基金
    store.watchlist.push({ code: '000001', name: '', loading: true })
    store.watchlist.push({ code: '000002', name: '', loading: true })
    await store.refreshEstimates()

    expect(store.isRefreshing).toBe(false)
    expect(store.watchlist).toHaveLength(2)
    expect(store.watchlist[0]?.name).toBe('测试基金000001')
    expect(store.watchlist[0]?.estimateValue).toBe('1.2345')
    expect(store.watchlist[0]?.loading).toBe(false)
    expect(store.lastRefreshTime).toBeTruthy()
  })

  it('updateFundData（通过 refreshSingleFund）：不会更新不存在的基金', async () => {
    const store = useFundStore()
    store.watchlist.push({ code: '000001', name: '', loading: true })
    await store.refreshSingleFund('999999')
    // 原有项不变，不新增
    expect(store.watchlist).toHaveLength(1)
    expect(store.watchlist[0]?.code).toBe('000001')
  })

  it('addFund：新增一只基金', async () => {
    const store = useFundStore()
    const result = await store.addFund('000001', '测试基金')
    expect(result).toBe(true)
    expect(store.watchlist[0]?.code).toBe('000001')
    expect(await storage.getWatchlist()).toContain('000001')
  })

  it('addFund：重复添加返回 false', async () => {
    const store = useFundStore()
    await storage.addToWatchlist('000001')
    const result = await store.addFund('000001', '测试基金')
    expect(result).toBe(false)
  })

  it('removeFund：移除一只基金', async () => {
    const store = useFundStore()
    store.watchlist.push({ code: '000001', name: '基金A', loading: false })
    store.watchlist.push({ code: '000002', name: '基金B', loading: false })
    await storage.addToWatchlist('000001')
    await storage.addToWatchlist('000002')

    await store.removeFund('000001')
    expect(store.watchlist).toHaveLength(1)
    expect(store.watchlist[0]?.code).toBe('000002')
    expect(await storage.isInWatchlist('000001')).toBe(false)
  })

  it('isFundInWatchlist：根据 watchlist 判断', async () => {
    const store = useFundStore()
    store.watchlist.push({ code: '000001', name: '', loading: false })
    expect(await store.isFundInWatchlist('000001')).toBe(true)
    expect(await store.isFundInWatchlist('999999')).toBe(false)
  })

  it('refreshSingleFund：更新单只基金', async () => {
    const store = useFundStore()
    store.watchlist.push({ code: '000001', name: '', loading: true })
    await store.refreshSingleFund('000001')
    expect(store.watchlist[0]?.name).toBe('测试基金000001')
    expect(store.watchlist[0]?.loading).toBe(false)
  })
})
