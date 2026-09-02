<script setup lang="ts">
// [WHY] 专业交易所风格图表组件
// [WHAT] 深色主题、实时K线图、成交量柱状图、时间周期选择
// [HOW] Canvas绘制，requestAnimationFrame实现流畅实时动画

import { ref, onMounted, onUnmounted, onActivated, watch, computed, nextTick } from 'vue'
import { fetchSimpleKLineData, calculatePeriodReturns, clearFundCache, fetchHS300History, type SimpleKLineData, type PeriodReturn } from '@/api/fundFast'
import { useThemeStore } from '@/stores/theme'
import { isTradingTime } from '@/api/tiantianApi'
import type { TradeRecord, TTradeRecord } from '@/types/fund'

const props = defineProps<{
  fundCode: string
  realtimeValue: number
  realtimeChange: number
  lastClose: number
  trades?: TradeRecord[]
  // 持仓成本净值，用于绘制成本线
  costNavValue?: number
  // T交易归档记录，K线上用虚线连线+盈亏标注
  tTrades?: TTradeRecord[]
  // 高亮交易节点（从AI分析跳转）
  highlightDate?: string
  highlightType?: string
}>()

const themeStore = useThemeStore()

// [WHY] 根据主题获取颜色
function getThemeColors() {
  const isDark = themeStore.actualTheme === 'dark'
  return {
    bgPrimary: isDark ? '#0b0e11' : '#ffffff',
    bgSecondary: isDark ? '#1e2329' : '#f5f5f5',
    textPrimary: isDark ? '#eaecef' : '#1a1a1a',
    textSecondary: isDark ? '#848e9c' : '#666666',
    borderColor: isDark ? '#2b3139' : '#e0e0e0',
    gridColor: isDark ? '#1e2329' : '#f0f0f0',
    upColor: '#f6465d',
    downColor: '#0ecb81',
  }
}

// ========== 状态 ==========
const chartData = ref<SimpleKLineData[]>([])
const periodReturns = ref<PeriodReturn[]>([])
const isLoading = ref(false)
const activePeriod = ref('3m') // 默认显示 3 个月
const canvasRef = ref<HTMLCanvasElement | null>(null)

// [WHAT] 鼠标位置（用于交易标记悬停提示）
const mousePos = ref<{ x: number; y: number } | null>(null)

// [WHAT] 分时数据
interface IntradayPoint {
  time: string
  value: number
  volume: number // 模拟成交量
}
const intradayData = ref<IntradayPoint[]>([])
const baseValue = ref(0)

// [WHAT] 沪深300数据
interface HS300Data {
  time: string
  value: number
}
const hs300Data = ref<HS300Data[]>([])
const showHS300 = ref(true) // 是否显示沪深300曲线

// [WHAT] 图表模式：始终使用业绩走势模式
const chartMode = ref('performance')


// [WHAT] 时间周期配置（适配基金每日净值数据）
const periods = [
  { key: '1d', label: '当日', days: 0 },    // 当日实时走势
  { key: '5d', label: '5日', days: 5 },     // 近5个交易日
  { key: '1m', label: '1月', days: 30 },    // 近1个月
  { key: '3m', label: '3月', days: 90 },    // 近3个月
  { key: '6m', label: '6月', days: 180 },   // 近6个月
  { key: '1y', label: '1年', days: 365 },   // 近1年
]

// [WHAT] 计算业绩走势收益率数据（基于当前选中的周期）
// [WHY] 定义在这里，实际实现在 filteredData 之后
interface PerformancePoint {
  time: string
  fundReturn: number
  hs300Return: number
}

// [WHAT] 判断是否是当日分时模式
const isIntradayMode = computed(() => activePeriod.value === '1d')

// [WHAT] 只有当日模式且有实时数据时才显示分时图样式
// [WHY] 当日模式显示昨日数据 + 今日估值
const showIntradayChart = computed(() => isIntradayMode.value)

// [WHAT] 过滤数据
const filteredData = computed(() => {
  const currentPeriod = activePeriod.value // [WHY] 显式依赖，确保响应式
  const now = new Date()
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
  
  // [WHY] 当日模式：显示昨日收盘 + 今日实时估值
  // [WHAT] 基金没有分时API，当日模式只显示2个数据点
  if (showIntradayChart.value) {
    // [WHY] 获取所有历史数据，取最近的作为昨日收盘
    const sortedData = [...chartData.value]
      .sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime())
    
    if (sortedData.length === 0) {
      return [{
        time: today,
        value: props.lastClose || props.realtimeValue || 1,
        change: 0,
        volume: 50
      }]
    }
    
    // [WHAT] 获取最后一个交易日数据（昨日收盘）
    const lastTradingDay = sortedData[sortedData.length - 1]!
    const hasTodayData = lastTradingDay.time === today
    
    // [WHY] 如果最后数据就是今天，取前一天作为昨日
    const yesterdayData = hasTodayData && sortedData.length > 1 
      ? sortedData[sortedData.length - 2]! 
      : lastTradingDay
    
    let data: typeof sortedData = [{
      time: yesterdayData.time,
      value: yesterdayData.value,
      change: yesterdayData.change,
      volume: 60
    }]
    
    // [WHY] 添加今日实时数据点（只要有实时估值数据就显示，不限于交易时间）
    // [NOTE] QDII基金和A股交易时间不同，收盘后也可能有估值数据
    const hasRealtimeData = props.realtimeValue > 0 && props.realtimeValue !== yesterdayData.value
    
    if (hasRealtimeData) {
      // [WHAT] 有实时估值数据，添加今日实时估值点
      const realtimeChange = ((props.realtimeValue - yesterdayData.value) / yesterdayData.value) * 100
      
      data = [...data, {
        time: today,
        value: props.realtimeValue,
        change: props.realtimeChange || Number(realtimeChange.toFixed(2)),
        volume: 80
      }]
    } else if (hasTodayData) {
      // [WHAT] 没有实时数据但有今日净值，使用今日净值
      data = [...data, {
        time: lastTradingDay.time,
        value: lastTradingDay.value,
        change: lastTradingDay.change,
        volume: 80
      }]
    }
    
    return data
  }
  
  // [WHY] 其他情况统一使用K线数据
  const period = periods.find(p => p.key === currentPeriod)
  // 当日模式但数据不足时，显示5日K线
  const days = (period?.days === 0 || !period) ? 5 : period.days
  
  const startDate = new Date(now.getTime() - days * 24 * 60 * 60 * 1000)
  
  // [WHY] 先按时间排序，再过滤指定天数范围
  let rawData = [...chartData.value]
  
  // [WHAT] 调试信息：使用 error 级别确保输出到 logcat
  const debugInfo = {
    period: currentPeriod,
    rawLength: rawData.length,
    firstTime: rawData[0]?.time,
    lastTime: rawData[rawData.length - 1]?.time,
    today
  }
  // console.error('[图表检查] 原始数据:', JSON.stringify(debugInfo))
  
  let data = rawData
    .sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime())
    .filter(item => new Date(item.time) >= startDate)
    .map((item, i) => ({ 
      ...item, 
      volume: 50 + Math.abs(item.change) * 30 + (i % 5) * 10
    }))
  
  // const debugInfo2 = {
  //   filteredLength: data.length,
  //   firstTime: data[0]?.time,
  //   lastTime: data[data.length - 1]?.time
  // }
  // console.error('[图表检查] 过滤后:', JSON.stringify(debugInfo2))
  
  // [WHY] 实时更新当日 K 线数据点（只要有实时估值数据就更新，不限于交易时间）
  // [NOTE] QDII基金和A股交易时间不同，收盘后也可能有估值数据
  const shouldUpdateToday = props.realtimeValue > 0
  
  // const debugInfo3 = {
  //   period: currentPeriod,
  //   dataLength: data.length,
  //   lastItemTime: data.length > 0 ? data[data.length - 1]!.time : 'none',
  //   today,
  //   realtimeValue: props.realtimeValue,
  //   realtimeChange: props.realtimeChange,
  //   isTradingTime: isTradingTime(),
  //   shouldUpdateToday
  // }
  // console.error('[图表检查] K 线模式:', JSON.stringify(debugInfo3))
  
  if (shouldUpdateToday && data.length > 0) {
    const lastIndex = data.length - 1
    const lastItem = data[lastIndex]!
    
    if (lastItem.time === today) {
      data = [...data.slice(0, lastIndex), {
        ...lastItem,
        value: props.realtimeValue,
        change: props.realtimeChange,
        volume: lastItem.volume
      }]
    } else {
      data = [...data, {
        time: today,
        value: props.realtimeValue,
        change: props.realtimeChange,
        volume: 50 + Math.abs(props.realtimeChange) * 30
      }]
    }
  }
  
  return data
})

// [WHAT] 当前涨跌
const currentChange = computed(() => {
  if (isIntradayMode.value && baseValue.value > 0 && props.realtimeValue > 0) {
    return ((props.realtimeValue - baseValue.value) / baseValue.value) * 100
  }
  return props.realtimeChange || 0
})

// [WHAT] 计算业绩走势收益率数据（基于当前选中的周期）
const performanceData = computed((): PerformancePoint[] => {
  const data = filteredData.value
  if (data.length === 0) return []
  
  const fundFirstValue = data[0]?.value || 1
  
  // [WHY] 将沪深300数据转为 Map，方便快速查找（O(1) vs O(n)）
  // 同时处理日期格式统一
  const hs300Map = new Map<string, number>()
  hs300Data.value.forEach(h => {
    hs300Map.set(h.time, h.value)
  })
  
  // [WHAT] 找到基金起始时间对应的沪深300值
  const fundStartTime = data[0]?.time
  
  // [WHY] 找到 >= 基金起始时间的第一个沪深300数据点作为基准
  let hs300FirstValue = 1
  for (const h of hs300Data.value) {
    if (h.time >= fundStartTime) {
      hs300FirstValue = h.value
      break
    }
  }
  
  // [WHAT] 用于存储上一个有效的沪深300值（处理缺失日期）
  let lastValidHS300Value = hs300FirstValue
  
  return data.map(point => {
    // [WHY] 基金收益率 = (当前值 - 起始值) / 起始值 * 100
    const fundReturn = ((point.value - fundFirstValue) / fundFirstValue) * 100
    
    // [WHY] 优先精确匹配，否则使用最近的前值
    let hs300Return = 0
    const hs300Value = hs300Map.get(point.time)
    
    if (hs300Value !== undefined) {
      lastValidHS300Value = hs300Value
      if (hs300FirstValue > 0) {
        hs300Return = ((hs300Value - hs300FirstValue) / hs300FirstValue) * 100
      }
    } else {
      // [EDGE] 该日期没有沪深300数据，使用最近的有效值计算
      if (hs300FirstValue > 0 && lastValidHS300Value > 0) {
        hs300Return = ((lastValidHS300Value - hs300FirstValue) / hs300FirstValue) * 100
      }
    }
    
    return {
      time: point.time,
      fundReturn,
      hs300Return
    }
  })
})

