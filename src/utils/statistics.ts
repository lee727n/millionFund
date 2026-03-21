/**
 * 自研基金统计算法模块
 * [WHY] 提供专业的基金分析指标计算
 * [WHAT] 包含收益分析、风险评估、相关性分析等算法
 * [DEPS] 依赖历史净值数据
 */

// ========== 类型定义 ==========

/** 净值数据点 */
export interface NetValuePoint {
  date: string      // YYYY-MM-DD
  value: number     // 单位净值
  change?: number   // 日涨跌幅(%)
}

/** 收益分析结果 */
export interface ReturnAnalysis {
  // 收益指标
  totalReturn: number        // 总收益率(%)
  annualizedReturn: number   // 年化收益率(%)
  dailyReturn: number        // 日均收益率(%)
  
  // 风险指标
  volatility: number         // 年化波动率(%)
  maxDrawdown: number        // 最大回撤(%)
  maxDrawdownStart: string   // 最大回撤起始日期
  maxDrawdownEnd: string     // 最大回撤结束日期
  
  // 风险调整收益
  sharpeRatio: number        // 夏普比率（无风险利率按2%计算）
  sortinoRatio: number       // 索提诺比率（只考虑下行风险）
  calmarRatio: number        // 卡尔玛比率（年化收益/最大回撤）
  
  // 统计周期
  tradingDays: number        // 交易日数
  startDate: string
  endDate: string
}

/** 基金评分结果 */
export interface FundScore {
  totalScore: number         // 综合评分(0-100)
  returnScore: number        // 收益评分(0-100)
  riskScore: number          // 风险评分(0-100)
  stabilityScore: number     // 稳定性评分(0-100)
  consistencyScore: number   // 一致性评分(0-100)
  level: 'S' | 'A' | 'B' | 'C' | 'D'  // 等级
  recommendation: string     // 投资建议
}

/** 定投模拟结果 */
export interface DIPSimulation {
  totalInvested: number      // 总投入金额
  currentValue: number       // 当前市值
  totalReturn: number        // 总收益(元)
  returnRate: number         // 收益率(%)
  annualizedReturn: number   // 年化收益率(%)
  averageCost: number        // 平均成本
  totalShares: number        // 总份额
  periods: number            // 定投期数
  records: DIPRecord[]       // 定投记录
}

/** 定投记录 */
export interface DIPRecord {
  date: string
  nav: number
  amount: number
  shares: number
  totalShares: number
  totalCost: number
  marketValue: number
  returnRate: number
}

/** 最佳定投日分析 */
export interface BestDIPDay {
  day: number                // 日期(1-28)
  averageReturn: number      // 平均收益率
  successRate: number        // 盈利概率
  recommendation: string     // 建议
}

/** 相关性分析结果 */
export interface CorrelationAnalysis {
  matrix: number[][]         // 相关性矩阵
  codes: string[]            // 基金代码列表
  names: string[]            // 基金名称列表
  diversification: number    // 分散度评分(0-100)
  suggestion: string         // 优化建议
  highCorrelationPairs: CorrelationPair[]  // 高相关性基金对
}

/** 相关性配对 */
export interface CorrelationPair {
  fund1: { code: string; name: string }
  fund2: { code: string; name: string }
  correlation: number
  suggestion: string
}

/** 趋势预测结果 */
export interface TrendPrediction {
  trend: 'up' | 'down' | 'sideways'  // 趋势方向
  strength: number           // 趋势强度(0-100)
  confidence: number         // 置信度(0-100)
  shortTermTrend: string     // 短期趋势描述
  mediumTermTrend: string    // 中期趋势描述
  supportLevel: number       // 支撑位
  resistanceLevel: number    // 阻力位
  signals: TrendSignal[]     // 技术信号
}

/** 趋势信号 */
export interface TrendSignal {
  name: string               // 信号名称
  type: 'buy' | 'sell' | 'hold'  // 信号类型
  strength: number           // 信号强度
  description: string        // 描述
}

