<script setup lang="ts">
// [WHY] 星标K线页面用的轻量走势图，一页多个实例时性能可控
// [WHAT] 精简版：只画业绩走势 + 沪深300对比 + 成本线 + 交易点 + T交易点
// [WHAT] 新增：点击显示交易点信息 + 估值显示 + 1分钟自动刷新
// [DEPS] 复用 OKXChart 的业绩收益率算法和 findDateIndex 容错匹配

import { ref, onMounted, onUnmounted, watch, nextTick } from 'vue'
import { fetchSimpleKLineData, fetchHS300History, fetchFundAccurateData, type SimpleKLineData } from '@/api/fundFast'
import { getTradesByCode, getTTradesByCode } from '@/utils/storage'
import { useThemeStore } from '@/stores/theme'

// ========== Props ==========
const props = defineProps<{
  fundCode: string
  period?: '1m' | '3m' | '6m' | '1y'
  showHS300?: boolean
  fundName?: string
  marketValue?: number
  returnRate?: number
  costNavValue?: number
}>()

// ========== 常量 ==========
const PERIOD_DAYS: Record<string, number> = {
  '1m': 30, '3m': 90, '6m': 180, '1y': 365,
}
const DEFAULT_PERIOD = '3m'

// ========== 主题 ==========
const themeStore = useThemeStore()
function getColors() {
  // [FIX] 强制深色配色，因为 StarKLine 页面是深色背景
  return {
    bgPrimary: '#0b0e11',
    textPrimary: '#eaecef',
    textSecondary: '#848e9c',
    gridColor: '#1e2329',
    borderColor: '#2b3139',
    upColor: '#f6465d',
    downColor: '#0ecb81',
  }
}

// ========== 状态 ==========
interface HS300Point { time: string; value: number }
interface PerfPoint { time: string; fundReturn: number; hs300Return: number }

const rawData = ref<SimpleKLineData[]>([])
const hs300Data = ref<HS300Point[]>([])
const isLoading = ref(false)
const hasError = ref(false)
const canvasRef = ref<HTMLCanvasElement | null>(null)
const containerRef = ref<HTMLDivElement | null>(null)

// ========== 实时数据（净值/估值）==========
// [FIX] 参考 Detail 逻辑：调用 fetchFundAccurateData 根据 dataSource 判断
const realtimeData = ref<{
  currentValue: number
  dayChange: number
  dataSource: string  // 'nav' | 'estimate' | 'fallback'
} | null>(null)

// ========== 点击交互 ==========
const clickedPoint = ref<{ x: number; y: number; data: any } | null>(null)

// ========== 自动刷新定时器 ==========
let refreshTimer: ReturnType<typeof setInterval> | null = null

// ========== 工具函数 ==========
function findDateIndex(data: { time: string }[], targetDate: string): number {
  if (!targetDate || data.length === 0) return -1
  const strictIdx = data.findIndex(d => d.time === targetDate)
  if (strictIdx !== -1) return strictIdx
  const targetClean = (targetDate.split(' ')[0] || targetDate).slice(0, 10)
  const cleanIdx = data.findIndex(d => {
    const dataClean = (d.time.split(' ')[0] || d.time).slice(0, 10)
    return dataClean === targetClean
  })
  if (cleanIdx !== -1) return cleanIdx
  let bestIdx = -1
  let minDiffDays = Infinity
  const targetTime = new Date(targetClean).getTime()
  if (isNaN(targetTime)) return -1
  for (let i = 0; i < data.length; i++) {
    const dataClean = (data[i]!.time.split(' ')[0] || data[i]!.time).slice(0, 10)
    const dataTime = new Date(dataClean).getTime()
    if (isNaN(dataTime)) continue
    const diffDays = Math.abs(dataTime - targetTime) / (1000 * 60 * 60 * 24)
    if (diffDays < minDiffDays) { minDiffDays = diffDays; bestIdx = i }
  }
  if (bestIdx !== -1 && minDiffDays <= 7) return bestIdx
  return -1
}

