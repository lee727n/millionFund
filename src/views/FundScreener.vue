<script setup lang="ts">
// [WHY] 基金筛选器页面 - 支持多条件筛选基金
// [WHAT] 按类型/公司/评级/收益排序筛选，实时预览结果
// [REF] Task #18 需求文档

import { ref, reactive, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { searchFund, type FundInfo } from '@/api/fundSearch'
import { showToast } from 'vant'

const router = useRouter()

// [WHAT] 筛选条件
interface FundFilterCriteria {
  type: string[]          // 股票型/混合型/债券型/指数型/货币型/QDII
  fundCompany: string     // 基金公司
  sortBy: 'return' | 'risk' | 'rating' | 'code' | 'name'
  sortOrder: 'asc' | 'desc'
  dateRange: '1周' | '1月' | '3月' | '6月' | '1年' | '今年来'
  minRating: number       // 晨星评级 ≥
  keyword: string         // 关键词搜索
}

const filters = reactive<FundFilterCriteria>({
  type: [],
  fundCompany: '',
  sortBy: 'return',
  sortOrder: 'desc',
  dateRange: '1年',
  minRating: 0,
  keyword: ''
})

// [WHAT] 筛选结果
const filterResults = ref<FundInfo[]>([])
const isLoading = ref(false)
const showFilterPanel = ref(false)

// [WHAT] 基金类型选项
const fundTypeOptions = [
  { label: '股票型', value: '股票型' },
  { label: '混合型', value: '混合型' },
  { label: '债券型', value: '债券型' },
  { label: '指数型', value: '指数型' },
  { label: '货币型', value: '货币型' },
  { label: 'QDII', value: 'QDII' },
  { label: 'FOF', value: 'FOF' },
  { label: '联接', value: '联接' }
]

// [WHAT] 日期范围选项
const dateRangeOptions = [
  { label: '1周', value: '1周' },
  { label: '1月', value: '1月' },
  { label: '3月', value: '3月' },
  { label: '6月', value: '6月' },
  { label: '1年', value: '1年' },
  { label: '今年来', value: '今年来' }
]

// [WHAT] 评级选项
const ratingOptions = [
  { label: '不限', value: 0 },
  { label: '★ 1星以上', value: 1 },
  { label: '★★ 2星以上', value: 2 },
  { label: '★★★ 3星以上', value: 3 },
  { label: '★★★★ 4星以上', value: 4 },
  { label: '★★★★★ 5星', value: 5 }
]

// [WHAT] 排序选项
const sortOptions = [
  { label: '收益', value: 'return' },
  { label: '评级', value: 'rating' },
  { label: '代码', value: 'code' },
  { label: '名称', value: 'name' }
]

// [WHAT] 活跃筛选数量
const activeFilterCount = computed(() => {
  let count = 0
  if (filters.type.length > 0) count++
  if (filters.fundCompany) count++
  if (filters.minRating > 0) count++
  if (filters.keyword) count++
  return count
})

/**
 * 执行筛选
 */
async function applyFilters() {
  isLoading.value = true

  try {
    // 获取基金列表
    let results: FundInfo[]

    if (filters.keyword) {
      // 有关键词，先搜索
      results = await searchFund(filters.keyword, 500)
    } else {
      // 没关键词，获取全部
      results = await searchFund('', 500)
    }

    // 按类型筛选
    if (filters.type.length > 0) {
      results = results.filter(fund =>
        filters.type.some(t => fund.type.includes(t))
      )
    }

    // 按基金公司筛选（名称中包含）
    if (filters.fundCompany) {
      results = results.filter(fund =>
        fund.name.includes(filters.fundCompany)
      )
    }

    // TODO: 按评级筛选（需要获取评级数据，暂时跳过）
    // if (filters.minRating > 0) {
    //   // 需要获取每个基金的评级数据
    // }

    // 排序
    results = sortFunds(results)

    filterResults.value = results
  } catch (err) {
    showToast('筛选失败')
    console.error(err)
  } finally {
    isLoading.value = false
  }
}

/**
 * 排序基金列表
 */
function sortFunds(funds: FundInfo[]): FundInfo[] {
  const sorted = [...funds]

  sorted.sort((a, b) => {
    let cmp = 0

    switch (filters.sortBy) {
      case 'code':
        cmp = a.code.localeCompare(b.code)
        break
      case 'name':
        cmp = a.name.localeCompare(b.name)
        break
      case 'return':
      case 'rating':
      case 'risk':
        // 收益/评级/风险需异步获取，FundInfo 本身不含这些字段，保持原始顺序
        cmp = 0
        break
    }

    return filters.sortOrder === 'desc' ? -cmp : cmp
  })

  return sorted
}

/**
 * 重置筛选条件
 */
function resetFilters() {
  filters.type = []
  filters.fundCompany = ''
  filters.sortBy = 'return'
  filters.sortOrder = 'desc'
  filters.dateRange = '1年'
  filters.minRating = 0
  filters.keyword = ''
  filterResults.value = []
}

/**
 * 切换筛选面板
 */
function toggleFilterPanel() {
  showFilterPanel.value = !showFilterPanel.value
}

/**
 * 关闭筛选面板
 */
function closeFilterPanel() {
  showFilterPanel.value = false
}

/**
 * 跳转基金详情
 */
function goToDetail(code: string) {
  router.push(`/detail/${code}`)
}

/**
 * 返回上一页
 */
function goBack() {
  router.back()
}

// [WHAT] 页面加载时自动执行一次筛选（显示全部基金）
onMounted(() => {
  applyFilters()
})
</script>

<template>
  <div class="fund-screener-page">
    <!-- 导航栏 -->
    <van-nav-bar
      title="基金筛选"
      left-arrow
      @click-left="goBack"
    >
      <template #right>
        <van-badge :content="activeFilterCount" :show-zero="false">
        <van-button
          type="primary"
          size="small"
          plain
          @click="toggleFilterPanel"
          data-testid="filter-button"
        >
            筛选
          </van-button>
        </van-badge>
      </template>
    </van-nav-bar>

    <!-- 搜索栏 -->
    <div class="search-bar" data-testid="screener-search-bar">
      <van-search
        v-model="filters.keyword"
        placeholder="搜索基金代码或名称"
        shape="round"
        @search="applyFilters"
        data-testid="screener-search-input"
      />
    </div>

    <!-- 快捷筛选标签 -->
    <div class="quick-filters" data-testid="type-filter-tags">
      <div class="filter-tags">
        <van-tag
          v-for="opt in fundTypeOptions"
          :key="opt.value"
          :class="{ active: filters.type.includes(opt.value) }"
          round
          size="medium"
          @click="filters.type.includes(opt.value) ? filters.type = filters.type.filter(t => t !== opt.value) : filters.type.push(opt.value)"
        >
          {{ opt.label }}
        </van-tag>
      </div>
    </div>

    <!-- 排序栏 -->
    <div class="sort-bar" data-testid="sort-bar">
      <div class="sort-options">
        <span
          v-for="opt in sortOptions"
          :key="opt.value"
          :class="{ active: filters.sortBy === opt.value }"
          class="sort-option"
          @click="filters.sortBy = opt.value as any"
        >
          {{ opt.label }}
          <van-icon
            v-if="filters.sortBy === opt.value"
            :name="filters.sortOrder === 'asc' ? 'arrow-up' : 'arrow-down'"
            size="12"
          />
        </span>
      </div>
      <div class="result-count">
        共 {{ filterResults.length }} 只
      </div>
    </div>

      <!-- 筛选结果列表 -->
      <div class="filter-results" data-testid="fund-list">
        <van-loading v-if="isLoading" class="loading" type="spinner" />
        
        <div
          v-for="fund in filterResults"
          :key="fund.code"
          class="fund-item"
          @click="goToDetail(fund.code)"
          data-testid="fund-list-item"
        >
        <div class="fund-info">
          <div class="fund-name">{{ fund.name }}</div>
          <div class="fund-meta">
            <span class="fund-code">{{ fund.code }}</span>
            <van-tag plain size="medium" class="fund-type-tag">{{ fund.type }}</van-tag>
          </div>
        </div>
        <van-icon name="arrow" color="var(--text-tertiary)" />
      </div>

      <!-- 空状态 -->
      <van-empty
        v-if="!isLoading && filterResults.length === 0"
        image="search"
        description="没有找到符合条件的基金"
      />
    </div>

    <!-- 筛选面板（弹出层） -->
    <van-popup
      v-model:show="showFilterPanel"
      position="right"
      :style="{ width: '80%', height: '100%' }"
    >
      <div class="filter-panel">
        <div class="panel-header">
          <span class="panel-title">筛选条件</span>
          <van-icon name="cross" size="20" @click="closeFilterPanel" />
        </div>

        <div class="panel-content">
          <!-- 基金类型 -->
          <div class="filter-section">
            <div class="section-title">基金类型</div>
            <div class="section-options">
              <van-checkbox
                v-for="opt in fundTypeOptions"
                :key="opt.value"
                v-model="filters.type"
                :name="opt.value"
                shape="square"
              >
                {{ opt.label }}
              </van-checkbox>
            </div>
          </div>

          <!-- 基金公司 -->
          <div class="filter-section">
            <div class="section-title">基金公司（关键词）</div>
            <van-field
              v-model="filters.fundCompany"
              placeholder="输入基金公司名称关键词"
              clearable
            />
          </div>

          <!-- 晨星评级 -->
          <div class="filter-section">
            <div class="section-title">晨星评级</div>
            <van-radio-group v-model="filters.minRating">
              <van-radio
                v-for="opt in ratingOptions"
                :key="opt.value"
                :name="opt.value"
              >
                {{ opt.label }}
              </van-radio>
            </van-radio-group>
          </div>

          <!-- 排序方式 -->
          <div class="filter-section">
            <div class="section-title">排序方式</div>
            <div class="section-options">
              <van-radio-group v-model="filters.sortBy">
                <van-radio
                  v-for="opt in sortOptions"
                  :key="opt.value"
                  :name="opt.value"
                >
                  {{ opt.label }}
                </van-radio>
              </van-radio-group>
            </div>
            <div class="sort-order-toggle">
              <van-button
                size="small"
                :type="filters.sortOrder === 'desc' ? 'primary' : 'default'"
                @click="filters.sortOrder = 'desc'"
              >
                降序
              </van-button>
              <van-button
                size="small"
                :type="filters.sortOrder === 'asc' ? 'primary' : 'default'"
                @click="filters.sortOrder = 'asc'"
              >
                升序
              </van-button>
            </div>
          </div>

          <!-- 日期范围 -->
          <div class="filter-section">
            <div class="section-title">收益日期范围</div>
            <van-radio-group v-model="filters.dateRange">
              <van-radio
                v-for="opt in dateRangeOptions"
                :key="opt.value"
                :name="opt.value"
              >
                {{ opt.label }}
              </van-radio>
            </van-radio-group>
          </div>
        </div>

        <div class="panel-footer">
          <van-button block type="default" @click="resetFilters">
            重置
          </van-button>
          <van-button block type="primary" @click="applyFilters(); closeFilterPanel()">
            确定（{{ filterResults.length }}只）
          </van-button>
        </div>
      </div>
    </van-popup>
  </div>
</template>

<style scoped>
.fund-screener-page {
  min-height: 100vh;
  background: var(--bg-primary);
}

/* ========== 搜索栏 ========== */
.search-bar {
  padding: 8px 12px;
  background: var(--bg-secondary);
}

/* ========== 快捷筛选标签 ========== */
.quick-filters {
  padding: 8px 12px;
  background: var(--bg-secondary);
  border-bottom: 1px solid var(--border-color, #ebedf0);
}

.filter-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.filter-tags .van-tag {
  cursor: pointer;
  padding: 4px 12px;
}

.filter-tags .van-tag.active {
  background: #1989fa;
  color: white;
}

/* ========== 排序栏 ========== */
.sort-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 16px;
  background: var(--bg-secondary);
  border-bottom: 1px solid var(--border-color, #ebedf0);
}

.sort-options {
  display: flex;
  gap: 16px;
}

.sort-option {
  font-size: 13px;
  color: var(--text-secondary);
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 4px;
}

.sort-option.active {
  color: #1989fa;
  font-weight: 600;
}

.result-count {
  font-size: 12px;
  color: var(--text-tertiary);
}

/* ========== 筛选结果 ========== */
.filter-results {
  padding: 0 16px;
}

.loading {
  display: flex;
  justify-content: center;
  padding: 40px;
}

.fund-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 0;
  border-bottom: 1px solid var(--border-color, #ebedf0);
  cursor: pointer;
}

.fund-item:active {
  background: var(--bg-active, #f2f3f5);
}

.fund-info {
  flex: 1;
  min-width: 0;
}

.fund-name {
  font-size: 15px;
  color: var(--text-primary);
  font-weight: 500;
  margin-bottom: 4px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.fund-meta {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  color: var(--text-secondary);
}

.fund-code {
  font-family: 'DIN Alternate', 'Roboto Mono', monospace;
}

.fund-type-tag {
  font-size: 10px;
}

/* ========== 筛选面板 ========== */
.filter-panel {
  display: flex;
  flex-direction: column;
  height: 100%;
}

.panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px;
  border-bottom: 1px solid var(--border-color, #ebedf0);
}

.panel-title {
  font-size: 16px;
  font-weight: 600;
}

.panel-content {
  flex: 1;
  overflow-y: auto;
  padding: 16px;
}

.filter-section {
  margin-bottom: 24px;
}

.section-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
  margin-bottom: 12px;
}

.section-options {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.sort-order-toggle {
  display: flex;
  gap: 8px;
  margin-top: 12px;
}

.panel-footer {
  display: flex;
  gap: 12px;
  padding: 16px;
  border-top: 1px solid var(--border-color, #ebedf0);
}
</style>
