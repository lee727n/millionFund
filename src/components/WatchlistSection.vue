<script setup lang="ts">
// [WHY] 自选列表组件
// [WHAT] 展示自选基金列表，支持删除和点击查看详情

import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { useFundStore } from '@/stores/fund'
import { showConfirmDialog, showToast } from 'vant'
import type { FundEstimate } from '@/types/fund'
import FundCard from '@/components/FundCard.vue'

const props = defineProps<{
  watchlist: FundEstimate[]
}>()

const emit = defineEmits<{
  (e: 'refresh'): void
}>()

const { t } = useI18n()
const router = useRouter()
const fundStore = useFundStore()

// [WHAT] 删除自选基金
async function handleDelete(code: string) {
  try {
    await showConfirmDialog({
      title: '确认删除',
      message: '确定要从自选中删除该基金吗？'
    })
    fundStore.removeFund(code)
    showToast('已删除')
  } catch {
    // 用户取消
  }
}

// [WHAT] 跳转到基金详情页
function goToDetail(code: string) {
  router.push(`/detail/${code}`)
}
</script>

<template>
  <div v-if="watchlist.length > 0">
    <!-- 自选基金标题 -->
    <div class="section-header">
      <span class="section-title">{{ t("home.watchlist") }}</span>
      <span class="fund-count">{{ watchlist.length }}只</span>
    </div>
    
    <!-- 刷新时间提示 -->
    <div v-if="fundStore.lastRefreshTime" class="refresh-time">
      <span>最后刷新：{{ fundStore.lastRefreshTime }}</span>
    </div>
    
    <!-- 基金列表 -->
    <FundCard
      v-for="fund in watchlist"
      :key="fund.fundcode"
      :fund="fund"
      @delete="handleDelete"
      @click="goToDetail"
    />
  </div>
</template>

<style scoped>
.section-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 16px 8px;
}

.section-title {
  font-size: 15px;
  font-weight: 600;
  color: var(--text-primary);
}

.fund-count {
  font-size: 12px;
  color: var(--text-secondary);
  padding: 2px 8px;
  background: var(--bg-tertiary);
  border-radius: 4px;
}

.refresh-time {
  padding: 0 16px 8px;
  font-size: 11px;
  color: var(--text-muted);
}
</style>