// ========== 计算：周期过滤 ==========
function getFilteredData(): SimpleKLineData[] {
  const periodKey = props.period || DEFAULT_PERIOD
  const days = PERIOD_DAYS[periodKey] || 90
  const now = new Date()
  const startDate = new Date(now.getTime() - days * 24 * 60 * 60 * 1000)
  const startStr = `${startDate.getFullYear()}-${String(startDate.getMonth() + 1).padStart(2, '0')}-${String(startDate.getDate()).padStart(2, '0')}`
  return rawData.value.filter(d => d.time >= startStr)
}

// ========== 计算：业绩收益率 ==========
function getPerformanceData(filtered: SimpleKLineData[]): PerfPoint[] {
  if (filtered.length === 0) return []
  const fundFirstValue = filtered[0]?.value || 1

  const hs300Map = new Map<string, number>()
  hs300Data.value.forEach(h => hs300Map.set(h.time, h.value))

  const fundStartTime = filtered[0]?.time
  let hs300FirstValue = 1
  for (const h of hs300Data.value) {
    if (h.time >= fundStartTime) { hs300FirstValue = h.value; break }
  }
  let lastValidHS300Value = hs300FirstValue

  return filtered.map(point => {
    const fundReturn = ((point.value - fundFirstValue) / fundFirstValue) * 100
    let hs300Return = 0
    const hs300Value = hs300Map.get(point.time)
    if (hs300Value !== undefined) {
      lastValidHS300Value = hs300Value
      if (hs300FirstValue > 0) {
        hs300Return = ((hs300Value - hs300FirstValue) / hs300FirstValue) * 100
      }
    } else {
      if (hs300FirstValue > 0 && lastValidHS300Value > 0) {
        hs300Return = ((lastValidHS300Value - hs300FirstValue) / hs300FirstValue) * 100
      }
    }
    return { time: point.time, fundReturn, hs300Return }
  })
}

// ========== 数据加载 ==========
async function loadData() {
  if (!props.fundCode) return
  isLoading.value = true
  hasError.value = false
  try {
    // [FIX] 去掉 clearFundCache，避免每次挂载都强制刷新导致串行队列拥堵
    // clearFundCache(props.fundCode)
    // 串行加载！共用 Data_netWorthTrend 全局变量
    const kline = await fetchSimpleKLineData(props.fundCode, 400)
    const hs300 = await fetchHS300History(400)
    rawData.value = kline
    hs300Data.value = hs300.map(item => ({ time: item.date, value: item.netValue })).reverse()

    await nextTick()
    drawChart()
  } catch (err) {
    console.error('[MiniKLineChart] 加载失败:', props.fundCode, err)
    hasError.value = true
  } finally {
    isLoading.value = false
  }
}

// ========== 加载实时数据（净值/估值）==========
// [FIX] 参考 Detail 逻辑：调用 fetchFundAccurateData
async function loadRealtime() {
  if (!props.fundCode) return
  try {
    const data = await fetchFundAccurateData(props.fundCode)
    // [DEBUG] 调试日志
    console.log('[MiniKLineChart] 实时数据加载完成:', props.fundCode, data)
    if (data && data.currentValue > 0) {
      realtimeData.value = {
        currentValue: data.currentValue,
        dayChange: data.dayChange,
        dataSource: data.dataSource
      }
      await nextTick()
      drawChart()
    } else {
      console.warn('[MiniKLineChart] 实时数据无效:', props.fundCode, data)
    }
  } catch (err) {
    console.warn('[MiniKLineChart] 实时数据加载失败:', props.fundCode, err)
  }
}

