<script setup lang="ts">
// [WHY] 自选列表组件 - 展示用户添加的自选基金
// [WHAT] 包含刷新时间提示、基金卡片列表、空状态引导

import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { showConfirmDialog, showToast } from 'vant'
import FundCard from '@/components/FundCard.vue'
import { useFundStore } from '@/stores/fund'

const { t } = useI18n()
const router = useRouter()
const fundStore = useFundStore()

// Props
defineProps<{
  watchlist: any[]
  lastRefreshTime: string | null
}>()

// Emits
const emit = defineEmits<{
  (e: 'delete', code: string): void
  (e: 'go-to-detail', code: string): void
  (e: 'go-to-search'): void
}>()

// [WHAT] 删除自选基金
async function handleDelete(code: string) {
  try {
    await showConfirmDialog({
      title: '确认删除',
      message: '确定要从自选中删除该基金吗？'
    })
    emit('delete', code)
    showToast('已删除')
  } catch {
    // 用户取消
  }
}

function goToDetail(code: string) {
  emit('go-to-detail', code)
}

function goToSearch() {
  emit('go-to-search')
}
</script>

<template>
  <div>
    <!-- 自选基金标题 -->
    <div class="section-header" v-if="watchlist.length > 0">
      <span class="section-title">{{ t("home.watchlist") }}</span>
      <span class="fund-count">{{ watchlist.length }}只</span>
    </div>
    
    <!-- 有自选基金时显示列表 -->
    <template v-if="watchlist.length > 0">
      <!-- 刷新时间提示 -->
      <div v-if="lastRefreshTime" class="refresh-time">
        <span>最后刷新：{{ lastRefreshTime }}</span>
      </div>
      
      <!-- 基金列表 -->
      <FundCard
        v-for="fund in watchlist"
        :key="fund.code"
        :fund="fund"
        @delete="handleDelete"
        @click="goToDetail(fund.code)"
      />
    </template>

    <!-- 首次启动 / 空状态引导卡片 -->
    <div v-if="watchlist.length === 0" class="onboarding-card">
      <div class="onboarding-icon">📈</div>
      <div class="onboarding-title">{{ t("home.welcome") }}</div>
      <div class="onboarding-desc">
        在这里管理你的自选和持仓基金<br />
        实时掌握涨跌情况和投资收益
      </div>
      <div class="onboarding-actions">
        <van-button round block type="primary" @click="goToSearch" data-test-id="search-button">
          🔍 添加自选基金
        </van-button>
        <van-button round block plain @click="router.push('/holding')">
          💰 添加持仓记录
        </van-button>
      </div>
      <div class="onboarding-tips">
        <div>💡 小提示：在持仓页长按基金可快速操作</div>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* ========== 自选列表样式 ========== */
.section-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 16px 8px;
}

.section-title {
  font-size: 16px;
  font-weight: 600;
  color: var(--text-primary);
}

.fund-count {
  font-size: 12px;
  color: var(--text-secondary);
}

.refresh-time {
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 12px;
  font-size: 12px;
  color: var(--text-secondary);
  padding: 8px 0;
  background: var(--bg-primary);
}

/* ========== 首次启动引导卡片 ========== */
.onboarding-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 48px 24px;
  text-align: center;
  background: linear-gradient(160deg, var(--bg-secondary) 0%, var(--bg-primary) 100%);
}

.onboarding-icon {
  font-size: 64px;
  margin-bottom: 20px;
  animation: bounceIn 0.8s ease;
}

@keyframes bounceIn {
  0% { transform: scale(0); opacity: 0; }
  50% { transform: scale(1.2); }
  100% { transform: scale(1); opacity: 1; }
}

.onboarding-title {
  font-size: 22px;
  font-weight: 700;
  color: var(--text-primary);
  margin-bottom: 12px;
}

.onboarding-desc {
  font-size: 14px;
  color: var(--text-secondary);
  line-height: 1.6;
  margin-bottom: 28px;
}

.onboarding-actions {
  width: 100%;
  max-width: 320px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.onboarding-tips {
  margin-top: 24px;
  font-size: 12px;
  color: var(--text-tertiary);
}

@media (max-width: 767px) {
  .section-header {
    display: none;
  }
  
  .refresh-time {
    display: none;
  }
}
</style>
