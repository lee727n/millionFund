// [WHY] 交易日 / 净值日期的公共判定
// [WHAT] 「这一期净值是不是当前该拿到的那一期」全项目只应有这一个实现
// [DEPS] 依赖 holiday 的节假日表

import { getPrevWorkdaySync } from './holiday'

/**
 * 获取本地日历日字符串（YYYY-MM-DD），不做任何交易日位移
 * [WHAT] 纯粹是「今天几号」，9 点前也不会变成昨天
 * [WHY] 有些问题必须按真实日期回答，例如「今天的交易能不能用这个净值确认」——
 *       用 getProgressDateStr() 会把上一交易日的净值当成今天的，导致份额算错
 */
export function getCalendarDateStr(date: Date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

/**
 * 【仅用于基金更新进度条】获取「当前所处交易日」字符串（本地时间 YYYY-MM-DD）
 * [WHAT] 早于 9:00 时归属上一工作日（跳过周末和节假日）；9:00 起即为当天
 * [WHY] 净值往往要到半夜/次日上午才更新完，盘前就要求「今天的净值」会让整个早上
 *       进度条都是空的。所以进度条允许一个宽限期：9 点前拿到上一交易日的净值即算已更新。
 *
 * [SCOPE] 这是**进度条专用**的口径。估值、交易确认、缓存新鲜度、节假日判断等
 *         一切其他场景都必须用 getCalendarDateStr()（自然日）。
 *         默认口径就是自然日（见 isNavUpToDate），要用这个宽限期必须显式传入。
 *
 * [FIX] 原先直接减 24h，周一 08:00 会返回「周日」——任何净值日期都不可能是周日，
 *       于是周一早上进度条反而永远不更新，与设计意图相反。改为取上一工作日。
 * @param date 基准时间，默认当前时间
 */
export function getProgressDateStr(date: Date = new Date()): string {
  const calendarDate = getCalendarDateStr(date)
  if (date.getHours() >= 9) return calendarDate
  return getPrevWorkdaySync(calendarDate)
}

export interface NavUpToDateInput {
  /** 净值（<= 0 视为无效） */
  nav: number
  /** 净值日期 YYYY-MM-DD */
  navDate: string
  /** 是否 QDII 基金（净值时差晚 1~2 天，允许用前一工作日的净值） */
  isQDII?: boolean
  /** 基准交易日，默认取当前交易日 */
  today?: string
}

/**
 * 判断「这一期净值是不是当前该拿到的那一期」
 * [WHAT] 普通基金：净值日期 == today；QDII：净值日期 == today 或 today 的前一工作日
 * [WHY] 这是 `holding.isUpdated` 和 `FundAccurateData.navIsCurrent` 的唯一真相来源。
 *       这两处曾经各写一遍同样的公式，改一处忘一处就会导致
 *       「进度条说已更新、交易确认却按未更新处理」这类口径不一致。
 *
 * [IMPORTANT] `today` 默认是**自然日** getCalendarDateStr()，也就是「今天几号」。
 *   只有一个例外要显式传入 getProgressDateStr()：
 *   - 基金更新进度条「我身处那个交易日的净值拿到了吗」—— 9 点前归属上一交易日，
 *     是刻意设计的宽限期（净值半夜才更新完，否则整个早上进度条是空的）。
 *   - 其余场景（估值取值、交易守卫、缓存新鲜度）一律用默认的自然日。
 *     若误用 getProgressDateStr()，09:00 前的「上一交易日净值」会被当成今天的，
 *     交易守卫失效，今天的交易被 T-1 的净值确认掉，份额算错。
 * @returns true = 这一期净值就是当前该拿到的那一期
 */
export function isNavUpToDate(input: NavUpToDateInput): boolean {
  const { nav, navDate, isQDII = false } = input
  if (!(nav > 0) || !navDate) return false

  const today = input.today ?? getCalendarDateStr()
  if (navDate === today) return true
  if (!isQDII) return false
  return navDate === getPrevWorkdaySync(today)
}