// ========== 点击事件处理 ==========
function handleCanvasClick(e: MouseEvent) {
  const canvas = canvasRef.value
  if (!canvas) return

  const rect = canvas.getBoundingClientRect()
  const x = e.clientX - rect.left
  const y = e.clientY - rect.top

  // 获取当前显示的数据
  const filtered = getFilteredData()
  if (filtered.length === 0) return

  const perfData = getPerformanceData(filtered)
  if (perfData.length === 0) return

  // 计算图表区域
  const width = rect.width
  const height = rect.height
  const hasInfo = props.fundName || props.marketValue !== undefined
  const infoBarHeight = hasInfo ? 14 : 0
  const padding = { top: 2 + infoBarHeight, right: 40, bottom: 16, left: 4 }
  const mainHeight = height - padding.top - padding.bottom
  const chartWidth = width - padding.left - padding.right

  // 计算收益率范围（和 drawChart 保持一致）
  const allReturns = [...perfData.map(d => d.fundReturn)]
  let minR = Math.min(...allReturns, 0)
  let maxR = Math.max(...allReturns, 0)
  const margin = ((maxR - minR) || 2) * 0.1
  minR -= margin; maxR += margin
  const range = maxR - minR || 1

  const toY = (r: number) => padding.top + mainHeight * (1 - (r - minR) / range)
  const toX = (i: number) => padding.left + (chartWidth / Math.max(perfData.length - 1, 1)) * i

  // 获取交易记录
  const trades = getTradesByCode(props.fundCode)
  const tTrades = getTTradesByCode(props.fundCode)

  // 检测是否点击了交易标记点
  let clickedTrade: any = null
  let clickedTTrade: any = null
  let clickedTTradeType: 'buy' | 'sell' | null = null

  // 检测普通交易点
  for (const trade of trades) {
    const idx = findDateIndex(filtered, trade.date)
    if (idx === -1) continue
    const px = toX(idx)
    const py = toY(perfData[idx]?.fundReturn ?? 0)
    const dist = Math.sqrt((px - x) ** 2 + (py - y) ** 2)
    if (dist < 10) {
      clickedTrade = { ...trade, x: px, y: py }
      break
    }
  }

  // 检测T交易点
  if (!clickedTrade) {
    for (const t of tTrades) {
      const buyIdx = findDateIndex(filtered, t.buyDate)
      const sellIdx = findDateIndex(filtered, t.sellDate)
      
      if (buyIdx !== -1) {
        const bx = toX(buyIdx)
        const by = toY(perfData[buyIdx]?.fundReturn ?? 0)
        const dist = Math.sqrt((bx - x) ** 2 + (by - y) ** 2)
        if (dist < 10) {
          clickedTTrade = { ...t, x: bx, y: by }
          clickedTTradeType = 'buy'
          break
        }
      }
      
      if (sellIdx !== -1) {
        const sx = toX(sellIdx)
        const sy = toY(perfData[sellIdx]?.fundReturn ?? 0)
        const dist = Math.sqrt((sx - x) ** 2 + (sy - y) ** 2)
        if (dist < 10) {
          clickedTTrade = { ...t, x: sx, y: sy }
          clickedTTradeType = 'sell'
          break
        }
      }
    }
  }

  // 设置点击状态
  if (clickedTrade) {
    clickedPoint.value = {
      x: clickedTrade.x,
      y: clickedTrade.y,
      data: {
        type: 'trade',
        trade: clickedTrade
      }
    }
    drawChart()
  } else if (clickedTTrade) {
    clickedPoint.value = {
      x: clickedTTrade.x,
      y: clickedTTrade.y,
      data: {
        type: 'ttrade',
        ttrade: clickedTTrade,
        ttradeType: clickedTTradeType
      }
    }
    drawChart()
  } else {
    // 点击空白处关闭提示
    if (clickedPoint.value) {
      clickedPoint.value = null
      drawChart()
    }
  }
}