/** 资产配置建议 */
export interface AllocationAdvice {
  currentAllocation: AllocationItem[]   // 当前配置
  suggestedAllocation: AllocationItem[] // 建议配置
  riskLevel: 'low' | 'medium' | 'high'  // 风险等级
  diversificationScore: number          // 分散度评分
  suggestions: string[]                 // 优化建议
}

/** 配置项 */
export interface AllocationItem {
  category: string           // 类别（股票型、债券型等）
  percentage: number         // 占比(%)
  funds: { code: string; name: string; amount: number }[]
}

// ========== 核心算法 ==========

/**
 * 计算收益分析指标
 * [WHY] 全面评估基金的收益和风险特征
 * [WHAT] 计算年化收益、波动率、夏普比率、最大回撤等
 */
export function calculateReturnAnalysis(data: NetValuePoint[]): ReturnAnalysis | null {
  if (!data || data.length < 2) return null
  
  // [WHAT] 按日期排序（正序）
  const sorted = [...data].sort((a, b) => a.date.localeCompare(b.date))
  const n = sorted.length
  
  const firstNav = sorted[0].value
  const lastNav = sorted[n - 1].value
  const startDate = sorted[0].date
  const endDate = sorted[n - 1].date
  
  // [WHAT] 计算日收益率序列
  const dailyReturns: number[] = []
  for (let i = 1; i < n; i++) {
    const ret = (sorted[i].value - sorted[i - 1].value) / sorted[i - 1].value
    dailyReturns.push(ret)
  }
  
  // [WHAT] 总收益率
  const totalReturn = ((lastNav - firstNav) / firstNav) * 100
  
  // [WHAT] 日均收益率
  const dailyReturnAvg = dailyReturns.reduce((a, b) => a + b, 0) / dailyReturns.length
  
  // [WHAT] 年化收益率（假设252个交易日）
  const tradingDays = dailyReturns.length
  const yearsHeld = tradingDays / 252
  const annualizedReturn = yearsHeld > 0 
    ? (Math.pow(1 + totalReturn / 100, 1 / yearsHeld) - 1) * 100 
    : totalReturn
  
  // [WHAT] 计算波动率（日收益率标准差 * sqrt(252)）
  const variance = dailyReturns.reduce((sum, r) => sum + Math.pow(r - dailyReturnAvg, 2), 0) / dailyReturns.length
  const dailyVolatility = Math.sqrt(variance)
  const volatility = dailyVolatility * Math.sqrt(252) * 100
  
  // [WHAT] 计算最大回撤
  let maxDrawdown = 0
  let maxDrawdownStart = startDate
  let maxDrawdownEnd = endDate
  let peak = sorted[0].value
  let peakDate = sorted[0].date
  
  for (let i = 1; i < n; i++) {
    if (sorted[i].value > peak) {
      peak = sorted[i].value
      peakDate = sorted[i].date
    }
    const drawdown = (peak - sorted[i].value) / peak
    if (drawdown > maxDrawdown) {
      maxDrawdown = drawdown
      maxDrawdownStart = peakDate
      maxDrawdownEnd = sorted[i].date
    }
  }
  
  // [WHAT] 计算夏普比率（无风险利率2%）
  const riskFreeRate = 0.02 / 252  // 日无风险利率
  const excessReturn = dailyReturnAvg - riskFreeRate
  const sharpeRatio = dailyVolatility > 0 ? (excessReturn / dailyVolatility) * Math.sqrt(252) : 0
  
  // [WHAT] 计算索提诺比率（只考虑下行波动）
  const negativeReturns = dailyReturns.filter(r => r < riskFreeRate)
  const downVariance = negativeReturns.length > 0
    ? negativeReturns.reduce((sum, r) => sum + Math.pow(r - riskFreeRate, 2), 0) / negativeReturns.length
    : 0
  const downVolatility = Math.sqrt(downVariance)
  const sortinoRatio = downVolatility > 0 ? (excessReturn / downVolatility) * Math.sqrt(252) : 0
  
  // [WHAT] 计算卡尔玛比率
  const calmarRatio = maxDrawdown > 0 ? annualizedReturn / (maxDrawdown * 100) : 0
  
  return {
    totalReturn: round(totalReturn, 2),
    annualizedReturn: round(annualizedReturn, 2),
    dailyReturn: round(dailyReturnAvg * 100, 4),
    volatility: round(volatility, 2),
    maxDrawdown: round(maxDrawdown * 100, 2),
    maxDrawdownStart,
    maxDrawdownEnd,
    sharpeRatio: round(sharpeRatio, 2),
    sortinoRatio: round(sortinoRatio, 2),
    calmarRatio: round(calmarRatio, 2),
    tradingDays,
    startDate,
    endDate
  }
}

