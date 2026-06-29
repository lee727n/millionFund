// [WHY] Home.vue 首页组件单元测试
// [WHAT] 验证首页渲染、汇总信息、持仓列表、自选基金、 onboarding、错误降级
// [DEPS] @vue/test-utils、vitest、pinia

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import Home from '../Home.vue'
// [WHY] 导入共享响应式状态（放在单独模块避免 vi.mock 提升导致的初始化顺序问题）
import {
  indices,
  globalIndices,
  tradingSession,
  currentTime,
  isRefreshing,
  loadIndices,
  loadGlobalIndices,
} from './homeState'

// [WHY] 模拟 vue-router
vi.mock('vue-router', () => ({
  useRouter: () => ({
    push: vi.fn(),
    back: vi.fn(),
  }),
}))

// [WHY] 模拟 fund store
vi.mock('@/stores/fund', () => ({
  useFundStore: () => ({
    watchlist: [],
    isRefreshing: false,
    lastRefreshTime: '',
    initWatchlist: vi.fn(),
    refreshEstimates: vi.fn().mockResolvedValue(undefined),
    removeFund: vi.fn(),
  }),
}))

// [WHY] 模拟 holding store - 使用共享引用确保测试修改能反映到组件
const mockHoldingStore = {
  holdings: [],
  isRefreshing: false,
  portfolioSummary: null,
  summary: { totalValue: 0, totalProfit: 0, totalProfitRate: 0, todayProfit: 0 },
  holdingCodes: [],
  initHoldings: vi.fn(),
  refreshEstimates: vi.fn().mockResolvedValue(undefined),
  addOrUpdateHolding: vi.fn(),
  removeHolding: vi.fn(),
  hasHolding: vi.fn(),
  getHoldingByCode: vi.fn(),
  updateHoldingDays: vi.fn(),
  fetchPortfolioSummary: vi.fn(),
}

vi.mock('@/stores/holding', () => ({
  useHoldingStore: () => mockHoldingStore,
}))

// [WHY] 模拟 network store
vi.mock('@/stores/network', () => ({
  useNetworkStore: () => ({
    isOnline: true,
    justRecovered: false,
  }),
}))

// [WHY] 模拟 useHomeData composable（返回 ref 保证响应式）
vi.mock('@/composables/useHomeData', () => ({
  useHomeData: () => ({
    indices,
    globalIndices,
    tradingSession,
    currentTime,
    isRefreshing,
    loadIndices,
    loadGlobalIndices,
  }),
}))

// [WHY] 模拟 useActionSheet composable
vi.mock('@/composables/useActionSheet', () => ({
  useActionSheet: () => ({
    show: { value: false },
    title: { value: '' },
    actions: { value: [] },
    context: { value: {} },
    open: vi.fn(),
    close: vi.fn(),
    onSelect: vi.fn(),
  }),
}))

// [WHY] 模拟 Vant 组件
vi.mock('vant', () => ({
  showToast: vi.fn(),
  showConfirmDialog: vi.fn().mockResolvedValue('confirmed'),
}))

// [WHY] 模拟子组件
vi.mock('@/components/FundCard.vue', () => ({
  default: {
    template: '<div class="mock-fund-card" />',
    props: ['fund'],
  },
}))
vi.mock('@/components/FundGridItem.vue', () => ({
  default: {
    template: '<div class="mock-fund-grid-item" />',
    props: ['fund', 'uiMode', 'tradingSession'],
  },
}))
vi.mock('@/components/QuickActionsBar.vue', () => ({
  default: {
    template: '<div class="mock-quick-actions" />',
    props: ['modelValue'],
  },
}))
vi.mock('@/components/IntradayChartPopup.vue', () => ({
  default: {
    template: '<div class="mock-intraday-popup" />',
    props: ['show', 'fund'],
  },
}))
vi.mock('@/components/TopHoldingsPopup.vue', () => ({
  default: {
    template: '<div class="mock-top-holdings-popup" />',
    props: ['show', 'fund'],
  },
}))

