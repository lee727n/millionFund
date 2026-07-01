<template>
  <div class="finance-news-page">
    <div class="page-header">
      <van-icon name="arrow-left" size="22" @click="router.back()" />
      <span class="header-title">{{ t('finance_news.title') }}</span>
      <van-dropdown-menu class="source-selector">
        <van-dropdown-item v-model="currentSource" :options="sourceOptions" @change="switchSource" />
      </van-dropdown-menu>
    </div>

    <div class="news-stats" v-if="newsList.length > 0">
      <span class="stat-item">📊 当前来源: {{ currentSourceName }}</span>
      <span class="stat-item">📰 新闻数量: {{ newsList.length }}</span>
      <span class="stat-item" v-if="crossValidation.enabled">✅ 交叉验证: 已启用</span>
    </div>

    <div v-if="loading" class="loading">{{ t('common.loading') }}</div>
    <div v-else-if="error" class="error">{{ error }}</div>
    <div v-else class="news-list">
      <div v-for="news in newsList" :key="news.id" class="news-item" @click="showNewsDetail(news)">
        <div class="news-source-tag">{{ news.source }}</div>
        <h3 class="news-title">{{ news.title }}</h3>
        <p class="news-summary">{{ news.summary }}</p>
        <div class="news-meta">
          <span class="news-time">{{ news.time }}</span>
          <span class="news-cross" v-if="news.crossCount > 1">🔄 在{{ news.crossCount }}个来源中出现</span>
        </div>
      </div>
    </div>

    <div v-if="selectedNews" class="news-detail-mask" @click="selectedNews = null">
      <div class="news-detail" @click.stop>
        <div class="detail-source-tag">{{ selectedNews.source }}</div>
        <h2 class="detail-title">{{ selectedNews.title }}</h2>
        <p class="detail-time">{{ selectedNews.time }}</p>
        <p class="detail-content">{{ selectedNews.summary }}</p>
        <div class="detail-cross" v-if="selectedNews.crossCount > 1">
          <p>🔄 这条新闻在以下来源中也有出现：</p>
          <ul>
            <li v-for="source in selectedNews.crossSources" :key="source">{{ source }}</li>
          </ul>
        </div>
        <a :href="selectedNews.url" target="_blank" class="detail-link">{{ t('finance_news.view_original') }}</a>
        <van-button type="primary" @click="selectedNews = null" class="detail-close">{{ t('common.close') }}</van-button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'

// 导入所有新闻源API
import { fetchNewsList } from '@/api/jin10'
import { fetchCailianNews } from '@/api/news'
import { fetchToutiaoNews } from '@/api/toutiao'
import { fetchSinaNews } from '@/api/sina'
import { fetchNeteaseNews } from '@/api/netease'
import { fetchTencentNews } from '@/api/tencent'
import { fetchXueqiuNews } from '@/api/xueqiu'
import { fetchEastmoneyNews } from '@/api/eastmoney'
import { fetch10jqkaNews } from '@/api/10jqka'
import { fetchSTCNNews } from '@/api/stcn'
import { fetchCSNews } from '@/api/csnews'
import { fetchYicaiNews } from '@/api/yicai'

const router = useRouter()
const { t } = useI18n()
const newsList = ref([])
const loading = ref(false)
const error = ref('')
const selectedNews = ref(null)
const currentSource = ref('all')
const currentSourceName = ref('全部来源')

// 交叉验证状态
const crossValidation = ref({
  enabled: false,
  newsMap: new Map()
})

// 数据源选项
const sourceOptions = [
  { text: '全部来源', value: 'all' },
  { text: '金十数据', value: 'jin10' },
  { text: '财联社', value: 'cailian' },
  { text: '今日头条', value: 'toutiao' },
  { text: '新浪财经', value: 'sina' },
  { text: '网易财经', value: 'netease' },
  { text: '腾讯财经', value: 'tencent' },
  { text: '雪球', value: 'xueqiu' },
  { text: '东方财富', value: 'eastmoney' },
  { text: '同花顺', value: '10jqka' },
  { text: '证券时报', value: 'stcn' },
  { text: '中国证券报', value: 'csnews' },
  { text: '第一财经', value: 'yicai' }
]

