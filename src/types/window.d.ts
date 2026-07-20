// [WHY] 全局类型增强 - 第三方脚本（东方财富 pingzhongdata 等）通过 queueGlobalVarScript
// 注入到 window 上的动态全局变量，统一在此声明，避免在业务代码里反复 (window as any)
// [WHAT] 给 fundDetail.ts 读取的 Data_* / apidata 等外部全局变量提供类型

export {}

declare global {
  interface Window {
    /** 重仓股接口注入的原始 HTML */
    apidata?: { content?: string }
    /** 基金经理信息 */
    Data_currentFundManager?: any[]
    /** 经理业绩走势 */
    Data_grandTotal?: any[]
    /** 行业配置 */
    Data_IndustryAllocation?: { series?: any[] }
    /** 资产配置 */
    Data_assetAllocation?: { series?: any[] }
    /** 同类排名 */
    Data_rateInSimilarType?: any[]
    /** 同类表现（近 498 日） */
    Data_rateInSimilarPers498?: any[]
    /** 波动/夏普等风险指标 */
    Data_fluctuationScale?: { series?: any[] }
  }
}
