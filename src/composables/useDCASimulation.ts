// [WHY] 定投收益模拟的核心逻辑
// [WHAT] 基于历史净值数据，模拟定投收益，计算总投入、总市值、收益、年化收益率
// [REF] Task #19 需求文档

import { ref, computed } from 'vue'
import { fetchNetValueHistoryFast } from '@/api/fundNetValue'
import { searchFund, type FundInfo } from '@/api/fundSearch'
import { showToast } from 'vant'

/** 定投频率 */
export type DCAFrequency = 'weekly' | 'monthly'

/** 定投模拟输入参数 */
export interface DCASimulationInput {
  fundCode: string
  fundName: string
  amountPerPeriod: number     // 每期投入金额（元）
  frequency: DCAFrequency     // 定投频率
  durationMonths: number      // 定投期限（月）
  startDate?: string          // 开始日期（可选，默认从 durationMonths 前开始）
}

/** 定投记录（每次定投的详情） */
export interface DCARecord {
  date: string
  nav: number                // 当日净值
  amount: number             // 投入金额
  shares: number             // 购买份额
  cumulativeShares: number   // 累计份额
  cumulativeInvested: number // 累计投入
  portfolioValue: number     // 组合市值
  returnRate: number         // 收益率 %
}

/** 定投模拟结果 */
export interface DCASimulationResult {
  input: DCASimulationInput
  records: DCARecord[]
  summary: {
    totalInvested: number        // 总投入
    totalValue: number           // 当前总市值
    totalReturn: number          // 总收益
    totalReturnRate: number      // 总收益率 %
    annualizedReturn: number     // 年化收益率 %
    monthsInvested: number       // 实际定投月数
  }
  chartData: {
    dates: string[]              // 日期数组
    portfolioValues: number[]    // 组合市值曲线
    totalInvested: number[]      // 累计投入曲线
  }
}

/**
 * 定投模拟组合式函数
 */
