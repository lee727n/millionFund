<script setup lang="ts">
// [WHY] 自选列表页面 - 独立页面展示用户收藏的基金
// [WHAT] 复用 FundCard 组件渲染 watchlist，支持下拉刷新、左滑删除、点击跳转详情

import { onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { showConfirmDialog, showToast } from 'vant'
import FundCard from '@/components/FundCard.vue'
import { useFundStore } from '@/stores/fund'

const { t } = useI18n()
const router = useRouter()
const fundStore = useFundStore()

onMounted(() => {
  fundStore.loadWatchlist()
})

async function onRefresh() {
  await fundStore.refreshEstimates()
}

function goToDetail(code: string) {
  router.push(`/detail/${code}`)
}

function goToSearch() {
  router.push('/search')
}

async function handleDelete(code: string) {
  try {
    await showConfirmDialog({
      title: t('watchlist.delete'),
      message: t('watchlist.confirm_delete'),
    })
    await fundStore.removeFund(code)
    showToast(t('common.deleted'))
  } catch {
    // 用户取消
  }
}
</script>

<template>
  <div class="watchlist-page">
    <van-nav-bar :title="t('watchlist.title')" />

    <van-pull-refresh v-model="fundStore.isRefreshing" @refresh="onRefresh">
      <!-- 有自选基金时显示列表 -->
      <template v-if="fundStore.watchlist.length > 0">
        <div v-if="fundStore.lastRefreshTime" class="refresh-time">
          <span>{{ t('common.last_refresh') }}: {{ fundStore.lastRefreshTime }}</span>
        </div>

        <FundCard
          v-for="fund in fundStore.watchlist"
          :key="fund.code"
          :fund="fund"
          @delete="handleDelete"
          @click="goToDetail(fund.code)"
        />
      </template>

      <!-- 空状态引导 -->
      <div v-else class="empty-state">
        <div class="empty-icon">📈</div>
        <div class="empty-title">{{ t('watchlist.no_data') }}</div>
        <van-button round block type="primary" @click="goToSearch">
          🔍 {{ t('watchlist.add') }}
        </van-button>
      </div>
    </van-pull-refresh>
  </div>
</template>

<style scoped>
.watchlist-page {
  min-height: 100vh;
  background: var(--bg-primary);
}

.refresh-time {
  display: flex;
  justify-content: center;
  align-items: center;
  font-size: 12px;
  color: var(--text-secondary);
  padding: 8px 0;
  background: var(--bg-primary);
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 80px 24px;
  text-align: center;
  gap: 16px;
}

.empty-icon {
  font-size: 64px;
}

.empty-title {
  font-size: 16px;
  color: var(--text-secondary);
  margin-bottom: 8px;
}

.empty-state .van-button {
  max-width: 280px;
}
</style>
