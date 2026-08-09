<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { useRouter } from 'vue-router'
// 金十数据
import { fetchNewsList, fetchFlashNews, fetchEconomicCalendar, getNewsCategories, type NewsItem, type FlashItem, type CalendarItem } from '@/api/jin10'
// 财联社
import { fetchClsTelegram, fetchClsHotTopics, fetchClsPlateMovement, type TelegramItem, type HotTopic, type PlateMovement } from '@/api/cls'
// 雪球
import { fetchHotDiscussions, fetchStockSentimentList, fetchUserViews, type HotDiscussion, type StockSentiment, type UserView } from '@/api/xueqiu'
// 东方财富 Choice
import { fetchNorthFlow, fetchSectorFlows, fetchMainForceFlow, type NorthFlowData, type SectorFlow, type MainForceFlow } from '@/api/choice'
// 新增数据源 (Task #10: 合并 FinanceNews.vue)
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
import { showToast, showLoadingToast, closeToast } from 'vant'
import { copyLogsToClipboard } from '@/utils/logger'
import { jaccardSimilarity } from '@/utils/jaccard'
import { useI18n } from 'vue-i18n'
import type { ApiNewsItem } from '@/types/news'

const router = useRouter()
const { t } = useI18n()

// ========== 时间格式化助手 ==========
function formatTime(isoString: string): string {
  const date = new Date(isoString)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMs / 3600000)
  
  if (diffMins < 1) return '刚刚'
  if (diffMins < 60) return `${diffMins}分钟前`
  if (diffHours < 24) return `${diffHours}小时前`
  return date.toLocaleDateString('zh-CN')
}

// ========== 搜索功能（Task #9 P0） ==========
const searchKeyword = ref('')

// ========== 数据源选择 ==========
type DataSource = 'jin10' | 'cls' | 'xueqiu' | 'choice' | 'toutiao' | 'sina' | 'netease' | 'tencent' | 'eastmoney' | '10jqka' | 'stcn' | 'csnews' | 'yicai' | 'all'
const activeSource = ref<DataSource>('jin10')

const sourceOptions = computed(() => [
  { text: t('news.jin10'), value: 'jin10' },
  { text: t('news.cls'), value: 'cls' },
  { text: t('news.xueqiu'), value: 'xueqiu' },
  { text: t('news.capital_flow'), value: 'choice' },
  { text: t('news.source_toutiao'), value: 'toutiao' },
  { text: t('news.source_sina'), value: 'sina' },
  { text: t('news.source_netease'), value: 'netease' },
  { text: t('news.source_tencent'), value: 'tencent' },
  { text: t('news.source_10jqka'), value: '10jqka' },
  { text: t('news.source_stcn'), value: 'stcn' },
  { text: t('news.source_csnews'), value: 'csnews' },
  { text: t('news.source_yicai'), value: 'yicai' },
  { text: t('news.all_sources_cross'), value: 'all' }
])

// ========== 交叉验证状态 (Task #11: Jaccard 相似度) ==========
const crossValidation = ref({
  enabled: false,
  newsMap: new Map<string, Set<string>>()
})

// 交叉验证新闻列表
const crossValidationNews = ref<Array<{
  id: string,
  title: string,
  summary: string,
  source: string,
  publishedAt: string,
  url: string,
  crossCount: number,
  crossSources: string[]
}>>([])
const isCrossLoading = ref(false)

// ========== 各个数据源的 tab 状态 ==========
// 金十数据
const jin10Tab = ref<'news' | 'flash' | 'calendar'>('news')
const activeCategory = ref('all')
const newsList = ref<NewsItem[]>([])
const flashList = ref<FlashItem[]>([])
const calendarList = ref<CalendarItem[]>([])
const categories = computed(() => getNewsCategories())
const newsPage = ref(1)
const hasMoreNews = ref(true)

// 财联社
const clsTab = ref<'telegram' | 'hotTopics' | 'plate'>('telegram')
const telegramList = ref<TelegramItem[]>([])
const hotTopicsList = ref<HotTopic[]>([])
const plateList = ref<PlateMovement[]>([])

// 雪球
const xueqiuTab = ref<'discussion' | 'sentiment' | 'views'>('discussion')
const discussionType = ref<'fund' | 'stock'>('fund')
const discussionList = ref<HotDiscussion[]>([])
const sentimentList = ref<StockSentiment[]>([])
const userViewsList = ref<UserView[]>([])

// 东方财富 Choice
const choiceTab = ref<'north' | 'sector' | 'mainforce'>('north')
const northFlow = ref<NorthFlowData | null>(null)
const sectorFlows = ref<SectorFlow[]>([])
const mainForceFlows = ref<MainForceFlow[]>([])

// ========== 新增数据源状态 (Task #10) ==========
// 今日头条
const toutiaoNewsList = ref<ApiNewsItem[]>([])
// 新浪财经
const sinaNewsList = ref<ApiNewsItem[]>([])
// 网易财经
const neteaseNewsList = ref<ApiNewsItem[]>([])
// 腾讯财经
const tencentNewsList = ref<ApiNewsItem[]>([])
// 东方财富新闻
const eastmoneyNewsList = ref<ApiNewsItem[]>([])
// 同花顺
const jqkaNewsList = ref<ApiNewsItem[]>([])
// 证券时报
const stcnNewsList = ref<ApiNewsItem[]>([])
// 中国证券报
const csNewsList = ref<ApiNewsItem[]>([])
// 第一财经
const yicaiNewsList = ref<ApiNewsItem[]>([])

// 通用
const isLoading = ref(false)

// ========== 过滤新闻列表 ==========
// 过滤新闻列表（金十）
const filteredNewsList = computed(() => {
  if (!searchKeyword.value.trim()) return newsList.value
  const kw = searchKeyword.value.toLowerCase()
  return newsList.value.filter(item =>
    item.title.toLowerCase().includes(kw) ||
    item.summary.toLowerCase().includes(kw) ||
    item.source.toLowerCase().includes(kw)
  )
})

// 过滤快讯列表（金十）
const filteredFlashList = computed(() => {
  if (!searchKeyword.value.trim()) return flashList.value
  const kw = searchKeyword.value.toLowerCase()
  return flashList.value.filter(item =>
    item.content.toLowerCase().includes(kw)
  )
})

// 过滤电报列表（财联社）
const filteredTelegramList = computed(() => {
  if (!searchKeyword.value.trim()) return telegramList.value
  const kw = searchKeyword.value.toLowerCase()
  return telegramList.value.filter(item =>
    item.content.toLowerCase().includes(kw)
  )
})

// 过滤讨论列表（雪球）
const filteredDiscussionList = computed(() => {
  if (!searchKeyword.value.trim()) return discussionList.value
  const kw = searchKeyword.value.toLowerCase()
  return discussionList.value.filter(item =>
    item.title.toLowerCase().includes(kw) ||
    item.content.toLowerCase().includes(kw) ||
    item.userName.toLowerCase().includes(kw)
  )
})

// 过滤交叉验证新闻列表
const filteredCrossValidationNews = computed(() => {
  if (!searchKeyword.value.trim()) return crossValidationNews.value
  const kw = searchKeyword.value.toLowerCase()
  return crossValidationNews.value.filter(item =>
    item.title.toLowerCase().includes(kw) ||
    item.summary.toLowerCase().includes(kw) ||
    item.source.toLowerCase().includes(kw)
  )
})

function filterApiNewsList(list: ApiNewsItem[]) {
  if (!searchKeyword.value.trim()) return list
  const kw = searchKeyword.value.toLowerCase()
  return list.filter(item =>
    item.title.toLowerCase().includes(kw) ||
    item.summary.toLowerCase().includes(kw) ||
    item.source.toLowerCase().includes(kw)
  )
}

const filteredToutiaoNews = computed(() => filterApiNewsList(toutiaoNewsList.value))
const filteredSinaNews = computed(() => filterApiNewsList(sinaNewsList.value))
const filteredNeteaseNews = computed(() => filterApiNewsList(neteaseNewsList.value))
const filteredTencentNews = computed(() => filterApiNewsList(tencentNewsList.value))
const filteredEastmoneyNews = computed(() => filterApiNewsList(eastmoneyNewsList.value))
const filteredJqkaNews = computed(() => filterApiNewsList(jqkaNewsList.value))
const filteredStcnNews = computed(() => filterApiNewsList(stcnNewsList.value))
const filteredCsNews = computed(() => filterApiNewsList(csNewsList.value))
const filteredYicaiNews = computed(() => filterApiNewsList(yicaiNewsList.value))

