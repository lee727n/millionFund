<script setup lang="ts">
// [WHY] 分时估值弹窗组件 - 展示单只基金的分时估值走势
// [WHAT] 包含弹窗、图表绘制、数据加载，支持 forceRefresh 跳过缓存

import { ref, watch, nextTick, onUnmounted } from 'vue'
import { fetchIntradayData, type IntradayPoint } from '@/api/fundFast'
import { logger } from '@/utils/logger'
import { useTimer } from '@/composables/useTimer'
import { useI18n } from 'vue-i18n'
const { t } = useI18n()

const { safeTimeout, clearSafeTimeout } = useTimer()

const props = defineProps<{
  show: boolean
  fund: { code: string; name: string } | null
}>()

const emit = defineEmits<{
  'update:show': [value: boolean]
}>()

const loading = ref(false)
const data = ref<IntradayPoint[]>([])
const canvasRef = ref<HTMLCanvasElement | null>(null)

// 重试定时器
let retryTimer: number | undefined

// 监听显示状态，打开时加载数据
watch(() => props.show, async (show) => {
  if (show && props.fund) {
    await loadData()
  } else {
    // 关闭时清空数据
    data.value = []
  }
})

async function loadData() {
  if (!props.fund) return
  loading.value = true
  data.value = []
  try {
    const result = await fetchIntradayData(props.fund.code, true)
    if (result && result.length > 0) {
      data.value = result
    }
  } catch (err) {
    logger.error('获取分时估值失败', err)
  } finally {
    loading.value = false
  }
}

function close() {
  emit('update:show', false)
}

function drawChart() {
  if (!canvasRef.value || data.value.length === 0) return

  const canvas = canvasRef.value
  const ctx = canvas.getContext('2d')
  if (!ctx) return

  // 设置 canvas 尺寸
  const dpr = window.devicePixelRatio || 1
  const rect = canvas.getBoundingClientRect()
  canvas.width = rect.width * dpr
  canvas.height = rect.height * dpr
  ctx.scale(dpr, dpr)

  const width = rect.width
  const height = rect.height
  const padding = { top: 10, right: 10, bottom: 20, left: 45 }
  const chartWidth = width - padding.left - padding.right
  const chartHeight = height - padding.top - padding.bottom

  // 计算数据范围
  const values = data.value.map(d => d.value)
  const minVal = Math.min(...values)
  const maxVal = Math.max(...values)
  const startVal = data.value[0]!.value
  const endVal = data.value[data.value.length - 1]!.value
  const color = endVal >= startVal ? '#ff4d4f' : '#52c41a'

  // 清空画布
  ctx.clearRect(0, 0, width, height)

  // 绘制网格线
  ctx.strokeStyle = 'rgba(128,128,128,0.1)'
  ctx.lineWidth = 0.5
  for (let i = 0; i <= 4; i++) {
    const y = padding.top + (chartHeight / 4) * i
    ctx.beginPath()
    ctx.moveTo(padding.left, y)
    ctx.lineTo(width - padding.right, y)
    ctx.stroke()
  }

  // 绘制Y轴标签
  ctx.fillStyle = '#999'
  ctx.font = '10px sans-serif'
  ctx.textAlign = 'right'
  for (let i = 0; i <= 4; i++) {
    const val = maxVal - ((maxVal - minVal) / 4) * i
    const y = padding.top + (chartHeight / 4) * i
    ctx.fillText(val.toFixed(3), padding.left - 5, y + 3)
  }

  // 绘制X轴标签（时间）
  ctx.textAlign = 'center'
  const timeStep = Math.ceil(data.value.length / 5)
  for (let i = 0; i < data.value.length; i += timeStep) {
    const x = padding.left + (i / (data.value.length - 1)) * chartWidth
    ctx.fillText(data.value[i]!.time, x, height - 5)
  }

  // 绘制折线
  ctx.strokeStyle = color
  ctx.lineWidth = 1.5
  ctx.beginPath()
  data.value.forEach((point, index) => {
    const x = padding.left + (index / (data.value.length - 1)) * chartWidth
    const y = padding.top + ((maxVal - point.value) / (maxVal - minVal)) * chartHeight
    if (index === 0) ctx.moveTo(x, y)
    else ctx.lineTo(x, y)
  })
  ctx.stroke()

  // 绘制渐变填充
  const gradient = ctx.createLinearGradient(0, padding.top, 0, height - padding.bottom)
  gradient.addColorStop(0, color + '20')
  gradient.addColorStop(1, color + '00')
  ctx.fillStyle = gradient
  ctx.beginPath()
  data.value.forEach((point, index) => {
    const x = padding.left + (index / (data.value.length - 1)) * chartWidth
    const y = padding.top + ((maxVal - point.value) / (maxVal - minVal)) * chartHeight
    if (index === 0) ctx.moveTo(x, y)
    else ctx.lineTo(x, y)
  })
  ctx.lineTo(padding.left + chartWidth, height - padding.bottom)
  ctx.lineTo(padding.left, height - padding.bottom)
  ctx.closePath()
  ctx.fill()
}

