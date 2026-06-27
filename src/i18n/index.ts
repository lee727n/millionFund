// [WHY] i18n 国际化配置文件
// [WHAT] 配置 vue-i18n，支持中英文切换

import { createI18n } from 'vue-i18n'
import zhCN from './locales/zh-CN.json'
import enUS from './locales/en-US.json'

export const i18n = createI18n({
  legacy: false, // 使用 Composition API 模式
  locale: 'zh-CN', // 默认语言
  fallbackLocale: 'en-US', // 回退语言
  messages: {
    'zh-CN': zhCN,
    'en-US': enUS,
  },
})

// 导出便捷方法
export const { t, locale } = i18n.global
