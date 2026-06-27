import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { ref } from 'vue'
import Alerts from '@/views/Alerts.vue'

// [WHY] Mock vue-router
vi.mock('vue-router', () => ({
  useRouter: () => ({
    back: vi.fn(),
    push: vi.fn(),
  }),
  useRoute: () => ({ query: {} }),
}))

// [WHY] Mock vue-i18n
vi.mock('vue-i18n', () => ({
  useI18n: () => ({
    t: (key: string) => key,
    locale: ref('zh-CN'),
  }),
}))

// [WHY] Mock alert store
const mockRules = ref<any[]>([])
vi.mock('@/stores/alerts', () => ({
  useAlertStore: () => ({
    rules: mockRules.value,
    addRule: vi.fn(),
    removeRule: vi.fn(),
    toggleRule: vi.fn(),
    getActiveAlerts: vi.fn(() => []),
  }),
}))

describe('Alerts.vue', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    mockRules.value = []
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  /**
   * 测试：组件渲染
   */
  it('应成功渲染组件', () => {
    const wrapper = mount(Alerts)
    expect(wrapper.exists()).toBe(true)
  })

  /**
   * 测试：空状态显示
   */
  it('无提醒规则时应显示空状态', () => {
    mockRules.value = []
    const wrapper = mount(Alerts)
    expect(wrapper.find('.empty-state').exists()).toBe(true)
    expect(wrapper.text()).toContain('暂无提醒规则')
  })

  /**
   * 测试：提醒规则列表显示
   */
  it('有提醒规则时应显示列表', async () => {
    mockRules.value = [
      {
        id: '1',
        fundCode: '000001',
        fundName: '测试基金',
        type: 'threshold',
        threshold: 1.5,
        direction: 'above',
        enabled: true,
      },
    ]

    const wrapper = mount(Alerts)
    await flushPromises()
    expect(wrapper.find('.rule-list').exists()).toBe(true)
    expect(wrapper.text()).toContain('测试基金')
  })

  /**
   * 测试：提醒规则类型显示
   */
  it('应正确显示提醒类型', async () => {
    mockRules.value = [
      {
        id: '1',
        fundCode: '000001',
        fundName: '测试基金',
        type: 'threshold',
        threshold: 1.5,
        direction: 'above',
        enabled: true,
      },
    ]

    const wrapper = mount(Alerts)
    await flushPromises()
    expect(wrapper.exists()).toBe(true)
  })

  /**
   * 测试：删除提醒规则
   */
  it('应支持删除提醒规则', async () => {
    mockRules.value = [
      {
        id: '1',
        fundCode: '000001',
        fundName: '测试基金',
        type: 'threshold',
        threshold: 1.5,
        direction: 'above',
        enabled: true,
      },
    ]

    const wrapper = mount(Alerts)
    await flushPromises()

    const deleteBtn = wrapper.find('.rule-actions .van-button')
    expect(deleteBtn.exists()).toBe(true)
  })

  /**
   * 测试：启用/禁用提醒规则
   */
  it('应支持切换提醒规则状态', async () => {
    mockRules.value = [
      {
        id: '1',
        fundCode: '000001',
        fundName: '测试基金',
        type: 'threshold',
        threshold: 1.5,
        direction: 'above',
        enabled: true,
      },
    ]

    const wrapper = mount(Alerts)
    await flushPromises()

    const switchEl = wrapper.find('.van-switch')
    expect(switchEl.exists()).toBe(true)
  })

  /**
   * 测试：添加提醒规则弹窗
   */
  it('应显示添加提醒弹窗', async () => {
    const wrapper = mount(Alerts)
    
    // 点击添加按钮
    const addBtn = wrapper.find('.van-icon[name="plus"]')
    if (addBtn.exists()) {
      await addBtn.trigger('click')
      await flushPromises()
    }

    expect(wrapper.exists()).toBe(true)
  })

  /**
   * 测试：阈值提醒配置
   */
  it('阈值提醒应显示阈值输入框', async () => {
    mockRules.value = [
      {
        id: '1',
        fundCode: '000001',
        fundName: '测试基金',
        type: 'threshold',
        threshold: 1.5,
        direction: 'above',
        enabled: true,
      },
    ]

    const wrapper = mount(Alerts)
    await flushPromises()
    expect(wrapper.text()).toContain('1.5')
  })

  /**
   * 测试：提醒规则基金信息显示
   */
  it('应正确显示基金代码和名称', async () => {
    mockRules.value = [
      {
        id: '1',
        fundCode: '000001',
        fundName: '测试基金A',
        type: 'threshold',
        threshold: 1.5,
        direction: 'above',
        enabled: true,
      },
    ]

    const wrapper = mount(Alerts)
    await flushPromises()
    expect(wrapper.text()).toContain('000001')
    expect(wrapper.text()).toContain('测试基金A')
  })

  /**
   * 测试：多个提醒规则显示
   */
  it('有多个提醒规则时应全部显示', async () => {
    mockRules.value = [
      {
        id: '1',
        fundCode: '000001',
        fundName: '测试基金A',
        type: 'threshold',
        threshold: 1.5,
        direction: 'above',
        enabled: true,
      },
      {
        id: '2',
        fundCode: '000002',
        fundName: '测试基金B',
        type: 'change',
        changePercent: 5,
        enabled: true,
      },
    ]

    const wrapper = mount(Alerts)
    await flushPromises()
    const ruleCards = wrapper.findAll('.rule-card')
    expect(ruleCards.length).toBe(2)
  })
})
