import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useNetworkStore } from '@/stores/network'

describe('network store', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    setActivePinia(createPinia())
    // Mock navigator.onLine
    Object.defineProperty(navigator, 'onLine', {
      writable: true,
      value: true,
    })
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('初始状态为在线', () => {
    const store = useNetworkStore()
    expect(store.isOnline).toBe(true)
    expect(store.statusText).toBe('')
    expect(store.justRecovered).toBe(false)
  })

  it('init 后更新状态为在线', () => {
    const store = useNetworkStore()
    store.init()
    expect(store.isOnline).toBe(true)
    expect(store.statusText).toBe('网络已连接')
  })

  it('重复 init 不会重复绑定事件', () => {
    const store = useNetworkStore()
    const addSpy = vi.spyOn(window, 'addEventListener')
    store.init()
    store.init()
    expect(addSpy).toHaveBeenCalledTimes(2) // online + offline
  })

  it('离线事件触发后 isOnline 变为 false', () => {
    const store = useNetworkStore()
    store.init()

    // Simulate offline
    Object.defineProperty(navigator, 'onLine', {
      writable: true,
      value: false,
    })
    window.dispatchEvent(new Event('offline'))

    expect(store.isOnline).toBe(false)
    expect(store.statusText).toBe('当前无网络连接，数据可能无法加载')
  })

  it('从离线恢复到在线触发 justRecovered 信号', () => {
    const store = useNetworkStore()
    store.init()

    // First go offline
    Object.defineProperty(navigator, 'onLine', {
      writable: true,
      value: false,
    })
    window.dispatchEvent(new Event('offline'))
    expect(store.isOnline).toBe(false)

    // Then back online
    Object.defineProperty(navigator, 'onLine', {
      writable: true,
      value: true,
    })
    window.dispatchEvent(new Event('online'))

    expect(store.isOnline).toBe(true)
    expect(store.justRecovered).toBe(true)
    expect(store.statusText).toBe('网络已恢复，正在刷新数据...')

    // Advance timers to reset justRecovered
    vi.advanceTimersByTime(600)
    expect(store.justRecovered).toBe(false)
  })

  it('cleanup 后移除事件监听', () => {
    const store = useNetworkStore()
    store.init()

    const removeSpy = vi.spyOn(window, 'removeEventListener')
    store.cleanup()
    expect(removeSpy).toHaveBeenCalledTimes(2)
  })

  it('多次在线事件不会重复触发恢复信号', () => {
    const store = useNetworkStore()
    store.init()
    expect(store.justRecovered).toBe(false)

    // Multiple online events while already online
    window.dispatchEvent(new Event('online'))
    expect(store.justRecovered).toBe(false)
  })

  it('SSR 环境下 (无 navigator) 默认为在线', () => {
    setActivePinia(createPinia())
    const store = useNetworkStore()
    store.init()
    expect(store.isOnline).toBe(true)
  })
})
