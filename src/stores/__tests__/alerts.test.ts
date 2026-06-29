import { describe, test, expect, vi, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'

describe('alerts.ts', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    localStorage.clear()
    vi.clearAllMocks()
  })

  test('addRule 添加规则', async () => {
    const { useAlertsStore } = await import('@/stores/alerts')
    const store = useAlertsStore()

    const rule = store.addRule({
      fundCode: '000001',
      fundName: '测试基金',
      type: 'threshold',
      threshold: 1.5,
      direction: 'above',
      enabled: true,
    })

    expect(rule.id).toBeDefined()
    expect(rule.fundCode).toBe('000001')
    expect(store.rules.length).toBe(1)
  })

  test('removeRule 删除规则', async () => {
    const { useAlertsStore } = await import('@/stores/alerts')
    const store = useAlertsStore()

    const rule = store.addRule({
      fundCode: '000001',
      fundName: '测试',
      type: 'threshold',
      threshold: 1.5,
      direction: 'above',
      enabled: true,
    })

    store.removeRule(rule.id)
    expect(store.rules.length).toBe(0)
  })

  test('toggleRule 切换启用状态', async () => {
    const { useAlertsStore } = await import('@/stores/alerts')
    const store = useAlertsStore()

    const rule = store.addRule({
      fundCode: '000001',
      fundName: '测试',
      type: 'threshold',
      threshold: 1.5,
      direction: 'above',
      enabled: true,
    })

    store.toggleRule(rule.id)
    expect(store.rules[0]!.enabled).toBe(false)

    store.toggleRule(rule.id)
    expect(store.rules[0]!.enabled).toBe(true)
  })

  test('updateRule 更新规则', async () => {
    const { useAlertsStore } = await import('@/stores/alerts')
    const store = useAlertsStore()

    const rule = store.addRule({
      fundCode: '000001',
      fundName: '测试',
      type: 'threshold',
      threshold: 1.5,
      direction: 'above',
      enabled: true,
    })

    store.updateRule(rule.id, { threshold: 2.0 })
    expect(store.rules[0]!.threshold).toBe(2.0)
  })

  test('markTriggered 标记触发时间', async () => {
    const { useAlertsStore } = await import('@/stores/alerts')
    const store = useAlertsStore()

    const rule = store.addRule({
      fundCode: '000001',
      fundName: '测试',
      type: 'threshold',
      threshold: 1.5,
      direction: 'above',
      enabled: true,
    })

    store.markTriggered(rule.id)
    expect(store.rules[0]!.lastTriggered).toBeDefined()
  })

  test('enabledRules 只返回启用规则', async () => {
    const { useAlertsStore } = await import('@/stores/alerts')
    const store = useAlertsStore()

    store.addRule({
      fundCode: '000001',
      fundName: '测试1',
      type: 'threshold',
      threshold: 1.5,
      direction: 'above',
      enabled: true,
    })

    store.addRule({
      fundCode: '000002',
      fundName: '测试2',
      type: 'threshold',
      threshold: 2.0,
      direction: 'above',
      enabled: false,
    })

    expect(store.enabledRules.length).toBe(1)
    expect(store.enabledRules[0]!.fundCode).toBe('000001')
  })
})
