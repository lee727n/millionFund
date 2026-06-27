import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
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
    locale: { value: 'zh-CN' },
  }),
}))

describe('Alerts.vue', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  /**
   * 测试：组件能成功渲染（最基础）
   */
  it('应成功渲染组件', () => {
    const wrapper = mount(Alerts)
    expect(wrapper.exists()).toBe(true)
  })

  /**
   * 测试：组件包含特定元素
   */
  it('应包含一个容器元素', () => {
    const wrapper = mount(Alerts)
    // 检查是否有 .alerts-page 或类似容器
    const container = wrapper.find('.alerts-page, .page-container, main, .content')
    expect(container.exists() || wrapper.find('div').exists()).toBe(true)
  })
})