// 数据变化时绘制图表
watch(data, () => {
  if (data.value.length > 0) {
    nextTick(() => tryDraw())
  }
}, { deep: true })

function tryDraw(attempts = 0) {
  clearSafeTimeout(retryTimer)
  retryTimer = undefined
  if (!canvasRef.value || data.value.length === 0) {
    if (attempts < 10) {
      retryTimer = safeTimeout(() => tryDraw(attempts + 1), 50)
    }
    return
  }
  drawChart()
}

onUnmounted(() => {
  clearSafeTimeout(retryTimer)
})

const lastPoint = () => {
  const p = data.value[data.value.length - 1]
  return p ?? null
}
</script>

<template>
  <van-popup 
    :show="show" 
    position="center" 
    round 
    :style="{ width: '92%', maxWidth: '480px', background: 'var(--bg-secondary)' }"
    @update:show="emit('update:show', $event)"
  >
    <div class="intraday-popup">
      <div class="intraday-popup-header">
        <div class="intraday-popup-title-row">
          <van-icon name="chart-trending-o" size="20" class="intraday-popup-icon" />
          <span class="intraday-popup-title">当日分时估值</span>
        </div>
      </div>
      <div class="intraday-popup-fund-info">
        <span class="intraday-popup-fund-name">{{ fund?.name }}</span>
        <span class="intraday-popup-fund-code">#{{ fund?.code }}</span>
      </div>
      <div class="intraday-popup-chart" v-if="!loading">
        <div v-if="data && data.length > 0" class="intraday-popup-chart-wrapper">
          <div class="intraday-popup-summary">
            <span 
              class="intraday-popup-latest" 
              :class="(lastPoint()?.growth ?? 0) >= 0 ? 'up' : 'down'"
            >
              {{ lastPoint()?.value }}
              ({{ (lastPoint()?.growth ?? 0) >= 0 ? '+' : '' }}{{ lastPoint()?.growth }}%)
            </span>
            <span class="intraday-popup-time">{{ lastPoint()?.time }}</span>
          </div>
          <canvas ref="canvasRef" class="intraday-popup-canvas"></canvas>
        </div>
        <div v-else class="intraday-popup-empty">
          暂无估值数据
        </div>
      </div>
      <div class="intraday-popup-loading" v-else>
        <van-loading size="24px">{{ t('common.loading') }}</van-loading>
      </div>
      <button class="intraday-popup-close-btn" @click="close">关闭</button>
    </div>
  </van-popup>
</template>

<style scoped>
.intraday-popup {
  padding: 20px;
}

.intraday-popup-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
}

.intraday-popup-title-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.intraday-popup-icon {
  color: var(--color-primary);
}

.intraday-popup-title {
  font-size: 16px;
  font-weight: 600;
  color: var(--text-primary);
}

.intraday-popup-fund-info {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 16px;
}

.intraday-popup-fund-name {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
}

.intraday-popup-fund-code {
  font-size: 12px;
  color: var(--text-secondary);
}

.intraday-popup-chart {
  min-height: 200px;
}

.intraday-popup-chart-wrapper {
  background: var(--bg-primary, rgba(0,0,0,0.02));
  border-radius: 10px;
  padding: 12px;
}

.intraday-popup-summary {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
}

.intraday-popup-latest {
  font-size: 15px;
  font-weight: 600;
}

.intraday-popup-latest.up {
  color: var(--color-up);
}

.intraday-popup-latest.down {
  color: var(--color-down);
}

.intraday-popup-time {
  font-size: 12px;
  color: #999;
}

.intraday-popup-canvas {
  width: 100%;
  height: 220px;
}

.intraday-popup-empty {
  text-align: center;
  padding: 40px 0;
  color: #999;
  font-size: 14px;
}

.intraday-popup-loading {
  display: flex;
  justify-content: center;
  padding: 40px 0;
}

.intraday-popup-close-btn {
  width: 100%;
  height: 40px;
  margin-top: 16px;
  border: none;
  border-radius: 10px;
  background: linear-gradient(180deg, #0ea5e9, #22d3ee);
  color: #05263b;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: opacity 0.2s;
}

.intraday-popup-close-btn:hover {
  opacity: 0.9;
}

.intraday-popup-close-btn:active {
  opacity: 0.8;
}
</style>