describe('Home.vue - 首页', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    // [WHY] 重置 mockHoldingStore（防止测试间状态泄漏）
    mockHoldingStore.holdings = []
    mockHoldingStore.isRefreshing = false
    mockHoldingStore.portfolioSummary = null
    mockHoldingStore.summary = {
      totalValue: 0,
      totalProfit: 0,
      totalProfitRate: 0,
      todayProfit: 0,
    }
    mockHoldingStore.holdingCodes = []
    // [WHY] 重置共享状态
    indices.value = [
      { code: '000001', name: '上证指数', current: 3200, change: 20, changePercent: 0.63 },
      { code: '399006', name: '创业板指', current: 2100, change: -10, changePercent: -0.48 },
    ]
    globalIndices.value = [
      { code: 'IXIC', name: '纳斯达克', price: 18000, changePercent: 1.2 },
    ]
    tradingSession.value = 'closed'
    currentTime.value = new Date('2026-06-27T14:30:00')
    isRefreshing.value = false
  })

  /**
   * 测试：页面结构存在
   */
  it('应渲染首页', () => {
    const wrapper = mount(Home)
    expect(wrapper.find('.home-page').exists()).toBe(true)
  })

  /**
   * 测试：顶部应用标题显示
   */
  it('应显示应用标题', () => {
    const wrapper = mount(Home)
    expect(wrapper.text()).toContain('AI 百万实盘')
  })

  /**
   * 测试：页面无自选且无持仓时显示 onboarding 引导
   */
  it('无自选基金时应显示 onboarding 引导卡片', () => {
    const wrapper = mount(Home)
    expect(wrapper.find('.onboarding-card').exists()).toBe(true)
    expect(wrapper.text()).toContain('欢迎使用基金管理')
  })

  /**
   * 测试：onboarding 引导包含添加自选和添加持仓按钮
   */
  it('onboarding 引导应包含添加自选和添加持仓按钮', () => {
    const wrapper = mount(Home)
    expect(wrapper.text()).toContain('添加自选基金')
    expect(wrapper.text()).toContain('添加持仓记录')
  })

  /**
   * 测试：有持仓时显示持仓趋势区块
   */
  it('有持仓时应显示持仓趋势区块', () => {
    mockHoldingStore.holdings = [
      {
        code: '000001',
        name: '测试基金',
        source: '手动',
        assetClass: 'fund',
        buyNetValue: 1.0,
        shares: 1000,
        buyDate: '2026-01-01',
        holdingDays: 180,
        marketValue: 10000,
        profit: 1000,
        profitRate: 10,
        todayProfit: 100,
        todayChange: '1.0',
        isUpdated: true,
        createdAt: Date.now(),
      } as any,
    ]

    const wrapper = mount(Home)
    expect(wrapper.find('.market-overview').exists()).toBe(true)
  })

  /**
   * 测试：指数概览区块显示
   */
  it('有指数数据时应显示全球主要指数区块', () => {
    const wrapper = mount(Home)
    expect(wrapper.text()).toContain('全球主要指数')
  })

  /**
   * 测试：指数名称显示
   */
  it('应显示上证指数、纳斯达克等指数名称', () => {
    const wrapper = mount(Home)
    expect(wrapper.text()).toContain('上证指数')
    expect(wrapper.text()).toContain('纳斯达克')
  })

  /**
   * 测试：空自选时显示 onboarding，有自选时显示自选基金标题
   */
  it('有自选基金时应显示自选基金标题', async () => {
    const { useFundStore } = await import('@/stores/fund')
    const fundStore = useFundStore()
    fundStore.watchlist = [
      { code: '000001', name: '测试基金', loading: false },
    ]

    const wrapper = mount(Home)
    expect(wrapper.text()).toContain('自选基金')
  })

  /**
   * 测试：周末状态显示
   */
  it('周末应显示休市状态', () => {
    tradingSession.value = 'weekend'
    currentTime.value = new Date('2026-06-27T10:00:00') // 周六

    const wrapper = mount(Home)
    expect(wrapper.text()).toContain('休市')
  })

  /**
   * 测试：页面包含主要区块结构
   */
  it('应包含顶部搜索栏、持仓趋势、指数概览等主要区块', () => {
    const wrapper = mount(Home)
    expect(wrapper.find('.home-page').exists()).toBe(true)
    expect(wrapper.find('.market-overview').exists()).toBe(true)
  })

  /**
   * 测试：持仓趋势区块有持仓时应显示盈亏统计
   */
  it('有持仓时应显示利润率/盈亏统计', () => {
    mockHoldingStore.holdings = [
      {
        code: '000001',
        name: '测试基金',
        source: '手动',
        assetClass: 'fund',
        buyNetValue: 1.0,
        shares: 1000,
        buyDate: '2026-01-01',
        holdingDays: 180,
        marketValue: 10000,
        profit: 1000,
        profitRate: 10,
        todayProfit: 100,
        todayChange: '1.0',
        isUpdated: true,
        createdAt: Date.now(),
      } as any,
    ]
    mockHoldingStore.summary = {
      totalValue: 10000,
      totalProfit: 1000,
      totalProfitRate: 10,
      todayProfit: 100,
    }

    const wrapper = mount(Home)
    expect(wrapper.text()).toContain('利润率')
    expect(wrapper.text()).toContain('今日盈亏')
  })

  /**
   * 测试：操作按钮存在
   */
  it('应有排序按钮', () => {
    mockHoldingStore.holdings = [
      {
        code: '000001',
        name: '测试基金',
        source: '手动',
        assetClass: 'fund',
        buyNetValue: 1.0,
        shares: 1000,
        buyDate: '2026-01-01',
        holdingDays: 180,
        marketValue: 10000,
        profit: 1000,
        profitRate: 10,
        todayProfit: 100,
        todayChange: '1.0',
        isUpdated: true,
        createdAt: Date.now(),
      } as any,
    ]

    const wrapper = mount(Home)
    // 排序图标按钮通过 CSS 类存在
    const sortButtons = wrapper.findAll('.sort-icon-button')
    expect(sortButtons.length).toBeGreaterThanOrEqual(2)
  })
})
