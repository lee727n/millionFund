<template>
  <div class="mine-page">
    <van-nav-bar :title="t('mine.title')" />
    <div class="p-4">
      <p class="text-gray-500">{{ t('mine.coming_soon') }}</p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n'
const { t } = useI18n()
</script>
