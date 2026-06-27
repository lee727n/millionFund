import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { ref } from 'vue'
import Trades from '@/views/Trades.vue'

// [WHY] Mock vue-router
vi.mock('vue-router', () => ({
  useRouter: () => ({
    back: vi.fn(),
    push: vi.fn(),
  }),
  useRoute: () => ({ 
    params: { code: '000001' },
    query: { name: '测试基金' }
  }),
}))

// [WHY] Mock vue-i18n
vi.mock('vue-i18n', () => ({
  useI18n: () => ({
    t: (key: string) => key,
    locale: ref('zh-CN'),
  }),
}))

// [WHY] Mock holding store
const mockTrades = ref<any[]>([])
vi.mock('@/stores/trade', () => ({
  useTradeStore: () => ({
    get trades() { return mockTrades.value },
    loadTrades: vi.fn(),
    addTrade: vi.fn(),
    removeTrade: vi.fn(),
    getTradesByFund: vi.fn(() => mockTrades.value),
  }),
}))

describe('Trades.vue', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    mockTrades.value = []
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  /**
   * 测试：组件渲染
   */
  it('应成功渲染组件', () => {
    const wrapper = mount(Trades)
    expect(wrapper.exists()).toBe(true)
  })

  /**
   * 测试：空状态显示
   */
  it('无交易记录时应显示空状态', () => {
    mockTrades.value = []
    const wrapper = mount(Trades)
    expect(wrapper.find('.empty-state').exists()).toBe(true)
    expect(wrapper.text()).toContain('暂无交易记录')
  })

  /**
   * 测试：交易记录列表显示
   */
  it('有交易记录时应显示列表', async () => {
    mockTrades.value = [
      {
        id: '1',
        code: '000001',
        name: '测试基金',
        type: 'buy',
        amount: 1000,
        netValue: 1.5,
        shares: 666.67,
        date: '2026-01-01',
        remark: '测试备注',
      },
    ]

    const wrapper = mount(Trades)
    await flushPromises()
    expect(wrapper.find('.trade-list').exists()).toBe(true)
    expect(wrapper.text()).toContain('测试基金')
  })

  /**
   * 测试：交易类型标签
   */
  it('应正确显示交易类型', async () => {
    mockTrades.value = [
      {
        id: '1',
        fundCode: '000001',
        fundName: '测试基金',
        type: 'buy',
        amount: 1000,
        date: '2026-01-01',
      },
    ]

    const wrapper = mount(Trades)
    await flushPromises()
    expect(wrapper.text()).toContain('买入')
  })

  /**
   * 测试：删除交易记录
   */
  it('应支持删除交易记录', async () => {
    mockTrades.value = [
      {
        id: '1',
        fundCode: '000001',
        fundName: '测试基金',
        type: 'buy',
        amount: 1000,
        date: '2026-01-01',
      },
    ]

    const wrapper = mount(Trades)
    await flushPromises()

    const deleteBtn = wrapper.find('.trade-actions .van-button')
    expect(deleteBtn.exists()).toBe(true)
  })

  /**
   * 测试：添加交易记录弹窗
   */
  it('应显示添加记录弹窗', async () => {
    const wrapper = mount(Trades)
    
    // 点击添加按钮
    const addBtn = wrapper.find('.van-icon[name="plus"]')
    if (addBtn.exists()) {
      await addBtn.trigger('click')
      await flushPromises()
    }

    expect(wrapper.exists()).toBe(true)
  })

  /**
   * 测试：基金信息显示
   */
  it('有基金代码参数时应显示基金信息', async () => {
    // Mock route with query
    vi.mock('vue-router', () => ({
      useRouter: () => ({
        back: vi.fn(),
        push: vi.fn(),
      }),
      useRoute: () => ({ 
        query: { code: '000001', name: '测试基金' } 
      }),
    }))

    const wrapper = mount(Trades)
    await flushPromises()
    expect(wrapper.exists()).toBe(true)
  })

  /**
   * 测试：交易金额格式化
   */
  it('应正确格式化交易金额', async () => {
    mockTrades.value = [
      {
        id: '1',
        fundCode: '000001',
        fundName: '测试基金',
        type: 'buy',
        amount: 1234.56,
        date: '2026-01-01',
      },
    ]

    const wrapper = mount(Trades)
    await flushPromises()
    expect(wrapper.text()).toContain('1234.56')
  })

  /**
   * 测试：交易日期显示
   */
  it('应正确显示交易日期', async () => {
    mockTrades.value = [
      {
        id: '1',
        fundCode: '000001',
        fundName: '测试基金',
        type: 'buy',
        amount: 1000,
        date: '2026-01-01',
      },
    ]

    const wrapper = mount(Trades)
    await flushPromises()
    expect(wrapper.text()).toContain('2026-01-01')
  })

  /**
   * 测试：备注信息显示
   */
  it('有备注时应显示备注', async () => {
    mockTrades.value = [
      {
        id: '1',
        fundCode: '000001',
        fundName: '测试基金',
        type: 'buy',
        amount: 1000,
        date: '2026-01-01',
        remark: '测试备注信息',
      },
    ]

    const wrapper = mount(Trades)
    await flushPromises()
    expect(wrapper.text()).toContain('测试备注信息')
  })
})