/**
 * 计算基金综合评分
 * [WHY] 为投资者提供简洁的基金评价
 * [WHAT] 综合收益、风险、稳定性等多维度评分
 */
export function calculateFundScore(analysis: ReturnAnalysis): FundScore {
  // [WHAT] 收益评分（年化收益率映射到0-100）
  // 年化收益: -20% -> 0分, 0% -> 40分, 20% -> 70分, 50%+ -> 100分
  let returnScore = 40 + analysis.annualizedReturn * 1.5
  returnScore = Math.max(0, Math.min(100, returnScore))
  
  // [WHAT] 风险评分（波动率和回撤）
  // 波动率: 0% -> 100分, 20% -> 70分, 40%+ -> 0分
  const volScore = Math.max(0, 100 - analysis.volatility * 2.5)
  // 回撤: 0% -> 100分, 20% -> 60分, 50%+ -> 0分
  const ddScore = Math.max(0, 100 - analysis.maxDrawdown * 2)
  const riskScore = (volScore + ddScore) / 2
  
  // [WHAT] 稳定性评分（夏普比率）
  // 夏普: <0 -> 0分, 0 -> 30分, 1 -> 60分, 2+ -> 100分
  let stabilityScore = 30 + analysis.sharpeRatio * 35
  stabilityScore = Math.max(0, Math.min(100, stabilityScore))
  
  // [WHAT] 一致性评分（索提诺和卡尔玛）
  const consistencyScore = Math.min(100, Math.max(0,
    50 + analysis.sortinoRatio * 15 + analysis.calmarRatio * 20
  ))
  
  // [WHAT] 综合评分（加权平均）
  const totalScore = round(
    returnScore * 0.35 +
    riskScore * 0.25 +
    stabilityScore * 0.25 +
    consistencyScore * 0.15,
    1
  )
  
  // [WHAT] 评级
  let level: FundScore['level']
  let recommendation: string
  
  if (totalScore >= 85) {
    level = 'S'
    recommendation = '优秀基金，收益风险比出色，可重点关注'
  } else if (totalScore >= 70) {
    level = 'A'
    recommendation = '良好基金，表现稳健，适合长期持有'
  } else if (totalScore >= 55) {
    level = 'B'
    recommendation = '中等基金，需观察后续表现'
  } else if (totalScore >= 40) {
    level = 'C'
    recommendation = '表现欠佳，建议谨慎投资'
  } else {
    level = 'D'
    recommendation = '风险较高，不建议投资'
  }
  
  return {
    totalScore,
    returnScore: round(returnScore, 1),
    riskScore: round(riskScore, 1),
    stabilityScore: round(stabilityScore, 1),
    consistencyScore: round(consistencyScore, 1),
    level,
    recommendation
  }
}

/**
 * 定投收益模拟
 * [WHY] 模拟历史定投收益，帮助投资者了解定投效果
 * @param data 历史净值数据
 * @param amount 每期定投金额
 * @param frequency 定投频率（monthly/weekly）
 */
