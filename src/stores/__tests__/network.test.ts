import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'

describe('network.ts store', () => {
  let mockAddEventListener: any
  let mockRemoveEventListener: any

  beforeEach(() => {
    vi.resetModules()
    setActivePinia(createPinia())

    // Mock navigator.onLine
    Object.defineProperty(navigator, 'onLine', {
      value: true,
      writable: true,
      configurable: true,
    })

    // Mock window.addEventListener/removeEventListener
    mockAddEventListener = vi.fn()
    mockRemoveEventListener = vi.fn()
    Object.defineProperty(window, 'addEventListener', {
      value: mockAddEventListener,
      writable: true,
      configurable: true,
    })
    Object.defineProperty(window, 'removeEventListener', {
      value: mockRemoveEventListener,
      writable: true,
      configurable: true,
    })

    // Mock setTimeout
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  test('默认 isOnline 为 true', async () => {
    const { useNetworkStore } = await import('@/stores/network')
    const store = useNetworkStore()
    expect(store.isOnline).toBe(true)
  })

  test('init() 添加事件监听', async () => {
    const { useNetworkStore } = await import('@/stores/network')
    const store = useNetworkStore()

    store.init()

    expect(mockAddEventListener).toHaveBeenCalledWith('online', expect.any(Function))
    expect(mockAddEventListener).toHaveBeenCalledWith('offline', expect.any(Function))
  })

  test('init() 重复调用不会重复添加监听', async () => {
    const { useNetworkStore } = await import('@/stores/network')
    const store = useNetworkStore()

    store.init()
    const callCount = mockAddEventListener.mock.callCount
    store.init()

    expect(mockAddEventListener.mock.callCount).toBe(callCount)
  })

  test('离线时 statusText 显示正确', async () => {
    Object.defineProperty(navigator, 'onLine', {
      value: false,
      writable: true,
      configurable: true,
    })

    const { useNetworkStore } = await import('@/stores/network')
    const store = useNetworkStore()

    store.init()

    expect(store.isOnline).toBe(false)
    expect(store.statusText).toBe('当前无网络连接，数据可能无法加载')
  })

  test('在线时 statusText 显示正确', async () => {
    Object.defineProperty(navigator, 'onLine', {
      value: true,
      writable: true,
      configurable: true,
    })

    const { useNetworkStore } = await import('@/stores/network')
    const store = useNetworkStore()

    store.init()

    expect(store.isOnline).toBe(true)
    expect(store.statusText).toBe('网络已连接')
  })

  test('从离线恢复在线时设置 justRecovered', async () => {
    // 先初始化为离线
    Object.defineProperty(navigator, 'onLine', {
      value: false,
      writable: true,
      configurable: true,
    })

    const { useNetworkStore } = await import('@/stores/network')
    const store = useNetworkStore()
    store.init()

    expect(store.isOnline).toBe(false)

    // 模拟恢复在线
    Object.defineProperty(navigator, 'onLine', {
      value: true,
      writable: true,
      configurable: true,
    })

    // 获取 online 事件处理器并调用
    const onlineHandler = mockAddEventListener.mock.calls.find(call => call[0] === 'online')?.[1]
    expect(onlineHandler).toBeDefined()

    onlineHandler()

    expect(store.isOnline).toBe(true)
    expect(store.justRecovered).toBe(true)
    expect(store.statusText).toBe('网络已恢复，正在刷新数据...')

    // 500ms 后 justRecovered 重置
    vi.advanceTimersByTime(500)
    expect(store.justRecovered).toBe(false)
  })

  test('cleanup() 移除事件监听', async () => {
    const { useNetworkStore } = await import('@/stores/network')
    const store = useNetworkStore()

    store.init()
    store.cleanup()

    expect(mockRemoveEventListener).toHaveBeenCalledWith('online', expect.any(Function))
    expect(mockRemoveEventListener).toHaveBeenCalledWith('offline', expect.any(Function))
  })
})