export function useDCASimulation() {
  const isLoading = ref(false)
  const error = ref<string | null>(null)
  const simulationResult = ref<DCASimulationResult | null>(null)

  /**
   * 执行定投模拟
   * @param input 定投参数
   */
  async function runSimulation(input: DCASimulationInput): Promise<DCASimulationResult | null> {
    isLoading.value = true
    error.value = null

    try {
      // 获取历史净值数据（需要足够长的数据）
      const daysNeeded = input.durationMonths * 31 + 30 // 额外30天缓冲
      const historyResult = await fetchNetValueHistoryFast(input.fundCode, daysNeeded)

      if (!historyResult.records || historyResult.records.length === 0) {
        throw new Error('无法获取基金历史净值数据')
      }

      const records = historyResult.records
      const startDate = input.startDate || getStartDate(records, input.durationMonths)

      // 筛选开始日期之后的数据
      const relevantRecords = records.filter(r => r.date >= startDate)

      if (relevantRecords.length === 0) {
        throw new Error('历史数据不足，无法模拟')
      }

      // 执行定投模拟
      const dcaRecords = simulateDCA(relevantRecords, input)

      // 计算汇总数据
      const summary = calculateSummary(dcaRecords, input)

      // 生成图表数据
      const chartData = generateChartData(dcaRecords)

      const result: DCASimulationResult = {
        input,
        records: dcaRecords,
        summary,
        chartData
      }

      simulationResult.value = result
      return result
    } catch (err) {
      error.value = `模拟失败: ${err}`
      return null
    } finally {
      isLoading.value = false
    }
  }

  /**
   * 模拟定投过程
   */
  function simulateDCA(
    records: { date: string; netValue: number }[],
    input: DCASimulationInput
  ): DCARecord[] {
    const dcaRecords: DCARecord[] = []
    let cumulativeShares = 0
    let cumulativeInvested = 0

    // 确定定投日期
    const investmentDates = getInvestmentDates(records, input.frequency, input.durationMonths)

    for (const investDate of investmentDates) {
      // 找到该日期或最近的净值数据
      const record = findNearestRecord(records, investDate)
      if (!record) continue

      const shares = input.amountPerPeriod / record.netValue
      cumulativeShares += shares
      cumulativeInvested += input.amountPerPeriod

      // 计算当前市值（使用最新净值）
      const currentNav = records[records.length - 1]!.netValue
      const portfolioValue = cumulativeShares * currentNav
      const returnRate = ((portfolioValue - cumulativeInvested) / cumulativeInvested) * 100

      dcaRecords.push({
        date: record.date,
        nav: record.netValue,
        amount: input.amountPerPeriod,
        shares,
        cumulativeShares,
        cumulativeInvested,
        portfolioValue,
        returnRate
      })
    }

    return dcaRecords
  }

  /**
   * 获取定投日期列表
   */
  function getInvestmentDates(
    records: { date: string }[],
    frequency: DCAFrequency,
    durationMonths: number
  ): string[] {
    const dates: string[] = []
    const sortedRecords = [...records].sort((a, b) => a.date.localeCompare(b.date))
    const uniqueDates = sortedRecords.map(r => r.date)

    if (uniqueDates.length === 0) return dates

    const startDate = uniqueDates[0]!
    const endDate = uniqueDates[uniqueDates.length - 1]!

    // 解析日期
    let current = new Date(startDate)

    while (current <= new Date(endDate)) {
      const dateStr = formatDate(current)
      dates.push(dateStr)

      // 跳到下一个定投日
      if (frequency === 'monthly') {
        current.setMonth(current.getMonth() + 1)
      } else {
        // weekly
        current.setDate(current.getDate() + 7)
      }
    }

    return dates
  }

  /**
   * 找到指定日期或最近的记录
   */
  function findNearestRecord(
    records: { date: string; netValue: number }[],
    targetDate: string
  ): { date: string; netValue: number } | null {
    // 先尝试精确匹配
    const exact = records.find(r => r.date === targetDate)
    if (exact) return exact

    // 找不到则找之后最近的一天
    const sorted = [...records].sort((a, b) => a.date.localeCompare(b.date))
    const target = new Date(targetDate)

    for (const record of sorted) {
      if (new Date(record.date) >= target) {
        return record
      }
    }

    // 如果没找到，返回最后一条记录
    return sorted[sorted.length - 1] || null
  }

  /**
   * 计算汇总数据
   */
  function calculateSummary(records: DCARecord[], input: DCASimulationInput) {
    if (records.length === 0) {
      return {
        totalInvested: 0,
        totalValue: 0,
        totalReturn: 0,
        totalReturnRate: 0,
        annualizedReturn: 0,
        monthsInvested: 0
      }
    }

    const lastRecord = records[records.length - 1]!
    const totalInvested = lastRecord.cumulativeInvested
    const totalValue = lastRecord.portfolioValue
    const totalReturn = totalValue - totalInvested
    const totalReturnRate = totalInvested > 0 ? (totalReturn / totalInvested) * 100 : 0

    // 年化收益率 = (1 + 总收益率)^(365/天数) - 1
    const firstDate = new Date(records[0]!.date)
    const lastDate = new Date(lastRecord.date)
    const days = (lastDate.getTime() - firstDate.getTime()) / (1000 * 60 * 60 * 24)
    const years = days / 365
    const annualizedReturn = years > 0
      ? (Math.pow(1 + totalReturnRate / 100, 1 / years) - 1) * 100
      : 0

    return {
      totalInvested,
      totalValue,
      totalReturn,
      totalReturnRate,
      annualizedReturn,
      monthsInvested: records.length
    }
  }

  /**
   * 生成图表数据
   */
  function generateChartData(records: DCARecord[]) {
    const dates: string[] = []
    const portfolioValues: number[] = []
    const totalInvested: number[] = []

    records.forEach(record => {
      dates.push(record.date)
      portfolioValues.push(record.portfolioValue)
      totalInvested.push(record.cumulativeInvested)
    })

    return { dates, portfolioValues, totalInvested }
  }

  /**
   * 获取开始日期
   */
  function getStartDate(records: { date: string }[], durationMonths: number): string {
    const sorted = [...records].sort((a, b) => b.date.localeCompare(a.date))
    const latestDate = new Date(sorted[0]!.date)
    const startDate = new Date(latestDate)
    startDate.setMonth(startDate.getMonth() - durationMonths)
    return formatDate(startDate)
  }

  /**
   * 格式化日期为 YYYY-MM-DD
   */
  function formatDate(date: Date): string {
    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const day = String(date.getDate()).padStart(2, '0')
    return `${year}-${month}-${day}`
  }

  /**
   * 重置模拟结果
   */
  function reset() {
    simulationResult.value = null
    error.value = null
  }

  return {
    isLoading,
    error,
    simulationResult,
    runSimulation,
    reset
  }
}

/**
 * 格式化金额
 */
export function formatMoney(value: number): string {
  if (Math.abs(value) >= 10000) {
    return `${(value / 10000).toFixed(2)}万`
  }
  return value.toFixed(2)
}

/**
 * 格式化百分比
 */
export function formatPercent(value: number): string {
  const sign = value >= 0 ? '+' : ''
  return `${sign}${value.toFixed(2)}%`
}