export function simulateDIP(
  data: NetValuePoint[],
  amount: number,
  frequency: 'monthly' | 'weekly' = 'monthly'
): DIPSimulation | null {
  if (!data || data.length < 10) return null
  
  const sorted = [...data].sort((a, b) => a.date.localeCompare(b.date))
  const records: DIPRecord[] = []
  
  let totalShares = 0
  let totalCost = 0
  let lastMonth = ''
  let lastWeek = -1
  
  for (const point of sorted) {
    const date = new Date(point.date)
    const month = `${date.getFullYear()}-${date.getMonth()}`
    const week = getWeekNumber(date)
    
    let shouldInvest = false
    if (frequency === 'monthly' && month !== lastMonth) {
      shouldInvest = true
      lastMonth = month
    } else if (frequency === 'weekly' && week !== lastWeek) {
      shouldInvest = true
      lastWeek = week
    }
    
    if (shouldInvest && point.value > 0) {
      const shares = amount / point.value
      totalShares += shares
      totalCost += amount
      const marketValue = totalShares * point.value
      
      records.push({
        date: point.date,
        nav: point.value,
        amount,
        shares: round(shares, 4),
        totalShares: round(totalShares, 4),
        totalCost,
        marketValue: round(marketValue, 2),
        returnRate: round((marketValue - totalCost) / totalCost * 100, 2)
      })
    }
  }
  
  if (records.length === 0) return null
  
  const lastNav = sorted[sorted.length - 1].value
  const currentValue = totalShares * lastNav
  const totalReturn = currentValue - totalCost
  const returnRate = (totalReturn / totalCost) * 100
  
  // 计算年化收益
  const firstDate = new Date(records[0].date)
  const lastDate = new Date(sorted[sorted.length - 1].date)
  const years = (lastDate.getTime() - firstDate.getTime()) / (365 * 24 * 60 * 60 * 1000)
  const annualizedReturn = years > 0 
    ? (Math.pow(1 + returnRate / 100, 1 / years) - 1) * 100 
    : returnRate
  
  return {
    totalInvested: totalCost,
    currentValue: round(currentValue, 2),
    totalReturn: round(totalReturn, 2),
    returnRate: round(returnRate, 2),
    annualizedReturn: round(annualizedReturn, 2),
    averageCost: round(totalCost / totalShares, 4),
    totalShares: round(totalShares, 4),
    periods: records.length,
    records
  }
}

/**
 * 分析最佳定投日
 * [WHY] 帮助投资者选择每月最佳定投日期
 */
export function analyzeBestDIPDay(data: NetValuePoint[]): BestDIPDay[] {
  if (!data || data.length < 60) return []
  
  const sorted = [...data].sort((a, b) => a.date.localeCompare(b.date))
  
  // [WHAT] 按日期(1-28)分组统计
  const dayStats: Map<number, { returns: number[]; count: number }> = new Map()
  
  for (let day = 1; day <= 28; day++) {
    dayStats.set(day, { returns: [], count: 0 })
  }
  
  // [WHAT] 模拟每个日期的定投收益
  for (let day = 1; day <= 28; day++) {
    const dayData = sorted.filter(p => {
      const d = new Date(p.date).getDate()
      return d === day
    })
    
    if (dayData.length < 3) continue
    
    // 计算该日期定投的收益率
    let totalShares = 0
    let totalCost = 0
    
    for (const point of dayData) {
      if (point.value > 0) {
        totalShares += 1000 / point.value  // 假设每期1000元
        totalCost += 1000
      }
    }
    
    const lastNav = sorted[sorted.length - 1].value
    const returnRate = totalCost > 0 
      ? ((totalShares * lastNav - totalCost) / totalCost) * 100 
      : 0
    
    const stat = dayStats.get(day)!
    stat.returns.push(returnRate)
    stat.count = dayData.length
  }
  
  // [WHAT] 计算每个日期的平均收益和盈利概率
  const results: BestDIPDay[] = []
  
  for (const [day, stat] of dayStats) {
    if (stat.returns.length === 0) continue
    
    const avgReturn = stat.returns.reduce((a, b) => a + b, 0) / stat.returns.length
    const positiveCount = stat.returns.filter(r => r > 0).length
    const successRate = (positiveCount / stat.returns.length) * 100
    
    let recommendation = ''
    if (avgReturn > 5 && successRate > 70) {
      recommendation = '优选日期'
    } else if (avgReturn > 0 && successRate > 50) {
      recommendation = '可选日期'
    } else {
      recommendation = '一般日期'
    }
    
    results.push({
      day,
      averageReturn: round(avgReturn, 2),
      successRate: round(successRate, 1),
      recommendation
    })
  }
  
  // 按平均收益排序
  return results.sort((a, b) => b.averageReturn - a.averageReturn)
}

