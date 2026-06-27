<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { showToast } from 'vant'

const { locale, t } = useI18n()

function toggleLanguage() {
  const newLocale = locale.value === 'zh-CN' ? 'en-US' : 'zh-CN'
  locale.value = newLocale
  localStorage.setItem('locale', newLocale)
  showToast(t('common.' + (newLocale === 'zh-CN' ? 'ok' : 'ok')))
}
</script>

<template>
  <van-button 
    size="small" 
    @click="toggleLanguage"
    class="lang-switcher"
  >
    {{ locale === 'zh-CN' ? 'EN' : '中文' }}
  </van-button>
</template>

<style scoped>
.lang-switcher {
  position: fixed;
  top: 10px;
  right: 10px;
  z-index: 9999;
  opacity: 0.7;
}
</style>
