<template>
  <div class="watchlist-page">
    <van-nav-bar :title="t('watchlist.title')" />
    <div class="p-4">
      <p class="text-gray-500">{{ t('watchlist.under_development') }}</p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n'
const { t } = useI18n()
</script>