// [WHAT] 计算最终涨跌幅（用于图例显示）
const fundPerformanceChange = computed(() => {
  if (performanceData.value.length === 0) return 0
  return performanceData.value[performanceData.value.length - 1]?.fundReturn || 0
})

const hs300PerformanceChange = computed(() => {
  if (performanceData.value.length === 0) return 0
  return performanceData.value[performanceData.value.length - 1]?.hs300Return || 0
})

// [WHAT] 调试信息
const debugMessage = computed(() => {
  const lastData = chartData.value[chartData.value.length - 1]
  const lastPerf = performanceData.value[performanceData.value.length - 1]
  return `基金数据:${chartData.value.length}条 | 沪深300:${hs300Data.value.length}条 | 业绩点:${performanceData.value.length}条 | 基金收益:${fundPerformanceChange.value.toFixed(2)}% | 沪深300收益:${hs300PerformanceChange.value.toFixed(2)}%`
})

// [WHAT] 统计数据
const stats = computed(() => {
  const data = filteredData.value
  if (data.length === 0) return { open: 0, high: 0, low: 0, close: 0 }
  const values = data.map(d => d.value)
  return {
    open: data[0]?.value || 0,
    high: Math.max(...values),
    low: Math.min(...values),
    close: data[data.length - 1]?.value || 0
  }
})

