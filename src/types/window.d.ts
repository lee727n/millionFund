// [WHY] 为外部脚本注入到 window 的全局变量补充类型
// [WHAT] 天天基金 / 东方财富接口返回后，会把数据挂载到 window 上供回调读取；
//   这里对可确定结构的成员声明类型，尽量减少调用处的 (window as any) 绕过类型系统
// [NOTE] 本文件为环境声明（无 import / export），interface Window 会合并到全局 lib.dom 的 Window

/** 基金经理信息（外部脚本 Data_currentFundManager 的元素结构） */
interface FundManagerExternal {
  name?: string
  pic?: string
  workTime?: string
  fundSize?: string
  profit?: { series?: Array<{ data?: Array<{ y?: number }> }> }
  power?: { categories?: string[]; data?: number[]; avr?: string | number }
}

interface Window {
  // FundArchivesDatas.aspx 接口注入，content 为解析后的 HTML 片段
  apidata?: { content?: string }
  // 基金经理信息
  Data_currentFundManager?: FundManagerExternal[]
  // 经理业绩走势，元素为 [时间戳, 收益率]
  Data_grandTotal?: Array<[string | number, number]>
  // 行业配置
  Data_IndustryAllocation?: { series?: Array<{ name?: string; data?: unknown[] }> }
  // 资产配置
  Data_assetAllocation?: { series?: Array<{ name?: string; data?: number[] }> }
  // 同类排名
  Data_rateInSimilarType?: Array<{ rank?: number; total?: number }>
  // 同类表现
  Data_rateInSimilarPers498?: Array<{ y?: number }>
  // 波动 / 夏普等比率指标
  Data_fluctuationScale?: { series?: Array<{ name?: string; data?: number[] }> }
}
