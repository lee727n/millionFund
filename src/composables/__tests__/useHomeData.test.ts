import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest'

// Mock vue lifecycle hooks - must be before imports
vi.mock('vue', () => {
  const actual = vi.mocked(require('vue'))
  return {
    ...actual,
    onMounted: vi.fn((fn: Function) => fn()),
    onUnmounted: vi.fn(),
  }
})

describe('useHomeData.ts', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
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

    // onMounted 会自动调用 init()
    expect(tradingSession.value).toBeDefined()
    expect(currentTime.value).toBeInstanceOf(Date)
  })
})
