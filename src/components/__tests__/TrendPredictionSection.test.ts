// [WHY] TrendPredictionSection 组件单元测试
// [WHAT] 验证趋势预测区块的渲染、趋势方向、信号列表、基金评分
// [DEPS] @vue/test-utils、vitest

import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import TrendPredictionSection from '../TrendPredictionSection.vue'

const mockTrendPrediction = {
  trend: 'up' as const,
  confidence: 75,
  supportLevel: 1.20,
  resistanceLevel: 1.35,
  signals: [
    { name: 'MACD', type: 'buy' as const, description: '金叉信号' },
    { name: 'RSI', type: 'hold' as const, description: '中性区域' },
  ],
}

const mockFundScore = {
  totalScore: 85,
  level: 'A',
  recommendation: '优质基金，建议关注',
}

describe('TrendPredictionSection', () => {
  /**
   * 测试：加载状态显示
   */
  it('应显示加载状态', () => {
    const wrapper = mount(TrendPredictionSection, {
      props: {
        trendPrediction: null,
        isTrendLoading: true,
      },
    })
    expect(wrapper.text()).toContain('加载中...')
  })

  /**
   * 测试：有趋势数据时显示趋势方向
   */
  it('应显示趋势方向', () => {
    const wrapper = mount(TrendPredictionSection, {
      props: {
        trendPrediction: mockTrendPrediction,
        isTrendLoading: false,
      },
    })
    expect(wrapper.find('.trend-text').text()).toBe('看涨')
    expect(wrapper.find('.trend-direction').classes()).toContain('up')
  })

  /**
   * 测试：置信度显示
   */
  it('应显示置信度', () => {
    const wrapper = mount(TrendPredictionSection, {
      props: {
        trendPrediction: mockTrendPrediction,
        isTrendLoading: false,
      },
    })
    expect(wrapper.find('.trend-confidence .value').text()).toBe('75%')
  })

  /**
   * 测试：支撑位和阻力位显示
   */
  it('应显示支撑位和阻力位', () => {
    const wrapper = mount(TrendPredictionSection, {
      props: {
        trendPrediction: mockTrendPrediction,
        isTrendLoading: false,
      },
    })
    const labels = wrapper.findAll('.level-label')
    expect(labels.at(0).text()).toBe('支撑位')
    expect(wrapper.find('.level-value.down').text()).toBe('1.2')
    expect(wrapper.find('.level-value.up').text()).toBe('1.35')
  })

  /**
   * 测试：信号列表渲染
   */
  it('应渲染信号列表', () => {
    const wrapper = mount(TrendPredictionSection, {
      props: {
        trendPrediction: mockTrendPrediction,
        isTrendLoading: false,
      },
    })
    const signalItems = wrapper.findAll('.signal-item')
    expect(signalItems.length).toBe(2)
    expect(signalItems.at(0).find('.signal-name').text()).toBe('MACD')
    expect(signalItems.at(0).find('.signal-type').classes()).toContain('buy')
  })

  /**
   * 测试：基金评分显示
   */
  it('应显示基金评分', () => {
    const wrapper = mount(TrendPredictionSection, {
      props: {
        trendPrediction: mockTrendPrediction,
        fundScore: mockFundScore,
        isTrendLoading: false,
      },
    })
    expect(wrapper.find('.score-value').text()).toBe('85')
    expect(wrapper.find('.score-level').text()).toBe('A级')
    expect(wrapper.find('.score-desc').text()).toBe('优质基金，建议关注')
  })

  /**
   * 测试：无基金评分时不显示评分卡片
   */
  it('无基金评分时不显示评分卡片', () => {
    const wrapper = mount(TrendPredictionSection, {
      props: {
        trendPrediction: mockTrendPrediction,
        isTrendLoading: false,
      },
    })
    expect(wrapper.find('.fund-score-card').exists()).toBe(false)
  })

  /**
   * 测试：空状态显示
   */
  it('无趋势数据时显示空状态', () => {
    const wrapper = mount(TrendPredictionSection, {
      props: {
        trendPrediction: null,
        isTrendLoading: false,
      },
    })
    // van-empty 在 happy-dom 中可能不渲染插槽文本，检查 DOM 结构即可
    expect(wrapper.find('.trend-section').exists()).toBe(true)
    expect(wrapper.find('.trend-header').exists()).toBe(false)
  })

  /**
   * 测试：看跌趋势
   */
  it('看跌趋势应显示下跌样式', () => {
    const bearPrediction = {
      ...mockTrendPrediction,
      trend: 'down' as const,
    }
    const wrapper = mount(TrendPredictionSection, {
      props: {
        trendPrediction: bearPrediction,
        isTrendLoading: false,
      },
    })
    expect(wrapper.find('.trend-text').text()).toBe('看跌')
    expect(wrapper.find('.trend-direction').classes()).toContain('down')
  })

  /**
   * 测试：震荡趋势
   */
  it('震荡趋势应显示中性样式', () => {
    const sidewaysPrediction = {
      ...mockTrendPrediction,
      trend: 'sideways' as const,
    }
    const wrapper = mount(TrendPredictionSection, {
      props: {
        trendPrediction: sidewaysPrediction,
        isTrendLoading: false,
      },
    })
    expect(wrapper.find('.trend-text').text()).toBe('震荡')
    expect(wrapper.find('.trend-direction').classes()).toContain('sideways')
  })
})
