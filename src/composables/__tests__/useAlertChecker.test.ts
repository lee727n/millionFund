import { describe, test, expect, vi, beforeEach } from 'vitest'
import { showToast } from 'vant'

// 顶层 mock - 会被 hoist
vi.mock('vue', () => ({
  onMounted: vi.fn(),
  onUnmounted: vi.fn(),
}))

vi.mock('@/stores/alerts', () => ({
  useAlertsStore: vi.fn(() => ({
    enabledRules: [],
    markTriggered: vi.fn(),
  })),
}))

vi.mock('@/stores/holding', () => ({
  useHoldingStore: vi.fn(() => ({
    holdings: [],
  })),
}))

vi.mock('@/api/fundFast', () => ({
  fetchFundEstimateFast: vi.fn(),
}))

vi.mock('@/api/tiantianApi', () => ({
  isTradingTime: vi.fn(() => true),
}))

vi.mock('vant', () => ({
  showToast: vi.fn(),
}))

describe('useAlertChecker.ts', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  test('start 和 stop 不抛异常', async () => {
    const { useAlertChecker } = await import('@/composables/useAlertChecker')
    const { start, stop } = useAlertChecker()
    start()
    stop()
    expect(true).toBe(true)
  })

  test('非交易时间不调用 fetchFundEstimateFast', async () => {
    const { isTradingTime } = await import('@/api/tiantianApi')
    isTradingTime.mockReturnValue(false)

    const { fetchFundEstimateFast } = await import('@/api/fundFast')
    fetchFundEstimateFast.mockClear()

    const { useAlertChecker } = await import('@/composables/useAlertChecker')
    const { start } = useAlertChecker()
    start()

    // checkAlerts 是异步的，等待一下
    await new Promise(r => setTimeout(r, 50))
    expect(fetchFundEstimateFast).not.toHaveBeenCalled()
  })

  test('有启用规则且净值超阈值时调用 showToast', async () => {
    // 设置 isTradingTime 返回 true
    const { isTradingTime } = await import('@/api/tiantianApi')
    isTradingTime.mockReturnValue(true)

    // 设置 fetchFundEstimateFast 返回值
    const { fetchFundEstimateFast } = await import('@/api/fundFast')
    fetchFundEstimateFast.mockResolvedValue({ gszzl: '2.5', gsz: '1.6' })

    // 设置 alerts store 返回启用规则
    const { useAlertsStore } = await import('@/stores/alerts')
    const markTriggeredMock = vi.fn()
    ;(useAlertsStore as any).mockReturnValue({
      enabledRules: [
        {
          id: 'rule1',
          fundCode: '000001',
          fundName: '测试基金',
          type: 'threshold',
          threshold: 1.5,
          direction: 'above',
          enabled: true,
          lastTriggered: undefined,
        },
      ],
      markTriggered: markTriggeredMock,
    })

    // 设置 holdings
    const { useHoldingStore } = await import('@/stores/holding')
    ;(useHoldingStore as any).mockReturnValue({
      holdings: [{ fundCode: '000001' }],
    })

    const { useAlertChecker } = await import('@/composables/useAlertChecker')
    const { start } = useAlertChecker()
    start()

    // 等待 checkAlerts 异步完成
    await new Promise(r => setTimeout(r, 100))
    expect(showToast).toHaveBeenCalled()
    expect(markTriggeredMock).toHaveBeenCalledWith('rule1')
  })
})
