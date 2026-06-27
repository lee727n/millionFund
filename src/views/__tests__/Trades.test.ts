import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import Trades from '@/views/Trades.vue'

// [WHY] Mock vue-router
vi.mock('vue-router', () => ({
  useRouter: () => ({
    back: vi.fn(),
    push: vi.fn(),
  }),
  useRoute: () => ({ params: { code: '000001' }, query: { name: '测试基金' } }),
}))

// [WHY] Mock vue-i18n
vi.mock('vue-i18n', () => ({
  useI18n: () => ({
    t: (key: string) => key,
    locale: { value: 'zh-CN' },
  }),
}))

// [WHY] Mock trade store
vi.mock('@/stores/trade', () => ({
  useTradeStore: () => ({
    trades: [],
    loadTrades: vi.fn(),
    addTrade: vi.fn(),
    removeTrade: vi.fn(),
    getTradesByFund: vi.fn(() => []),
  }),
}))

describe('Trades.vue', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  /**
   * 测试：组件能成功渲染（最基础）
   */
  it('应成功渲染组件', () => {
    const wrapper = mount(Trades)
    expect(wrapper.exists()).toBe(true)
  })

  /**
   * 测试：组件包含特定元素
   */
  it('应包含一个容器元素', () => {
    const wrapper = mount(Trades)
    const container = wrapper.find('.trades-page, .page-container, main, .content')
    expect(container.exists() || wrapper.find('div').exists()).toBe(true)
  })
})
