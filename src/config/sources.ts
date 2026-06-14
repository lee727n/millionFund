// [WHY] 基金来源统一配置，避免多处硬编码
// [WHAT] 定义来源标识与显示名称、图标的映射关系

export interface FundSource {
  label: string
  icon: string
}

export const FUND_SOURCES: Record<string, FundSource> = {
  ali: { label: '支付宝', icon: 'ali.jpg' },
  TX: { label: '腾讯', icon: 'TX.jpg' },
  JD: { label: '京东', icon: 'JD.jpg' },
  observe: { label: '观察', icon: 'eye.png' }
}

/** 获取来源显示名称 */
export function getSourceLabel(source: string): string {
  return FUND_SOURCES[source]?.label ?? source
}

/** 所有来源选项（用于选择器） */
export const sourceOptions = Object.entries(FUND_SOURCES).map(([value, config]) => ({
  text: config.label,
  value
}))