// ========== Canvas 绘制 ==========
function drawChart() {
  const canvas = canvasRef.value
  const container = containerRef.value
  if (!canvas || !container) return

  // 设置 canvas 尺寸
  const rect = container.getBoundingClientRect()
  const dpr = window.devicePixelRatio || 1
  canvas.width = rect.width * dpr
  canvas.height = rect.height * dpr
  canvas.style.width = rect.width + 'px'
  canvas.style.height = rect.height + 'px'

  const ctx = canvas.getContext('2d')
  if (!ctx) return
  ctx.setTransform(1, 0, 0, 1, 0, 0) // [FIX] 重置 transform，避免 scale 累积导致坐标偏移
  ctx.scale(dpr, dpr)

  const width = rect.width
  const height = rect.height
  // [FIX] 紧凑布局：padding 大幅缩小，让更多空间留给曲线
  const hasInfo = props.fundName || props.marketValue !== undefined
  const infoBarHeight = hasInfo ? 14 : 0
  const padding = { top: 2 + infoBarHeight, right: 40, bottom: 16, left: 4 }
  const mainHeight = height - padding.top - padding.bottom
  const chartWidth = width - padding.left - padding.right
  const colors = getColors()

  // 背景
  ctx.fillStyle = colors.bgPrimary
  ctx.fillRect(0, 0, width, height)

  // ========== 顶部信息条 ==========
  if (hasInfo) {
    // 基金名称（代码）
    ctx.fillStyle = colors.textPrimary
    ctx.font = 'bold 10px Arial'
    ctx.textAlign = 'left'
    const displayName = (props.fundName || props.fundCode).slice(0, 8)
    ctx.fillText(displayName, padding.left, infoBarHeight - 3)

    // 当天涨跌幅（中间位置）
    // [FIX] 参考 Detail 逻辑：dataSource === 'nav' 是净值涨幅，否则是估值涨幅
    if (realtimeData.value && realtimeData.value.dayChange !== undefined) {
      const isNav = realtimeData.value.dataSource === 'nav'
      const dayChange = realtimeData.value.dayChange
      const changeColor = dayChange >= 0 ? colors.upColor : colors.downColor
      const changeStr = `${dayChange >= 0 ? '+' : ''}${dayChange.toFixed(2)}% ${isNav ? '净值' : '估值'}`
      ctx.fillStyle = changeColor
      ctx.font = 'bold 10px Arial'
      ctx.textAlign = 'center'
      ctx.fillText(changeStr, width / 2, infoBarHeight - 3)
    }

    // 持仓市值
    if (props.marketValue !== undefined && props.marketValue !== null) {
      const mvStr = `¥${props.marketValue.toFixed(0)}`
      ctx.fillStyle = colors.textSecondary
      ctx.font = '9px Arial'
      ctx.textAlign = 'right'
      ctx.fillText(mvStr, width - padding.right - 40, infoBarHeight - 3)
    }

    // 收益率
    if (props.returnRate !== undefined && props.returnRate !== null) {
      const rateColor = props.returnRate >= 0 ? colors.upColor : colors.downColor
      const rateStr = `${props.returnRate >= 0 ? '+' : ''}${props.returnRate.toFixed(2)}%`
      ctx.fillStyle = rateColor
      ctx.font = 'bold 9px Arial'
      ctx.textAlign = 'right'
      ctx.fillText(rateStr, width - padding.left, infoBarHeight - 3)
    }
  }

  const filtered = getFilteredData()
  if (filtered.length < 2) {
    ctx.fillStyle = colors.textSecondary
    ctx.font = '12px Arial'
    ctx.textAlign = 'center'
    ctx.fillText('数据不足', width / 2, height / 2)
    return
  }

  const perfData = getPerformanceData(filtered)
  const showHS300Line = props.showHS300 !== false && hs300Data.value.length > 0

  // ========== 先计算 extendedPerfData（用于后续所有坐标计算）==========
  // [FIX] 延伸点的收益率必须相对于 filtered[0].value 计算，与 getPerformanceData 基准一致
  //       不能用 lastPoint.value，否则 Y 坐标完全错误（Detail 页面也是以第一个点为基准）
  let extendedPerfData = perfData
  if (realtimeData.value && realtimeData.value.currentValue > 0) {
    const today = new Date()
    const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
    
    const lastPoint = filtered[filtered.length - 1]
    const lastDate = lastPoint?.time?.split(' ')[0] || ''
    
    if (lastDate !== todayStr) {
      const fundFirstValue = filtered[0]?.value || 1
      const fundReturn = ((realtimeData.value.currentValue - fundFirstValue) / fundFirstValue) * 100
      
      extendedPerfData = [...perfData, {
        time: todayStr,
        fundReturn,
        hs300Return: perfData[perfData.length - 1]?.hs300Return ?? 0
      }]
    }
  }

  // ========== 收益率范围（必须包含 extendedPerfData 的所有点）==========
  const allReturns = [
    ...extendedPerfData.map(d => d.fundReturn),
    ...(showHS300Line ? extendedPerfData.map(d => d.hs300Return) : []),
  ]
  if ((props.costNavValue ?? 0) > 0) {
    const firstVal = filtered[0]?.value || 1
    allReturns.push((((props.costNavValue ?? 0) - firstVal) / firstVal) * 100)
  }
  let minR = Math.min(...allReturns, 0)
  let maxR = Math.max(...allReturns, 0)
  const margin = ((maxR - minR) || 2) * 0.1
  minR -= margin; maxR += margin
  const range = maxR - minR || 1

  const toY = (r: number) => padding.top + mainHeight * (1 - (r - minR) / range)
  // [FIX] toX 也必须用 extendedPerfData.length，否则最后一个延伸点会超出画布
  const toX = (i: number) => padding.left + (chartWidth / Math.max(extendedPerfData.length - 1, 1)) * i

  // ========== 网格线 + Y轴刻度 ==========
  ctx.strokeStyle = colors.gridColor
  ctx.lineWidth = 1
  ctx.fillStyle = colors.textSecondary
  ctx.font = '8px Arial'
  ctx.textAlign = 'left'
  for (let i = 0; i <= 4; i++) {
    const r = maxR - range * i / 4
    const y = toY(r)
    ctx.beginPath(); ctx.moveTo(padding.left, y); ctx.lineTo(width - padding.right, y); ctx.stroke()
    ctx.fillText(`${r.toFixed(1)}%`, width - padding.right + 3, y + 3)
  }

  // ========== 0% 基准线 ==========
  const zeroY = toY(0)
  ctx.strokeStyle = colors.borderColor
  ctx.lineWidth = 1
  ctx.beginPath(); ctx.moveTo(padding.left, zeroY); ctx.lineTo(width - padding.right, zeroY); ctx.stroke()

  // ========== 成本线 ==========
  if ((props.costNavValue ?? 0) > 0) {
    const firstVal = filtered[0]?.value || 1
    const costR = (((props.costNavValue ?? 0) - firstVal) / firstVal) * 100
    const costY = toY(costR)
    ctx.beginPath(); ctx.moveTo(padding.left, costY); ctx.lineTo(width - padding.right, costY)
    ctx.strokeStyle = '#1677ff'; ctx.lineWidth = 1; ctx.setLineDash([5, 3]); ctx.stroke(); ctx.setLineDash([])
    
    // 成本线标签
    ctx.fillStyle = '#1677ff'; ctx.font = '8px Arial'; ctx.textAlign = 'left'
    ctx.fillText(`成 ${(props.costNavValue ?? 0).toFixed(3)}`, padding.left + 3, costY - 3)
  }

  // ========== 基金曲线（带渐变填充）==========
  const fundPoints = extendedPerfData.map((d, i) => ({ x: toX(i), y: toY(d.fundReturn) }))
  if (fundPoints.length > 1) {
    const lastPoint = extendedPerfData[extendedPerfData.length - 1]
    const isUp = (lastPoint?.fundReturn ?? 0) >= 0
    const lineColor = isUp ? colors.upColor : colors.downColor
    const grad = ctx.createLinearGradient(0, padding.top, 0, zeroY)
    grad.addColorStop(0, lineColor + '40')
    grad.addColorStop(1, lineColor + '05')
    ctx.fillStyle = grad
    ctx.beginPath()
    ctx.moveTo(fundPoints[0].x, zeroY)
    for (let i = 0; i < fundPoints.length; i++) ctx.lineTo(fundPoints[i].x, fundPoints[i].y)
    ctx.lineTo(fundPoints[fundPoints.length - 1].x, zeroY)
    ctx.closePath(); ctx.fill()

    ctx.strokeStyle = lineColor; ctx.lineWidth = 1.5
    ctx.beginPath()
    for (let i = 0; i < fundPoints.length; i++) {
      if (i === 0) ctx.moveTo(fundPoints[0].x, fundPoints[0].y)
      else ctx.lineTo(fundPoints[i].x, fundPoints[i].y)
    }
    ctx.stroke()
  }

  // ========== 沪深300 曲线（灰色虚线） ==========
  if (showHS300Line) {
    ctx.strokeStyle = colors.textSecondary + '80'; ctx.lineWidth = 1; ctx.setLineDash([4, 3])
    ctx.beginPath()
    let started = false
    for (let i = 0; i < perfData.length; i++) {
      const p = perfData[i]
      if (isNaN(p.hs300Return)) continue
      const x = toX(i), y = toY(p.hs300Return)
      if (!started) { ctx.moveTo(x, y); started = true } else { ctx.lineTo(x, y) }
    }
    ctx.stroke(); ctx.setLineDash([])
  }

  // ========== X轴日期标签 ==========
  ctx.fillStyle = colors.textSecondary; ctx.font = '8px Arial'; ctx.textAlign = 'center'
  const labelStep = Math.max(1, Math.floor(perfData.length / 4))
  for (let i = 0; i < perfData.length; i += labelStep) {
    const d = perfData[i]
    if (d) {
      const datePart = (d.time.split(' ')[0] || d.time).slice(5) // MM-DD
      ctx.fillText(datePart, toX(i), height - 8)
    }
  }

  // ========== 交易点标记 ==========
  const trades = getTradesByCode(props.fundCode)
  const tTrades = getTTradesByCode(props.fundCode)

  // 获取今天的日期字符串
  const today = new Date()
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
  const hasExtension = extendedPerfData.length > perfData.length

  // [DEBUG] 调试日志
  if (trades.length > 0) {
    console.log('[MiniKLineChart] 交易记录:', trades)
    console.log('[MiniKLineChart] 今天日期:', todayStr)
    console.log('[MiniKLineChart] hasExtension:', hasExtension)
    console.log('[MiniKLineChart] filtered 最后日期:', filtered[filtered.length - 1]?.time)
    console.log('[MiniKLineChart] extendedPerfData 长度:', extendedPerfData.length)
  }

  for (const trade of trades) {
    // [FIX] 不能用 findDateIndex（有7天兜底），今天的交易日期不在 filtered 里会错误匹配到最近日期
    // 必须严格匹配日期，匹配不到就检查是否是今天（延伸点）
    const tradeDateOnly = (trade.date.split(' ')[0] || trade.date).slice(0, 10)
    const strictIdx = filtered.findIndex(d => {
      const dDateOnly = (d.time.split(' ')[0] || d.time).slice(0, 10)
      return dDateOnly === tradeDateOnly
    })

    // [DEBUG] 调试日志
    console.log('[MiniKLineChart] 交易日期:', trade.date, '→ 提取:', tradeDateOnly, '→ strictIdx:', strictIdx)

    let perfIdx: number
    let fundReturn: number

    if (strictIdx !== -1) {
      // 严格匹配成功
      perfIdx = strictIdx
      fundReturn = perfData[strictIdx]?.fundReturn ?? 0
    } else if (hasExtension && tradeDateOnly === todayStr) {
      // 今天的交易 → 使用延伸点
      perfIdx = extendedPerfData.length - 1
      fundReturn = extendedPerfData[perfIdx].fundReturn
    } else {
      // [DEBUG] 调试日志
      console.log('[MiniKLineChart] 跳过交易点:', trade.date, '原因: strictIdx=-1 且 (hasExtension=', hasExtension, '或 tradeDateOnly !== todayStr)')
      continue
    }

    const x = toX(perfIdx)
    const y = toY(fundReturn)
    const isBuy = trade.type === 'buy'
    ctx.beginPath()
    ctx.arc(x, y, 2.5, 0, Math.PI * 2)
    ctx.fillStyle = isBuy ? colors.upColor : colors.downColor
    ctx.fill()
  }

  // ========== T交易紫色点 + 虚线连接 ==========
  for (const t of tTrades) {
    let buyIdx = findDateIndex(filtered, t.buyDate)
    let sellIdx = findDateIndex(filtered, t.sellDate)
    let buyPerfIdx = buyIdx
    let sellPerfIdx = sellIdx
    let buyReturn = perfData[buyIdx]?.fundReturn ?? 0
    let sellReturn = perfData[sellIdx]?.fundReturn ?? 0

    // [FIX] 提取日期部分进行比较，避免时间部分导致比较失败
    const buyDateOnly = (t.buyDate.split(' ')[0] || t.buyDate).slice(0, 10)
    const sellDateOnly = (t.sellDate.split(' ')[0] || t.sellDate).slice(0, 10)

    // 如果买入日期找不到，检查是否是今天且存在延伸点
    if (buyIdx === -1 && hasExtension && buyDateOnly === todayStr) {
      buyPerfIdx = extendedPerfData.length - 1
      buyReturn = extendedPerfData[buyPerfIdx].fundReturn
    } else if (buyIdx === -1) {
      continue
    }

    // 如果卖出日期找不到，检查是否是今天且存在延伸点
    if (sellIdx === -1 && hasExtension && sellDateOnly === todayStr) {
      sellPerfIdx = extendedPerfData.length - 1
      sellReturn = extendedPerfData[sellPerfIdx].fundReturn
    } else if (sellIdx === -1) {
      continue
    }

    const bx = toX(buyPerfIdx), by = toY(buyReturn)
    const sx = toX(sellPerfIdx), sy = toY(sellReturn)

    // 虚线连接
    ctx.strokeStyle = '#a855f780'; ctx.lineWidth = 1; ctx.setLineDash([3, 3])
    ctx.beginPath(); ctx.moveTo(bx, by); ctx.lineTo(sx, sy); ctx.stroke(); ctx.setLineDash([])

    // 紫色点
    for (const [px, py] of [[bx, by], [sx, sy]]) {
      ctx.beginPath(); ctx.arc(px, py, 2, 0, Math.PI * 2)
      ctx.fillStyle = '#a855f7'; ctx.fill()
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 1; ctx.stroke()
    }
  }

  // ========== 点击提示框 ==========
  if (clickedPoint.value) {
    const cp = clickedPoint.value
    const data = cp.data

    // 垂直线
    ctx.strokeStyle = colors.textSecondary + '60'
    ctx.lineWidth = 1
    ctx.setLineDash([3, 3])
    ctx.beginPath()
    ctx.moveTo(cp.x, padding.top)
    ctx.lineTo(cp.x, height - padding.bottom)
    ctx.stroke()
    ctx.setLineDash([])

    // 高亮点
    ctx.beginPath()
    ctx.arc(cp.x, cp.y, 4, 0, Math.PI * 2)
    ctx.fillStyle = data.type === 'ttrade' ? '#a855f7' : colors.upColor
    ctx.fill()
    ctx.strokeStyle = '#fff'
    ctx.lineWidth = 1.5
    ctx.stroke()

    // 根据类型构建提示框内容
    let lines: string[] = []
    let borderColor = colors.borderColor

    if (data.type === 'trade') {
      const trade = data.trade
      const isBuy = trade.type === 'buy'
      borderColor = isBuy ? colors.upColor : colors.downColor
      lines = [
        `${isBuy ? '加仓' : '减仓'} ${trade.date}`,
        `金额: ${trade.amount.toFixed(2)} 元`,
        `净值: ${trade.netValue.toFixed(4)}`,
        `份额: ${trade.shares.toFixed(2)}`
      ]
    } else if (data.type === 'ttrade') {
      const t = data.ttrade
      const isBuy = data.ttradeType === 'buy'
      const isProfit = t.profit >= 0
      borderColor = '#a855f7'
      lines = [
        `${isBuy ? '做T买入' : '做T卖出'} ${isBuy ? t.buyDate : t.sellDate}`,
        `金额: ${(isBuy ? t.buyAmount : t.sellAmount).toFixed(2)} 元`,
        `净值: ${(isBuy ? t.buyNetValue : t.sellNetValue).toFixed(4)}`,
        `做T收益: ${isProfit ? '+' : ''}${t.profit.toFixed(2)} 元`,
        `收益率: ${isProfit ? '+' : ''}${t.returnRate.toFixed(2)}%`,
        `持有天数: ${t.holdingDays} 天`
      ]
    }

    // 测量提示框尺寸
    ctx.font = '10px Arial'
    const maxWidth = Math.max(...lines.map(l => ctx.measureText(l).width))
    const boxWidth = maxWidth + 12
    const lineHeight = 14
    const boxHeight = lines.length * lineHeight + 8

    // 确定提示框位置（避免超出边界）
    let boxX = cp.x + 8
    let boxY = cp.y - boxHeight - 8
    if (boxX + boxWidth > width - padding.right) boxX = cp.x - boxWidth - 8
    if (boxY < padding.top) boxY = cp.y + 8

    // 绘制提示框背景
    ctx.fillStyle = 'rgba(0, 0, 0, 0.85)'
    ctx.beginPath()
    ctx.roundRect(boxX, boxY, boxWidth, boxHeight, 4)
    ctx.fill()

    // 绘制提示框边框
    ctx.strokeStyle = borderColor
    ctx.lineWidth = 1
    ctx.stroke()

    // 绘制提示文字
    ctx.textAlign = 'left'
    ctx.font = '10px Arial'
    lines.forEach((line, i) => {
      if (data.type === 'ttrade' && (line.startsWith('做T收益') || line.startsWith('收益率'))) {
        const isProfit = data.ttrade.profit >= 0
        ctx.fillStyle = isProfit ? colors.upColor : colors.downColor
      } else {
        ctx.fillStyle = '#ffffff'
      }
      ctx.fillText(line, boxX + 6, boxY + 14 + i * lineHeight)
    })
  }
}

