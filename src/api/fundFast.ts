// [WHY] 基金API统一导出模块（重构后）
// [WHAT] 从各拆分模块统一导出，保持与原 fundFast.ts 的 API 兼容性
// [NOTE] 此为 barrel 文件，实际实现已按功能拆分至以下模块：
//   - fundEstimate.ts  -> 基金估值相关 API
//   - fundNetValue.ts  -> 基金净值相关 API
//   - fundSearch.ts    -> 基金搜索 API
//   - fundDetail.ts    -> 基金详情 API
//   - fundMarket.ts    -> 市场指数 API
//   - fundRating.ts    -> 基金评级与配置 API
//   - fundUtils.ts     -> 工具函数和类型定义

// 导出工具函数和类型
export {
  clearFundCache,
  clearAllCache,
  queueGlobalVarScript,
  type MarketIndexSimple,
  type GlobalIndex,
  type IntradayPoint,
  type HoldingStock,
  type FundAccurateData,
  type SimpleKLineData,
  type PeriodReturn,
  type FundRankItemSimple,
  type FundManagerInfo,
  type ManagerProfitPoint,
  type IndustryAllocation,
  type AssetAllocation,
  type FundRating,
} from './fundUtils'

// 导出估值相关 API
export {
  fetchFundEstimateFast,
  fetchFundEstimatesBatch,
  fetchFundEstimate,
} from './fundEstimate'

// 导出净值相关 API
export {
  fetchNetValueHistoryFast,
  fetchIntradayData,
  fetchLatestNetValue,
  fetchSimpleKLineData,
  calculatePeriodReturns,
  fetchHS300History,
} from './fundNetValue'

// 导出搜索相关 API
export {
  fetchFundList,
  searchFund,
  fetchFundRankingFast,
} from './fundSearch'

// 导出详情相关 API
export {
  fetchTopHoldings,
  fetchFundBasicInfo,
  fetchFundAccurateData,
  fetchFundAccurateBatch,
  fetchFundManagerInfo,
  fetchManagerProfit,
} from './fundDetail'

// 导出市场指数相关 API
export {
  fetchMarketIndicesFast,
  fetchGlobalIndices,
} from './fundMarket'

// 导出评级与配置相关 API
export {
  fetchIndustryAllocation,
  fetchAssetAllocation,
  fetchFundRating,
} from './fundRating'