// ========== 金十数据 ==========

async function loadJin10News() {
  if (isLoading.value) return
  isLoading.value = true
  showLoadingToast({ message: t('common.loading'), forbidClick: true })
  try {
    const data = await fetchNewsList(newsPage.value, 20, activeCategory.value)
    if (data.length === 0) hasMoreNews.value = false
    else { newsList.value = [...newsList.value, ...data]; newsPage.value++ }
  } catch { showToast(t('common.load_failed')) }
  finally { isLoading.value = false; closeToast() }
}

async function loadJin10Flash() {
  if (isLoading.value) return
  isLoading.value = true
  showLoadingToast({ message: t('common.loading'), forbidClick: true })
  try { flashList.value = await fetchFlashNews() }
  catch { showToast(t('common.load_failed')) }
  finally { isLoading.value = false; closeToast() }
}

async function loadJin10Calendar() {
  if (isLoading.value) return
  isLoading.value = true
  showLoadingToast({ message: t('common.loading'), forbidClick: true })
  try {
    const today = new Date().toISOString().split('T')[0]
    calendarList.value = await fetchEconomicCalendar(today)
  } catch { showToast(t('common.load_failed')) }
  finally { isLoading.value = false; closeToast() }
}

function onJin10TabChange(tab: 'news' | 'flash' | 'calendar') {
  jin10Tab.value = tab
  if (tab === 'news' && newsList.value.length === 0) loadJin10News()
  else if (tab === 'flash' && flashList.value.length === 0) loadJin10Flash()
  else if (tab === 'calendar' && calendarList.value.length === 0) loadJin10Calendar()
}

function onCategoryChange(category: string) {
  activeCategory.value = category
  newsList.value = []; newsPage.value = 1; hasMoreNews.value = true
  loadJin10News()
}

// ========== 财联社 ==========

async function loadClsTelegram() {
  if (isLoading.value) return
  isLoading.value = true
  showLoadingToast({ message: t('common.loading'), forbidClick: true })
  try { telegramList.value = await fetchClsTelegram() }
  catch { showToast(t('common.load_failed')) }
  finally { isLoading.value = false; closeToast() }
}

async function loadClsHotTopics() {
  if (isLoading.value) return
  isLoading.value = true
  showLoadingToast({ message: t('common.loading'), forbidClick: true })
  try { hotTopicsList.value = await fetchClsHotTopics() }
  catch { showToast(t('common.load_failed')) }
  finally { isLoading.value = false; closeToast() }
}

async function loadClsPlate() {
  if (isLoading.value) return
  isLoading.value = true
  showLoadingToast({ message: t('common.loading'), forbidClick: true })
  try { plateList.value = await fetchClsPlateMovement() }
  catch { showToast(t('common.load_failed')) }
  finally { isLoading.value = false; closeToast() }
}

function onClsTabChange(tab: 'telegram' | 'hotTopics' | 'plate') {
  clsTab.value = tab
  if (tab === 'telegram' && telegramList.value.length === 0) loadClsTelegram()
  else if (tab === 'hotTopics' && hotTopicsList.value.length === 0) loadClsHotTopics()
  else if (tab === 'plate' && plateList.value.length === 0) loadClsPlate()
}

async function onCopyLogs(): Promise<void> {
  const ok = await copyLogsToClipboard()
  if (ok) showToast(t('news.logs_copied'))
  else showToast(t('news.copy_failed'))
}

// ========== 雪球 ==========

async function loadXueqiuDiscussions() {
  if (isLoading.value) return
  isLoading.value = true
  showLoadingToast({ message: t('common.loading'), forbidClick: true })
  try { discussionList.value = await fetchHotDiscussions(discussionType.value) }
  catch { showToast(t('common.load_failed')) }
  finally { isLoading.value = false; closeToast() }
}

async function loadXueqiuSentiment() {
  if (isLoading.value) return
  isLoading.value = true
  showLoadingToast({ message: t('common.loading'), forbidClick: true })
  try { sentimentList.value = await fetchStockSentimentList(discussionType.value) }
  catch { showToast(t('common.load_failed')) }
  finally { isLoading.value = false; closeToast() }
}

async function loadXueqiuViews() {
  if (isLoading.value) return
  isLoading.value = true
  showLoadingToast({ message: t('common.loading'), forbidClick: true })
  try { userViewsList.value = await fetchUserViews() }
  catch { showToast(t('common.load_failed')) }
  finally { isLoading.value = false; closeToast() }
}

function onXueqiuTabChange(tab: 'discussion' | 'sentiment' | 'views') {
  xueqiuTab.value = tab
  if (tab === 'discussion' && discussionList.value.length === 0) loadXueqiuDiscussions()
  else if (tab === 'sentiment' && sentimentList.value.length === 0) loadXueqiuSentiment()
  else if (tab === 'views' && userViewsList.value.length === 0) loadXueqiuViews()
}

function onXueqiuTypeChange(type: 'fund' | 'stock') {
  discussionType.value = type
  discussionList.value = []; sentimentList.value = []
  loadXueqiuDiscussions()
}

// ========== 东方财富 Choice ==========

async function loadChoiceNorth() {
  if (isLoading.value) return
  isLoading.value = true
  showLoadingToast({ message: t('common.loading'), forbidClick: true })
  try { northFlow.value = await fetchNorthFlow() }
  catch { showToast(t('common.load_failed')) }
  finally { isLoading.value = false; closeToast() }
}

async function loadChoiceSector() {
  if (isLoading.value) return
  isLoading.value = true
  showLoadingToast({ message: t('common.loading'), forbidClick: true })
  try { sectorFlows.value = await fetchSectorFlows() }
  catch { showToast(t('common.load_failed')) }
  finally { isLoading.value = false; closeToast() }
}

async function loadChoiceMainForce() {
  if (isLoading.value) return
  isLoading.value = true
  showLoadingToast({ message: t('common.loading'), forbidClick: true })
  try { mainForceFlows.value = await fetchMainForceFlow() }
  catch { showToast(t('common.load_failed')) }
  finally { isLoading.value = false; closeToast() }
}

function onChoiceTabChange(tab: 'north' | 'sector' | 'mainforce') {
  choiceTab.value = tab
  if (tab === 'north' && !northFlow.value) loadChoiceNorth()
  else if (tab === 'sector' && sectorFlows.value.length === 0) loadChoiceSector()
  else if (tab === 'mainforce' && mainForceFlows.value.length === 0) loadChoiceMainForce()
}

// ========== 新增数据源加载函数 (Task #10) ==========

async function loadToutiaoNews() {
  if (isLoading.value) return
  isLoading.value = true
  showLoadingToast({ message: t('common.loading'), forbidClick: true })
  try { toutiaoNewsList.value = await fetchToutiaoNews(1, 20) }
  catch { showToast(t('common.load_failed')) }
  finally { isLoading.value = false; closeToast() }
}

async function loadSinaNews() {
  if (isLoading.value) return
  isLoading.value = true
  showLoadingToast({ message: t('common.loading'), forbidClick: true })
  try { sinaNewsList.value = await fetchSinaNews(1, 20) }
  catch { showToast(t('common.load_failed')) }
  finally { isLoading.value = false; closeToast() }
}

async function loadNeteaseNews() {
  if (isLoading.value) return
  isLoading.value = true
  showLoadingToast({ message: t('common.loading'), forbidClick: true })
  try { neteaseNewsList.value = await fetchNeteaseNews(1, 20) }
  catch { showToast(t('common.load_failed')) }
  finally { isLoading.value = false; closeToast() }
}

async function loadTencentNews() {
  if (isLoading.value) return
  isLoading.value = true
  showLoadingToast({ message: t('common.loading'), forbidClick: true })
  try { tencentNewsList.value = await fetchTencentNews(1, 20) }
  catch { showToast(t('common.load_failed')) }
  finally { isLoading.value = false; closeToast() }
}

async function loadEastmoneyNews() {
  if (isLoading.value) return
  isLoading.value = true
  showLoadingToast({ message: t('common.loading'), forbidClick: true })
  try { eastmoneyNewsList.value = await fetchEastmoneyNews(1, 20) }
  catch { showToast(t('common.load_failed')) }
  finally { isLoading.value = false; closeToast() }
}

