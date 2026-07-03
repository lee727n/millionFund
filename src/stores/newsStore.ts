// [WHY] 新闻 Store - 集中管理新闻状态，替代 News.vue 中的散乱本地状态
// [WHAT] 管理新闻列表、搜索、筛选、缓存
import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { NewsSource, ApiNewsItem } from '@/types/news'

export const useNewsStore = defineStore('news', () => {
  const articles = ref<ApiNewsItem[]>([])
  const loading = ref(false)
  const error = ref<string | null>(null)
  const searchKeyword = ref('')
  const activeSource = ref<NewsSource | 'all'>('all')
  const lastFetchTime = ref(0)
  
  const filteredArticles = computed(() => {
    let result = articles.value
    if (activeSource.value !== 'all') {
      result = result.filter(a => a.source === activeSource.value)
    }
    if (searchKeyword.value.trim()) {
      const kw = searchKeyword.value.toLowerCase()
      result = result.filter(a =>
        a.title?.toLowerCase().includes(kw) ||
        a.summary?.toLowerCase().includes(kw) ||
        a.source?.toLowerCase().includes(kw)
      )
    }
    return result
  })
  
  const articleCount = computed(() => articles.value.length)
  const filteredCount = computed(() => filteredArticles.value.length)
  
  function setArticles(list: ApiNewsItem[]) {
    articles.value = list
    lastFetchTime.value = Date.now()
  }
  
  function setLoading(val: boolean) {
    loading.value = val
  }
  
  function setError(err: string | null) {
    error.value = err
  }
  
  function setSearchKeyword(kw: string) {
    searchKeyword.value = kw
  }
  
  function setActiveSource(source: NewsSource | 'all') {
    activeSource.value = source
  }
  
  function clearArticles() {
    articles.value = []
    lastFetchTime.value = 0
  }
  
  return {
    articles,
    loading,
    error,
    searchKeyword,
    activeSource,
    lastFetchTime,
    filteredArticles,
    articleCount,
    filteredCount,
    setArticles,
    setLoading,
    setError,
    setSearchKeyword,
    setActiveSource,
    clearArticles,
  }
})
