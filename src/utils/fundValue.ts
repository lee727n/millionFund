// [WHAT] 基金「当前该用哪个值」的唯一决策出口
// [WHY] 过去「用净值还是估值 / 净值是多少 / 估值是多少 / 净值是不是最新的」
//       这套判断散落在 8 个文件 11 个地方，写法各不相同，已经造成过一次线上事故
//       （dataSource 语义被改，导致今天的交易被上一期净值错误确认）。
//       本文件把这些判断收敛成一处，调用方一律读结果，不许自己再判断。
//
// [RULE] 调用方只准读 FundValueResult 的字段：
//   - 要「当前该显示的值」     → value
//   - 要「这是净值还是估值」   → isNav        （不许写 dataSource === 'nav'）
//   - 要「今天的净值出没出」   → navIsCurrent （不许写 dataSource !== 'nav'）
//
// [NOT PURE?] resolveFundValue 是**纯取值**，不带任何副作用：
//             不会写 localStorage、不会确认交易记录。
//             updateTradesByCode 和「恢复 estimated」守卫仍由调用方负责，
//             这样只想要展示值的地方不会被迫去确认交易。

import { fetchFundAccurateData, type FundAccurateData } from '@/api/fundFast'

export interface FundValueResult {
  code: string
  name: string

  /**
   * 最终该用的值。等价于过去的 currentValue。
   * [NOTE] 0 是「本次不更新」的信号（盘中估值失败时特意置 0，
   *        让 updateHoldingWithAccurateData 跳过更新、保持之前的数据），
   *        不是「基金跌到 0」。需要区分时用 hasValue。
   */
  value: number
  /** value > 0，方便调用方区分「值为 0」和「没有值」 */
  hasValue: boolean

  /**
   * value 里装的到底是净值还是估值。
   * [USAGE] UI 的「净 / 估」文案、交易弹窗的成交价基准类型（isEstimate = !isNav）
   */
  isNav: boolean

  /**
   * 这一期净值是不是「今天的」（QDII 允许前一工作日）。
   * [USAGE] 决定今天的交易能不能用这个净值确认份额。
   * [WHY] 与 isNav 是两个不同的问题：盘前 / 周末显示的是净值（isNav = true），
   *       但那期净值不属于今天（navIsCurrent = false），不能用来确认今天的单。
   */
  navIsCurrent: boolean

  /**
   * 这个值是不是「今天已经确认的净值」= isNav && navIsCurrent
   * [USAGE] 交易弹窗的 isEstimate 就是 !isConfirmed
   * [WHY] 两个条件缺一不可：盘前 / 周末拿到的上一期净值，isNav 是 true（它确实是净值），
   *       但 navIsCurrent 是 false（不属于今天）—— 那仍然只是参考值，
   *       必须保持 estimated，等真净值出来再重新确认，否则份额算错。
   */
  isConfirmed: boolean

  // ---- 明细，供需要分别展示净值 / 估值的页面使用 ----
  nav: number
  navDate: string
  navChange: number
  estimate: number
  estimateTime: string
  estimateChange: number
  dayChange: number
}

/**
 * 把 fetchFundAccurateData 的返回值压成决策结果
 * [WHAT] 纯函数，不做网络请求。手上已经有 FundAccurateData 时用这个。
 */
export function toFundValueResult(data: FundAccurateData): FundValueResult {
  return {
    code: data.code,
    name: data.name,
    value: data.currentValue,
    hasValue: data.currentValue > 0,
    isNav: data.isNav,
    navIsCurrent: data.navIsCurrent,
    isConfirmed: data.isNav && data.navIsCurrent,
    nav: data.nav,
    navDate: data.navDate,
    navChange: data.navChange,
    estimate: data.estimate,
    estimateTime: data.estimateTime,
    estimateChange: data.estimateChange,
    dayChange: data.dayChange
  }
}

/**
 * 统一的基金取值入口：判断净值是否已更新 → 取最新历史净值 → 取/算估值 → 选出当前值
 *
 * [WHAT] 内部调 fetchFundAccurateData，把结果压成 FundValueResult。
 * [WHAT] **纯取值，无副作用** —— 不确认交易、不写持仓。
 *
 * @param code 基金代码
 * @param isQDII 是否 QDII（净值 T+1/T+2 延迟，判定口径不同）
 * @param forceRefresh 是否忽略缓存强制刷新
 */
export async function resolveFundValue(
  code: string,
  isQDII: boolean = false,
  forceRefresh: boolean = false
): Promise<FundValueResult> {
  const data = await fetchFundAccurateData(code, isQDII, forceRefresh)
  return toFundValueResult(data)
}
