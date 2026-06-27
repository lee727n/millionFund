<script setup lang="ts">
// [WHY] 搜索页 - 搜索基金并添加到自选
// [WHAT] 输入基金代码或名称搜索，点击进入详情，支持添加到自选

import { ref, watch, onMounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useFundStore } from '@/stores/fund'
import { searchFund } from '@/api/fundFast'
import { fetchFundEstimateFast } from '@/api/fundFast'
import { showToast, showLoadingToast, closeToast } from 'vant'
import type { FundInfo } from '@/types/fund'
import { useI18n } from 'vue-i18n'

const router = useRouter()
const { t } = useI18n()
const route = useRoute()
const fundStore = useFundStore()

const keyword = ref('')

// [WHAT] 搜索历史
const searchHistory = ref<string[]>([])

// [WHY] 从路由参数获取初始搜索关键词
onMounted(() => {
  const q = route.query.q as string
  if (q) {
    keyword.value = q
    doSearch(q)
  }
  loadSearchHistory()
})

// [WHAT] 扩展的搜索结果，包含实时涨跌幅
interface FundInfoWithChange extends FundInfo {
  gszzl?: string  // 估算涨跌幅
}

const searchResults = ref<FundInfoWithChange[]>([])
const isSearching = ref(false)

// [WHAT] 防抖搜索 - 输入停止 300ms 后触发
let searchTimer: ReturnType<typeof setTimeout> | null = null

watch(keyword, (val) => {
  if (searchTimer) {
    clearTimeout(searchTimer)
  }
  
  if (!val.trim()) {
    searchResults.value = []
    return
  }
  
  searchTimer = setTimeout(() => {
    doSearch(val)
  }, 300)
})

// [WHAT] 加载搜索历史
function loadSearchHistory() {
  try {
    const saved = localStorage.getItem('fund_search_history')
    if (saved) {
      searchHistory.value = JSON.parse(saved).slice(0, 10)
    }
  } catch {
    searchHistory.value = []
  }
}

// [WHAT] 保存搜索历史
function saveSearchHistory(kw: string) {
  if (!kw.trim()) return
  searchHistory.value = [kw, ...searchHistory.value.filter(h => h !== kw)].slice(0, 10)
  try {
    localStorage.setItem('fund_search_history', JSON.stringify(searchHistory.value))
  } catch {
    // 忽略存储失败
  }
}

// [WHAT] 清除搜索历史
function clearSearchHistory() {
  searchHistory.value = []
  try {
    localStorage.removeItem('fund_search_history')
  } catch {
    // 忽略
  }
}

// [WHAT] 点击搜索历史项
function onHistoryClick(kw: string) {
  keyword.value = kw
  doSearch(kw)
}

// [WHAT] 执行搜索
async function doSearch(kw: string) {
  if (!kw.trim()) return
  
  saveSearchHistory(kw)
  isSearching.value = true
  try {
    const results = await searchFund(kw, 30)
    searchResults.value = results
    
    // [WHY] 异步获取涨跌幅数据，不阻塞搜索结果显示
    const unsupportedTypes = ['期货', 'QDII', 'FOF', '联接', '其他']
    const supportedResults = results.filter(f => 
      !unsupportedTypes.some(t => f.type.includes(t) || f.name.includes(t))
    ).slice(0, 10)
    
    await Promise.allSettled(supportedResults.map(async (fund) => {
      try {
        const estimate = await fetchFundEstimateFast(fund.code)
        if (estimate?.gszzl) {
          const idx = searchResults.value.findIndex(r => r.code === fund.code)
          if (idx !== -1) {
            searchResults.value[idx]!.gszzl = estimate.gszzl
          }
        }
      } catch {
        // 忽略单个基金获取失败
      }
    }))
  } catch (err) {
    showToast('搜索失败')
  } finally {
    isSearching.value = false
  }
}

// [WHAT] 进入基金详情
function goToDetail(code: string) {
  router.push(`/detail/${code}`)
}

// [WHAT] 格式化涨跌幅显示
function formatChange(gszzl?: string): string {
  if (!gszzl) return ''
  const val = parseFloat(gszzl)
  if (isNaN(val)) return ''
  const prefix = val >= 0 ? '+' : ''
  return `${prefix}${val.toFixed(2)}%`
}

// [WHAT] 获取涨跌幅颜色类名
function getChangeClass(gszzl?: string): string {
  if (!gszzl) return ''
  const val = parseFloat(gszzl)
  if (isNaN(val)) return ''
  return val >= 0 ? 'up' : 'down'
}

// [WHAT] 添加基金到自选
async function handleAdd(e: Event, fund: FundInfo) {
  e.stopPropagation()
  if (fundStore.isFundInWatchlist(fund.code)) {
    showToast('已在自选中')
    return
  }
  
  showLoadingToast({ message: '添加中...', forbidClick: true })
  
  try {
    await fundStore.addFund(fund.code, fund.name)
    closeToast()
    showToast('添加成功')
  } catch {
    closeToast()
    showToast('添加失败')
  }
}

// [WHAT] 返回上一页
function goBack() {
  router.back()
}

// [WHAT] 判断基金是否已在自选中
function isInWatchlist(code: string): boolean {
  return fundStore.isFundInWatchlist(code)
}
</script>

