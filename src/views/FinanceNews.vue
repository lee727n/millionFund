<template>
  <div class="finance-news-page">
    <div class="page-header">
      <van-icon name="arrow-left" size="22" @click="router.back()" />
      <span class="header-title">{{ t('finance_news.title') }}</span>
    </div>

    <div v-if="loading" class="loading">{{ t('common.loading') }}</div>
    <div v-else-if="error" class="error">{{ error }}</div>
    <div v-else class="news-list">
      <div v-for="news in newsList" :key="news.id" class="news-item" @click="showNewsDetail(news)">
        <h3 class="news-title">{{ news.title }}</h3>
        <p class="news-summary">{{ news.summary }}</p>
        <p class="news-time">{{ news.time }}</p>
      </div>
    </div>

    <div v-if="selectedNews" class="news-detail-mask" @click="selectedNews = null">
      <div class="news-detail" @click.stop>
        <h2 class="detail-title">{{ selectedNews.title }}</h2>
        <p class="detail-time">{{ selectedNews.time }}</p>
        <p class="detail-content">{{ selectedNews.summary }}</p>
        <a :href="selectedNews.url" target="_blank" class="detail-link">{{ t('finance_news.view_original') }}</a>
        <van-button type="primary" @click="selectedNews = null" class="detail-close">{{ t('common.close') }}</van-button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { fetchNewsList } from '@/api/jin10'
import { useI18n } from 'vue-i18n'

const router = useRouter()
const { t } = useI18n()
const newsList = ref([])
const loading = ref(false)
const error = ref('')
const selectedNews = ref(null)

const loadNews = async () => {
  loading.value = true
  error.value = ''
  try {
    const data = await fetchNewsList(1, 20, 'all')
    newsList.value = data
  } catch (err) {
    error.value = t('finance_news.load_failed')
    console.error('[FinanceNews] 加载新闻失败', err)
  } finally {
    loading.value = false
  }
}

const showNewsDetail = (news) => {
  selectedNews.value = news
}

onMounted(() => {
  loadNews()
})
</script>

<style scoped>
.finance-news-page {
  padding: 16px;
  min-height: 100vh;
  background: #f7f8fa;
}

.page-header {
  display: flex;
  align-items: center;
  margin-bottom: 16px;
  padding-bottom: 12px;
  border-bottom: 1px solid #eaeaea;
}

.header-title {
  font-size: 18px;
  font-weight: bold;
  margin-left: 12px;
}

.loading, .error {
  text-align: center;
  padding: 40px;
  color: #999;
}

.error {
  color: #ee0a24;
}

.news-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.news-item {
  padding: 16px;
  background: white;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s;
}

.news-item:hover {
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}

.news-title {
  font-size: 16px;
  font-weight: bold;
  margin: 0 0 8px 0;
  color: #323233;
}

.news-summary {
  font-size: 14px;
  color: #646566;
  margin: 0 0 8px 0;
  line-height: 1.5;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.news-time {
  font-size: 12px;
  color: #969799;
  margin: 0;
}

.news-detail-mask {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.news-detail {
  background: white;
  padding: 24px;
  border-radius: 12px;
  max-width: 90%;
  max-height: 80vh;
  overflow-y: auto;
}

.detail-title {
  font-size: 18px;
  font-weight: bold;
  margin: 0 0 12px 0;
  color: #323233;
}

.detail-time {
  font-size: 12px;
  color: #969799;
  margin: 0 0 16px 0;
}

.detail-content {
  font-size: 14px;
  color: #646566;
  line-height: 1.6;
  margin: 0 0 16px 0;
}

.detail-link {
  display: inline-block;
  color: #1989fa;
  margin-bottom: 16px;
}

.detail-close {
  width: 100%;
}
</style>