async function load10jqkaNews() {
  if (isLoading.value) return
  isLoading.value = true
  showLoadingToast({ message: t('common.loading'), forbidClick: true })
  try { jqkaNewsList.value = await fetch10jqkaNews(1, 20) }
  catch { showToast(t('common.load_failed')) }
  finally { isLoading.value = false; closeToast() }
}

async function loadSTCNNews() {
  if (isLoading.value) return
  isLoading.value = true
  showLoadingToast({ message: t('common.loading'), forbidClick: true })
  try { stcnNewsList.value = await fetchSTCNNews(1, 20) }
  catch { showToast(t('common.load_failed')) }
  finally { isLoading.value = false; closeToast() }
}

async function loadCSNews() {
  if (isLoading.value) return
  isLoading.value = true
  showLoadingToast({ message: t('common.loading'), forbidClick: true })
  try { csNewsList.value = await fetchCSNews(1, 20) }
  catch { showToast(t('common.load_failed')) }
  finally { isLoading.value = false; closeToast() }
}

async function loadYicaiNews() {
  if (isLoading.value) return
  isLoading.value = true
  showLoadingToast({ message: t('common.loading'), forbidClick: true })
  try { yicaiNewsList.value = await fetchYicaiNews(1, 20) }
  catch { showToast(t('common.load_failed')) }
  finally { isLoading.value = false; closeToast() }
}

// Jaccard 相似度已抽取至 @/utils/jaccard（见 Task #11 单元测试）

/**
 * 加载所有数据源并进行交叉验证
 */
async function loadAllSourcesWithCrossValidation() {
  console.log('[News] 🚀 开始加载所有数据源，启用交叉验证...')
  isCrossLoading.value = true
  crossValidation.value.enabled = true
  
  const allNews: Array<{
    id: string,
    title: string,
    summary: string,
    source: string,
    publishedAt: string,
    url: string,
    crossCount: number,
    crossSources: string[]
  }> = []
  
  // 定义所有数据源
  const allSources = [
    { name: '金十数据', fetch: async () => await fetchNewsList(1, 20, 'all') },
    { name: '财联社', fetch: async () => await fetchClsTelegram(20) },
    { name: '今日头条', fetch: async () => await fetchToutiaoNews(1, 20) },
    { name: '新浪财经', fetch: async () => await fetchSinaNews(1, 20) },
    { name: '网易财经', fetch: async () => await fetchNeteaseNews(1, 20) },
    { name: '腾讯财经', fetch: async () => await fetchTencentNews(1, 20) },
    { name: '雪球', fetch: async () => await fetchXueqiuNews(1, 20) },
    { name: '东方财富', fetch: async () => await fetchEastmoneyNews(1, 20) },
    { name: '同花顺', fetch: async () => await fetch10jqkaNews(1, 20) },
    { name: '证券时报', fetch: async () => await fetchSTCNNews(1, 20) },
    { name: '中国证券报', fetch: async () => await fetchCSNews(1, 20) },
    { name: '第一财经', fetch: async () => await fetchYicaiNews(1, 20) }
  ]
  
  // 并行加载所有数据源
  const results = await Promise.allSettled(
    allSources.map(async (source) => {
      try {
        const news = await source.fetch()
        return { source: source.name, news }
      } catch (err) {
        console.warn(`[News] ⚠️ ${source.name} 加载失败:`, err)
        return { source: source.name, news: [] }
      }
    })
  )
  
  // 处理结果并标准化
  results.forEach(result => {
    if (result.status === 'fulfilled' && result.value.news.length > 0) {
      const { source, news } = result.value
      
      news.forEach((item: any) => {
        allNews.push({
          id: item.id || `${source}_${Math.random()}`,
          title: item.title || '',
          summary: item.summary || item.content || '',
          source: item.source || source,
          publishedAt: item.publishedAt || new Date().toISOString(),
          url: item.url || '#',
          crossCount: 1,
          crossSources: [source]
        })
      })
    }
  })
  
  // 使用 Jaccard 相似度进行交叉验证
  console.log(`[News] 📊 开始交叉验证，共 ${allNews.length} 条新闻...`)
  
  // 字符级 2-gram 下 0.30 是更合适的交叉验证阈值
  // - 0.50 以上：几乎完全相同的标题（同一条新闻的多源转载）
  // - 0.30-0.50：高度相关的新闻（同事件不同角度报道）
  // - 0.15-0.30：部分关键词重合（可能相关也可能不相关）
  const SIMILARITY_THRESHOLD = 0.30
  
  for (let i = 0; i < allNews.length; i++) {
    for (let j = i + 1; j < allNews.length; j++) {
      const similarity = jaccardSimilarity(allNews[i].title, allNews[j].title)
      
      if (similarity > SIMILARITY_THRESHOLD) {
        // 认为是同一新闻，合并来源
        if (!allNews[i].crossSources.includes(allNews[j].source)) {
          allNews[i].crossSources.push(allNews[j].source)
          allNews[i].crossCount = allNews[i].crossSources.length
        }
        if (!allNews[j].crossSources.includes(allNews[i].source)) {
          allNews[j].crossSources.push(allNews[i].source)
          allNews[j].crossCount = allNews[j].crossSources.length
        }
      }
    }
  }
  
  // 按交叉验证次数排序（出现次数越多越靠前）
  allNews.sort((a, b) => b.crossCount - a.crossCount)
  
  // 去重（保留交叉验证次数最多的，使用完整标题进行去重）
  const uniqueNews: typeof allNews = []
  const seenTitles = new Set<string>()
  
  allNews.forEach(news => {
    // 使用完整标题进行去重（不再截断前30个字符）
    const normalizedTitle = news.title.trim().toLowerCase()
    if (!seenTitles.has(normalizedTitle)) {
      seenTitles.add(normalizedTitle)
      uniqueNews.push(news)
    }
  })
  
  crossValidationNews.value = uniqueNews.slice(0, 50) // 最多显示50条
  
  console.log(`[News] ✅ 交叉验证完成，共 ${crossValidationNews.value.length} 条新闻`)
  console.log(`[News] 📊 交叉验证统计:`, {
    总新闻数: allNews.length,
    去重后: crossValidationNews.value.length,
    多来源新闻: crossValidationNews.value.filter(n => n.crossCount > 1).length
  })
  
  isCrossLoading.value = false
}

// ========== 数据源切换 ==========

function refreshCurrentSource() {
  // 重置并重新加载当前数据源
  switch (activeSource.value) {
    case 'jin10':
      jin10Tab.value = 'news'
      newsList.value = []; newsPage.value = 1; hasMoreNews.value = true
      loadJin10News()
      break
    case 'cls':
      clsTab.value = 'telegram'
      telegramList.value = []; loadClsTelegram()
      break
    case 'xueqiu':
      xueqiuTab.value = 'discussion'
      discussionList.value = []; sentimentList.value = []; userViewsList.value = []
      loadXueqiuDiscussions()
      break
    case 'choice':
      choiceTab.value = 'north'
      northFlow.value = null
      loadChoiceNorth()
      break
    // 新增数据源
    case 'toutiao':
      toutiaoNewsList.value = []
      loadToutiaoNews()
      break
    case 'sina':
      sinaNewsList.value = []
      loadSinaNews()
      break
    case 'netease':
      neteaseNewsList.value = []
      loadNeteaseNews()
      break
    case 'tencent':
      tencentNewsList.value = []
      loadTencentNews()
      break
    case 'eastmoney':
      eastmoneyNewsList.value = []
      loadEastmoneyNews()
      break
    case '10jqka':
      jqkaNewsList.value = []
      load10jqkaNews()
      break
    case 'stcn':
      stcnNewsList.value = []
      loadSTCNNews()
      break
    case 'csnews':
      csNewsList.value = []
      loadCSNews()
      break
    case 'yicai':
      yicaiNewsList.value = []
      loadYicaiNews()
      break
    // 交叉验证
    case 'all':
      crossValidationNews.value = []
      loadAllSourcesWithCrossValidation()
      break
  }
}

// 获取当前数据源名称
function getCurrentSourceName(): string {
  const option = sourceOptions.find(opt => opt.value === activeSource.value)
  return option ? option.text : '金十数据'
}

onMounted(() => {
  // 不再自动加载，等待用户选择数据源
})
</script>

