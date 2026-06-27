// [WHY] 全局 vitest setup — mock vue-i18n，使所有测试文件无需单独 mock
// [WHAT] 从 locale json 文件加载翻译，t() 返回对应中文；未匹配 key 返回 key 本身
import { vi } from 'vitest'
import zhCN from '@/i18n/locales/zh-CN.json'

// 扁平化嵌套对象，支持 'nav.portfolio' 这样的 key
function flatten(obj: Record<string, unknown>, prefix = ''): Record<string, string> {
  const result: Record<string, string> = {}
  for (const key of Object.keys(obj)) {
    const value = obj[key]
    const path = prefix ? `${prefix}.${key}` : key
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      Object.assign(result, flatten(value as Record<string, unknown>, path))
    } else {
      result[path] = String(value)
    }
  }
  return result
}

const mockTranslations = flatten(zhCN)

vi.mock('vue-i18n', () => ({
  useI18n: () => ({
    t: (key: string, options?: Record<string, unknown>) => {
      let text = mockTranslations[key] ?? key
      if (options) {
        for (const [k, v] of Object.entries(options)) {
          text = text.replace(new RegExp(`\\{${k}\\}`, 'g'), String(v))
        }
      }
      return text
    },
    locale: { value: 'zh-CN' },
  }),
  createI18n: vi.fn(),
}))