/**
 * 计算相关性矩阵
 * [WHY] 分析持仓基金之间的相关性，评估分散度
 */
export function calculateCorrelation(
  fundsData: { code: string; name: string; data: NetValuePoint[] }[]
): CorrelationAnalysis | null {
  if (!fundsData || fundsData.length < 2) return null
  
  const n = fundsData.length
  const codes = fundsData.map(f => f.code)
  const names = fundsData.map(f => f.name)
  
  // [WHAT] 对齐日期，计算日收益率
  const returnSeries: number[][] = []
  
  for (const fund of fundsData) {
    const sorted = [...fund.data].sort((a, b) => a.date.localeCompare(b.date))
    const returns: number[] = []
    for (let i = 1; i < sorted.length; i++) {
      returns.push((sorted[i].value - sorted[i - 1].value) / sorted[i - 1].value)
    }
    returnSeries.push(returns)
  }
  
  // [WHAT] 计算相关性矩阵
  const matrix: number[][] = []
  const highCorrelationPairs: CorrelationPair[] = []
  
  for (let i = 0; i < n; i++) {
    matrix[i] = []
    for (let j = 0; j < n; j++) {
      if (i === j) {
        matrix[i][j] = 1
      } else {
        const corr = pearsonCorrelation(returnSeries[i], returnSeries[j])
        matrix[i][j] = round(corr, 3)
        
        // 记录高相关性配对（>0.7且i<j避免重复）
        if (i < j && corr > 0.7) {
          highCorrelationPairs.push({
            fund1: { code: codes[i], name: names[i] },
            fund2: { code: codes[j], name: names[j] },
            correlation: round(corr, 3),
            suggestion: corr > 0.9 
              ? '高度相关，建议减持其一' 
              : '中度相关，可适当调整'
          })
        }
      }
    }
  }
  
  // [WHAT] 计算分散度评分
  let totalCorr = 0
  let count = 0
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      totalCorr += Math.abs(matrix[i][j])
      count++
    }
  }
  const avgCorr = count > 0 ? totalCorr / count : 0
  const diversification = round(Math.max(0, (1 - avgCorr) * 100), 1)
  
  // [WHAT] 生成建议
  let suggestion = ''
  if (diversification >= 70) {
    suggestion = '持仓分散度良好，风险分散效果佳'
  } else if (diversification >= 50) {
    suggestion = '持仓分散度中等，可考虑增加低相关性基金'
  } else {
    suggestion = '持仓相关性较高，建议调整以分散风险'
  }
  
  return {
    matrix,
    codes,
    names,
    diversification,
    suggestion,
    highCorrelationPairs
  }
}

/**
 * 趋势预测分析
 * [WHY] 基于技术指标预测短期趋势
 */