<template>
  <div class="search-page">
    <!-- 搜索栏 -->
    <van-nav-bar :title="t('search.title')" left-arrow @click-left="goBack">
      <template #right>
        <span v-if="isSearching" class="searching-text" :data-test-id="'loading'">{{ t('common.loading') }}</span>
      </template>
    </van-nav-bar>

    <!-- 搜索输入框 -->
    <div data-test-id="search-input">
      <van-search
        v-model="keyword"
        :placeholder="t('search.placeholder')"
        show-action
        autofocus
        @cancel="goBack"
      />
    </div>

    <!-- 搜索历史 -->
    <div v-if="!keyword && searchHistory.length > 0" class="search-history">
      <div class="history-header">
        <span class="history-title">{{ t('search.history') }}</span>
        <van-icon name="delete-o" size="16" class="history-clear" @click="clearSearchHistory" />
      </div>
      <div class="history-tags">
        <van-tag
          v-for="h in searchHistory"
          :key="h"
          class="history-tag"
          round
          @click="onHistoryClick(h)"
        >
          {{ h }}
        </van-tag>
      </div>
    </div>

    <!-- 搜索结果列表 -->
    <div class="search-results" :data-test-id="'search-results'">
      <div 
        v-for="fund in searchResults"
        :key="fund.code"
        class="fund-item"
        @click="goToDetail(fund.code)"
        :data-test-id="'fund-item'"
        :data-code="fund.code"
      >
        <div class="fund-info">
          <div class="fund-name" :data-test-id="'fund-name'">{{ fund.name }}</div>
          <div class="fund-meta">
            <span class="fund-code" :data-test-id="'fund-code'">{{ fund.code }}</span>
            <van-tag plain size="medium" class="fund-type-tag">{{ fund.type }}</van-tag>
          </div>
        </div>
        <div class="fund-change-col">
          <span 
            v-if="fund.gszzl" 
            class="fund-change" 
            :class="getChangeClass(fund.gszzl)"
            :data-test-id="'fund-change'"
          >
            {{ formatChange(fund.gszzl) }}
          </span>
          <span v-else class="fund-change empty">--</span>
        </div>
        <div class="fund-action" :data-test-id="'add-fund-button'">
          <van-icon
            :name="isInWatchlist(fund.code) ? 'success' : 'plus'"
            :color="isInWatchlist(fund.code) ? '#07c160' : '#1989fa'"
            size="22"
            @click="(e: Event) => handleAdd(e, fund)"
          />
        </div>
      </div>

      <!-- 空状态 -->
      <van-empty
        v-if="keyword && searchResults.length === 0 && !isSearching"
        image="search"
        :description="t('search.no_result')"
        data-test-id="empty-result"
      />

      <!-- 搜索提示 -->
      <div v-if="!keyword && searchHistory.length === 0" class="search-tip">
        <van-icon name="info-o" />
        <span>{{ t('search.tip') }}</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.search-page {
  height: 100%;
  background: var(--bg-primary);
  transition: background-color 0.3s;
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
  overscroll-behavior-y: contain;
  touch-action: pan-y;
}

.searching-text {
  font-size: 12px;
  color: var(--text-secondary);
}

/* ========== 搜索历史 ========== */
.search-history {
  background: var(--bg-secondary);
  padding: 12px 16px 16px;
}

.history-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 10px;
}

.history-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-secondary);
}

.history-clear {
  color: var(--text-tertiary);
  cursor: pointer;
  padding: 4px;
}

.history-clear:active {
  opacity: 0.6;
}

.history-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.history-tag {
  background: var(--bg-tertiary);
  color: var(--text-primary);
  font-size: 12px;
  padding: 4px 10px;
  cursor: pointer;
  border: none;
}

.history-tag:active {
  opacity: 0.7;
}

/* ========== 搜索结果 ========== */
.search-results {
  background: var(--bg-secondary);
}

.search-tip {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 40px 20px;
  color: var(--text-secondary);
  font-size: 14px;
}

.fund-item {
  display: flex;
  align-items: center;
  padding: 12px 16px;
  background: var(--bg-secondary);
  border-bottom: 1px solid var(--border-color, #ebedf0);
  cursor: pointer;
  transition: background 0.2s;
}

.fund-item:active {
  background: var(--bg-active, #f2f3f5);
}

.fund-info {
  flex: 1;
  min-width: 0;
  overflow: hidden;
}

.fund-name {
  font-size: 15px;
  color: var(--text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  margin-bottom: 4px;
}

.fund-meta {
  font-size: 12px;
  color: var(--text-secondary);
  display: flex;
  align-items: center;
  gap: 6px;
}

.fund-code {
  font-family: 'DIN Alternate', 'Roboto Mono', monospace;
}

.fund-type-tag {
  font-size: 10px;
  padding: 0 4px;
}

.fund-change-col {
  width: 70px;
  text-align: right;
  margin-right: 12px;
  flex-shrink: 0;
}

.fund-change {
  font-size: 14px;
  font-weight: 600;
  font-family: 'DIN Alternate', 'Roboto Mono', monospace;
}

.fund-change.up {
  color: #f56c6c;
}

.fund-change.down {
  color: #67c23a;
}

.fund-change.empty {
  color: var(--text-tertiary, #c8c9cc);
}

.fund-action {
  width: 36px;
  display: flex;
  justify-content: center;
  align-items: center;
  flex-shrink: 0;
}

.fund-action .van-icon:active {
  transform: scale(1.2);
}
</style>