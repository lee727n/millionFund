<script setup lang="ts">
import { useI18n } from 'vue-i18n'
const { t } = useI18n()

defineProps<{
  fundCode: string
  hasHolding: boolean
  isInWatchlist: boolean
}>()

const emit = defineEmits<{
  (e: 'edit-holding'): void
  (e: 'delete-holding'): void
  (e: 'manage-source'): void
  (e: 'show-transactions'): void
  (e: 'toggle-watchlist'): void
  (e: 'go-compare'): void
  (e: 'manage-sectors'): void
  (e: 'show-more'): void
}>()
</script>

<template>
  <div class="bottom-bar">
    <div class="bar-item" @click="emit('edit-holding')">
      <van-icon name="edit" size="20" />
      <span>{{ t('detail.edit_holding') }}</span>
    </div>
    <div class="bar-item" v-if="hasHolding" @click="emit('delete-holding')">
      <van-icon name="delete" size="20" />
      <span>{{ t('detail.remove_from_holdings') }}</span>
    </div>
    <div class="bar-item" @click="emit('manage-source')">
      <van-icon name="shop-o" size="20" />
      <span>{{ t('news.source') }}</span>
    </div>
    <div class="bar-item" @click="emit('show-transactions')">
      <van-icon name="orders-o" size="20" />
      <span>{{ t('detail.trade_record') }}</span>
    </div>
    <div class="bar-item" @click="emit('toggle-watchlist')">
      <van-icon :name="isInWatchlist ? 'star' : 'star-o'" size="20" />
      <span>{{ isInWatchlist ? '删自选' : '加自选' }}</span>
    </div>
    <div class="bar-item" @click="emit('go-compare')">
      <van-icon name="bars" size="20" />
      <span>对比</span>
    </div>
    <div class="bar-item" @click="emit('manage-sectors')">
      <van-icon name="cluster-o" size="20" />
      <span>{{ t('detail.industry_sector') }}</span>
    </div>
    <div class="bar-item" @click="emit('show-more')">
      <van-icon name="ellipsis" size="20" />
      <span>{{ t('detail.more') }}</span>
    </div>
  </div>
</template>

<style scoped>
.bottom-bar {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  display: flex;
  align-items: center;
  justify-content: space-around;
  padding: 8px 12px;
  padding-bottom: calc(8px + env(safe-area-inset-bottom));
  background: var(--bg-primary);
  border-top: 1px solid var(--border-color);
  z-index: 100;
}

.bar-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: 4px 8px;
  cursor: pointer;
  color: var(--text-secondary);
  font-size: 11px;
}

.bar-item:active {
  opacity: 0.7;
}
</style>