export function predictTrend(data: NetValuePoint[]): TrendPrediction | null {
  if (!data || data.length < 30) return null
  
  const sorted = [...data].sort((a, b) => a.date.localeCompare(b.date))
  const values = sorted.map(p => p.value)
  const n = values.length
  
  // [WHAT] 计算移动平均线
  const ma5 = calculateMA(values, 5)
  const ma10 = calculateMA(values, 10)
  const ma20 = calculateMA(values, 20)
  
  // [WHAT] 计算RSI
  const rsi = calculateRSI(values, 14)
  
  // [WHAT] 计算MACD
  const macd = calculateMACD(values)
  
  // [WHAT] 分析信号
  const signals: TrendSignal[] = []
  const lastPrice = values[n - 1]
  const lastMa5 = ma5[ma5.length - 1]
  const lastMa10 = ma10[ma10.length - 1]
  const lastMa20 = ma20[ma20.length - 1]
  
  // MA信号
  if (lastMa5 > lastMa10 && lastMa10 > lastMa20) {
    signals.push({
      name: '均线多头排列',
      type: 'buy',
      strength: 80,
      description: '短中长期均线呈多头排列，趋势向上'
    })
  } else if (lastMa5 < lastMa10 && lastMa10 < lastMa20) {
    signals.push({
      name: '均线空头排列',
      type: 'sell',
      strength: 80,
      description: '短中长期均线呈空头排列，趋势向下'
    })
  }
  
  // RSI信号
  if (rsi > 70) {
    signals.push({
      name: 'RSI超买',
      type: 'sell',
      strength: 60,
      description: `RSI=${round(rsi, 1)}，进入超买区域`
    })
  } else if (rsi < 30) {
    signals.push({
      name: 'RSI超卖',
      type: 'buy',
      strength: 60,
      description: `RSI=${round(rsi, 1)}，进入超卖区域`
    })
  }
  
  // MACD信号
  if (macd.histogram > 0 && macd.macd > macd.signal) {
    signals.push({
      name: 'MACD金叉',
      type: 'buy',
      strength: 70,
      description: 'MACD线上穿信号线，买入信号'
    })
  } else if (macd.histogram < 0 && macd.macd < macd.signal) {
    signals.push({
      name: 'MACD死叉',
      type: 'sell',
      strength: 70,
      description: 'MACD线下穿信号线，卖出信号'
    })
  }
  
  // [WHAT] 综合判断趋势
  const buySignals = signals.filter(s => s.type === 'buy')
  const sellSignals = signals.filter(s => s.type === 'sell')
  const buyStrength = buySignals.reduce((sum, s) => sum + s.strength, 0)
  const sellStrength = sellSignals.reduce((sum, s) => sum + s.strength, 0)
  
  let trend: TrendPrediction['trend']
  let strength: number
  
  if (buyStrength > sellStrength + 30) {
    trend = 'up'
    strength = Math.min(100, buyStrength)
  } else if (sellStrength > buyStrength + 30) {
    trend = 'down'
    strength = Math.min(100, sellStrength)
  } else {
    trend = 'sideways'
    strength = 50
  }
  
  // [WHAT] 计算支撑位和阻力位
  const recentHigh = Math.max(...values.slice(-20))
  const recentLow = Math.min(...values.slice(-20))
  
  return {
    trend,
    strength: round(strength, 0),
    confidence: round(Math.abs(buyStrength - sellStrength) / 2 + 50, 0),
    shortTermTrend: trend === 'up' ? '短期看涨' : trend === 'down' ? '短期看跌' : '短期震荡',
    mediumTermTrend: lastMa20 > ma20[ma20.length - 10] ? '中期上行' : '中期下行',
    supportLevel: round(recentLow, 4),
    resistanceLevel: round(recentHigh, 4),
    signals
  }
}

/**
 * 资产配置分析与建议
 */
export function analyzeAllocation(
  holdings: { code: string; name: string; amount: number; type: string }[]
): AllocationAdvice {
  // [WHAT] 按类型分组统计
  const typeMap = new Map<string, { amount: number; funds: typeof holdings }>()
  let totalAmount = 0
  
  for (const h of holdings) {
    totalAmount += h.amount
    const type = h.type || '其他'
    if (!typeMap.has(type)) {
      typeMap.set(type, { amount: 0, funds: [] })
    }
    const group = typeMap.get(type)!
    group.amount += h.amount
    group.funds.push(h)
  }
  
  // [WHAT] 计算当前配置
  const currentAllocation: AllocationItem[] = []
  for (const [category, data] of typeMap) {
    currentAllocation.push({
      category,
      percentage: round((data.amount / totalAmount) * 100, 1),
      funds: data.funds.map(f => ({ code: f.code, name: f.name, amount: f.amount }))
    })
  }
  
  // [WHAT] 评估风险等级
  const stockPercentage = (typeMap.get('股票型')?.amount || 0) / totalAmount * 100
  const mixedPercentage = (typeMap.get('混合型')?.amount || 0) / totalAmount * 100
  const riskPercentage = stockPercentage + mixedPercentage * 0.6
  
  let riskLevel: AllocationAdvice['riskLevel']
  if (riskPercentage > 70) {
    riskLevel = 'high'
  } else if (riskPercentage > 40) {
    riskLevel = 'medium'
  } else {
    riskLevel = 'low'
  }
  
  // [WHAT] 计算分散度评分
  const categoryCount = typeMap.size
  const maxConcentration = Math.max(...Array.from(typeMap.values()).map(v => v.amount / totalAmount))
  const diversificationScore = round(
    Math.min(100, categoryCount * 15 + (1 - maxConcentration) * 50),
    1
  )
  
  // [WHAT] 生成建议
  const suggestions: string[] = []
  
  if (maxConcentration > 0.5) {
    suggestions.push('单一类型占比过高，建议分散投资')
  }
  if (categoryCount < 3) {
    suggestions.push('资产类型较少，建议增加不同类型基金')
  }
  if (riskLevel === 'high') {
    suggestions.push('整体风险较高，可适当配置债券型基金降低风险')
  }
  if (!typeMap.has('债券型') && totalAmount > 50000) {
    suggestions.push('建议配置10-20%的债券型基金作为底仓')
  }
  
  if (suggestions.length === 0) {
    suggestions.push('当前资产配置较为合理')
  }
  
  // [WHAT] 建议配置（简化版）
  const suggestedAllocation: AllocationItem[] = [
    { category: '股票型', percentage: riskLevel === 'low' ? 20 : riskLevel === 'medium' ? 40 : 60, funds: [] },
    { category: '混合型', percentage: 30, funds: [] },
    { category: '债券型', percentage: riskLevel === 'low' ? 40 : riskLevel === 'medium' ? 20 : 10, funds: [] },
    { category: '货币型', percentage: 10, funds: [] }
  ]
  
  return {
    currentAllocation,
    suggestedAllocation,
    riskLevel,
    diversificationScore,
    suggestions
  }
}