// ========== 生命周期 ==========
onMounted(() => {
  loadData()
  loadRealtime()
  // 1分钟自动刷新实时数据
  refreshTimer = setInterval(() => {
    loadRealtime()
  }, 60000)
})
watch(() => props.fundCode, () => {
  loadData()
  loadRealtime()
})
watch(() => props.period, () => { nextTick(drawChart) })
watch(() => themeStore?.actualTheme, () => { nextTick(drawChart) })
// [FIX] 监听展示 props 变化时重绘（store 异步加载完成后 props 更新）
// 必须用数组形式监听每个 prop，不能用 () => [props.a, props.b] 因为数组引用不变
watch(
  [() => props.fundName, () => props.marketValue, () => props.returnRate, () => props.costNavValue],
  () => { nextTick(drawChart) }
)

// ResizeObserver 自适应
let ro: ResizeObserver | null = null
onMounted(() => {
  if (containerRef.value) {
    ro = new ResizeObserver(() => nextTick(drawChart))
    ro.observe(containerRef.value)
  }
})
onUnmounted(() => {
  ro?.disconnect()
  if (refreshTimer) {
    clearInterval(refreshTimer)
    refreshTimer = null
  }
})
</script>

<template>
  <div class="mini-kline">
    <!-- 标题行 -->
    <div class="mini-kline-header">
      <div class="mini-kline-title">
        <span class="code">{{ fundCode }}</span>
      </div>
      <div class="mini-kline-legend">
        <span class="dot fund-dot"></span>
        <span class="dot-label">净值</span>
        <span class="line hs-line"></span>
        <span class="dot-label">沪深300</span>
      </div>
    </div>

    <!-- Canvas -->
    <div ref="containerRef" class="mini-kline-canvas-wrap">
      <div v-if="isLoading" class="mini-kline-loading">加载中...</div>
      <div v-else-if="hasError" class="mini-kline-error">加载失败</div>
      <canvas
        v-show="!isLoading && !hasError"
        ref="canvasRef"
        class="mini-kline-canvas"
        @click="handleCanvasClick"
      ></canvas>
    </div>
  </div>
</template>

<style scoped>
.mini-kline {
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100%;
  min-height: 220px;
  border: 1px solid var(--border-color, #e0e0e0);
  border-radius: 8px;
  overflow: hidden;
  background: var(--bg-color, #fff);
}

.mini-kline-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 6px 10px;
  border-bottom: 1px solid var(--border-color, #eee);
  background: var(--header-bg, #fafafa);
}

.mini-kline-title .code {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-primary, #333);
  letter-spacing: 0.5px;
}

.mini-kline-legend {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 10px;
  color: var(--text-secondary, #999);
}

.mini-kline-legend .dot {
  width: 8px; height: 8px; border-radius: 50%;
}
.mini-kline-legend .fund-dot { background: #f6465d; }
.mini-kline-legend .hs-line {
  width: 12px; height: 2px;
  background: repeating-linear-gradient(90deg, #999 0, #999 3px, transparent 3px, transparent 6px);
}
.mini-kline-legend .dot-label { margin-right: 4px; }

.mini-kline-canvas-wrap {
  flex: 1;
  position: relative;
  min-height: 180px;
}

.mini-kline-canvas {
  width: 100%;
  height: 100%;
  display: block;
}

.mini-kline-loading, .mini-kline-error {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  color: #999;
}
</style>