// ========== 分时数据 ==========
function addIntradayPoint(value: number) {
  if (!value || value <= 0) return
  
  const now = new Date()
  const timeStr = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}`
  
  if (baseValue.value === 0) {
    baseValue.value = props.lastClose || value
  }
  
  // 模拟成交量（基于价格变化）
  const lastValue = intradayData.value.length > 0 ? intradayData.value[intradayData.value.length - 1]!.value : value
  const priceChange = Math.abs(value - lastValue)
  const volume = 100 + priceChange * 10000 + Math.random() * 50
  
  const maxPoints = 500
  if (intradayData.value.length >= maxPoints) {
    intradayData.value = intradayData.value.slice(-maxPoints + 1)
  }
  
  intradayData.value.push({ time: timeStr, value, volume })
}

function resetIntradayData() {
  intradayData.value = []
  baseValue.value = props.lastClose || 0
}

// ========== 数据加载 ==========
async function loadData() {
  if (!props.fundCode) return
  
  isLoading.value = true
  try {
    clearFundCache(props.fundCode)
    
    // [WHY] 必须串行加载！两个API都使用同一个全局变量 Data_netWorthTrend
    // Promise.all 并行加载会导致全局变量被覆盖，沪深300读到基金数据
    const kline = await fetchSimpleKLineData(props.fundCode, 400)
    const returns = await calculatePeriodReturns(props.fundCode)
    const hs300 = await fetchHS300History(400)
    
    chartData.value = kline
    periodReturns.value = returns
    
    // [WHAT] 转换沪深300数据格式
    hs300Data.value = hs300.map(item => ({
      time: item.date,
      value: item.netValue
    })).reverse() // 转为正序（旧->新）
    
    console.log('[OKXChart] 基金数据:', kline.length, '条, 沪深300:', hs300.length, '条')
    if (kline.length > 0 && hs300.length > 0) {
      console.log('[OKXChart] 基金首值:', kline[0]?.value, '沪深300首值:', hs300Data.value[0]?.value)
    }
    
    // [DEBUG] 检查图表数据的日期范围
    if (kline.length > 0) {
      console.log('[OKXChart] 图表数据日期范围:', {
        firstDate: kline[0]?.time,
        lastDate: kline[kline.length - 1]?.time,
        totalRecords: kline.length,
        tradeDates: props.trades?.map(t => t.date)
      })
    }
    
    await nextTick()
    drawChart()
    
    // [WHY] 数据加载完成后，如果costNavValue有效，确保重绘成本线
    if (props.costNavValue && props.costNavValue > 0) {
      setTimeout(() => drawChart(), 100)
    }
  } catch (err) {
    console.error('加载图表数据失败:', err)
  } finally {
    isLoading.value = false
  }
}


// ========== 业绩走势图绘制（仿支付宝风格） ==========
function drawPerformanceChart(
  ctx: CanvasRenderingContext2D, 
  width: number, 
  height: number, 
  mainHeight: number,
  padding: { top: number; right: number; bottom: number; left: number },
  chartWidth: number,
  colors: ReturnType<typeof getThemeColors>
) {
  const perfData = performanceData.value
  if (perfData.length === 0) return
  
  // [WHAT] 计算收益率范围
  const allReturns = [
    ...perfData.map(d => d.fundReturn),
    ...(showHS300.value ? perfData.map(d => d.hs300Return) : [])
  ]
  // [FIX] 把成本线收益率也纳入范围计算，确保成本线永远可见（否则超出数据范围时消失）
  if (props.costNavValue && props.costNavValue > 0) {
    const fundFirstValue = filteredData.value[0]?.value || props.lastClose || 1
    if (fundFirstValue > 0) {
      allReturns.push(((props.costNavValue - fundFirstValue) / fundFirstValue) * 100)
    }
  }
  let minReturn = Math.min(...allReturns)
  let maxReturn = Math.max(...allReturns)
  
  // [WHY] 确保包含0%基准线，并添加边距
  minReturn = Math.min(minReturn, 0)
  maxReturn = Math.max(maxReturn, 0)
  const returnMargin = (maxReturn - minReturn) * 0.1 || 2
  minReturn -= returnMargin
  maxReturn += returnMargin
  
  const returnRange = maxReturn - minReturn || 1
  
  // [WHAT] Y轴转换为收益率坐标
  const toY = (ret: number) => {
    return padding.top + (mainHeight - padding.top) * (1 - (ret - minReturn) / returnRange)
  }
  
  // [WHAT] X轴坐标
  const toX = (index: number) => {
    return padding.left + (chartWidth / Math.max(perfData.length - 1, 1)) * index
  }
  
  // ========== 绘制网格线 ==========
  ctx.strokeStyle = colors.gridColor
  ctx.lineWidth = 1
  
  for (let i = 0; i <= 4; i++) {
    const ret = maxReturn - returnRange * i / 4
    const y = toY(ret)
    ctx.beginPath()
    ctx.moveTo(padding.left, y)
    ctx.lineTo(width - padding.right, y)
    ctx.stroke()
    
    // [WHAT] Y轴刻度（百分比）
    ctx.fillStyle = colors.textSecondary
    ctx.font = '10px Arial'
    ctx.textAlign = 'left'
    ctx.fillText(`${ret.toFixed(2)}%`, width - padding.right + 5, y + 3)
  }
  
  // ========== 绘制0%基准线（加粗） ==========
  const zeroY = toY(0)
  ctx.beginPath()
  ctx.moveTo(padding.left, zeroY)
  ctx.lineTo(width - padding.right, zeroY)
  ctx.strokeStyle = colors.borderColor
  ctx.lineWidth = 1.5
  ctx.stroke()
  
  // ========== 绘制持仓成本线（蓝色虚线） ==========
  if (props.costNavValue && props.costNavValue > 0) {
    // 获取基金的起始净值作为基准
    const fundFirstValue = filteredData.value[0]?.value || props.lastClose || 1
    if (fundFirstValue > 0) {
      const costReturn = ((props.costNavValue - fundFirstValue) / fundFirstValue) * 100
      const costY = toY(costReturn)
      
      // 绘制成本线
      ctx.beginPath()
      ctx.moveTo(padding.left, costY)
      ctx.lineTo(width - padding.right, costY)
      ctx.strokeStyle = '#1677ff' // 蓝色
      ctx.lineWidth = 1.5
      ctx.setLineDash([6, 4]) // 虚线样式
      ctx.stroke()
      ctx.setLineDash([]) // 恢复实线
      
      // 绘制成本线标签
      ctx.fillStyle = '#1677ff'
      ctx.font = '10px Arial'
      ctx.textAlign = 'left'
      const costLabel = `成本 ${props.costNavValue.toFixed(4)}`
      ctx.fillText(costLabel, padding.left + 5, costY - 4)
    }
  }
  
  // ========== 绘制基金曲线（蓝色实线） ==========
  const fundPoints = perfData.map((d, i) => ({ x: toX(i), y: toY(d.fundReturn), value: d.fundReturn }))
  
  if (fundPoints.length > 0) {
    // [WHAT] 填充渐变区域
    ctx.beginPath()
    ctx.moveTo(fundPoints[0].x, zeroY)
    
    for (let i = 0; i < fundPoints.length; i++) {
      const p = fundPoints[i]
      if (i === 0) {
        ctx.lineTo(p.x, p.y)
        continue
      }
      
      if (fundPoints.length < 3) {
        ctx.lineTo(p.x, p.y)
      } else {
        const p0 = fundPoints[Math.max(i - 1, 0)]
        const p1 = fundPoints[i]
        const p2 = fundPoints[Math.min(i + 1, fundPoints.length - 1)]
        const p3 = fundPoints[Math.min(i + 2, fundPoints.length - 1)]
        
        const tension = 6
        const cp1x = p1.x + (p2.x - p0.x) / tension
        const cp1y = p1.y + (p2.y - p0.y) / tension
        const cp2x = p2.x - (p3.x - p1.x) / tension
        const cp2y = p2.y - (p3.y - p1.y) / tension
        
        ctx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, p2.x, p2.y)
      }
    }
    
    ctx.lineTo(fundPoints[fundPoints.length - 1].x, zeroY)
    ctx.closePath()
    
    // [WHY] 根据最终涨跌决定颜色
    const isUp = fundPerformanceChange.value >= 0
    const fillColor = isUp ? 'rgba(246, 70, 93, 0.15)' : 'rgba(14, 203, 129, 0.15)'
    ctx.fillStyle = fillColor
    ctx.fill()
    
    // [WHAT] 绘制曲线
    ctx.beginPath()
    ctx.moveTo(fundPoints[0].x, fundPoints[0].y)
    
    for (let i = 1; i < fundPoints.length; i++) {
      if (fundPoints.length < 3) {
        ctx.lineTo(fundPoints[i].x, fundPoints[i].y)
      } else {
        const p0 = fundPoints[Math.max(i - 1, 0)]
        const p1 = fundPoints[i]
        const p2 = fundPoints[Math.min(i + 1, fundPoints.length - 1)]
        const p3 = fundPoints[Math.min(i + 2, fundPoints.length - 1)]
        
        const tension = 6
        const cp1x = p1.x + (p2.x - p0.x) / tension
        const cp1y = p1.y + (p2.y - p0.y) / tension
        const cp2x = p2.x - (p3.x - p1.x) / tension
        const cp2y = p2.y - (p3.y - p1.y) / tension
        
        ctx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, p2.x, p2.y)
      }
    }
    
    ctx.strokeStyle = isUp ? '#f6465d' : '#0ecb81'
    ctx.lineWidth = 2
    ctx.stroke()
  }
  
  // ========== 绘制沪深300曲线（黄色实线） ==========
  if (showHS300.value && hs300Data.value.length > 0) {
    const hs300Points = perfData
      .filter((d, i) => d.hs300Return !== 0 || i === 0)
      .map((d, i) => ({ x: toX(i), y: toY(d.hs300Return) }))
      .filter(p => !isNaN(p.y))
    
    if (hs300Points.length > 1) {
      ctx.beginPath()
      ctx.moveTo(hs300Points[0].x, hs300Points[0].y)
      
      for (let i = 1; i < hs300Points.length; i++) {
        ctx.lineTo(hs300Points[i].x, hs300Points[i].y)
      }
      
      ctx.strokeStyle = '#f0b90b' // 黄色
      ctx.lineWidth = 1.5
      ctx.setLineDash([]) // 实线
      ctx.stroke()
    }
  }
  
  // ========== 绘制最新点标记 ==========
  if (fundPoints.length > 0) {
    const lastPoint = fundPoints[fundPoints.length - 1]
    const isUp = fundPerformanceChange.value >= 0
    
    // 脉冲动画点
    const pulseSize = 4 + Math.sin(Date.now() / 200) * 1.5
    ctx.beginPath()
    ctx.arc(lastPoint.x, lastPoint.y, pulseSize, 0, Math.PI * 2)
    ctx.fillStyle = isUp ? '#f6465d' : '#0ecb81'
    ctx.fill()
  }
  
  // ========== 绘制X轴时间标签 ==========
  ctx.fillStyle = colors.textSecondary
  ctx.font = '10px Arial'
  ctx.textAlign = 'center'
  
  const maxLabels = width < 350 ? 3 : (width < 450 ? 4 : 5)
  const labelCount = Math.min(maxLabels, perfData.length)
  for (let i = 0; i < labelCount; i++) {
    const idx = Math.floor((perfData.length - 1) * i / Math.max(labelCount - 1, 1))
    const point = perfData[idx]
    if (!point) continue
    const x = toX(idx)
    
    const parts = point.time.split('-')
    const label = parts.length >= 3 ? `${parts[1]}-${parts[2]}` : point.time.slice(-5)
    ctx.fillText(label, x, height - 8)
  }
}

// ========== Canvas 绘图（专业风格） ==========
function drawChart() {
  const canvas = canvasRef.value
  if (!canvas) {
    setTimeout(drawChart, 50)
    return
  }
  
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  
  const data = filteredData.value
  const now = new Date()
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
  
  if (data.length === 0) return
  
  const dpr = window.devicePixelRatio || 1
  const rect = canvas.getBoundingClientRect()
  
  if (rect.width === 0 || rect.height === 0) {
    setTimeout(drawChart, 50)
    return
  }
  
  canvas.width = rect.width * dpr
  canvas.height = rect.height * dpr
  ctx.scale(dpr, dpr)
  
  const width = rect.width
  const height = rect.height
  
  // [WHAT] 布局：分时图占满高度，K线图有成交量区
  let mainHeight: number
  let volumeHeight: number
  let volumeTop: number
  
  // [WHY] 曲线图布局：图表占满高度，不显示成交量
  mainHeight = height - 25 // 留出底部X轴空间
  volumeHeight = 0
  volumeTop = height
  
  // [WHY] 根据画布宽度自适应调整内边距，充分利用手机屏幕空间
  // PC端（宽度 >= 500）保留较宽松的内边距，移动端紧凑布局
  const isMobile = width < 500
  const padding = isMobile 
    ? { top: 10, right: 40, bottom: 22, left: 40 }
    : { top: 15, right: 60, bottom: 25, left: 55 }
  const chartWidth = width - padding.left - padding.right
  
  // [WHY] 获取当前主题颜色
  const colors = getThemeColors()
  
  // 清除画布
  ctx.fillStyle = colors.bgPrimary
  ctx.fillRect(0, 0, width, height)
  
  // ========== 业绩走势模式 ==========
  if (chartMode.value === 'performance' && performanceData.value.length > 0) {
    drawPerformanceChart(ctx, width, height, mainHeight, padding, chartWidth, colors)
    // 绘制交易标记（业绩模式）
    drawTradeMarkers(ctx, width, height, mainHeight, padding, chartWidth, colors, 'performance')
    drawTTradeMarkers(ctx, width, height, mainHeight, padding, chartWidth, colors, 'performance')
    drawHighlightMarker(ctx, width, height, mainHeight, padding, chartWidth, 'performance')
    return
  }
  
  // ========== 净值走势模式（原有逻辑） ==========
  // 计算价格范围
  const values = data.map(d => d.value)
  let minValue = Math.min(...values)
  let maxValue = Math.max(...values)

  // [FIX] 把成本线净值也纳入价格范围计算，确保成本线永远可见（否则超出数据范围时直接消失）
  if (props.costNavValue && props.costNavValue > 0) {
    minValue = Math.min(minValue, props.costNavValue)
    maxValue = Math.max(maxValue, props.costNavValue)
  }
  
  // [WHY] 价格范围增加边距，让曲线不贴边
  const margin = (maxValue - minValue) * 0.1 || 0.01
  minValue -= margin
  maxValue += margin
  
  const valueRange = maxValue - minValue || 1
  
  // 成交量范围
  const volumes = data.map(d => (d as any).volume || 0)
  const maxVolume = Math.max(...volumes, 1)
  
  // ========== 绘制网格线 ==========
  ctx.strokeStyle = colors.gridColor
  ctx.lineWidth = 1
  
  // 水平网格线（主图区）
  for (let i = 0; i <= 4; i++) {
    const y = padding.top + (mainHeight - padding.top) * i / 4
    ctx.beginPath()
    ctx.moveTo(padding.left, y)
    ctx.lineTo(width - padding.right, y)
    ctx.stroke()
  }
  
  // ========== 绘制Y轴刻度（右侧） ==========
  ctx.fillStyle = colors.textSecondary
  ctx.font = '10px Arial'
  ctx.textAlign = 'left'
  
  for (let i = 0; i <= 4; i++) {
    const value = maxValue - valueRange * i / 4
    const y = padding.top + (mainHeight - padding.top) * i / 4
    ctx.fillText(value.toFixed(4), width - padding.right + 5, y + 3)
  }
  
  // ========== 绘制持仓成本线（蓝色虚线） ==========
  // [FIX] 成本线已加入 min/max 计算，必然在可见范围内，无需范围判断
  if (props.costNavValue && props.costNavValue > 0) {
    const costValue = props.costNavValue
    const costY = padding.top + (mainHeight - padding.top) * (1 - (costValue - minValue) / valueRange)

    // 绘制成本线
    ctx.beginPath()
    ctx.moveTo(padding.left, costY)
    ctx.lineTo(width - padding.right, costY)
    ctx.strokeStyle = '#1677ff' // 蓝色
    ctx.lineWidth = 1.5
    ctx.setLineDash([6, 4]) // 虚线样式
    ctx.stroke()
    ctx.setLineDash([]) // 恢复实线

    // 绘制成本线标签（右侧）
    ctx.fillStyle = '#1677ff'
    ctx.font = '10px Arial'
    ctx.textAlign = 'left'
    const costLabel = `成本 ${costValue.toFixed(4)}`
    ctx.fillText(costLabel, padding.left + 5, costY - 4)
  }
  
  // ========== 绘制价格线/K线 ==========
  const isUp = currentChange.value >= 0
  // [WHY] 国内股市/基金习惯：红涨绿跌
  const upColor = colors.upColor
  const downColor = colors.downColor
  const lineColor = isUp ? upColor : downColor
  
  // [WHY] 计算整体涨跌
  const chartBottom = mainHeight
  const firstValue = data[0]?.value || 0
  const lastValue = data[data.length - 1]?.value || 0
  const isOverallUp = lastValue >= firstValue
  
  // ========== 当日模式特殊处理 ==========
  // [WHY] 非交易时间显示完整曲线，交易时间无数据时显示"等待开盘"
  const isTrading = isTradingTime()
  const hasRealtimeData = props.realtimeValue > 0
  const showWaitingState = isIntradayMode.value && isTrading && !hasRealtimeData
  
  if (isIntradayMode.value && data.length > 0 && showWaitingState) {
    // [WHAT] 交易时间但无实时数据：显示历史曲线 + 等待开盘
    ctx.beginPath()
    ctx.setLineDash([4, 4])
    data.forEach((point, i) => {
      const x = padding.left + (chartWidth / Math.max(data.length - 1, 1)) * i
      const y = padding.top + (mainHeight - padding.top) * (1 - (point.value - minValue) / valueRange)
      if (i === 0) ctx.moveTo(x, y)
      else ctx.lineTo(x, y)
    })
    ctx.strokeStyle = colors.textSecondary
    ctx.lineWidth = 1.5
    ctx.stroke()
    ctx.setLineDash([])
    
    // [WHAT] 绘制历史数据点
    data.forEach((point, i) => {
      const x = padding.left + (chartWidth / Math.max(data.length - 1, 1)) * i
      const y = padding.top + (mainHeight - padding.top) * (1 - (point.value - minValue) / valueRange)
      ctx.beginPath()
      ctx.arc(x, y, 3, 0, Math.PI * 2)
      ctx.fillStyle = colors.textSecondary
      ctx.fill()
    })
    
    // [WHAT] 在最后一个点右侧显示"等待开盘"
    const lastPoint = data[data.length - 1]!
    const lastX = padding.left + chartWidth
    const lastY = padding.top + (mainHeight - padding.top) * (1 - (lastPoint.value - minValue) / valueRange)
    
    // 绘制虚线延伸到右侧
    ctx.beginPath()
    ctx.setLineDash([4, 4])
    const prevX = padding.left + (chartWidth / Math.max(data.length - 1, 1)) * (data.length - 1)
    const prevY = padding.top + (mainHeight - padding.top) * (1 - (lastPoint.value - minValue) / valueRange)
    ctx.moveTo(prevX, prevY)
    ctx.lineTo(lastX, lastY)
    ctx.strokeStyle = colors.textSecondary
    ctx.lineWidth = 1
    ctx.stroke()
    ctx.setLineDash([])
    
    // 显示"等待开盘"文字
    ctx.fillStyle = colors.textSecondary
    ctx.font = '12px Arial'
    ctx.textAlign = 'center'
    ctx.fillText('等待开盘', lastX - 40, lastY - 10)
    
    // 绘制闪烁的等待点
    const pulseSize = 3 + Math.sin(Date.now() / 300) * 1.5
    ctx.beginPath()
    ctx.arc(lastX, lastY, pulseSize, 0, Math.PI * 2)
    ctx.fillStyle = colors.textSecondary
    ctx.globalAlpha = 0.5 + Math.sin(Date.now() / 300) * 0.3
    ctx.fill()
    ctx.globalAlpha = 1
  } else {
    // ========== 其他模式：标准曲线图 ==========
    
    // [WHAT] 绘制填充区域
    ctx.beginPath()
    ctx.moveTo(padding.left, chartBottom)
    
    const fillPoints: { x: number, y: number }[] = data.map((point, i) => ({
      x: padding.left + (chartWidth / Math.max(data.length - 1, 1)) * i,
      y: padding.top + (mainHeight - padding.top) * (1 - (point.value - minValue) / valueRange)
    }))
    
    if (fillPoints.length > 0) {
      ctx.lineTo(fillPoints[0]!.x, fillPoints[0]!.y)
      
      // [WHY] 点数少于3时使用直线，点数足够时使用贝塞尔曲线
      if (fillPoints.length < 3) {
        for (let i = 1; i < fillPoints.length; i++) {
          ctx.lineTo(fillPoints[i]!.x, fillPoints[i]!.y)
        }
      } else {
        // [HOW] Catmull-Rom样条曲线
        for (let i = 0; i < fillPoints.length - 1; i++) {
          const p0 = fillPoints[Math.max(i - 1, 0)]!
          const p1 = fillPoints[i]!
          const p2 = fillPoints[i + 1]!
          const p3 = fillPoints[Math.min(i + 2, fillPoints.length - 1)]!
          
          const tension = 6
          const cp1x = p1.x + (p2.x - p0.x) / tension
          const cp1y = p1.y + (p2.y - p0.y) / tension
          const cp2x = p2.x - (p3.x - p1.x) / tension
          const cp2y = p2.y - (p3.y - p1.y) / tension
          
          ctx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, p2.x, p2.y)
        }
      }
    }
    
    // 闭合路径
    const lastX = padding.left + chartWidth
    ctx.lineTo(lastX, chartBottom)
    ctx.closePath()
    
    // 填充渐变
    const fillGradient = ctx.createLinearGradient(0, padding.top, 0, chartBottom)
    if (isOverallUp) {
      fillGradient.addColorStop(0, 'rgba(246, 70, 93, 0.25)')
      fillGradient.addColorStop(0.5, 'rgba(246, 70, 93, 0.1)')
      fillGradient.addColorStop(1, 'rgba(246, 70, 93, 0)')
    } else {
      fillGradient.addColorStop(0, 'rgba(14, 203, 129, 0.25)')
      fillGradient.addColorStop(0.5, 'rgba(14, 203, 129, 0.1)')
      fillGradient.addColorStop(1, 'rgba(14, 203, 129, 0)')
    }
    ctx.fillStyle = fillGradient
    ctx.fill()
    
    // [WHAT] 绘制平滑走势曲线
    ctx.beginPath()
    const points: { x: number, y: number }[] = data.map((point, i) => ({
      x: padding.left + (chartWidth / Math.max(data.length - 1, 1)) * i,
      y: padding.top + (mainHeight - padding.top) * (1 - (point.value - minValue) / valueRange)
    }))
    
    if (points.length > 0) {
      ctx.moveTo(points[0]!.x, points[0]!.y)
      
      // [WHY] 点数少于3时使用直线，点数足够时使用贝塞尔曲线
      if (points.length < 3) {
        // 直线连接
        for (let i = 1; i < points.length; i++) {
          ctx.lineTo(points[i]!.x, points[i]!.y)
        }
      } else {
        // [HOW] 使用Catmull-Rom样条曲线，自动生成平滑控制点
        for (let i = 0; i < points.length - 1; i++) {
          const p0 = points[Math.max(i - 1, 0)]!
          const p1 = points[i]!
          const p2 = points[i + 1]!
          const p3 = points[Math.min(i + 2, points.length - 1)]!
          
          // [WHAT] Catmull-Rom to Bezier转换，生成平滑曲线
          const tension = 6 // 张力系数
          const cp1x = p1.x + (p2.x - p0.x) / tension
          const cp1y = p1.y + (p2.y - p0.y) / tension
          const cp2x = p2.x - (p3.x - p1.x) / tension
          const cp2y = p2.y - (p3.y - p1.y) / tension
          
          ctx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, p2.x, p2.y)
        }
      }
    }
    ctx.strokeStyle = isOverallUp ? upColor : downColor
    ctx.lineWidth = 2
    ctx.stroke()
    
    // [WHAT] 绘制沪深300曲线（黄色）- 相对趋势对比
    if (showHS300.value && hs300Data.value.length > 0) {
      // [WHY] 过滤与基金数据相同时间范围的沪深300数据
      const fundStartTime = data[0]?.time
      const fundEndTime = data[data.length - 1]?.time
      
      const filteredHS300 = hs300Data.value.filter(item => {
        return item.time >= fundStartTime && item.time <= fundEndTime
      })
      
      if (filteredHS300.length > 0) {
        // [WHY] 相对趋势对比：将沪深300起点对齐到基金起点
        // 计算对齐比例：基金第一个值 / 沪深300第一个值
        const fundFirstValue = data[0]?.value || 1
        const hs300FirstValue = filteredHS300[0]?.value || 1
        const alignRatio = fundFirstValue / hs300FirstValue
        
        // [WHAT] 计算对齐后的沪深300点
        const hs300Points = filteredHS300.map((item, i) => {
          const x = padding.left + (chartWidth / Math.max(data.length - 1, 1)) * 
            (data.findIndex(d => d.time === item.time) / Math.max(data.length - 1, 1) * (data.length - 1))
          // [WHY] 对齐后的值 = 原始值 × 对齐比例
          const alignedValue = item.value * alignRatio
          const y = padding.top + (mainHeight - padding.top) * (1 - (alignedValue - minValue) / valueRange)
          return { x, y, value: alignedValue }
        }).filter(p => p.x >= padding.left) // 只保留有对应X坐标的点

        if (hs300Points.length > 1) {
          ctx.beginPath()
          ctx.moveTo(hs300Points[0].x, hs300Points[0].y)
          
          // [HOW] 使用直线连接沪深300点（数据点可能不连续）
          for (let i = 1; i < hs300Points.length; i++) {
            ctx.lineTo(hs300Points[i].x, hs300Points[i].y)
          }
          
          ctx.strokeStyle = '#f5a623' // 黄色
          ctx.lineWidth = 1.5
          ctx.setLineDash([5, 3]) // 虚线样式
          ctx.stroke()
          ctx.setLineDash([]) // 恢复实线
          
          // [WHAT] 绘制图例说明
          ctx.fillStyle = '#f5a623'
          ctx.font = '10px Arial'
          ctx.textAlign = 'left'
          ctx.fillText('沪深300(对齐)', padding.left + 5, padding.top + 12)
        }
      }
    }
    
    // 绘制最新点动画 + 精确数值标注
    if (data.length > 0) {
      const lastPoint = data[data.length - 1]!
      const lastPointX = padding.left + chartWidth
      const lastPointY = padding.top + (mainHeight - padding.top) * (1 - (lastPoint.value - minValue) / valueRange)
      
      // [WHAT] 绘制脉冲动画点
      const pulseSize = 3 + Math.sin(Date.now() / 200) * 1.5
      ctx.beginPath()
      ctx.arc(lastPointX, lastPointY, pulseSize, 0, Math.PI * 2)
      ctx.fillStyle = isOverallUp ? upColor : downColor
      ctx.fill()
      
      ctx.beginPath()
      ctx.arc(lastPointX, lastPointY, pulseSize + 3, 0, Math.PI * 2)
      ctx.strokeStyle = isOverallUp ? upColor : downColor
      ctx.lineWidth = 1
      ctx.globalAlpha = 0.4
      ctx.stroke()
      ctx.globalAlpha = 1
      
      // [WHAT] 在最新点旁边显示精确数值（带背景框避免与Y轴刻度重叠）
      const priceText = lastPoint.value.toFixed(4)
      ctx.font = 'bold 11px Arial'
      
      // [WHY] 根据点位置决定标签显示在上方还是下方，并加背景框
      const labelY = lastPointY < mainHeight / 2 ? lastPointY + 18 : lastPointY - 8
      const labelX = lastPointX + 5
      
      // [WHAT] 测量文本宽度，绘制背景框
      const textMetrics = ctx.measureText(priceText)
      const textWidth = textMetrics.width
      const textHeight = 14
      const bgPadding = 3
      
      // [WHY] 绘制背景框，避免与右侧Y轴刻度重叠
      ctx.fillStyle = isOverallUp ? 'rgba(246, 70, 93, 0.9)' : 'rgba(14, 203, 129, 0.9)'
      ctx.beginPath()
      ctx.roundRect(
        labelX - bgPadding, 
        labelY - textHeight + 2, 
        textWidth + bgPadding * 2, 
        textHeight + bgPadding,
        3
      )
      ctx.fill()
      
      // [WHAT] 绘制白色文字
      ctx.fillStyle = '#ffffff'
      ctx.textAlign = 'left'
      ctx.fillText(priceText, labelX, labelY)
    }
  }
  
  // ========== 绘制 X 轴时间标签 ==========
  ctx.fillStyle = colors.textSecondary
  ctx.font = '10px Arial'
  ctx.textAlign = 'center'
  
  // [WHY] 移动端减少标签数量避免重叠，根据屏幕宽度动态调整
  const maxLabels = width < 350 ? 3 : (width < 450 ? 4 : 5)
  const labelCount = Math.min(maxLabels, data.length)
  for (let i = 0; i < labelCount; i++) {
    const idx = Math.floor((data.length - 1) * i / Math.max(labelCount - 1, 1))
    const point = data[idx]
    if (!point) continue
    const x = padding.left + (chartWidth / Math.max(data.length - 1, 1)) * idx
    
    // [WHAT] 显示时间标签
    // [WHY] 当日分时模式只显示时间（如 09:30），避免与日期重叠
    let label: string
    if (isIntradayMode.value && point.time.includes(' ')) {
      // 分时模式：只显示时间部分
      label = point.time.split(' ')[1] || point.time.slice(-5)
    } else {
      // K 线模式：显示日期
      const parts = point.time.split('-')
      label = parts.length >= 3 ? `${parts[1]}-${parts[2].split(' ')[0]}` : point.time.slice(-5)
    }
    ctx.fillText(label, x, height - 5)
  }
  
  // [WHAT] 当日模式：显示数据日期提示
  if (isIntradayMode.value && data.length > 0) {
    // 获取数据的实际日期
    const firstPoint = data[0]!
    const dateStr = firstPoint.time.split(' ')[0] || firstPoint.time
    const dateParts = dateStr.split('-')
    const displayDate = dateParts.length >= 3 ? `${dateParts[1]}-${dateParts[2]}` : dateStr
    
    // [WHY] 如果数据日期不是今天，显示提示
    if (!dateStr.includes(today)) {
      ctx.font = '11px Arial'
      ctx.textAlign = 'left'
      ctx.fillStyle = colors.textSecondary
      ctx.fillText(`最新交易日: ${displayDate}`, padding.left, padding.top - 3)
    }
  }

  // 绘制交易标记（净值模式）
  drawTradeMarkers(ctx, width, height, mainHeight, padding, chartWidth, colors, 'normal')
  drawTTradeMarkers(ctx, width, height, mainHeight, padding, chartWidth, colors, 'normal')
  drawHighlightMarker(ctx, width, height, mainHeight, padding, chartWidth, 'normal')
}

function formatVolume(v: number): string {
  if (v >= 1000000) return (v / 1000000).toFixed(1) + 'M'
  if (v >= 1000) return (v / 1000).toFixed(1) + 'K'
  return v.toFixed(0)
}

// ========== 容错日期匹配 ==========
// [WHY] 修复日期格式/时区/精度不一致导致交易标记无法匹配的问题
// [WHAT] 优先严格匹配，失败后用宽松匹配（只比 YYYY-MM-DD 部分），最后用最近日期兜底
function findDateIndex(data: { time: string }[], targetDate: string): number {
  if (!targetDate || data.length === 0) return -1
  
  // 1. 严格字符串匹配
  const strictIdx = data.findIndex(d => d.time === targetDate)
  if (strictIdx !== -1) return strictIdx
  
  // 2. 宽松匹配：只比较 YYYY-MM-DD 部分（忽略可能的时间/时区后缀）
  const targetClean = (targetDate.split(' ')[0] || targetDate).slice(0, 10)
  const cleanIdx = data.findIndex(d => {
    const dataClean = (d.time.split(' ')[0] || d.time).slice(0, 10)
    return dataClean === targetClean
  })
  if (cleanIdx !== -1) {
    console.log('[findDateIndex] 宽松匹配:', targetDate, '→', data[cleanIdx]?.time)
    return cleanIdx
  }
  
  // 3. 最近日期兜底（允许最大 7 天误差）
  let bestIdx = -1
  let minDiffDays = Infinity
  const targetTime = new Date(targetClean).getTime()
  if (isNaN(targetTime)) return -1
  
  for (let i = 0; i < data.length; i++) {
    const d = data[i]!
    const dataClean = (d.time.split(' ')[0] || d.time).slice(0, 10)
    const dataTime = new Date(dataClean).getTime()
    if (isNaN(dataTime)) continue
    const diffDays = Math.abs(dataTime - targetTime) / (1000 * 60 * 60 * 24)
    if (diffDays < minDiffDays) {
      minDiffDays = diffDays
      bestIdx = i
    }
  }
  
  if (bestIdx !== -1 && minDiffDays <= 7) {
    console.log('[findDateIndex] 最近匹配:', targetDate, '→', data[bestIdx]?.time, `(差${minDiffDays.toFixed(1)}天)`)
    return bestIdx
  }
  
  return -1
}

// ========== 交易标记绘制 ==========
function drawTradeMarkers(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  mainHeight: number,
  padding: { top: number; right: number; bottom: number; left: number },
  chartWidth: number,
  colors: ReturnType<typeof getThemeColors>,
  mode: 'performance' | 'normal'
) {
  const trades = props.trades || []
  const tTrades = props.tTrades || []

  // [FIX] trades 为空但 tTrades 不为空时仍需继续，否则 T 交易的 hover 检测和 tooltip 不执行
  if (trades.length === 0 && tTrades.length === 0) return

  const data = mode === 'performance' ? performanceData.value : filteredData.value
  if (data.length === 0) return

  // [DEBUG] 调试日志：检查交易标记
  const tradeDates = trades.map(t => t.date)
  const dataDates = data.map(d => d.time)
  const missingDates = tradeDates.filter(d => !dataDates.includes(d))
  if (missingDates.length > 0) {
    console.log('[drawTradeMarkers] 警告: 以下交易日期不在图表数据中:', missingDates)
    console.log('[drawTradeMarkers] 图表数据日期范围:', dataDates[0], '至', dataDates[dataDates.length - 1])
    console.log('[drawTradeMarkers] 交易日期:', tradeDates)
  }

  // 计算坐标转换函数
  const toX = (index: number) => padding.left + (chartWidth / Math.max(data.length - 1, 1)) * index

  let toY: (value: number) => number
  let valueGetter: (d: any) => number
  let hoveredTrade: TradeRecord | null = null
  let hoveredTTrade: TTradeRecord | null = null
  let hoveredTTradeType: 'buy' | 'sell' = 'buy'

  if (mode === 'performance') {
    const allReturns = [
      ...performanceData.value.map(d => d.fundReturn),
      ...(showHS300.value ? performanceData.value.map(d => d.hs300Return) : [])
    ]
    let minReturn = Math.min(...allReturns)
    let maxReturn = Math.max(...allReturns)
    minReturn = Math.min(minReturn, 0)
    maxReturn = Math.max(maxReturn, 0)
    const returnMargin = (maxReturn - minReturn) * 0.1 || 2
    minReturn -= returnMargin
    maxReturn += returnMargin
    const returnRange = maxReturn - minReturn || 1

    toY = (ret: number) => padding.top + (mainHeight - padding.top) * (1 - (ret - minReturn) / returnRange)
    valueGetter = (d: any) => d.fundReturn

    // 检查悬停
    if (mousePos.value) {
      for (const trade of trades) {
        const pointIndex = findDateIndex(performanceData.value, trade.date)
        if (pointIndex === -1) continue
        const x = toX(pointIndex)
        const y = toY(valueGetter(performanceData.value[pointIndex]!))
        const dist = Math.hypot(mousePos.value.x - x, mousePos.value.y - y)
        if (dist <= 12) {
          hoveredTrade = trade
          break
        }
      }
      // 检查T交易紫色点悬停
      if (!hoveredTrade && tTrades.length > 0) {
        for (const t of tTrades) {
          const buyIdx = findDateIndex(performanceData.value, t.buyDate)
          if (buyIdx !== -1) {
            const bx = toX(buyIdx)
            const by = toY(valueGetter(performanceData.value[buyIdx]!))
            if (Math.hypot(mousePos.value.x - bx, mousePos.value.y - by) <= 10) {
              hoveredTTrade = t
              hoveredTTradeType = 'buy'
              break
            }
          }
          const sellIdx = findDateIndex(performanceData.value, t.sellDate)
          if (sellIdx !== -1) {
            const sx = toX(sellIdx)
            const sy = toY(valueGetter(performanceData.value[sellIdx]!))
            if (Math.hypot(mousePos.value.x - sx, mousePos.value.y - sy) <= 10) {
              hoveredTTrade = t
              hoveredTTradeType = 'sell'
              break
            }
          }
        }
      }
    }
  } else {
    const values = filteredData.value.map(d => d.value)
    let minValue = Math.min(...values)
    let maxValue = Math.max(...values)
    const margin = (maxValue - minValue) * 0.1 || 0.01
    minValue -= margin
    maxValue += margin
    const valueRange = maxValue - minValue || 1

    toY = (val: number) => padding.top + (mainHeight - padding.top) * (1 - (val - minValue) / valueRange)
    valueGetter = (d: any) => d.value

    // 检查悬停
    if (mousePos.value) {
      for (const trade of trades) {
        const pointIndex = findDateIndex(filteredData.value, trade.date)
        if (pointIndex === -1) continue
        const x = toX(pointIndex)
        const y = toY(valueGetter(filteredData.value[pointIndex]!))
        const dist = Math.hypot(mousePos.value.x - x, mousePos.value.y - y)
        if (dist <= 12) {
          hoveredTrade = trade
          break
        }
      }
      // 检查T交易紫色点悬停
      if (!hoveredTrade && tTrades.length > 0) {
        for (const t of tTrades) {
          const buyIdx = findDateIndex(filteredData.value, t.buyDate)
          if (buyIdx !== -1) {
            const bx = toX(buyIdx)
            const by = toY(valueGetter(filteredData.value[buyIdx]!))
            if (Math.hypot(mousePos.value.x - bx, mousePos.value.y - by) <= 10) {
              hoveredTTrade = t
              hoveredTTradeType = 'buy'
              break
            }
          }
          const sellIdx = findDateIndex(filteredData.value, t.sellDate)
          if (sellIdx !== -1) {
            const sx = toX(sellIdx)
            const sy = toY(valueGetter(filteredData.value[sellIdx]!))
            if (Math.hypot(mousePos.value.x - sx, mousePos.value.y - sy) <= 10) {
              hoveredTTrade = t
              hoveredTTradeType = 'sell'
              break
            }
          }
        }
      }
    }
  }

  // 绘制交易标记
  for (const trade of trades) {
    const pointIndex = findDateIndex(data, trade.date)
    if (pointIndex === -1) continue

    const x = toX(pointIndex)
    const y = toY(valueGetter(data[pointIndex]!))
    const isBuy = trade.type === 'buy'
    const markerColor = isBuy ? '#f6465d' : '#0ecb81'

    // 绘制圆点标记
    ctx.beginPath()
    ctx.arc(x, y, 6, 0, Math.PI * 2)
    ctx.fillStyle = markerColor
    ctx.globalAlpha = 0.9
    ctx.fill()
    ctx.globalAlpha = 1

    // 绘制边框
    ctx.beginPath()
    ctx.arc(x, y, 6, 0, Math.PI * 2)
    ctx.strokeStyle = '#ffffff'
    ctx.lineWidth = 2
    ctx.stroke()

    // 绘制方向标记（上三角=买入，下三角=卖出）
    ctx.beginPath()
    if (isBuy) {
      // 买入：向上三角形
      ctx.moveTo(x, y - 12)
      ctx.lineTo(x - 4, y - 6)
      ctx.lineTo(x + 4, y - 6)
    } else {
      // 卖出：向下三角形
      ctx.moveTo(x, y + 12)
      ctx.lineTo(x - 4, y + 6)
      ctx.lineTo(x + 4, y + 6)
    }
    ctx.closePath()
    ctx.fillStyle = markerColor
    ctx.fill()
  }

  // 绘制悬停提示
  if (hoveredTrade && mousePos.value) {
    const trade = hoveredTrade
    const pointIndex = findDateIndex(data, trade.date)
    if (pointIndex === -1) return

    const x = toX(pointIndex)
    const y = toY(valueGetter(data[pointIndex]!))
    const isBuy = trade.type === 'buy'

    // 提示框内容
    const lines = [
      `${isBuy ? '📈 加仓' : '📉 减仓'} ${trade.date}`,
      `金额: ${trade.amount.toFixed(2)} 元`,
      `净值: ${trade.netValue.toFixed(4)}`,
      `份额: ${trade.shares.toFixed(2)}`
    ]

    // 测量提示框尺寸
    ctx.font = '12px Arial'
    const maxWidth = Math.max(...lines.map(l => ctx.measureText(l).width))
    const boxWidth = maxWidth + 16
    const lineHeight = 18
    const boxHeight = lines.length * lineHeight + 12

    // 确定提示框位置（避免超出边界）
    let boxX = x + 12
    let boxY = y - boxHeight - 10
    if (boxX + boxWidth > width) boxX = x - boxWidth - 12
    if (boxY < padding.top) boxY = y + 12

    // 绘制提示框背景
    ctx.fillStyle = 'rgba(0, 0, 0, 0.85)'
    ctx.beginPath()
    ctx.roundRect(boxX, boxY, boxWidth, boxHeight, 6)
    ctx.fill()

    // 绘制提示框边框
    ctx.strokeStyle = isBuy ? '#f6465d' : '#0ecb81'
    ctx.lineWidth = 1
    ctx.stroke()

    // 绘制提示文字
    ctx.fillStyle = '#ffffff'
    ctx.textAlign = 'left'
    ctx.font = '12px Arial'
    lines.forEach((line, i) => {
      ctx.fillText(line, boxX + 8, boxY + 20 + i * lineHeight)
    })
  }

  // [WHY] T交易紫色点悬停提示：显示买入/卖出详情和做T盈亏
  if (hoveredTTrade && mousePos.value) {
    const t = hoveredTTrade
    const isBuy = hoveredTTradeType === 'buy'
    const pointDate = isBuy ? t.buyDate : t.sellDate
    const pointIndex = findDateIndex(data, pointDate)
    if (pointIndex === -1) return

    const x = toX(pointIndex)
    const y = toY(valueGetter(data[pointIndex]!))
    const isProfit = t.profit >= 0

    // 提示框内容
    const lines = [
      `${isBuy ? '🟣 做T买入' : '🟣 做T卖出'} ${pointDate}`,
      `金额: ${(isBuy ? t.buyAmount : t.sellAmount).toFixed(2)} 元`,
      `净值: ${(isBuy ? t.buyNetValue : t.sellNetValue).toFixed(4)}`,
      `做T收益: ${isProfit ? '+' : ''}${t.profit.toFixed(2)} 元`,
      `收益率: ${isProfit ? '+' : ''}${t.returnRate.toFixed(2)}%`,
      `持有天数: ${t.holdingDays} 天`
    ]

    // 测量提示框尺寸
    ctx.font = '12px Arial'
    const maxWidth = Math.max(...lines.map(l => ctx.measureText(l).width))
    const boxWidth = maxWidth + 16
    const lineHeight = 18
    const boxHeight = lines.length * lineHeight + 12

    // 确定提示框位置（避免超出边界）
    let boxX = x + 12
    let boxY = y - boxHeight - 10
    if (boxX + boxWidth > width) boxX = x - boxWidth - 12
    if (boxY < padding.top) boxY = y + 12

    // 绘制提示框背景
    ctx.fillStyle = 'rgba(0, 0, 0, 0.85)'
    ctx.beginPath()
    ctx.roundRect(boxX, boxY, boxWidth, boxHeight, 6)
    ctx.fill()

    // 绘制提示框边框（紫色）
    ctx.strokeStyle = '#8b5cf6'
    ctx.lineWidth = 1
    ctx.stroke()

    // 绘制提示文字
    ctx.fillStyle = '#ffffff'
    ctx.textAlign = 'left'
    ctx.font = '12px Arial'
    lines.forEach((line, i) => {
      // 做T收益行根据盈亏着色
      if (line.startsWith('做T收益') || line.startsWith('收益率')) {
        ctx.fillStyle = isProfit ? '#22c55e' : '#ef4444'
      } else {
        ctx.fillStyle = '#ffffff'
      }
      ctx.fillText(line, boxX + 8, boxY + 20 + i * lineHeight)
    })
  }
}

// ========== T交易标记绘制 ==========
// [WHY] T交易用虚线连接买卖点+盈亏标注，与普通交易标记区分
function drawTTradeMarkers(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  mainHeight: number,
  padding: { top: number; right: number; bottom: number; left: number },
  chartWidth: number,
  colors: ReturnType<typeof getThemeColors>,
  mode: 'performance' | 'normal'
) {
  const tTrades = props.tTrades
  if (!tTrades || tTrades.length === 0) return

  const data = mode === 'performance' ? performanceData.value : filteredData.value
  if (data.length === 0) return

  const toX = (index: number) => padding.left + (chartWidth / Math.max(data.length - 1, 1)) * index

  let toY: (value: number) => number
  let valueGetter: (d: any) => number

  if (mode === 'performance') {
    const allReturns = [
      ...performanceData.value.map(d => d.fundReturn),
      ...(showHS300.value ? performanceData.value.map(d => d.hs300Return) : [])
    ]
    let minReturn = Math.min(...allReturns)
    let maxReturn = Math.max(...allReturns)
    minReturn = Math.min(minReturn, 0)
    maxReturn = Math.max(maxReturn, 0)
    const returnMargin = (maxReturn - minReturn) * 0.1 || 2
    minReturn -= returnMargin
    maxReturn += returnMargin
    const returnRange = maxReturn - minReturn || 1
    toY = (ret: number) => padding.top + (mainHeight - padding.top) * (1 - (ret - minReturn) / returnRange)
    valueGetter = (d: any) => d.fundReturn
  } else {
    const values = filteredData.value.map(d => d.value)
    let minValue = Math.min(...values)
    let maxValue = Math.max(...values)
    const margin = (maxValue - minValue) * 0.1 || 0.01
    minValue -= margin
    maxValue += margin
    const valueRange = maxValue - minValue || 1
    toY = (val: number) => padding.top + (mainHeight - padding.top) * (1 - (val - minValue) / valueRange)
    valueGetter = (d: any) => d.value
  }

  for (const t of tTrades) {
    const buyIndex = findDateIndex(data, t.buyDate)
    const sellIndex = findDateIndex(data, t.sellDate)
    if (buyIndex === -1 || sellIndex === -1) continue

    const x1 = toX(buyIndex)
    const y1 = toY(valueGetter(data[buyIndex]!))
    const x2 = toX(sellIndex)
    const y2 = toY(valueGetter(data[sellIndex]!))

    const isProfit = t.profit >= 0
    const lineColor = isProfit ? '#22c55e' : '#ef4444'

    // 绘制虚线连接
    ctx.beginPath()
    ctx.setLineDash([4, 3])
    ctx.moveTo(x1, y1)
    ctx.lineTo(x2, y2)
    ctx.strokeStyle = lineColor
    ctx.lineWidth = 1.5
    ctx.globalAlpha = 0.6
    ctx.stroke()
    ctx.setLineDash([])
    ctx.globalAlpha = 1

    // 买入点：紫色圆点
    ctx.beginPath()
    ctx.arc(x1, y1, 5, 0, Math.PI * 2)
    ctx.fillStyle = '#8b5cf6'
    ctx.globalAlpha = 0.9
    ctx.fill()
    ctx.globalAlpha = 1
    ctx.strokeStyle = '#fff'
    ctx.lineWidth = 1.5
    ctx.stroke()

    // 卖出点：紫色圆点
    ctx.beginPath()
    ctx.arc(x2, y2, 5, 0, Math.PI * 2)
    ctx.fillStyle = '#8b5cf6'
    ctx.globalAlpha = 0.9
    ctx.fill()
    ctx.globalAlpha = 1
    ctx.strokeStyle = '#fff'
    ctx.lineWidth = 1.5
    ctx.stroke()
  }
}

// ========== 高亮交易标记 ==========
// [WHY] 从AI分析跳转过来，用脉冲圆+价格箭头+水平线突出显示对应交易节点
function drawHighlightMarker(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  mainHeight: number,
  padding: { top: number; right: number; bottom: number; left: number },
  chartWidth: number,
  mode: 'performance' | 'normal'
) {
  if (!props.highlightDate) return

  const data = mode === 'performance' ? performanceData.value : filteredData.value
  if (data.length === 0) return

  const hlIndex = findDateIndex(data, props.highlightDate)
  if (hlIndex === -1) return

  const toX = (index: number) => padding.left + (chartWidth / Math.max(data.length - 1, 1)) * index

  let toY: (value: number) => number
  let valueGetter: (d: any) => number

  if (mode === 'performance') {
    const allReturns = [
      ...performanceData.value.map(d => d.fundReturn),
      ...(showHS300.value ? performanceData.value.map(d => d.hs300Return) : [])
    ]
    let minReturn = Math.min(...allReturns)
    let maxReturn = Math.max(...allReturns)
    minReturn = Math.min(minReturn, 0)
    maxReturn = Math.max(maxReturn, 0)
    const returnMargin = (maxReturn - minReturn) * 0.1 || 2
    minReturn -= returnMargin
    maxReturn += returnMargin
    const returnRange = maxReturn - minReturn || 1
    toY = (ret: number) => padding.top + (mainHeight - padding.top) * (1 - (ret - minReturn) / returnRange)
    valueGetter = (d: any) => d.fundReturn
  } else {
    const values = filteredData.value.map(d => d.value)
    let minValue = Math.min(...values)
    let maxValue = Math.max(...values)
    const margin = (maxValue - minValue) * 0.1 || 0.01
    minValue -= margin
    maxValue += margin
    const valueRange = maxValue - minValue || 1
    toY = (val: number) => padding.top + (mainHeight - padding.top) * (1 - (val - minValue) / valueRange)
    valueGetter = (d: any) => d.value
  }

  const x = toX(hlIndex)
  const y = toY(valueGetter(data[hlIndex]!))
  const isBuy = props.highlightType === 'buy'
  const color = isBuy ? '#ef4444' : '#22c55e'

  // 1. 水平虚线（交易价格线）
  ctx.beginPath()
  ctx.setLineDash([6, 4])
  ctx.moveTo(padding.left, y)
  ctx.lineTo(width - padding.right, y)
  ctx.strokeStyle = color
  ctx.lineWidth = 1
  ctx.globalAlpha = 0.4
  ctx.stroke()
  ctx.setLineDash([])
  ctx.globalAlpha = 1

  // 2. 脉冲外环
  ctx.beginPath()
  ctx.arc(x, y, 12, 0, Math.PI * 2)
  ctx.strokeStyle = color
  ctx.lineWidth = 2
  ctx.globalAlpha = 0.4
  ctx.stroke()

  ctx.beginPath()
  ctx.arc(x, y, 8, 0, Math.PI * 2)
  ctx.strokeStyle = color
  ctx.lineWidth = 1.5
  ctx.globalAlpha = 0.7
  ctx.stroke()
  ctx.globalAlpha = 1

  // 3. 实心圆点
  ctx.beginPath()
  ctx.arc(x, y, 5, 0, Math.PI * 2)
  ctx.fillStyle = color
  ctx.fill()
  ctx.strokeStyle = '#fff'
  ctx.lineWidth = 2
  ctx.stroke()

  // 4. 价格标签（右侧）
  // [FIX] 业绩模式下不显示 fundReturn（那是图表起点开始的收益率，会误导）
  // 改为显示交易净值，让用户看到买卖点的实际价格
  const hlTrade = props.trades?.find(t => {
    if (t.type !== props.highlightType) return false
    // 日期宽松匹配：只比较 YYYY-MM-DD 部分
    const tradeClean = (t.date.split(' ')[0] || t.date).slice(0, 10)
    const hlClean = (props.highlightDate.split(' ')[0] || props.highlightDate).slice(0, 10)
    return tradeClean === hlClean || Math.abs(new Date(tradeClean).getTime() - new Date(hlClean).getTime()) <= 7 * 24 * 60 * 60 * 1000
  })
  const hlPoint = data[hlIndex]!
  const tradeNav = hlTrade?.netValue || (
    mode === 'performance' && hlPoint && 'fundReturn' in hlPoint
      ? hlPoint.fundReturn
      : hlPoint && 'value' in hlPoint
        ? hlPoint.value
        : 0
  )
  const labelText = isBuy ? `买入 ${props.highlightDate}` : `卖出 ${props.highlightDate}`
  const priceText = `净值 ${tradeNav.toFixed(4)}`

  ctx.font = 'bold 12px Arial'
  const labelW = ctx.measureText(labelText).width
  const priceW = ctx.measureText(priceText).width
  const boxW = Math.max(labelW, priceW) + 16
  const boxH = 32
  const boxX = Math.min(x + 10, width - padding.right - boxW)
  const boxY = Math.max(y - boxH / 2, padding.top)

  // 标签背景
  ctx.fillStyle = color
  ctx.beginPath()
  ctx.roundRect(boxX, boxY, boxW, boxH, 6)
  ctx.fill()

  // 标签文字
  ctx.fillStyle = '#fff'
  ctx.textAlign = 'left'
  ctx.font = '10px Arial'
  ctx.fillText(labelText, boxX + 8, boxY + 13)
  ctx.font = 'bold 13px Arial'
  ctx.fillText(priceText, boxX + 8, boxY + 26)

  // 5. 箭头从标签指向圆点
  ctx.beginPath()
  ctx.strokeStyle = color
  ctx.lineWidth = 1.5
  ctx.moveTo(boxX, boxY + boxH / 2)
  ctx.lineTo(x + 6, y)
  ctx.stroke()
}

// ========== 画布鼠标事件 ==========
function handleMouseMove(e: MouseEvent) {
  const canvas = canvasRef.value
  if (!canvas) return
  const rect = canvas.getBoundingClientRect()
  mousePos.value = {
    x: e.clientX - rect.left,
    y: e.clientY - rect.top
  }
}

function handleMouseLeave() {
  mousePos.value = null
}

// ========== 事件处理 ==========
function selectPeriod(key: string) {
  // [WHY] 先停止动画，避免旧数据干扰
  stopAnimation()
  
  // [WHY] 当日模式重置分时数据并添加当前点
  if (key === '1d') {
    resetIntradayData()
    // 确保添加至少一个数据点
    const val = props.realtimeValue || props.lastClose || 1
    if (val > 0) {
      addIntradayPoint(val)
    }
  }
  
  // [WHY] 更新周期
  activePeriod.value = key
  
  // [WHY] 使用 nextTick 确保 Vue 响应式更新完成后再绘图
  nextTick(() => {
    drawChart()
    startAnimation()
  })
}

// ========== 动画 ==========
let animationFrame: number | null = null

function startAnimation() {
  if (animationFrame) return
  
  let lastTime = 0
  function animate(time: number) {
    // [WHY] 所有模式都持续动画，实现K线实时走动
    if (time - lastTime > 33) { // 约30fps
      lastTime = time
      drawChart()
    }
    animationFrame = requestAnimationFrame(animate)
  }
  
  animationFrame = requestAnimationFrame(animate)
}

function stopAnimation() {
  if (animationFrame) {
    cancelAnimationFrame(animationFrame)
    animationFrame = null
  }
}

// ========== 生命周期 ==========
watch(() => props.fundCode, () => {
  resetIntradayData()
  loadData()
}, { immediate: true })

watch(() => props.realtimeValue, (newVal) => {
  if (newVal && newVal > 0) {
    // [WHY] 分时模式累积数据点，K线模式由computed自动更新
    if (isIntradayMode.value) {
      addIntradayPoint(newVal)
    }
    // 动画循环会自动重绘，无需手动调用
  }
})

watch(() => props.lastClose, (newVal) => {
  if (newVal && newVal > 0 && baseValue.value === 0) {
    baseValue.value = newVal
  }
})

// [WHY] 监控周期变化，强制重绘
watch(activePeriod, () => {
  nextTick(drawChart)
})

// [WHY] 监控主题变化，重绘图表
watch(() => themeStore.actualTheme, () => {
  nextTick(drawChart)
})

// [WHY] 监控沪深300显示切换，重绘图表
watch(showHS300, () => {
  nextTick(drawChart)
})

// [WHY] 监控高亮交易节点，重绘
watch(() => [props.highlightDate, props.highlightType], () => {
  nextTick(drawChart)
})

// [WHY] 监控图表模式切换，重绘图表
watch(chartMode, () => {
  nextTick(drawChart)
})

// [WHY] 监控交易记录变化，重绘标记
watch(() => props.trades, () => {
  nextTick(drawChart)
}, { deep: true })

// [WHY] 监控T交易归档变化，重绘T交易标记
watch(() => props.tTrades, () => {
  nextTick(drawChart)
}, { deep: true })

// [WHY] 监控成本净值变化，重绘成本线
watch(() => props.costNavValue, (newVal) => {
  if (newVal && newVal > 0) {
    // 立即尝试绘制
    nextTick(() => {
      drawChart()
      // 如果数据可能还在加载中，稍后再尝试一次
      setTimeout(() => drawChart(), 300)
    })
  }
}, { immediate: true })

let resizeObserver: ResizeObserver | null = null

onMounted(() => {
  if (canvasRef.value) {
    resizeObserver = new ResizeObserver(() => drawChart())
    resizeObserver.observe(canvasRef.value.parentElement!)
  }
  
  if (props.realtimeValue > 0) {
    addIntradayPoint(props.realtimeValue)
  }
  
  // [WHY] 所有模式都启用动画，实现实时走动
  setTimeout(startAnimation, 500)
})

// [FIX] Detail 页用了 keep-alive，从其他页 router.back() 返回时 onMounted 不会再跑，
// startAnimation/resizeObserver 可能处于停止或 detached 状态，导致成本线/图表不更新
onActivated(() => {
  if (canvasRef.value && !resizeObserver) {
    resizeObserver = new ResizeObserver(() => drawChart())
    resizeObserver.observe(canvasRef.value.parentElement!)
  }
  drawChart()
  startAnimation()
})

onUnmounted(() => {
  stopAnimation()
  resizeObserver?.disconnect()
  resizeObserver = null
})
</script>

<template>
  <div class="pro-chart">
    <!-- [WHAT] 图表类型切换 + 时间周期选择器 -->
    <div class="chart-header">
      <div class="period-selector">
        <div
          v-for="p in periods"
          :key="p.key"
          class="period-btn"
          :class="{ active: activePeriod === p.key }"
          @click.stop="selectPeriod(p.key)"
        >
          {{ p.label }}
        </div>
        <div class="period-tools">
          <span class="tool-label">实时</span>
          <span class="live-dot"></span>
        </div>
      </div>
    </div>

    <!-- [WHAT] 业绩走势图例（仿支付宝风格） -->
    <div v-if="performanceData.length > 0" class="performance-legend">
      <div class="legend-item fund-legend">
        <span class="legend-dot"></span>
        <span class="legend-label">本基金</span>
        <span class="legend-value" :class="fundPerformanceChange >= 0 ? 'up' : 'down'">
          {{ fundPerformanceChange >= 0 ? '+' : '' }}{{ fundPerformanceChange.toFixed(2) }}%
        </span>
      </div>
      <div v-if="showHS300 && hs300Data.length > 0" class="legend-item hs300-legend">
        <span class="legend-dash"></span>
        <span class="legend-label">沪深300</span>
        <span class="legend-value" :class="hs300PerformanceChange >= 0 ? 'up' : 'down'">
          {{ hs300PerformanceChange >= 0 ? '+' : '' }}{{ hs300PerformanceChange.toFixed(2) }}%
        </span>
      </div>
    </div>

    <!-- OHLC信息栏 -->
    <div class="ohlc-bar">
      <span class="ohlc-item">
        <span class="ohlc-label">开</span>
        <span class="ohlc-value">{{ stats.open.toFixed(4) }}</span>
      </span>
      <span class="ohlc-item">
        <span class="ohlc-label">高</span>
        <span class="ohlc-value up">{{ stats.high.toFixed(4) }}</span>
      </span>
      <span class="ohlc-item">
        <span class="ohlc-label">低</span>
        <span class="ohlc-value down">{{ stats.low.toFixed(4) }}</span>
      </span>
      <span class="ohlc-item">
        <span class="ohlc-label">收</span>
        <span class="ohlc-value" :class="currentChange >= 0 ? 'up' : 'down'">
          {{ realtimeValue > 0 ? realtimeValue.toFixed(4) : stats.close.toFixed(4) }}
        </span>
      </span>
      <span class="ohlc-item">
        <span class="ohlc-label">涨跌</span>
        <span class="ohlc-value" :class="currentChange >= 0 ? 'up' : 'down'">
          {{ currentChange >= 0 ? '+' : '' }}{{ currentChange.toFixed(2) }}%
        </span>
      </span>
    </div>

    <!-- 图表区域 -->
    <div class="chart-container">
      <div v-if="isLoading" class="chart-loading">
        <van-loading size="24px" color="#0ecb81">加载中...</van-loading>
      </div>
      <canvas 
        v-else 
        ref="canvasRef" 
        class="chart-canvas"
        @mousemove="handleMouseMove"
        @mouseleave="handleMouseLeave"
      ></canvas>
    </div>

    <!-- 成交量标签 -->
    <!-- <div class="volume-label">
      <span>成交量(Volume)</span>
      <span class="volume-value">{{ formatVolume((filteredData[filteredData.length - 1] as any)?.volume || 0) }}</span>
    </div> -->

    <!-- 阶段涨幅 -->
    <!-- <div v-if="periodReturns.length > 0" class="returns-bar">
      <div v-for="r in periodReturns" :key="r.period" class="return-item">
        <span class="return-label">{{ r.label }}</span>
        <span class="return-value" :class="r.change >= 0 ? 'up' : 'down'">
          {{ r.change >= 0 ? '+' : '' }}{{ r.change.toFixed(2) }}%
        </span>
      </div>
    </div> -->
  </div>
</template>

<style scoped>
/* ========== 移动端适配 + 主题支持 ========== */
/* [WHY] 使用CSS变量实现黑白主题切换 */

.pro-chart {
  background: var(--bg-primary);
  border-bottom: 1px solid var(--border-color);
  overscroll-behavior: contain;
  transition: background-color 0.3s;
}

/* [WHAT] 图表头部（模式切换 + 时间周期） */
/* [FIX] 移动端用紧凑型 padding（符合用户 profile 偏好），避免月度切换 tabbar 上方留白过大 */
.chart-header {
  padding-top: 6px;
  border-bottom: 1px solid var(--border-color);
}

@media (min-width: 768px) {
  .chart-header {
    padding-top: 12px;
  }
}

/* [WHAT] 模式切换标签 */
.mode-tabs {
  display: flex;
  padding: 4px 8px 2px;
  gap: 4px;
  border-bottom: 1px solid rgba(128, 128, 128, 0.15);
}

.mode-tab {
  padding: 4px 12px;
  font-size: 13px;
  color: var(--text-secondary);
  background: transparent;
  border-radius: 14px;
  cursor: pointer;
  transition: all 0.15s ease;
  border: none;
  white-space: nowrap;
}

.mode-tab.active {
  color: #fff;
  background: linear-gradient(135deg, #1677ff, #0958d9);
  font-weight: 500;
}

.mode-tab:not(.active):hover {
  background: var(--bg-secondary);
}

/* [WHAT] 业绩走势图例（仿支付宝风格） */
.performance-legend {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 6px 10px;
  border-bottom: 1px solid var(--border-color);
}

.legend-item {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
}

.legend-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #1677ff;
  flex-shrink: 0;
}

.fund-legend .legend-dot {
  background: var(--color-up);
}

.legend-dash {
  width: 16px;
  height: 2px;
  background: #f0b90b;
  flex-shrink: 0;
  position: relative;
}

.legend-dash::after {
  display: none;
}

.legend-label {
  color: var(--text-secondary);
}

.legend-value {
  font-weight: 600;
  font-family: -apple-system, 'SF Mono', monospace;
}

.legend-value.up { color: var(--color-up); }
.legend-value.down { color: var(--color-down); }

/* 时间周期选择器 */
/* [FIX] 移动端紧凑型 padding，网页端保持原宽松布局（用户 profile 偏好） */
.period-selector {
  display: flex;
  align-items: center;
  padding: 4px 8px 6px;
  gap: 4px;
  border-bottom: 1px solid var(--border-color);
  overflow-x: auto;
  scrollbar-width: none;
  -ms-overflow-style: none;
  -webkit-overflow-scrolling: touch;
}

@media (min-width: 768px) {
  .period-selector {
    padding: 8px 8px;
  }
}

.period-selector::-webkit-scrollbar {
  display: none;
}

.period-btn {
  min-height: 36px;
  min-width: 44px;
  padding: 6px 12px;
  font-size: 13px;
  color: var(--text-secondary);
  background: transparent;
  border-radius: 6px;
  white-space: nowrap;
  cursor: pointer;
  transition: all 0.15s ease;
  touch-action: manipulation;
  -webkit-tap-highlight-color: transparent;
  user-select: none;
}

.period-btn:active {
  transform: scale(0.95);
  opacity: 0.8;
}

.period-btn.active {
  color: var(--color-primary);
  background: var(--color-primary-bg);
  font-weight: 500;
}

.period-tools {
  margin-left: auto;
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}

.tool-label {
  font-size: 12px;
  color: var(--color-down);
  padding: 5px 10px;
  background: var(--color-down-bg);
  border-radius: 4px;
}

.live-dot {
  width: 8px;
  height: 8px;
  background: var(--color-down);
  border-radius: 50%;
  animation: pulse 1.5s infinite;
}

@keyframes pulse {
  0%, 100% { opacity: 1; transform: scale(1); }
  50% { opacity: 0.5; transform: scale(1.3); }
}

/* [WHAT] 沪深300切换按钮样式 */
.hs300-toggle {
  margin-left: 8px;
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 5px 10px;
  border-radius: 4px;
  cursor: pointer;
  transition: all 0.15s ease;
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
  flex-shrink: 0;
}

.hs300-toggle:hover {
  opacity: 0.8;
}

.hs300-toggle.active {
  background: rgba(245, 166, 35, 0.15);
  border-color: #f5a623;
}

.hs300-icon {
  font-size: 12px;
}

.hs300-label {
  font-size: 11px;
  color: var(--text-secondary);
  font-weight: 500;
}

.hs300-toggle.active .hs300-label {
  color: #f5a623;
}

/* OHLC信息栏 */
.ohlc-bar {
  display: flex;
  gap: 10px;
  padding: 6px 10px;
  font-size: 12px;
  border-bottom: 1px solid var(--border-color);
  overflow-x: auto;
  scrollbar-width: none;
  -ms-overflow-style: none;
  -webkit-overflow-scrolling: touch;
}

.ohlc-bar::-webkit-scrollbar {
  display: none;
}

.ohlc-item {
  display: flex;
  align-items: center;
  gap: 4px;
  white-space: nowrap;
  flex-shrink: 0;
}

.ohlc-label {
  color: var(--text-secondary);
}

.ohlc-value {
  font-family: -apple-system, 'SF Mono', 'Roboto Mono', monospace;
  color: var(--text-primary);
  font-weight: 500;
}

/* [WHY] 红涨绿跌 */
.ohlc-value.up { color: var(--color-up); }
.ohlc-value.down { color: var(--color-down); }

/* 图表容器 */
.chart-container {
  position: relative;
  /* [WHY] 使用vw单位适配不同屏幕，移动端让图表更大 */
  height: max(220px, 55vw);
  max-height: 340px;
  /* [WHY] 防止图表区域意外滚动 */
  touch-action: pan-x pan-y;
}

.chart-canvas {
  width: 100%;
  height: 100%;
  /* [WHY] 防止Canvas模糊 */
  image-rendering: -webkit-optimize-contrast;
}

.chart-loading {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
}

/* 成交量标签 */
.volume-label {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  font-size: 12px;
  color: var(--text-secondary);
  border-top: 1px solid var(--border-color);
}

.volume-value {
  font-family: -apple-system, 'SF Mono', 'Roboto Mono', monospace;
  color: var(--text-primary);
}

/* 阶段涨幅 */
.returns-bar {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(60px, 1fr));
  gap: 8px;
  padding: 12px;
  border-top: 1px solid var(--border-color);
}

.return-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: 4px;
}

.return-label {
  font-size: 12px;
  color: var(--text-secondary);
}

.return-value {
  font-size: 14px;
  font-weight: 600;
  font-family: -apple-system, 'SF Mono', 'Roboto Mono', monospace;
}

/* [WHY] 红涨绿跌 */
.return-value.up { color: var(--color-up); }
.return-value.down { color: var(--color-down); }

/* ========== 响应式适配 ========== */
@media screen and (max-width: 375px) {
  /* 小屏手机（iPhone SE等） */
  .period-btn {
    padding: 4px 8px;
    font-size: 12px;
    min-width: 36px;
  }
  
  .ohlc-bar {
    gap: 6px;
    font-size: 11px;
  }
  
  .chart-container {
    height: 220px;
  }
  
  .returns-bar {
    grid-template-columns: repeat(3, 1fr);
  }
}

@media screen and (min-width: 414px) {
  /* 大屏手机（iPhone Plus/Max等） */
  .period-btn {
    padding: 6px 12px;
    font-size: 14px;
  }
  
  .chart-container {
    height: 300px;
  }
}

/* [WHY] 安全区域适配（刘海屏、底部横条） */
@supports (padding-bottom: env(safe-area-inset-bottom)) {
  .pro-chart {
    padding-bottom: env(safe-area-inset-bottom);
  }
}
</style>
