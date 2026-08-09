import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest'

// Mock vue 生命周期钩子 - 必须位于 import 之前（vitest 会提升）
// 使用 importOriginal 以 ESM 安全方式获取真实的 ref/computed，仅覆写 onMounted/onUnmounted
vi.mock('vue', async (importOriginal) => {
  const actual = await importOriginal<typeof import('vue')>()
  return {
    ...actual,
    onMounted: vi.fn((fn: () => void) => fn()),
    onUnmounted: vi.fn(),
  }
})

// Mock 依赖的 API 模块，避免真实网络请求导致超时
vi.mock('@/api/fundMarket', () => ({
  fetchMarketIndicesFast: vi.fn().mockResolvedValue([
    { code: '000001', name: '上证指数', current: 3150, change: 12.5, changePercent: 0.40 },
    { code: '399006', name: '创业板指', current: 2050, change: 8.6, changePercent: 0.42 },
    { code: '000300', name: '沪深300', current: 3780, change: 15.8, changePercent: 0.42 },
  ]),
  fetchGlobalIndices: vi.fn().mockResolvedValue([
    { code: '100.NDX', name: '纳斯达克', region: 'us', price: 15000, change: 100, changePercent: 0.67 },
    { code: '100.DJIA', name: '道琼斯', region: 'us', price: 38000, change: 200, changePercent: 0.53 },
  ]),
}))

vi.mock('@/api/tiantianApi', () => ({
  getTradingSession: vi.fn().mockReturnValue('closed'),
}))

vi.mock('@/composables/useWebSocket', () => ({
  useDefaultWebSocket: vi.fn().mockReturnValue({
    connectionStatus: { value: 'disconnected' },
    connect: vi.fn(),
    on: vi.fn(),
    off: vi.fn(),
  }),
}))

describe('useHomeData.ts', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  test('loadIndices 加载大盘指数', async () => {
    const { useHomeData } = await import('@/composables/useHomeData')
    const { loadIndices, indices } = useHomeData()

    await loadIndices()

    expect(indices.value).toBeInstanceOf(Array)
  })

  test('loadGlobalIndices 加载全球指数', async () => {
    const { useHomeData } = await import('@/composables/useHomeData')
    const { loadGlobalIndices, globalIndices } = useHomeData()

    await loadGlobalIndices()

    expect(globalIndices.value).toBeInstanceOf(Array)
  })

  test('refreshAll 刷新所有数据', async () => {
    const { useHomeData } = await import('@/composables/useHomeData')
    const { refreshAll, isRefreshing } = useHomeData()

    const promise = refreshAll()
    expect(isRefreshing.value).toBe(true)

    await promise

    expect(isRefreshing.value).toBe(false)
  })

  test('refreshAll 防止重复刷新', async () => {
    const { useHomeData } = await import('@/composables/useHomeData')
    const { refreshAll, isRefreshing } = useHomeData()

    refreshAll()
    refreshAll() // 第二次调用应该被忽略

    // 第一次调用还在进行中，isRefreshing 应该为 true
    expect(isRefreshing.value).toBe(true)
  })

  test('updateTradingSession 更新交易状态', async () => {
    const { useHomeData } = await import('@/composables/useHomeData')
    const { updateTradingSession, tradingSession } = useHomeData()

    updateTradingSession()

    expect(tradingSession.value).toBeDefined()
  })

  test('init 初始化数据', async () => {
    const { useHomeData } = await import('@/composables/useHomeData')
    const { tradingSession, currentTime } = useHomeData()

    // onMounted 会自动调用 init()（vue mock 中 onMounted 立即执行）
    expect(tradingSession.value).toBeDefined()
    expect(currentTime.value).toBeInstanceOf(Date)
  })
})
