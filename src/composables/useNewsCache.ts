// [WHY] 新闻缓存和已读管理 Composable
// [WHAT] 提供新闻数据的缓存机制（带 TTL）和已读/未读标记功能
// [NOTE] Task #21（新闻缓存机制）和 Task #22（新闻已读/未读标记）的统一实现

import { ref, computed, onMounted } from 'vue'
import type { NewsItem, NewsSource, NewsCategory } from '@/types/news'

/**
 * 缓存配置
 */
const CACHE_CONFIG = {
  /** 缓存 TTL（毫秒）= 5 分钟 */
  TTL: 5 * 60 * 1000,
  /** localStorage 键名 */
  CACHE_KEY: 'news_cache',
  /** 已读记录键名 */
  READ_KEY: 'news_read_records'
}

/**
 * 缓存数据结构
 */
interface NewsCacheData {
  /** 缓存时间戳 */
  timestamp: number
  /** 缓存的数据 */
  data: NewsItem[]
  /** 数据源 */
  source?: NewsSource
  /** 分类 */
  category?: NewsCategory
}

/**
 * 新闻缓存和已读管理 Composable
 * [WHAT] 提供缓存、已读标记、未读计数等功能
 */
export function useNewsCache() {
  // ========== 状态 ==========
  
  /** 缓存的新闻数据 */
  const cachedNews = ref<NewsItem[]>([])
  
  /** 是否已加载缓存 */
  const isCacheLoaded = ref(false)
  
  /** 是否正在刷新 */
  const isRefreshing = ref(false)
  
  /** 已读新闻 ID 集合 */
  const readIds = ref<Set<string>>(new Set())
  
  // ========== 计算属性 ==========
  
  /** 未读新闻数量 */
  const unreadCount = computed(() => {
    return cachedNews.value.filter(item => !isRead(item.id)).length
  })
  
  /** 已读新闻数量 */
  const readCount = computed(() => {
    return cachedNews.value.filter(item => isRead(item.id)).length
  })
  
  // ========== 缓存管理方法 ==========
  
  /**
   * 加载缓存数据
   * [WHAT] 从 localStorage 加载缓存的新闻数据
   * @returns 缓存有效返回 true，否则返回 false
   */
  function loadCache(): boolean {
    try {
      const cached = localStorage.getItem(CACHE_CONFIG.CACHE_KEY)
      if (!cached) {
        isCacheLoaded.value = false
        return false
      }
      
      const cacheData: NewsCacheData = JSON.parse(cached)
      const now = Date.now()
      
      // 检查 TTL
      if (now - cacheData.timestamp > CACHE_CONFIG.TTL) {
        // 缓存过期，清除
        localStorage.removeItem(CACHE_CONFIG.CACHE_KEY)
        isCacheLoaded.value = false
        return false
      }
      
      // 加载缓存数据
      cachedNews.value = cacheData.data
      isCacheLoaded.value = true
      return true
    } catch (error) {
      console.error('[useNewsCache] 加载缓存失败:', error)
      isCacheLoaded.value = false
      return false
    }
  }
  
  /**
   * 保存缓存数据
   * [WHAT] 将新闻数据保存到 localStorage（带时间戳）
   */
  function saveCache(data: NewsItem[]): void {
    try {
      const cacheData: NewsCacheData = {
        timestamp: Date.now(),
        data
      }
      localStorage.setItem(CACHE_CONFIG.CACHE_KEY, JSON.stringify(cacheData))
      cachedNews.value = data
    } catch (error) {
      console.error('[useNewsCache] 保存缓存失败:', error)
    }
  }
  
  /**
   * 检查缓存是否有效
   * [WHAT] 检查缓存是否过期
   */
  function isCacheValid(): boolean {
    try {
      const cached = localStorage.getItem(CACHE_CONFIG.CACHE_KEY)
      if (!cached) return false
      
      const cacheData: NewsCacheData = JSON.parse(cached)
      const now = Date.now()
      
      return (now - cacheData.timestamp) <= CACHE_CONFIG.TTL
    } catch {
      return false
    }
  }
  
  /**
   * 清除缓存
   */
  function clearCache(): void {
    localStorage.removeItem(CACHE_CONFIG.CACHE_KEY)
    cachedNews.value = []
    isCacheLoaded.value = false
  }
  
  /**
   * 获取缓存时间
   * [WHAT] 返回缓存的时间戳（用于显示"更新于 XX 分钟前"）
   */
  function getCacheTime(): number | null {
    try {
      const cached = localStorage.getItem(CACHE_CONFIG.CACHE_KEY)
      if (!cached) return null
      
      const cacheData: NewsCacheData = JSON.parse(cached)
      return cacheData.timestamp
    } catch {
      return null
    }
  }
  
  /**
   * 智能加载新闻数据
   * [WHAT] 先显示缓存（如果有），然后后台刷新
   * @param fetcher 获取新数据的函数
   * @param options 选项
   */
  async function smartLoad(
    fetcher: () => Promise<NewsItem[]>,
    options: { showCacheFirst?: boolean } = {}
  ): Promise<NewsItem[]> {
    const { showCacheFirst = true } = options
    
    // 1. 先尝试加载缓存
    const hasCache = showCacheFirst && loadCache()
    
    // 2. 如果缓存有效，直接返回缓存数据（后台刷新）
    if (hasCache && isCacheValid()) {
      // 后台刷新
      refreshInBackground(fetcher)
      return cachedNews.value
    }
    
    // 3. 缓存无效或不存在，直接获取新数据
    isRefreshing.value = true
    try {
      const newData = await fetcher()
      saveCache(newData)
      return newData
    } catch (error) {
      console.error('[useNewsCache] 加载数据失败:', error)
      // 如果获取失败但有缓存，返回缓存
      if (hasCache) {
        return cachedNews.value
      }
      return []
    } finally {
      isRefreshing.value = false
    }
  }
  
  /**
   * 后台刷新
   * [WHAT] 在后台获取新数据，获取成功后更新缓存
   */
  async function refreshInBackground(fetcher: () => Promise<NewsItem[]>): Promise<void> {
    try {
      const newData = await fetcher()
      saveCache(newData)
    } catch (error) {
      console.error('[useNewsCache] 后台刷新失败:', error)
    }
  }
  
  // ========== 已读/未读管理方法 ==========
  
  /**
   * 加载已读记录
   * [WHAT] 从 localStorage 加载已读新闻 ID
   */
  function loadReadRecords(): void {
    try {
      const saved = localStorage.getItem(CACHE_CONFIG.READ_KEY)
      if (saved) {
        const ids = JSON.parse(saved) as string[]
        readIds.value = new Set(ids)
      }
    } catch (error) {
      console.error('[useNewsCache] 加载已读记录失败:', error)
      readIds.value = new Set()
    }
  }
  
  /**
   * 保存已读记录
   * [WHAT] 将已读新闻 ID 保存到 localStorage
   */
  function saveReadRecords(): void {
    try {
      const ids = Array.from(readIds.value)
      localStorage.setItem(CACHE_CONFIG.READ_KEY, JSON.stringify(ids))
    } catch (error) {
      console.error('[useNewsCache] 保存已读记录失败:', error)
    }
  }
  
  /**
   * 标记新闻为已读
   * [WHAT] 将指定新闻 ID 标记为已读
   */
  function markAsRead(newsId: string): void {
    readIds.value.add(newsId)
    saveReadRecords()
  }
  
  /**
   * 标记新闻为未读
   */
  function markAsUnread(newsId: string): void {
    readIds.value.delete(newsId)
    saveReadRecords()
  }
  
  /**
   * 检查新闻是否已读
   */
  function isRead(newsId: string): boolean {
    return readIds.value.has(newsId)
  }
  
  /**
   * 标记所有新闻为已读
   * [WHAT] 将所有当前缓存的新闻标记为已读
   */
  function markAllAsRead(): void {
    cachedNews.value.forEach(item => {
      readIds.value.add(item.id)
    })
    saveReadRecords()
  }
  
  /**
   * 清除所有已读记录
   */
  function clearAllReadRecords(): void {
    readIds.value.clear()
    saveReadRecords()
  }
  
  /**
   * 获取带有已读状态的新闻列表
   * [WHAT] 返回带有 isRead 字段的新闻列表
   */
  function getNewsWithReadStatus(): NewsItem[] {
    return cachedNews.value.map(item => ({
      ...item,
      isRead: isRead(item.id)
    }))
  }
  
  // ========== 初始化 ==========
  
  /**
   * 初始化
   * [WHAT] 加载缓存和已读记录
   */
  function init(): void {
    loadCache()
    loadReadRecords()
  }
  
  // 组件挂载时自动初始化
  onMounted(() => {
    init()
  })
  
  // ========== 返回 ==========
  
  return {
    // 状态
    cachedNews,
    isCacheLoaded,
    isRefreshing,
    unreadCount,
    readCount,
    
    // 缓存管理方法
    loadCache,
    saveCache,
    isCacheValid,
    clearCache,
    getCacheTime,
    smartLoad,
    refreshInBackground,
    
    // 已读/未读管理方法
    loadReadRecords,
    markAsRead,
    markAsUnread,
    isRead,
    markAllAsRead,
    clearAllReadRecords,
    getNewsWithReadStatus,
    
    // 初始化
    init
  }
}
