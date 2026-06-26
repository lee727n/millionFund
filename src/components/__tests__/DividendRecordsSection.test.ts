// [WHY] DividendRecordsSection 组件单元测试
// [WHAT] 验证分红记录区块的渲染、记录列表、累计分红统计
// [DEPS] @vue/test-utils、vitest

import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import DividendRecordsSection from '../DividendRecordsSection.vue'

const mockDividendRecords = [
  { date: '2024-01-15', amount: 0.1234, type: '现金分红' },
  { date: '2024-06-15', amount: 0.1567, type: '现金分红' },
  { date: '2024-12-15', amount: 0.0890, type: '红利再投资' },
]

describe('DividendRecordsSection', () => {
  /**
   * 测试：显示分红记录列表
   */
  it('应显示分红记录列表', () => {
    const wrapper = mount(DividendRecordsSection, {
      props: {
        dividendRecords: mockDividendRecords,
        totalDividend: 0.3691,
      },
    })
    expect(wrapper.find('.dividend-list').exists()).toBe(true)
    const items = wrapper.findAll('.dividend-item')
    expect(items.length).toBe(3)
  })

  /**
   * 测试：显示累计分红次数和总额
   */
  it('应显示累计分红统计', () => {
    const wrapper = mount(DividendRecordsSection, {
      props: {
        dividendRecords: mockDividendRecords,
        totalDividend: 0.3691,
      },
    })
    const tip = wrapper.find('.section-tip')
    expect(tip.text()).toBe('累计3次，共0.3691元/份')
  })

  /**
   * 测试：每份派息金额格式化
   */
  it('应格式化每份派息金额', () => {
    const wrapper = mount(DividendRecordsSection, {
      props: {
        dividendRecords: mockDividendRecords,
        totalDividend: 0.3691,
      },
    })
    const amounts = wrapper.findAll('.dividend-amount')
    expect(amounts.at(0).text()).toBe('每份派0.1234元')
    expect(amounts.at(1).text()).toBe('每份派0.1567元')
  })

  /**
   * 测试：分红类型显示
   */
  it('应显示分红类型', () => {
    const wrapper = mount(DividendRecordsSection, {
      props: {
        dividendRecords: mockDividendRecords,
        totalDividend: 0.3691,
      },
    })
    const types = wrapper.findAll('.dividend-type')
    expect(types.at(0).text()).toBe('现金分红')
    expect(types.at(1).text()).toBe('现金分红')
    expect(types.at(2).text()).toBe('红利再投资')
  })

  /**
   * 测试：日期显示
   */
  it('应显示分红日期', () => {
    const wrapper = mount(DividendRecordsSection, {
      props: {
        dividendRecords: mockDividendRecords,
        totalDividend: 0.3691,
      },
    })
    const dates = wrapper.findAll('.dividend-date')
    expect(dates.at(0).text()).toBe('2024-01-15')
    expect(dates.at(2).text()).toBe('2024-12-15')
  })

  /**
   * 测试：超过5条记录时显示更多提示
   */
  it('超过5条记录时显示更多提示', () => {
    const manyRecords = Array.from({ length: 8 }, (_, i) => ({
      date: `2024-${String(i + 1).padStart(2, '0')}-15`,
      amount: 0.1,
      type: '现金分红',
    }))
    const wrapper = mount(DividendRecordsSection, {
      props: {
        dividendRecords: manyRecords,
        totalDividend: 0.8,
      },
    })
    expect(wrapper.find('.more-hint').text()).toBe('还有3条记录...')
  })

  /**
   * 测试：5条以内记录不显示更多提示
   */
  it('5条以内记录不显示更多提示', () => {
    const wrapper = mount(DividendRecordsSection, {
      props: {
        dividendRecords: mockDividendRecords,
        totalDividend: 0.3691,
      },
    })
    expect(wrapper.find('.more-hint').exists()).toBe(false)
  })

  /**
   * 测试：空记录列表不渲染区块
   */
  it('空记录列表不渲染区块', () => {
    const wrapper = mount(DividendRecordsSection, {
      props: {
        dividendRecords: [],
        totalDividend: 0,
      },
    })
    expect(wrapper.find('.info-section').exists()).toBe(false)
  })
})
