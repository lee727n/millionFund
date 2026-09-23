// [WHY] 添加基金 / 加仓 / 减仓 / 截图导入 多处都在重复「决定用净值还是估值」+「创建交易记录」的逻辑，
//       且字段拼装极易不一致（漏 estimated / 漏 source / 漏 estimateAtTrade）。
// [WHAT] 本 composable 把这两块抽成唯一出口：
//       1. resolveAddValue(data) —— 根据 fetchFundAccurateData 的结论决定「用哪期的价格算份额」+ 是否估值
//       2. createBuyTrade(params) —— 统一创建买入交易记录（K线买点标记 + 晚上净值更新后自动重算份额）
// [SCOPE] 全部交易写入入口已统一：Holding.vue(单加+批量导入)、Detail.vue(加仓/减仓)、
//        Home.vue(加仓/减仓)、PanoramaDashboard.vue(加仓/减仓)、ScreenshotImport.vue(截图导入)、
//        holding.ts(自愈补齐买点) 均改调本 composable。
//        AITracking.vue 因数据模型(AITrackingRecord)与确认逻辑(日期匹配历史净值)不同，保持独立未合并。

import { addTrade, getTradesByCode } from '@/utils/storage'
import type { FundAccurateData } from '@/api/fundFast'
import type { TradeType } from '@/types/fund'

/**
 * [WHAT] 决定「今天添加/加仓时，用哪期的价格来算份额」
 * [WHY] 交易时间内（净值未公布）应该用盘中实时估值（gsz）算份额，等晚上净值公布后
 *       再由 updateTradesByCode 用正式净值重算；净值已公布的日子直接走净值。
 * @returns netValue 用来算份额的价格；estimated 是否用估值（决定晚上要不要重算）
 */
export function resolveAddValue(data: FundAccurateData): { netValue: number; estimated: boolean } {
  // [WHAT] 净值已更新（今天该拿到的那期净值已出）：直接用净值，不算估值
  if (data.navIsCurrent) {
    return { netValue: data.nav > 0 ? data.nav : 1, estimated: false }
  }

  // [WHAT] 净值未更新 + 有实时估值（盘中/午休/盘后公布前）：用估值，标记晚上重算
  if (data.estimate > 0) {
    return { netValue: data.estimate, estimated: true }
  }

  // [EDGE] 无估值（盘前等缓存里只有上一期净值）：回退上一期净值，不算估值
  return { netValue: data.nav > 0 ? data.nav : 1, estimated: false }
}

/**
 * [WHAT] 统一创建一笔交易记录（买入/卖出/分红/定投通用出口）
 * [WHY] 加仓/减仓/单加/批量导入/截图导入 多处都在拼装同一套 addTrade 字段，
 *       且极易漏 estimated / 漏 estimateAtTrade / 漏 source。本函数收敛成唯一出口。
 * [NOTE] estimated/estimateAtTrade 由调用方按 resolveAddValue 的结论传入，本函数只负责拼装 + 落盘。
 */
export function createTrade(params: {
  code: string
  name: string
  type: TradeType
  date: string
  amount: number
  netValue: number
  shares: number
  fee?: number
  estimated: boolean
  source?: string
}): void {
  addTrade({
    id: '',
    code: params.code,
    name: params.name,
    type: params.type,
    date: params.date,
    amount: params.amount,
    netValue: params.netValue,
    shares: params.shares,
    fee: params.fee ?? 0,
    estimated: params.estimated,
    // [WHAT] 估值快照：保存交易时用的估值，便于后续按涨跌幅口径计算
    estimateAtTrade: params.estimated ? params.netValue : undefined,
    source: params.source,
    createdAt: Date.now()
  })
}

/**
 * [WHAT] 创建一笔「买入」交易记录（单加 / 批量导入 / 截图导入 走这里）
 * [WHY] 这笔记录是 K线买点标记的数据源（MiniKLineChart 直接读 getTradesByCode），
 *       同时也是晚上净值更新后自动重算份额的载体（estimated: true 的交易会被 updateTradesByCode 覆盖成净值）。
 */
export function createBuyTrade(params: {
  code: string
  name: string
  date: string
  amount: number
  netValue: number
  shares: number
  estimated: boolean
  source?: string
}): void {
  createTrade({ ...params, type: 'buy' })
}

/**
 * [WHAT] 净值公布后，计算「今天首次添加（单笔买入、无减仓）」持仓应用正式净值后的份额/买入净值
 * [WHY] 交易时间内添加用的是盘中估值算份额；晚上净值公布后，交易记录已被 updateTradesByCode
 *       改成净值，但持仓的 shares/buyNetValue 还是估值口径 → 若不改，市值会凭空差一个估值误差。
 *       这里给出纠正值，由调用方（useFundValuation / holdingStore）写回各自的持仓状态。
 * [RETURNS] null = 不适用（非今天买入 / 多笔买入=加仓过 / 有减仓 / 金额无效 / 非估值单=批量导入），
 *           调用方不动该持仓。
 */
export function getTodayFirstBuyCorrection(
  code: string,
  nav: number,
  buyDate: string,
  today: string
): { shares: number; buyNetValue: number } | null {
  if (!(nav > 0)) return null
  if (buyDate !== today) return null
  const trades = getTradesByCode(code)
  const buys = trades.filter(t => t.type === 'buy')
  if (buys.length !== 1) return null                 // 多笔买入（加仓过）的不动
  if (trades.some(t => t.type === 'sell')) return null // 减仓过的不动
  const buy = buys[0]
  if (!buy.amount) return null
  // [WHAT] 只有「用盘中估值建的单」才需要晚上重算（estimateAtTrade 在 createTrade 里仅 estimated 时写入）。
  //       批量导入用实际净值、estimated:false → estimateAtTrade 恒为空 → 永不重算，历史盈亏得以保留
  //       （这正是批量导入与「今天新买」的本质区别：后者白天用估值、晚上重算为净值）。
  if (!buy.estimateAtTrade) return null
  // [WHAT] 白天用估值算的份额，晚上净值公布后：把「投入金额(buy.amount)」拿出来，
  //       用正式净值重算 份额 = 投入金额 / 净值、买入净值 = 净值。
  // [WHY] 实盘账户就是拿今天更新的净值去算份额，不需要参考白天买入价做等比例缩放——
  //       那个价格因子缩放反而把带历史盈亏的批量导入算错（用户 2026-09-22 否决）。
  return { shares: buy.amount / nav, buyNetValue: nav }
}
