// [WHY] 持仓数据状态管理（重构版）
// [WHAT] 此文件现已拆分为 4 个模块，此处重新导出以保持向后兼容
// [WHAT] 新代码请直接使用 holdingStore.ts 或对应的 composable
// [DEPS] 依赖 holdingStore.ts（主 Store）、holdingCrud.ts、holdingCalc.ts、holdingFilter.ts

// ========== 重新导出主 Store ==========
export { useHoldingStore } from './holdingStore'

// ========== 重新导出类型 ==========
export type { HoldingWithProfit } from '@/types/fund'

// ========== 兼容层：导出 holdingStore 的所有内容 ==========
// [NOTE] 为了保持与现有代码的完全兼容，此处不重复定义，全部委托给 holdingStore.ts

// 如需直接使用 CRUD / 计算 / 筛选 模块，请导入对应的文件：
// import { useHoldingCrud } from '@/stores/holdingCrud'
// import { useHoldingCalc } from '@/stores/holdingCalc'
// import { useHoldingFilter } from '@/stores/holdingFilter'