// ========== 辅助函数 ==========

function round(value: number, decimals: number): number {
  const factor = Math.pow(10, decimals)
  return Math.round(value * factor) / factor
}

function getWeekNumber(date: Date): number {
  const firstDay = new Date(date.getFullYear(), 0, 1)
  const days = Math.floor((date.getTime() - firstDay.getTime()) / (24 * 60 * 60 * 1000))
  return Math.ceil((days + firstDay.getDay() + 1) / 7)
}

function pearsonCorrelation(x: number[], y: number[]): number {
  const n = Math.min(x.length, y.length)
  if (n < 2) return 0
  
  let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0, sumY2 = 0
  
  for (let i = 0; i < n; i++) {
    sumX += x[i]
    sumY += y[i]
    sumXY += x[i] * y[i]
    sumX2 += x[i] * x[i]
    sumY2 += y[i] * y[i]
  }
  
  const numerator = n * sumXY - sumX * sumY
  const denominator = Math.sqrt((n * sumX2 - sumX * sumX) * (n * sumY2 - sumY * sumY))
  
  return denominator === 0 ? 0 : numerator / denominator
}

function calculateMA(values: number[], period: number): number[] {
  const result: number[] = []
  for (let i = period - 1; i < values.length; i++) {
    const sum = values.slice(i - period + 1, i + 1).reduce((a, b) => a + b, 0)
    result.push(sum / period)
  }
  return result
}

function calculateRSI(values: number[], period: number): number {
  if (values.length < period + 1) return 50
  
  let gains = 0, losses = 0
  
  for (let i = values.length - period; i < values.length; i++) {
    const change = values[i] - values[i - 1]
    if (change > 0) gains += change
    else losses -= change
  }
  
  const avgGain = gains / period
  const avgLoss = losses / period
  
  if (avgLoss === 0) return 100
  const rs = avgGain / avgLoss
  return 100 - (100 / (1 + rs))
}

function calculateMACD(values: number[]): { macd: number; signal: number; histogram: number } {
  const ema12 = calculateEMA(values, 12)
  const ema26 = calculateEMA(values, 26)
  
  const macdLine = ema12 - ema26
  const signal = macdLine * 0.2  // 简化的信号线
  const histogram = macdLine - signal
  
  return { macd: macdLine, signal, histogram }
}

function calculateEMA(values: number[], period: number): number {
  if (values.length === 0) return 0
  
  const multiplier = 2 / (period + 1)
  let ema = values[0]
  
  for (let i = 1; i < values.length; i++) {
    ema = (values[i] - ema) * multiplier + ema
  }
  
  return ema
}
