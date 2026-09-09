<script setup lang="ts">
// [WHY] 星标K线独立页：一行多个迷你走势图，方便对比
// [WHAT] 页面本身只留「返回 + 标题 + 数量」的头部，
//       星标列表 / 周期切换 / 图表网格全部交给 StarKLinePanel（全景大屏第二列复用同一个组件）

import { ref, onMounted, onActivated, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import StarKLinePanel from '@/components/StarKLinePanel.vue'
import { getStarredFunds } from '@/utils/storage'
import { useHoldingStore } from '@/stores/holding'

const router = useRouter()
const holdingStore = useHoldingStore()

const starredCount = ref(0)
const klinePeriod = ref<'1m' | '3m' | '6m' | '1y'>('3m')

function refreshCount() {
  starredCount.value = getStarredFunds().length
}

// [WHAT] 星标在别处被增删时同步数量
function onStarredChanged() { refreshCount() }

onMounted(async () => {
  refreshCount()
  window.addEventListener('starred-funds-changed', onStarredChanged)
  if (holdingStore.holdings.length === 0) {
    await holdingStore.initHoldings()
  }
})
onActivated(async () => {
  refreshCount()
  if (holdingStore.holdings.length === 0) {
    await holdingStore.initHoldings()
  }
})
onUnmounted(() => {
  window.removeEventListener('starred-funds-changed', onStarredChanged)
})
</script>

<template>
  <div class="star-kline-page">
    <!-- 单行顶栏：返回 | 标题+数量 -->
    <div class="sk-header">
      <button class="sk-back" @click="router.back()">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M15 18l-6-6 6-6"/>
        </svg>
      </button>
      <div class="sk-title-wrap">
        <span class="sk-title">K线全景</span>
        <span class="sk-count" v-if="starredCount">{{ starredCount }}</span>
      </div>
      <div class="sk-header-spacer"></div>
    </div>

    <!-- K线面板：minItemWidth 让每行个数随窗口宽度自适应 -->
    <div class="sk-panel">
      <StarKLinePanel
        v-model:period="klinePeriod"
        :min-item-width="300"
        aspect-ratio="16 / 9"
        color-scheme="dark"
      />
    </div>
  </div>
</template>

<style scoped>
.star-kline-page {
  min-height: 100vh;
  background: #1a1d24;
  overflow-y: auto;
  overflow-x: hidden;
  display: flex;
  flex-direction: column;
}

/* ========== 单行顶栏 ========== */
.sk-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0 12px;
  height: 42px;
  padding-top: calc(var(--status-bar-height, 0px));
  background: #1a1d24;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  position: sticky;
  top: 0;
  z-index: 100;
  flex-shrink: 0;
}

.sk-back {
  background: none;
  border: none;
  cursor: pointer;
  color: #eaecef;
  padding: 4px;
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  border-radius: 6px;
}
.sk-back:hover { background: rgba(255, 255, 255, 0.08); }

.sk-title-wrap {
  display: flex;
  align-items: baseline;
  gap: 8px;
}
.sk-title {
  font-size: 15px;
  font-weight: 600;
  color: #eaecef;
  letter-spacing: 0.5px;
}
.sk-count {
  font-size: 11px;
  color: #4d8bff;
  font-weight: 600;
  background: rgba(77, 139, 255, 0.18);
  padding: 1px 7px;
  border-radius: 8px;
}

.sk-header-spacer { flex: 1; }

.sk-panel {
  flex: 1;
  min-height: 0;
}
</style>