// 所有数据源配置
const allSources = [
  {
    name: 'jin10',
    displayName: '金十数据',
    fetch: async () => {
      const data = await fetchNewsList(1, 20, 'all')
      if (!data || data.length === 0) throw new Error('空数据')
      return data
    }
  },
  {
    name: 'cailian',
    displayName: '财联社',
    fetch: async () => {
      const data = await fetchCailianNews(20)
      if (!data || data.length === 0) throw new Error('空数据')
      return data.map(item => ({
        id: item.id || `cailian_${Math.random()}`,
        title: item.title || '',
        summary: item.content || item.summary || '',
        source: '财联社',
        time: item.time || new Date().toLocaleString(),
        url: item.url || '#',
        image: item.image
      }))
    }
  },
  {
    name: 'toutiao',
    displayName: '今日头条',
    fetch: () => fetchToutiaoNews(1, 20)
  },
  {
    name: 'sina',
    displayName: '新浪财经',
    fetch: () => fetchSinaNews(1, 20)
  },
  {
    name: 'netease',
    displayName: '网易财经',
    fetch: () => fetchNeteaseNews(1, 20)
  },
  {
    name: 'tencent',
    displayName: '腾讯财经',
    fetch: () => fetchTencentNews(1, 20)
  },
  {
    name: 'xueqiu',
    displayName: '雪球',
    fetch: () => fetchXueqiuNews(1, 20)
  },
  {
    name: 'eastmoney',
    displayName: '东方财富',
    fetch: () => fetchEastmoneyNews(1, 20)
  },
  {
    name: '10jqka',
    displayName: '同花顺',
    fetch: () => fetch10jqkaNews(1, 20)
  },
  {
    name: 'stcn',
    displayName: '证券时报',
    fetch: () => fetchSTCNNews(1, 20)
  },
  {
    name: 'csnews',
    displayName: '中国证券报',
    fetch: () => fetchCSNews(1, 20)
  },
  {
    name: 'yicai',
    displayName: '第一财经',
    fetch: () => fetchYicaiNews(1, 20)
  }
]

const loadNews = async () => {
  loading.value = true
  error.value = ''
  
  // 如果选择全部来源，启用交叉验证
  if (currentSource.value === 'all') {
    await loadAllSourcesWithCrossValidation()
  } else {
    // 否则只加载选中的来源
    await loadSingleSource(currentSource.value)
  }
  
  loading.value = false
}

const loadAllSourcesWithCrossValidation = async () => {
  console.log('[FinanceNews] 🚀 开始加载所有数据源，启用交叉验证...')
  
  const allNews = []
  const newsTitleMap = new Map() // 用于交叉验证：标题 -> 来源列表
  
  // 并行加载所有数据源
  const results = await Promise.allSettled(
    allSources.map(async (source) => {
      try {
        const news = await source.fetch()
        return { source: source.displayName, news }
      } catch (err) {
        console.warn(`[FinanceNews] ⚠️ ${source.displayName} 加载失败:`, err)
        return { source: source.displayName, news: [] }
      }
    })
  )
  
  // 处理结果
  results.forEach(result => {
    if (result.status === 'fulfilled' && result.value.news.length > 0) {
      const { source, news } = result.value
      
      news.forEach(item => {
        // 添加到总列表
        allNews.push({
          ...item,
          source: item.source || source,
          crossCount: 1,
          crossSources: [source]
        })
        
        // 交叉验证：提取标题关键词
        const keywords = extractKeywords(item.title)
        keywords.forEach(keyword => {
          if (!newsTitleMap.has(keyword)) {
            newsTitleMap.set(keyword, [])
          }
          if (!newsTitleMap.get(keyword).includes(source)) {
            newsTitleMap.get(keyword).push(source)
          }
        })
      })
    }
  })
  
  // 交叉验证：找出在多个来源中出现的新闻
  allNews.forEach(news => {
    const keywords = extractKeywords(news.title)
    const crossSources = new Set()
    
    keywords.forEach(keyword => {
      if (newsTitleMap.has(keyword)) {
        newsTitleMap.get(keyword).forEach(source => crossSources.add(source))
      }
    })
    
    news.crossCount = crossSources.size
    news.crossSources = Array.from(crossSources)
  })
  
  // 按交叉验证次数排序（出现次数越多越靠前）
  allNews.sort((a, b) => b.crossCount - a.crossCount)
  
  // 去重（保留交叉验证次数最多的）
  const uniqueNews = []
  const seenTitles = new Set()
  
  allNews.forEach(news => {
    const normalizedTitle = news.title.substring(0, 20) // 取前20个字符作为标识
    if (!seenTitles.has(normalizedTitle)) {
      seenTitles.add(normalizedTitle)
      uniqueNews.push(news)
    }
  })
  
  newsList.value = uniqueNews.slice(0, 50) // 最多显示50条
  
  console.log(`[FinanceNews] ✅ 加载完成，共 ${newsList.value.length} 条新闻`)
  console.log(`[FinanceNews] 📊 交叉验证统计:`, {
    总新闻数: allNews.length,
    去重后: newsList.value.length,
    多来源新闻: newsList.value.filter(n => n.crossCount > 1).length
  })
}

