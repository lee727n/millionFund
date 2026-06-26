// [WHY] FundAnnouncementsSection 组件单元测试
// [WHAT] 验证基金公告区块的渲染、公告列表、点击事件
// [DEPS] @vue/test-utils、vitest

import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import FundAnnouncementsSection from '../FundAnnouncementsSection.vue'

const mockAnnouncements = [
  {
    id: '1',
    title: '华夏成长混合基金分红公告',
    date: '2024-01-15',
    type: '分红公告',
    url: 'https://example.com/announcement/1',
  },
  {
    id: '2',
    title: '2024年年度报告',
    date: '2024-03-15',
    type: '定期报告',
    url: 'https://example.com/announcement/2',
  },
  {
    id: '3',
    title: '基金经理变更公告',
    date: '2024-06-01',
    type: '人事变动',
    url: 'https://example.com/announcement/3',
  },
]

describe('FundAnnouncementsSection', () => {
  /**
   * 测试：显示公告列表
   */
  it('应显示公告列表', () => {
    const wrapper = mount(FundAnnouncementsSection, {
      props: {
        announcements: mockAnnouncements,
      },
    })
    expect(wrapper.find('.announcement-list').exists()).toBe(true)
    const items = wrapper.findAll('.announcement-item')
    expect(items.length).toBe(3)
  })

  /**
   * 测试：公告标题显示
   */
  it('应显示公告标题', () => {
    const wrapper = mount(FundAnnouncementsSection, {
      props: {
        announcements: mockAnnouncements,
      },
    })
    const titles = wrapper.findAll('.announcement-title')
    expect(titles.at(0).text()).toBe('华夏成长混合基金分红公告')
    expect(titles.at(1).text()).toBe('2024年年度报告')
  })

  /**
   * 测试：公告日期显示
   */
  it('应显示公告日期', () => {
    const wrapper = mount(FundAnnouncementsSection, {
      props: {
        announcements: mockAnnouncements,
      },
    })
    const dates = wrapper.findAll('.announcement-date')
    expect(dates.at(0).text()).toBe('2024-01-15')
    expect(dates.at(2).text()).toBe('2024-06-01')
  })

  /**
   * 测试：公告类型标签显示
   */
  it('应显示公告类型标签', () => {
    const wrapper = mount(FundAnnouncementsSection, {
      props: {
        announcements: mockAnnouncements,
      },
    })
    const types = wrapper.findAll('.announcement-type')
    expect(types.at(0).text()).toBe('分红')
    expect(types.at(1).text()).toBe('报告')
    expect(types.at(2).text()).toBe('人事')
  })

  /**
   * 测试：点击公告时触发 openAnnouncement 事件
   */
  it('点击公告时应触发 openAnnouncement 事件', async () => {
    const wrapper = mount(FundAnnouncementsSection, {
      props: {
        announcements: mockAnnouncements,
      },
    })
    await wrapper.find('.announcement-item').trigger('click')
    const emitted = wrapper.emitted('openAnnouncement')
    expect(emitted).toBeTruthy()
    expect(emitted![0]).toEqual(['https://example.com/announcement/1'])
  })

  /**
   * 测试：点击第二条公告触发正确事件
   */
  it('点击第二条公告应传递正确的 URL', async () => {
    const wrapper = mount(FundAnnouncementsSection, {
      props: {
        announcements: mockAnnouncements,
      },
    })
    const items = wrapper.findAll('.announcement-item')
    await items.at(1).trigger('click')
    const emitted = wrapper.emitted('openAnnouncement')
    expect(emitted![0]).toEqual(['https://example.com/announcement/2'])
  })

  /**
   * 测试：公告类型样式类名
   */
  it('公告类型应有正确的样式类名', () => {
    const wrapper = mount(FundAnnouncementsSection, {
      props: {
        announcements: mockAnnouncements,
      },
    })
    const types = wrapper.findAll('.announcement-type')
    expect(types.at(0).classes()).toContain('分红公告')
    expect(types.at(1).classes()).toContain('定期报告')
    expect(types.at(2).classes()).toContain('人事变动')
  })

  /**
   * 测试：通用公告类型样式
   */
  it('通用公告类型应使用默认样式', () => {
    const generalAnnouncements = [
      {
        id: '4',
        title: '其他公告',
        date: '2024-07-01',
        type: '其他',
      },
    ]
    const wrapper = mount(FundAnnouncementsSection, {
      props: {
        announcements: generalAnnouncements,
      },
    })
    expect(wrapper.find('.announcement-type').classes()).toContain('其他')
    expect(wrapper.find('.announcement-type').text()).toBe('公告')
  })

  /**
   * 测试：超过5条公告时只显示前5条
   */
  it('超过5条公告时只显示前5条', () => {
    const manyAnnouncements = Array.from({ length: 8 }, (_, i) => ({
      id: String(i + 1),
      title: `公告 ${i + 1}`,
      date: `2024-0${(i % 9) + 1}-01`,
      type: '公告',
    }))
    const wrapper = mount(FundAnnouncementsSection, {
      props: {
        announcements: manyAnnouncements,
      },
    })
    expect(wrapper.findAll('.announcement-item').length).toBe(5)
  })

  /**
   * 测试：空公告列表不渲染区块
   */
  it('空公告列表不渲染区块', () => {
    const wrapper = mount(FundAnnouncementsSection, {
      props: {
        announcements: [],
      },
    })
    expect(wrapper.find('.info-section').exists()).toBe(false)
  })
})
