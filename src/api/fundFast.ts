// [WHY] 基金API统一导出入口
// [WHAT] 重新导出所有子模块，保持向后兼容
// [NOTE] 本文件已拆分为以下模块（Task #16）：
//   - fundTypes.ts      类型定义
//   - fundUtils.ts      共享工具函数
//   - fundEstimate.ts   估值API
//   - fundNetValue.ts   净值API
//   - fundSearch.ts     搜索API
//   - fundDetail.ts     详情API
//   - fundMarket.ts     市场指数API
//   - fundRating.ts     基金评级API

// ========== fundTypes.ts - 类型定义 ==========
export type {
  IntradayPoint,
  HoldingStock,
  FundAccurateData,
  SimpleKLineData,
  PeriodReturn,
  MarketIndexSimple,
  FundRankItemSimple,
  FundManagerInfo,
  ManagerProfitPoint,
  GlobalIndex,
  IndustryAllocation,
  AssetAllocation,
  FundRating
} from './fundTypes'

// ========== fundUtils.ts - 共享工具函数 ==========
export { clearFundCache, clearAllCache, queueGlobalVarScript } from './fundUtils'

// ========== fundEstimate.ts - 估值API ==========
export {
  fetchFundEstimateFast,
  fetchFundEstimatesBatch,
  fetchFundEstimate
} from './fundEstimate'

// ========== fundNetValue.ts - 净值API ==========
export {
  fetchNetValueHistoryFast,
  fetchIntradayData,
  fetchLatestNetValue,
  fetchHS300History,
  fetchSimpleKLineData,
  calculatePeriodReturns
} from './fundNetValue'

// ========== fundSearch.ts - 搜索API ==========
export { fetchFundList, searchFund } from './fundSearch'

// ========== fundDetail.ts - 详情API ==========
export {
  fetchTopHoldings,
  fetchFundBasicInfo,
  fetchFundAccurateData,
  fetchFundAccurateBatch,
  fetchFundRankingFast,
  fetchFundManagerInfo,
  fetchManagerProfit,
  fetchIndustryAllocation,
  fetchAssetAllocation,
  fetchFundRating
} from './fundDetail'

// ========== fundMarket.ts - 市场指数API ==========
export {
  fetchMarketIndicesFast,
  fetchGlobalIndices
} from './fundMarket'