<template>
  <div class="news-page" data-testid="news-page">
    <!-- 导航栏 -->
    <div class="custom-nav-bar">
      <div class="nav-title">{{ t('news.title') }}</div>
      <div class="nav-actions">
        <van-icon name="replay" size="20" @click="refreshCurrentSource" title="刷新" style="margin-right: 12px" />
        <van-icon name="description-o" size="20" @click="onCopyLogs" title="复制日志" />
      </div>
    </div>

    <!-- 数据源切换 (Task #10: 改为下拉选择) -->
    <div class="source-selector-bar" data-testid="source-selector-bar">
      <van-dropdown-menu active-color="#1677ff" data-testid="source-dropdown">
        <van-dropdown-item v-model="activeSource" :options="sourceOptions" :title="getCurrentSourceName()" />
      </van-dropdown-menu>
    </div>

    <!-- 交叉验证统计 -->
    <div v-if="activeSource === 'all' && crossValidationNews.length > 0" class="cross-validation-stats">
      <span class="stat-item">📊 共 {{ crossValidationNews.length }} 条新闻</span>
      <span class="stat-item">✅ {{ crossValidationNews.filter(n => n.crossCount > 1).length }} 条经过交叉验证</span>
    </div>

    <!-- 搜索框（Task #9 P0） -->
    <div class="search-bar" data-testid="news-search-bar">
      <van-search
        v-model="searchKeyword"
        :placeholder="t('news.search_placeholder')"
        shape="round"
        background="transparent"
        clearable
        class="news-search"
        data-testid="news-search-input"
      />
    </div>

    <!-- ==================== 交叉验证视图 (Task #10 & #11) ==================== -->
    <template v-if="activeSource === 'all'">
      <div class="content-area">
        <div v-if="isCrossLoading" class="loading-container">
          <van-loading size="24px">正在加载并交叉验证...</van-loading>
        </div>
        <div v-else-if="filteredCrossValidationNews.length > 0" class="scroll-list" data-testid="cross-validation-list">
          <div v-for="news in filteredCrossValidationNews" :key="news.id" class="news-card" @click="router.push(news.url)" data-testid="news-card">
            <div class="news-source-tag" :class="{ 'cross-validated': news.crossCount > 1 }">{{ news.source }}</div>
            <div class="news-time">{{ formatTime(news.publishedAt) }}</div>
            <div class="news-title">{{ news.title }}</div>
            <div class="news-summary">{{ news.summary }}</div>
            <div v-if="news.crossCount > 1" class="news-cross-validation">
              <span class="cross-badge">🔄 在{{ news.crossCount }}个来源中出现</span>
              <div class="cross-sources">
                <span v-for="source in news.crossSources" :key="source" class="cross-source-tag">{{ source }}</span>
              </div>
            </div>
          </div>
        </div>
        <van-empty v-else description="暂无新闻，请尝试刷新" />
      </div>
    </template>

    <!-- ==================== 金十数据 ==================== -->
    <template v-else-if="activeSource === 'jin10'">
      <div class="sub-tabs" data-testid="news-tabs">
        <div class="sub-tab" :class="{ active: jin10Tab === 'news' }" @click="onJin10TabChange('news')">{{ t('news.tab_news') }}</div>
        <div class="sub-tab" :class="{ active: jin10Tab === 'flash' }" @click="onJin10TabChange('flash')">{{ t('news.tab_flash') }}</div>
        <div class="sub-tab" :class="{ active: jin10Tab === 'calendar' }" @click="onJin10TabChange('calendar')">{{ t('news.tab_calendar') }}</div>
      </div>

      <!-- 新闻 -->
      <div v-if="jin10Tab === 'news'" class="content-area">
        <div class="category-scroll-x">
          <div class="category-list">
            <div v-for="cat in categories" :key="cat.id" class="category-item" :class="{ active: activeCategory === cat.id }" @click="onCategoryChange(cat.id)">
              <span>{{ cat.icon }}</span><span>{{ cat.name }}</span>
            </div>
          </div>
        </div>
        <div class="scroll-list">
          <template v-if="filteredNewsList.length > 0">
            <div v-for="news in filteredNewsList" :key="news.id" class="news-card" @click="router.push(news.url)" data-testid="news-card">
              <div class="news-time">{{ news.time }}</div>
              <div class="news-category-tag">{{ news.category }}</div>
              <div class="news-title">{{ news.title }}</div>
              <div class="news-summary">{{ news.summary }}</div>
              <div v-if="news.tags?.length" class="news-tags">
                <span v-for="tag in news.tags.slice(0, 3)" :key="tag" class="news-tag">{{ tag }}</span>
              </div>
            </div>
          </template>
          <van-empty v-else :description="t('news.no_news')" />
          <div v-if="hasMoreNews" class="load-more" @click="loadJin10News">
            <van-loading v-if="isLoading" size="small" />
            <span v-else>{{ t('news.load_more') }}</span>
          </div>
        </div>
      </div>

      <!-- 快讯 -->
      <div v-else-if="jin10Tab === 'flash'" class="content-area">
        <div class="scroll-list">
          <template v-if="filteredFlashList.length > 0">
            <div v-for="flash in filteredFlashList" :key="flash.id" class="flash-card" :class="'flash-' + flash.type">
              <div class="flash-header">
                <span class="flash-type-badge" :class="'flash-' + flash.type">
                  {{ flash.type === 'important' ? t('news.important') : flash.type === 'warning' ? t('news.warning') : t('news.flash_type') }}
                </span>
                <span class="flash-time">{{ flash.time }}</span>
              </div>
              <div class="flash-content">{{ flash.content }}</div>
            </div>
          </template>
          <van-empty v-else :description="t('news.no_flash')" />
        </div>
      </div>

      <!-- 日历 -->
      <div v-else-if="jin10Tab === 'calendar'" class="content-area">
        <div class="scroll-list">
          <template v-if="calendarList.length > 0">
            <div v-for="item in calendarList" :key="item.id" class="calendar-card">
              <div class="calendar-time">{{ item.time }}</div>
              <span class="calendar-importance" :class="'imp-' + item.importance">
                {{ item.importance === 'high' ? t('news.high') : item.importance === 'medium' ? t('news.medium') : t('news.low') }}
              </span>
              <div class="calendar-title">{{ item.title }}</div>
              <div v-if="item.currency" class="calendar-currency">{{ item.currency }}</div>
              <div v-if="item.actual || item.forecast || item.previous" class="calendar-data-row">
                <div class="data-cell"><span class="data-lbl">{{ t('news.actual') }}</span><span class="data-val">{{ item.actual || '--' }}</span></div>
                <div class="data-cell"><span class="data-lbl">{{ t('news.forecast') }}</span><span class="data-val">{{ item.forecast || '--' }}</span></div>
                <div class="data-cell"><span class="data-lbl">{{ t('news.previous') }}</span><span class="data-val">{{ item.previous || '--' }}</span></div>
              </div>
            </div>
          </template>
          <van-empty v-else :description="t('news.no_calendar')" />
        </div>
      </div>
    </template>

    <!-- ==================== 财联社 ==================== -->
    <template v-else-if="activeSource === 'cls'">
      <div class="sub-tabs">
        <div class="sub-tab" :class="{ active: clsTab === 'telegram' }" @click="onClsTabChange('telegram')">{{ t('news.tab_telegram') }}</div>
        <div class="sub-tab" :class="{ active: clsTab === 'hotTopics' }" @click="onClsTabChange('hotTopics')">{{ t('news.tab_hot') }}</div>
        <div class="sub-tab" :class="{ active: clsTab === 'plate' }" @click="onClsTabChange('plate')">{{ t('news.tab_plate') }}</div>
      </div>

      <!-- 电报 -->
      <div v-if="clsTab === 'telegram'" class="content-area">
        <div class="scroll-list">
          <template v-if="filteredTelegramList.length > 0">
            <div v-for="item in filteredTelegramList" :key="item.id" class="flash-card" :class="'flash-' + item.type">
              <div class="flash-header">
                <span class="flash-type-badge" :class="'flash-' + item.type">
                  {{ item.type === 'urgent' ? t('news.urgent') : item.type === 'important' ? t('news.important') : t('news.flash_type') }}
                </span>
                <span class="flash-time">{{ item.time }}</span>
              </div>
              <div class="flash-content">{{ item.content }}</div>
              <div v-if="item.stocks?.length" class="related-stocks">
                <span v-for="s in item.stocks.slice(0, 3)" :key="s" class="stock-tag">{{ s }}</span>
              </div>
            </div>
          </template>
          <van-empty v-else :description="t('news.no_telegram')" />
        </div>
      </div>

      <!-- 热门主题 -->
      <div v-if="clsTab === 'hotTopics'" class="content-area">
        <div class="scroll-list">
          <template v-if="hotTopicsList.length > 0">
            <div v-for="(topic, idx) in hotTopicsList" :key="topic.id" class="topic-card">
              <div class="topic-rank">{{ idx + 1 }}</div>
              <div class="topic-info">
                <div class="topic-name">{{ topic.name }}</div>
                <div class="topic-heat">热度 {{ topic.heat >= 10000 ? (topic.heat / 10000).toFixed(0) + '万' : topic.heat }}</div>
              </div>
              <div class="topic-change" :class="topic.change >= 0 ? 'up' : 'down'">
                {{ topic.change >= 0 ? '+' : '' }}{{ topic.change }}%
              </div>
            </div>
          </template>
          <van-empty v-else :description="t('news.no_hot_topics')" />
        </div>
      </div>

      <!-- 板块异动 -->
      <div v-if="clsTab === 'plate'" class="content-area">
        <div class="scroll-list">
          <template v-if="plateList.length > 0">
            <div v-for="plate in plateList" :key="plate.id" class="plate-card">
              <div class="plate-name">{{ plate.plateName }}</div>
              <div class="plate-change" :class="plate.direction">{{ plate.direction === 'up' ? '+' : '-' }}{{ plate.changePercent }}%</div>
              <div class="plate-leader">{{ t('news.leader') }}<{{ plate.leadingStock }}</div>
              <div class="plate-reason">{{ plate.reason }}</div>
            </div>
          </template>
          <van-empty v-else :description="t('news.no_plate')" />
        </div>
      </div>
    </template>

    <!-- ==================== 雪球 ==================== -->
    <template v-else-if="activeSource === 'xueqiu'">
      <div class="sub-tabs">
        <div class="sub-tab" :class="{ active: xueqiuTab === 'discussion' }" @click="onXueqiuTabChange('discussion')">{{ t('news.tab_discussion') }}</div>
        <div class="sub-tab" :class="{ active: xueqiuTab === 'sentiment' }" @click="onXueqiuTabChange('sentiment')">{{ t('news.tab_sentiment') }}</div>
        <div class="sub-tab" :class="{ active: xueqiuTab === 'views' }" @click="onXueqiuTabChange('views')">{{ t('news.tab_views') }}</div>
      </div>

      <!-- 类型切换 -->
      <div v-if="xueqiuTab === 'discussion' || xueqiuTab === 'sentiment'" class="type-switch-bar">
        <span class="type-switch" :class="{ active: discussionType === 'fund' }" @click="onXueqiuTypeChange('fund')">{{ t('news.fund') }}</span>
        <span class="type-switch" :class="{ active: discussionType === 'stock' }" @click="onXueqiuTypeChange('stock')">{{ t('news.stock') }}</span>
      </div>

      <!-- 热帖 -->
      <div v-if="xueqiuTab === 'discussion'" class="content-area">
        <div class="scroll-list">
          <template v-if="filteredDiscussionList.length > 0">
            <div v-for="item in filteredDiscussionList" :key="item.id" class="discuss-card">
              <div class="discuss-header">
                <span class="discuss-user">{{ item.userName }}</span>
                <span class="discuss-time">{{ item.createTime }}</span>
              </div>
              <div class="discuss-title">{{ item.title }}</div>
              <div class="discuss-content">{{ item.content }}</div>
              <div class="discuss-footer">
                <span>❤️ {{ item.likeCount >= 1000 ? (item.likeCount / 1000).toFixed(1) + 'k' : item.likeCount }}</span>
                <span>💬 {{ item.commentCount >= 1000 ? (item.commentCount / 1000).toFixed(1) + 'k' : item.commentCount }}</span>
                <span v-if="item.stockName" class="discuss-stock">{{ item.stockName }}</span>
              </div>
            </div>
          </template>
          <van-empty v-else :description="t('news.no_discussion')" />
        </div>
      </div>

      <!-- 情绪 -->
      <div v-if="xueqiuTab === 'sentiment'" class="content-area">
        <div class="scroll-list">
          <template v-if="sentimentList.length > 0">
            <div v-for="item in sentimentList" :key="item.code" class="sentiment-card">
              <div class="sentiment-header">
                <div class="sentiment-code">{{ item.name }}</div>
                <div class="sentiment-badge" :class="item.sentiment">
                  {{ item.sentiment === 'bullish' ? t('news.bullish') : item.sentiment === 'bearish' ? t('news.bearish') : t('news.neutral') }}
                </div>
              </div>
              <div class="sentiment-bar-wrap">
                <div class="sentiment-bar">
                  <div class="bar-bullish" :style="{ width: item.bullishRatio + '%' }"></div>
                </div>
                <span class="sentiment-ratio">{{ item.bullishRatio }}% {{ t('news.bullish_short') }}</span>
              </div>
              <div class="sentiment-stats">
                <span>讨论 {{ item.discussionCount }}</span>
                <span>排名 #{{ item.hotRank }}</span>
              </div>
            </div>
          </template>
          <van-empty v-else :description="t('news.no_sentiment')" />
        </div>
      </div>

      <!-- 大V观点 -->
      <div v-if="xueqiuTab === 'views'" class="content-area">
        <div class="scroll-list">
          <template v-if="userViewsList.length > 0">
            <div v-for="item in userViewsList" :key="item.id" class="views-card">
              <div class="views-user">
                <span class="views-name">{{ item.userName }}</span>
                <span class="views-desc">{{ item.userDesc }}</span>
              </div>
              <div class="views-title">{{ item.title }}</div>
              <div class="views-summary">{{ item.summary }}</div>
              <div class="views-footer">
                <span class="views-direction" :class="item.direction">
                  {{ item.direction === 'bullish' ? t('news.bullish_arrow') : item.direction === 'bearish' ? t('news.bearish_arrow') : t('news.neutral_arrow') }}
                </span>
                <span>❤️ {{ item.likes }}</span>
              </div>
            </div>
          </template>
          <van-empty v-else :description="t('news.no_views')" />
        </div>
      </div>
    </template>

    <!-- ==================== 东方财富 ==================== -->
    <template v-else-if="activeSource === 'choice'">
      <div class="sub-tabs">
        <div class="sub-tab" :class="{ active: choiceTab === 'north' }" @click="onChoiceTabChange('north')">{{ t('news.tab_north') }}</div>
        <div class="sub-tab" :class="{ active: choiceTab === 'sector' }" @click="onChoiceTabChange('sector')">{{ t('news.tab_sector') }}</div>
        <div class="sub-tab" :class="{ active: choiceTab === 'mainforce' }" @click="onChoiceTabChange('mainforce')">{{ t('news.tab_mainforce') }}</div>
      </div>

      <!-- 北向资金 -->
      <div v-if="choiceTab === 'north'" class="content-area">
        <div class="scroll-list">
          <div v-if="northFlow" class="north-card">
            <div class="north-date">{{ northFlow.date }}</div>
            <div class="north-total">
              <span class="total-label">{{ t('news.north_total') }}</span>
              <span class="total-value" :class="northFlow.totalNetInflow >= 0 ? 'up' : 'down'">
                {{ northFlow.totalNetInflow >= 0 ? '+' : '' }}{{ northFlow.totalNetInflow.toFixed(2) }} 亿
              </span>
            </div>
            <div class="north-detail">
              <div class="north-item">
                <span class="north-item-label">{{ t('news.sh_connect') }}</span>
                <span class="north-item-value" :class="northFlow.shNetInflow >= 0 ? 'up' : 'down'">
                  {{ northFlow.shNetInflow >= 0 ? '+' : '' }}{{ northFlow.shNetInflow.toFixed(2) }}亿
                </span>
              </div>
              <div class="north-item">
                <span class="north-item-label">{{ t('news.sz_connect') }}</span>
                <span class="north-item-value" :class="northFlow.szNetInflow >= 0 ? 'up' : 'down'">
                  {{ northFlow.szNetInflow >= 0 ? '+' : '' }}{{ northFlow.szNetInflow.toFixed(2) }}亿
                </span>
              </div>
              <div class="north-item">
                <span class="north-item-label">{{ t('news.balance') }}</span>
                <span class="north-item-value">{{ northFlow.balance.toFixed(0) }}亿</span>
              </div>
            </div>
            <!-- 近5日趋势 -->
            <div v-if="northFlow.recent5Day.length" class="north-trend">
              <div class="trend-title">{{ t('news.north_trend') }}</div>
              <div class="trend-bars">
                <div v-for="day in northFlow.recent5Day" :key="day.date" class="trend-bar-item">
                  <div class="trend-bar-track">
                    <div
                      class="trend-bar-fill"
                      :class="day.value >= 0 ? 'up' : 'down'"
                      :style="{ height: Math.abs(day.value) / 50 * 100 + '%' }"
                    ></div>
                  </div>
                  <div class="trend-bar-label">{{ day.date.slice(-2) }}</div>
                </div>
              </div>
            </div>
          </div>
          <van-empty v-else :description="t('news.no_north')" />
        </div>
      </div>

      <!-- 板块资金 -->
      <div v-if="choiceTab === 'sector'" class="content-area">
        <div class="scroll-list">
          <template v-if="sectorFlows.length > 0">
            <div v-for="(item, idx) in sectorFlows" :key="idx" class="sector-flow-card">
              <div class="sector-flow-rank">{{ idx + 1 }}</div>
              <div class="sector-flow-info">
                <div class="sector-flow-name">{{ item.sectorName }}</div>
                <div class="sector-flow-leader" v-if="item.leadingStock">{{ t('news.leader') }}<{{ item.leadingStock }}</div>
              </div>
              <div class="sector-flow-value" :class="item.netInflow >= 0 ? 'up' : 'down'">
                {{ item.netInflow >= 0 ? '+' : '' }}{{ item.netInflow.toFixed(1) }}亿
              </div>
            </div>
          </template>
          <van-empty v-else :description="t('news.no_sector')" />
        </div>
      </div>

      <!-- 主力资金 -->
      <div v-if="choiceTab === 'mainforce'" class="content-area">
        <div class="scroll-list">
          <template v-if="mainForceFlows.length > 0">
            <div class="mainforce-summary">
              <div v-for="item in mainForceFlows" :key="item.label" class="mainforce-item" :class="{ 'mainforce-main': item.isMain }">
                <div class="mainforce-label">{{ item.label }}</div>
                <div class="mainforce-value" :class="item.netInflow >= 0 ? 'up' : 'down'">
                  {{ item.netInflow >= 0 ? '+' : '' }}{{ item.netInflow.toFixed(1) }}亿
                </div>
                <div v-if="item.ratio > 0" class="mainforce-bar-wrap">
                  <div class="mainforce-bar">
                    <div class="bar-fill" :class="item.netInflow >= 0 ? 'up' : 'down'" :style="{ width: Math.abs(item.ratio) + '%' }"></div>
                  </div>
                </div>
              </div>
            </div>
          </template>
          <van-empty v-else :description="t('news.no_mainforce')" />
        </div>
      </div>
    </template>

    <!-- ==================== 今日头条 ==================== -->
    <template v-else-if="activeSource === 'toutiao'">
      <div class="content-area">
        <div v-if="isLoading" class="loading-container">
          <van-loading size="24px">加载中...</van-loading>
        </div>
        <div v-else-if="toutiaoNewsList.length > 0" class="scroll-list">
          <div v-for="item in filteredToutiaoNews" :key="item.id" class="news-card" @click="router.push(item.url)">
            <div class="news-source-tag">{{ t('news.source_toutiao') }}</div>
            <div class="news-time">{{ formatTime(item.publishedAt) }}</div>
            <div class="news-title">{{ item.title }}</div>
            <div class="news-summary">{{ item.summary }}</div>
          </div>
        </div>
        <van-empty v-else description="暂无新闻，请尝试刷新" />
      </div>
    </template>

    <!-- ==================== 新浪财经 ==================== -->
    <template v-else-if="activeSource === 'sina'">
      <div class="content-area">
        <div v-if="isLoading" class="loading-container">
          <van-loading size="24px">加载中...</van-loading>
        </div>
        <div v-else-if="sinaNewsList.length > 0" class="scroll-list">
          <div v-for="item in filteredSinaNews" :key="item.id" class="news-card" @click="router.push(item.url)">
            <div class="news-source-tag">{{ t('news.source_sina') }}</div>
            <div class="news-time">{{ formatTime(item.publishedAt) }}</div>
            <div class="news-title">{{ item.title }}</div>
            <div class="news-summary">{{ item.summary }}</div>
          </div>
        </div>
        <van-empty v-else description="暂无新闻，请尝试刷新" />
      </div>
    </template>

    <!-- ==================== 网易财经 ==================== -->
    <template v-else-if="activeSource === 'netease'">
      <div class="content-area">
        <div v-if="isLoading" class="loading-container">
          <van-loading size="24px">加载中...</van-loading>
        </div>
        <div v-else-if="neteaseNewsList.length > 0" class="scroll-list">
          <div v-for="item in filteredNeteaseNews" :key="item.id" class="news-card" @click="router.push(item.url)">
            <div class="news-source-tag">{{ t('news.source_netease') }}</div>
            <div class="news-time">{{ formatTime(item.publishedAt) }}</div>
            <div class="news-title">{{ item.title }}</div>
            <div class="news-summary">{{ item.summary }}</div>
          </div>
        </div>
        <van-empty v-else description="暂无新闻，请尝试刷新" />
      </div>
    </template>

    <!-- ==================== 腾讯财经 ==================== -->
    <template v-else-if="activeSource === 'tencent'">
      <div class="content-area">
        <div v-if="isLoading" class="loading-container">
          <van-loading size="24px">加载中...</van-loading>
        </div>
        <div v-else-if="tencentNewsList.length > 0" class="scroll-list">
          <div v-for="item in filteredTencentNews" :key="item.id" class="news-card" @click="router.push(item.url)">
            <div class="news-source-tag">{{ t('news.source_tencent') }}</div>
            <div class="news-time">{{ formatTime(item.publishedAt) }}</div>
            <div class="news-title">{{ item.title }}</div>
            <div class="news-summary">{{ item.summary }}</div>
          </div>
        </div>
        <van-empty v-else description="暂无新闻，请尝试刷新" />
      </div>
    </template>

    <!-- ==================== 雪球新闻 ==================== -->
    <template v-else-if="activeSource === 'xueqiu'">
      <!-- 已有雪球视图，这里添加新闻视图 -->
    </template>

    <!-- ==================== 东方财富新闻 ==================== -->
    <template v-else-if="activeSource === 'eastmoney'">
      <div class="content-area">
        <div v-if="isLoading" class="loading-container">
          <van-loading size="24px">加载中...</van-loading>
        </div>
        <div v-else-if="eastmoneyNewsList.length > 0" class="scroll-list">
          <div v-for="item in filteredEastmoneyNews" :key="item.id" class="news-card" @click="router.push(item.url)">
            <div class="news-source-tag">{{ t('settings.eastmoney') }}</div>
            <div class="news-time">{{ formatTime(item.publishedAt) }}</div>
            <div class="news-title">{{ item.title }}</div>
            <div class="news-summary">{{ item.summary }}</div>
          </div>
        </div>
        <van-empty v-else description="暂无新闻，请尝试刷新" />
      </div>
    </template>

    <!-- ==================== 同花顺 ==================== -->
    <template v-else-if="activeSource === '10jqka'">
      <div class="content-area">
        <div v-if="isLoading" class="loading-container">
          <van-loading size="24px">加载中...</van-loading>
        </div>
        <div v-else-if="jqkaNewsList.length > 0" class="scroll-list">
          <div v-for="item in filteredJqkaNews" :key="item.id" class="news-card" @click="router.push(item.url)">
            <div class="news-source-tag">{{ t('news.source_10jqka') }}</div>
            <div class="news-time">{{ formatTime(item.publishedAt) }}</div>
            <div class="news-title">{{ item.title }}</div>
            <div class="news-summary">{{ item.summary }}</div>
          </div>
        </div>
        <van-empty v-else description="暂无新闻，请尝试刷新" />
      </div>
    </template>

    <!-- ==================== 证券时报 ==================== -->
    <template v-else-if="activeSource === 'stcn'">
      <div class="content-area">
        <div v-if="isLoading" class="loading-container">
          <van-loading size="24px">加载中...</van-loading>
        </div>
        <div v-else-if="stcnNewsList.length > 0" class="scroll-list">
          <div v-for="item in filteredStcnNews" :key="item.id" class="news-card" @click="router.push(item.url)">
            <div class="news-source-tag">{{ t('news.source_stcn') }}</div>
            <div class="news-time">{{ formatTime(item.publishedAt) }}</div>
            <div class="news-title">{{ item.title }}</div>
            <div class="news-summary">{{ item.summary }}</div>
          </div>
        </div>
        <van-empty v-else description="暂无新闻，请尝试刷新" />
      </div>
    </template>

    <!-- ==================== 中国证券报 ==================== -->
    <template v-else-if="activeSource === 'csnews'">
      <div class="content-area">
        <div v-if="isLoading" class="loading-container">
          <van-loading size="24px">加载中...</van-loading>
        </div>
        <div v-else-if="csNewsList.length > 0" class="scroll-list">
          <div v-for="item in filteredCsNews" :key="item.id" class="news-card" @click="router.push(item.url)">
            <div class="news-source-tag">{{ t('news.source_csnews') }}</div>
            <div class="news-time">{{ formatTime(item.publishedAt) }}</div>
            <div class="news-title">{{ item.title }}</div>
            <div class="news-summary">{{ item.summary }}</div>
          </div>
        </div>
        <van-empty v-else description="暂无新闻，请尝试刷新" />
      </div>
    </template>

    <!-- ==================== 第一财经 ==================== -->
    <template v-else-if="activeSource === 'yicai'">
      <div class="content-area">
        <div v-if="isLoading" class="loading-container">
          <van-loading size="24px">加载中...</van-loading>
        </div>
        <div v-else-if="yicaiNewsList.length > 0" class="scroll-list">
          <div v-for="item in filteredYicaiNews" :key="item.id" class="news-card" @click="router.push(item.url)">
            <div class="news-source-tag">{{ t('news.source_yicai') }}</div>
            <div class="news-time">{{ formatTime(item.publishedAt) }}</div>
            <div class="news-title">{{ item.title }}</div>
            <div class="news-summary">{{ item.summary }}</div>
          </div>
        </div>
        <van-empty v-else description="暂无新闻，请尝试刷新" />
      </div>
    </template>
  </div>
</template>

<style scoped>
.news-page {
  height: 100%;
  background: var(--bg-primary);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.custom-nav-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  background: var(--bg-primary);
  border-bottom: 1px solid var(--border-color);
  padding-top: max(12px, env(safe-area-inset-top, 0px));
}

.nav-title { font-size: 18px; font-weight: 600; color: var(--text-primary); }
.nav-actions { display: flex; align-items: center; gap: 8px; }

/* 数据源选择器 */
.source-selector-bar {
  background: var(--bg-secondary);
  border-bottom: 1px solid var(--border-color);
}

/* 交叉验证统计 */
.cross-validation-stats {
  display: flex;
  gap: 12px;
  padding: 8px 12px;
  background: var(--bg-card);
  border-bottom: 1px solid var(--border-color);
  font-size: 12px;
  color: var(--text-secondary);
}

.stat-item {
  display: inline-block;
}

/* 搜索栏 */
.search-bar {
  padding: 8px 12px;
  background: var(--bg-primary);
}

/* 加载容器 */
.loading-container {
  display: flex;
  justify-content: center;
  align-items: center;
  padding: 40px;
}

/* 内容区 */
.content-area { flex: 1; overflow: hidden; display: flex; flex-direction: column; }
.scroll-list { flex: 1; overflow-y: auto; padding-bottom: 20px; }

/* 子标签 */
.sub-tabs {
  display: flex;
  background: var(--bg-primary);
  padding: 6px 12px;
  gap: 4px;
  border-bottom: 1px solid var(--border-color);
}
.sub-tab {
  flex: 1;
  text-align: center;
  padding: 8px 10px;
  border-radius: 6px;
  font-size: 13px;
  color: var(--text-secondary);
  background: var(--bg-secondary);
  transition: all 0.2s;
  cursor: pointer;
}
.sub-tab.active {
  color: var(--text-primary);
  background: var(--color-primary);
  font-weight: 600;
}

/* 类型切换 */
.type-switch-bar {
  display: flex;
  gap: 8px;
  padding: 6px 12px;
  background: var(--bg-primary);
  border-bottom: 1px solid var(--border-color);
}
.type-switch {
  padding: 4px 16px;
  border-radius: 12px;
  font-size: 12px;
  background: var(--bg-secondary);
  color: var(--text-secondary);
  cursor: pointer;
}
.type-switch.active {
  background: var(--color-primary);
  color: #fff;
}

/* 分类滚动 */
.category-scroll-x {
  overflow-x: auto;
  white-space: nowrap;
  background: var(--bg-primary);
  border-bottom: 1px solid var(--border-color);
}
.category-list {
  display: inline-flex;
  padding: 10px 12px;
  gap: 10px;
}
.category-item {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 8px 14px;
  border-radius: 20px;
  background: var(--bg-secondary);
  font-size: 13px;
  color: var(--text-secondary);
  white-space: nowrap;
  cursor: pointer;
}
.category-item.active { background: var(--color-primary); color: #fff; }

/* 新闻卡片 */
.news-card {
  background: var(--bg-card);
  margin: 12px;
  padding: 16px;
  border-radius: 12px;
  border: 1px solid var(--border-color);
  cursor: pointer;
}
.news-time { font-size: 12px; color: var(--text-muted); margin-bottom: 6px; }
.news-category-tag {
  display: inline-block;
  font-size: 11px;
  padding: 2px 8px;
  border-radius: 4px;
  background: var(--color-primary-bg);
  color: var(--color-primary);
  margin-bottom: 8px;
}
.news-title { font-size: 16px; font-weight: 600; color: var(--text-primary); margin-bottom: 8px; line-height: 1.4; }
.news-summary { font-size: 14px; color: var(--text-secondary); line-height: 1.5; display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; }
.news-tags { display: flex; gap: 6px; margin-top: 10px; }
.news-tag { font-size: 11px; padding: 2px 6px; border-radius: 3px; background: rgba(0,0,0,0.05); color: var(--text-secondary); }

/* 新闻来源标签 */
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
.news-source-tag.cross-validated {
  background: #07c160;
}

/* 交叉验证 */
.news-cross-validation {
  margin-top: 10px;
  padding: 8px;
  background: #f7f8fa;
  border-radius: 8px;
}
.cross-badge {
  display: inline-block;
  font-size: 10px;
  color: #07c160;
  background: #e8f8ef;
  padding: 2px 6px;
  border-radius: 4px;
  margin-bottom: 6px;
}
.cross-sources {
  display: flex;
  gap: 4px;
  flex-wrap: wrap;
}
.cross-source-tag {
  font-size: 10px;
  padding: 1px 6px;
  border-radius: 3px;
  background: rgba(7, 193, 96, 0.1);
  color: #07c160;
}

/* 快讯/电报卡片 */
.flash-card { margin: 8px 12px; padding: 14px; border-radius: 10px; border-left: 4px solid; }
.flash-normal { background: var(--bg-card); border-left-color: var(--color-primary); }
.flash-important { background: rgba(255,152,0,0.1); border-left-color: #ff9800; }
.flash-warning { background: rgba(245,108,108,0.1); border-left-color: #f56c6c; }
.flash-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; }
.flash-type-badge { font-size: 11px; font-weight: 600; padding: 2px 6px; border-radius: 3px; }
.flash-normal .flash-type-badge { background: var(--color-primary-bg); color: var(--color-primary); }
.flash-important .flash-type-badge { background: rgba(255,152,0,0.2); color: #ff9800; }
.flash-warning .flash-type-badge { background: rgba(245,108,108,0.2); color: #f56c6c; }
.flash-time { font-size: 12px; color: var(--text-muted); }
.flash-content { font-size: 15px; color: var(--text-primary); line-height: 1.5; }
.related-stocks { display: flex; gap: 4px; margin-top: 8px; flex-wrap: wrap; }
.stock-tag { font-size: 11px; padding: 1px 6px; border-radius: 3px; background: rgba(22,119,255,0.1); color: #1677ff; }

/* 日历卡片 */
.calendar-card { background: var(--bg-card); margin: 12px; padding: 16px; border-radius: 12px; border: 1px solid var(--border-color); }
.calendar-time { font-size: 12px; color: var(--text-muted); margin-bottom: 8px; }
.calendar-importance { display: inline-block; font-size: 11px; font-weight: 600; padding: 2px 8px; border-radius: 4px; margin-bottom: 8px; }
.imp-high { background: rgba(245,108,108,0.1); color: #f56c6c; }
.imp-medium { background: rgba(255,152,0,0.1); color: #ff9800; }
.imp-low { background: rgba(103,194,58,0.1); color: #67c23a; }
.calendar-title { font-size: 15px; font-weight: 600; color: var(--text-primary); margin-bottom: 4px; }
.calendar-currency { font-size: 12px; color: var(--text-secondary); margin-bottom: 12px; }
.calendar-data-row { display: flex; gap: 20px; }
.data-cell { display: flex; flex-direction: column; gap: 4px; }
.data-lbl { font-size: 11px; color: var(--text-muted); }
.data-val { font-size: 14px; font-weight: 600; color: var(--text-primary); }

/* 热门主题 */
.topic-card {
  display: flex;
  align-items: center;
  padding: 14px 16px;
  margin: 4px 12px;
  background: var(--bg-card);
  border-radius: 10px;
  gap: 12px;
}
.topic-rank { font-size: 18px; font-weight: 700; color: var(--text-muted); min-width: 28px; }
.topic-info { flex: 1; }
.topic-name { font-size: 16px; font-weight: 600; color: var(--text-primary); }
.topic-heat { font-size: 12px; color: var(--text-muted); margin-top: 2px; }
.topic-change { font-size: 16px; font-weight: 700; }
.up { color: #f56c6c; }
.down { color: #67c23a; }

/* 板块异动 */
.plate-card { margin: 8px 12px; padding: 14px; border-radius: 10px; background: var(--bg-card); border: 1px solid var(--border-color); display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
.plate-name { font-size: 15px; font-weight: 600; color: var(--text-primary); }
.plate-change { font-size: 15px; font-weight: 700; }
.plate-leader { font-size: 12px; color: var(--text-secondary); margin-left: auto; }
.plate-reason { width: 100%; font-size: 12px; color: var(--text-muted); }

/* 雪球 - 讨论 */
.discuss-card { margin: 8px 12px; padding: 14px; border-radius: 10px; background: var(--bg-card); border: 1px solid var(--border-color); }
.discuss-header { display: flex; justify-content: space-between; margin-bottom: 6px; }
.discuss-user { font-size: 13px; font-weight: 600; color: #1677ff; }
.discuss-time { font-size: 11px; color: var(--text-muted); }
.discuss-title { font-size: 16px; font-weight: 600; color: var(--text-primary); margin-bottom: 6px; }
.discuss-content { font-size: 14px; color: var(--text-secondary); line-height: 1.5; display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; margin-bottom: 8px; }
.discuss-footer { display: flex; gap: 16px; font-size: 12px; color: var(--text-muted); }
.discuss-stock { background: rgba(22,119,255,0.1); color: #1677ff; padding: 1px 6px; border-radius: 3px; }

/* 雪球 - 情绪 */
.sentiment-card { margin: 8px 12px; padding: 14px; border-radius: 10px; background: var(--bg-card); border: 1px solid var(--border-color); }
.sentiment-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; }
.sentiment-code { font-size: 15px; font-weight: 600; }
.sentiment-badge { font-size: 12px; padding: 2px 8px; border-radius: 4px; }
.sentiment-badge.bullish { background: rgba(245,108,108,0.1); color: #f56c6c; }
.sentiment-badge.bearish { background: rgba(103,194,58,0.1); color: #67c23a; }
.sentiment-badge.neutral { background: rgba(144,147,153,0.1); color: #909399; }
.sentiment-bar-wrap { display: flex; align-items: center; gap: 10px; margin-bottom: 8px; }
.sentiment-bar { flex: 1; height: 6px; border-radius: 3px; background: #e8e8e8; overflow: hidden; }
.bar-bullish { height: 100%; background: #f56c6c; border-radius: 3px; transition: width 0.3s; }
.sentiment-ratio { font-size: 12px; color: var(--text-muted); min-width: 70px; text-align: right; }
.sentiment-stats { display: flex; gap: 16px; font-size: 12px; color: var(--text-muted); }

/* 雪球 - 大V观点 */
.views-card { margin: 8px 12px; padding: 14px; border-radius: 10px; background: var(--bg-card); border: 1px solid var(--border-color); }
.views-user { margin-bottom: 8px; }
.views-name { font-size: 14px; font-weight: 600; color: #1677ff; margin-right: 8px; }
.views-desc { font-size: 11px; color: var(--text-muted); }
.views-title { font-size: 15px; font-weight: 600; color: var(--text-primary); margin-bottom: 6px; }
.views-summary { font-size: 14px; color: var(--text-secondary); line-height: 1.5; display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; margin-bottom: 8px; }
.views-footer { display: flex; justify-content: space-between; font-size: 13px; }
.views-direction { font-weight: 600; }
.views-direction.bullish { color: #f56c6c; }
.views-direction.bearish { color: #67c23a; }
.views-direction.neutral { color: #909399; }

/* 北向资金 */
.north-card { margin: 12px; padding: 20px; border-radius: 12px; background: var(--bg-card); border: 1px solid var(--border-color); }
.north-date { font-size: 12px; color: var(--text-muted); margin-bottom: 16px; }
.north-total { text-align: center; margin-bottom: 20px; }
.total-label { display: block; font-size: 13px; color: var(--text-secondary); margin-bottom: 6px; }
.total-value { font-size: 28px; font-weight: 700; }
.north-detail { display: flex; gap: 12px; margin-bottom: 20px; }
.north-item { flex: 1; text-align: center; padding: 10px; background: var(--bg-secondary); border-radius: 8px; }
.north-item-label { display: block; font-size: 12px; color: var(--text-muted); margin-bottom: 4px; }
.north-item-value { font-size: 14px; font-weight: 600; }
.north-trend { border-top: 1px solid var(--border-color); padding-top: 16px; }
.trend-title { font-size: 13px; color: var(--text-secondary); margin-bottom: 12px; }
.trend-bars { display: flex; justify-content: space-around; align-items: flex-end; height: 80px; gap: 8px; }
.trend-bar-item { flex: 1; display: flex; flex-direction: column; align-items: center; height: 100%; }
.trend-bar-track { flex: 1; width: 100%; display: flex; align-items: flex-end; justify-content: center; }
.trend-bar-fill { width: 60%; min-height: 4px; border-radius: 3px; transition: height 0.3s; }
.trend-bar-fill.up { background: #f56c6c; }
.trend-bar-fill.down { background: #67c23a; }
.trend-bar-label { font-size: 10px; color: var(--text-muted); margin-top: 4px; }

/* 板块资金 */
.sector-flow-card { display: flex; align-items: center; padding: 14px 16px; margin: 4px 12px; background: var(--bg-card); border-radius: 10px; gap: 12px; }
.sector-flow-rank { font-size: 16px; font-weight: 700; color: var(--text-muted); min-width: 24px; }
.sector-flow-info { flex: 1; }
.sector-flow-name { font-size: 15px; font-weight: 600; color: var(--text-primary); }
.sector-flow-leader { font-size: 11px; color: var(--text-muted); margin-top: 2px; }
.sector-flow-value { font-size: 15px; font-weight: 700; }

/* 主力资金 */
.mainforce-summary { margin: 12px; padding: 16px; background: var(--bg-card); border-radius: 12px; border: 1px solid var(--border-color); }
.mainforce-item { padding: 12px 0; border-bottom: 1px solid var(--border-color); }
.mainforce-item:last-child { border-bottom: none; }
.mainforce-item.mainforce-main { background: rgba(22,119,255,0.03); margin: 0 -8px; padding: 12px 8px; border-radius: 8px; }
.mainforce-label { font-size: 14px; color: var(--text-primary); margin-bottom: 4px; }
.mainforce-value { font-size: 18px; font-weight: 700; margin-bottom: 8px; }
.mainforce-bar-wrap { display: flex; align-items: center; gap: 8px; }
.mainforce-bar { flex: 1; height: 6px; border-radius: 3px; background: #e8e8e8; overflow: hidden; }
.mainforce-bar .bar-fill { height: 100%; border-radius: 3px; }
.mainforce-bar .bar-fill.up { background: #f56c6c; }
.mainforce-bar .bar-fill.down { background: #67c23a; }

.load-more { text-align: center; padding: 16px; font-size: 14px; color: var(--text-secondary); cursor: pointer; }
</style>
