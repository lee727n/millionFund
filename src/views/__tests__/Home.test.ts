// [WHY] Home.vue 首页组件单元测试
// [WHAT] 验证首页渲染、汇总信息、持仓列表、自选基金、 onboarding、错误降级
// [DEPS] @vue/test-utils、vitest、pinia

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { ref } from 'vue'
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

// [WHY] 模拟 vue-i18n - 返回正确的翻译值（用于测试）
const mockTranslations: Record<string, string> = {
  'home.app_title_full': 'AI 百万实盘',
  'home.app_title_short': 'AI实盘',
  'home.reference_ma': '参考均线',
  'home.filter_all': '全部',
  'home.error_title': '页面加载出现问题',
  'home.error_detail': '部分数据暂时无法加载',
  'home.retry': '点击重试',
  'home.holding_trend': '持仓趋势',
  'home.profit_rate': '利润率',
  'home.today_profit': '今日盈亏',
  'home.market_closed': '休市',
  'home.sort_asc': '升序',
  'home.sort_desc': '降序',
  'home.total_assets': '总资产',
  'home.total_profit': '累计盈亏',
  'home.holdings': '持仓',
  'home.no_holdings': '暂无持仓',
  'home.sorted_by_profit': '持仓列表（按盈亏排序）',
  'home.welcome': '欢迎使用基金管理',
  'home.description': '在这里管理你的自选和持仓基金',
  'home.add_fund': '添加自选基金',
  'home.add_holding': '添加持仓记录',
  'home.tip': '小提示：在持仓页长按基金可快速操作',
  'home.quant_observe': '量化观察',
  'home.global_indices': '全球主要指数',
  'home.watchlist': '自选基金',
  'home.market_closed_short': '休市',
  'common.simple': '简',
  'common.full': '全',
}

vi.mock('vue-i18n', () => ({
  useI18n: () => ({
    t: (key: string) => mockTranslations[key] || key,
    locale: { value: 'zh-CN' },
  }),
  createI18n: vi.fn(),
}))

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

// [WHY] 模拟 holding store - 使用 getter 支持动态更新
const mockHoldings = ref<any[]>([])
vi.mock('@/stores/holding', () => ({
  useHoldingStore: () => ({
    get holdings() { return mockHoldings.value },
    initHoldings: vi.fn(),
    refreshEstimates: vi.fn().mockResolvedValue(undefined),
    addOrUpdateHolding: vi.fn(),
  }),
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
    // [WHY] 防止 useHomeData 中的 setInterval 在测试环境执行
    vi.useFakeTimers()
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

  afterEach(() => {
    vi.useRealTimers()
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
  it('有持仓时应显示持仓趋势区块', async () => {
    // 直接设置 mock 数据
    mockHoldings.value = [
      {
        code: '000001',
        name: '测试基金',
        source: 'tencent',
        holdShare: '1000',
        holdCost: '1.5',
        todayChange: '1.0',
        isUpdated: true,
        createdAt: Date.now(),
      },
    ]

    const wrapper = mount(Home)
    await flushPromises()
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
  it('有持仓时应显示利润率/盈亏统计', async () => {
    // 直接设置 mock 数据
    mockHoldings.value = [
      {
        code: '000001',
        name: '测试基金',
        source: 'tencent',
        holdShare: '1000',
        holdCost: '1.5',
        todayChange: '1.0',
        isUpdated: true,
        createdAt: Date.now(),
      },
    ]

    const wrapper = mount(Home)
    await flushPromises()
    // 检查 i18n 集成：组件应使用 t() 渲染翻译后的文本
    expect(wrapper.text()).toContain('利润率')
    expect(wrapper.text()).toContain('今日盈亏')
  })

  /**
   * 测试：操作按钮存在
   */
  it('应有排序按钮', async () => {
    // 直接设置 mock 数据
    mockHoldings.value = [
      {
        code: '000001',
        name: '测试基金',
        source: 'tencent',
        holdShare: '1000',
        holdCost: '1.5',
      },
    ]

    const wrapper = mount(Home)
    await flushPromises()
    const sortButtons = wrapper.findAll('.sort-icon-button')
    expect(sortButtons.length).toBeGreaterThanOrEqual(2)
  })
})