const loadSingleSource = async (sourceName) => {
  const source = allSources.find(s => s.name === sourceName)
  if (!source) return
  
  try {
    console.log(`[FinanceNews] 加载 ${source.displayName}...`)
    const news = await source.fetch()
    newsList.value = news.map(item => ({
      ...item,
      source: item.source || source.displayName,
      crossCount: 1,
      crossSources: [source.displayName]
    }))
    currentSourceName.value = source.displayName
    console.log(`[FinanceNews] ✅ 加载成功，共 ${news.length} 条`)
  } catch (err) {
    error.value = `${source.displayName} 加载失败: ${err.message}`
    console.error(`[FinanceNews] ❌ 加载失败:`, err)
  }
}

const switchSource = () => {
  const option = sourceOptions.find(opt => opt.value === currentSource.value)
  if (option) {
    currentSourceName.value = option.text
  }
  loadNews()
}

// 提取标题关键词（用于交叉验证）
const extractKeywords = (title) => {
  // 简单提取：移除标点，取关键词
  const normalized = title.replace(/[，。！？、；：""''《》（）【】]/g, ' ')
  const words = normalized.split(' ').filter(w => w.length >= 2)
  return words.slice(0, 3) // 取前3个关键词
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
  flex: 1;
}

.source-selector {
  flex: 0 0 auto;
}

.news-stats {
  display: flex;
  gap: 12px;
  margin-bottom: 16px;
  padding: 8px 12px;
  background: white;
  border-radius: 8px;
  font-size: 12px;
  color: #646566;
}

.stat-item {
  display: inline-block;
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
  position: relative;
}

.news-item:hover {
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}

.news-source-tag {
  position: absolute;
  top: 12px;
  right: 12px;
  padding: 2px 8px;
  background: #1989fa;
  color: white;
  font-size: 10px;
  border-radius: 4px;
}

.news-title {
  font-size: 16px;
  font-weight: bold;
  margin: 0 0 8px 0;
  color: #323233;
  padding-right: 60px;
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

.news-meta {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.news-time {
  font-size: 12px;
  color: #969799;
  margin: 0;
}

.news-cross {
  font-size: 10px;
  color: #07c160;
  background: #e8f8ef;
  padding: 2px 6px;
  border-radius: 4px;
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
  position: relative;
}

.detail-source-tag {
  position: absolute;
  top: 16px;
  right: 16px;
  padding: 4px 12px;
  background: #1989fa;
  color: white;
  font-size: 12px;
  border-radius: 4px;
}

.detail-title {
  font-size: 18px;
  font-weight: bold;
  margin: 0 0 12px 0;
  color: #323233;
  padding-right: 80px;
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

.detail-cross {
  background: #f7f8fa;
  padding: 12px;
  border-radius: 8px;
  margin-bottom: 16px;
  font-size: 12px;
}

.detail-cross p {
  margin: 0 0 8px 0;
  color: #323233;
  font-weight: bold;
}

.detail-cross ul {
  margin: 0;
  padding-left: 20px;
}

.detail-cross li {
  color: #646566;
  margin-bottom: 4px;
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
