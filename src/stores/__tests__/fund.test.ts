import { describe, test, expect, vi, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'

// Mock storage module
vi.mock('@/utils/storage', () => ({
  getWatchlist: vi.fn(),
  addToWatchlist: vi.fn(),
  removeFromWatchlist: vi.fn(),
  isInWatchlist: vi.fn()
}))

// Mock fund API modules
vi.mock('@/api/fundFast', () => ({
  fetchFundEstimateFast: vi.fn(),
  fetchFundAccurateData: vi.fn(),
  fetchFundBasicInfo: vi.fn()
}))

// Mock logger
vi.mock('@/utils/logger', () => ({
  logger: {
    error: vi.fn()
  }
}))

describe('fund.ts store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  test('initWatchlist 从 storage 读取数据', async () => {
    const { getWatchlist } = await import('@/utils/storage')
    getWatchlist.mockResolvedValue(['110011', '110022'])

    const store = (await import('@/stores/fund')).useFundStore()
    await store.initWatchlist()

    expect(store.watchlist.length).toBe(2)
    expect(store.watchlist[0]!.code).toBe('110011')
    expect(store.watchlist[0]!.loading).toBe(true)
  })

  test('initWatchlist 空列表时不刷新', async () => {
    const { getWatchlist } = await import('@/utils/storage')
    getWatchlist.mockResolvedValue([])

    const store = (await import('@/stores/fund')).useFundStore()
    await store.initWatchlist()

    expect(store.watchlist.length).toBe(0)
  })

  test('refreshEstimates 空列表时重置刷新状态', async () => {
    const store = (await import('@/stores/fund')).useFundStore()
    store.isRefreshing = true

    await store.refreshEstimates()

    expect(store.isRefreshing).toBe(false)
  })

  test('refreshEstimates 成功刷新估值', async () => {
    const { fetchFundEstimateFast } = await import('@/api/fundFast')
    fetchFundEstimateFast.mockResolvedValue({
      fundcode: '110011',
      name: '测试基金',
      gsz: '1.5',
      gszzl: '2.5',
      gztime: '2024-01-01 15:00',
      dwjz: '1.45'
    })

    const store = (await import('@/stores/fund')).useFundStore()
    store.watchlist = [{ code: '110011', name: '', loading: true }]

    await store.refreshEstimates()

    expect(store.watchlist[0]!.loading).toBe(false)
    expect(store.watchlist[0]!.estimateValue).toBe('1.5')
    expect(store.watchlist[0]!.estimateChange).toBe('2.5')
    expect(store.isRefreshing).toBe(false)
  })

  test('refreshEstimates fast 接口失败时尝试 basic', async () => {
    const { fetchFundEstimateFast, fetchFundBasicInfo } = await import('@/api/fundFast')
    fetchFundEstimateFast.mockRejectedValue(new Error('fail'))
    fetchFundBasicInfo.mockResolvedValue({
      name: '测试基金',
      netValue: '1.45',
      changeRate: '2.5',
      updateTime: '2024-01-01'
    })

    const store = (await import('@/stores/fund')).useFundStore()
    store.watchlist = [{ code: '110011', name: '', loading: true }]

    await store.refreshEstimates()

    expect(store.watchlist[0]!.loading).toBe(false)
    expect(fetchFundBasicInfo).toHaveBeenCalled()
  })

  test('refreshEstimates 所有接口都失败时保留原数据', async () => {
    const { fetchFundEstimateFast, fetchFundBasicInfo, fetchFundAccurateData } = await import('@/api/fundFast')
    fetchFundEstimateFast.mockRejectedValue(new Error('fail'))
    fetchFundBasicInfo.mockRejectedValue(new Error('fail'))
    fetchFundAccurateData.mockRejectedValue(new Error('fail'))

    const store = (await import('@/stores/fund')).useFundStore()
    store.watchlist = [{ code: '110011', name: '原名称', loading: true }]

    await store.refreshEstimates()

    expect(store.watchlist[0]!.loading).toBe(false)
    expect(store.watchlist[0]!.name).toBe('原名称')
    expect(store.isRefreshing).toBe(false)
  })

  test('refreshSingleFund 成功刷新单只基金', async () => {
    const { fetchFundEstimateFast } = await import('@/api/fundFast')
    fetchFundEstimateFast.mockResolvedValue({
      fundcode: '110011',
      name: '测试基金',
      gsz: '1.5',
      gszzl: '2.5',
      gztime: '2024-01-01 15:00',
      dwjz: '1.45'
    })

    const store = (await import('@/stores/fund')).useFundStore()
    store.watchlist = [{ code: '110011', name: '', loading: true }]

    await store.refreshSingleFund('110011')

    expect(store.watchlist[0]!.loading).toBe(false)
    expect(store.watchlist[0]!.estimateValue).toBe('1.5')
  })

  test('refreshSingleFund 失败时记录错误', async () => {
    const { fetchFundEstimateFast } = await import('@/api/fundFast')
    fetchFundEstimateFast.mockRejectedValue(new Error('fail'))

    const { logger } = await import('@/utils/logger')
    const store = (await import('@/stores/fund')).useFundStore()

    await store.refreshSingleFund('110011')

    expect(logger.error).toHaveBeenCalled()
  })

  test('addFund 成功添加基金', async () => {
    const { isInWatchlist, addToWatchlist } = await import('@/utils/storage')
    isInWatchlist.mockResolvedValue(false)
    const { fetchFundEstimateFast } = await import('@/api/fundFast')
    fetchFundEstimateFast.mockResolvedValue({
      fundcode: '110011',
      name: '测试基金',
      gsz: '1.5',
      gszzl: '2.5',
      gztime: '2024-01-01 15:00',
      dwjz: '1.45'
    })

    const store = (await import('@/stores/fund')).useFundStore()
    const result = await store.addFund('110011', '测试基金')

    expect(result).toBe(true)
    expect(addToWatchlist).toHaveBeenCalledWith('110011')
    expect(store.watchlist.length).toBe(1)
  })

  test('addFund 已存在时不重复添加', async () => {
    const { isInWatchlist } = await import('@/utils/storage')
    isInWatchlist.mockResolvedValue(true)

    const store = (await import('@/stores/fund')).useFundStore()
    const result = await store.addFund('110011', '测试基金')

    expect(result).toBe(false)
  })

  test('removeFund 成功移除基金', async () => {
    const { removeFromWatchlist } = await import('@/utils/storage')
    const store = (await import('@/stores/fund')).useFundStore()
    store.watchlist = [
      { code: '110011', name: '测试基金', loading: false },
      { code: '110022', name: '测试基金2', loading: false }
    ]

    await store.removeFund('110011')

    expect(store.watchlist.length).toBe(1)
    expect(store.watchlist[0]!.code).toBe('110022')
    expect(removeFromWatchlist).toHaveBeenCalledWith('110011')
  })

  test('isFundInWatchlist 正确判断', async () => {
    const store = (await import('@/stores/fund')).useFundStore()
    store.watchlist = [{ code: '110011', name: '测试基金', loading: false }]

    const result = await store.isFundInWatchlist('110011')
    const result2 = await store.isFundInWatchlist('999999')

    expect(result).toBe(true)
    expect(result2).toBe(false)
  })

  test('watchlistCodes getter 正确返回代码列表', async () => {
    const store = (await import('@/stores/fund')).useFundStore()
    store.watchlist = [
      { code: '110011', name: '测试基金', loading: false },
      { code: '110022', name: '测试基金2', loading: false }
    ]

    expect(store.watchlistCodes.length).toBe(2)
    expect(store.watchlistCodes).toContain('110011')
    expect(store.watchlistCodes).toContain('110022')
  })
})
