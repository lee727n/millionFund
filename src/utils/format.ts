// [WHY] 统一数据格式化，保证 UI 展示一致性
// [WHAT] 金额、百分比、日期等格式化函数

/**
 * 格式化金额（保留2位小数）
 * [WHAT] 用于净值、市值等金额展示
 * @param value 原始数值
 * @param prefix 前缀（如 ¥）
 * @param integerOnly 是否只显示整数
 */
export function formatMoney(value: number | string, prefix = '', integerOnly = false): string {
  const num = typeof value === 'string' ? parseFloat(value) : value
  if (isNaN(num)) return '--'
  return `${prefix}${integerOnly ? Math.floor(num).toLocaleString() : num.toFixed(2)}`
}

/**
 * 格式化百分比
 * [WHAT] 用于涨跌幅展示
 * [EDGE] 正数添加 + 号，负数保留原有 - 号
 * @param value 百分比数值（如 1.23 表示 1.23%）
 * @param withSign 是否显示正负号
 * @param integerOnly 是否只显示整数
 */
export function formatPercent(value: number | string, withSign = true, integerOnly = false): string {
  const num = typeof value === 'string' ? parseFloat(value) : value
  if (isNaN(num)) return '--'
  const sign = withSign && num > 0 ? '+' : ''
  return `${sign}${integerOnly ? Math.floor(num) : num.toFixed(2)}%`
}

/**
 * 格式化净值（保留4位小数）
 * [WHAT] 基金净值通常保留4位小数
 */
export function formatNetValue(value: number | string): string {
  const num = typeof value === 'string' ? parseFloat(value) : value
  if (isNaN(num)) return '--'
  return num.toFixed(4)
}

/**
 * 判断涨跌状态
 * [WHAT] 用于决定文字颜色（红涨绿跌）
 * @returns 'up' | 'down' | 'flat'
 */
export function getChangeStatus(value: number | string): 'up' | 'down' | 'flat' {
  const num = typeof value === 'string' ? parseFloat(value) : value
  if (isNaN(num) || num === 0) return 'flat'
  return num > 0 ? 'up' : 'down'
}

/**
 * 格式化时间（HH:mm）
 * [WHAT] 用于展示估值更新时间
 */
export function formatTime(timeStr: string): string {
  if (!timeStr) return '--'
  // 输入格式：2024-01-01 15:00
  const parts = timeStr.split(' ')
  return parts[1] || timeStr
}

/**
 * 格式化日期（MM-DD）
 */
export function formatDate(timeStr: string): string {
  if (!timeStr) return '--'
  // 输入格式：2024-01-01 15:00
  const parts = timeStr.split(' ')[0]?.split('-')
  if (!parts || parts.length < 3) return timeStr
  return `${parts[1]}-${parts[2]}`
}
