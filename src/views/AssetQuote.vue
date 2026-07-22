<template>
  <div class="asset-page">
    <!-- 导航栏 -->
    <div class="page-header">
      <van-icon name="arrow-left" size="22" @click="router.back()" />
      <span class="header-title">{{ def ? def.label + '行情' : '行情' }}</span>
      <div style="width: 22px"></div>
    </div>

    <div class="scroll-content" v-if="def">
      <!-- 搜索框 -->
      <div class="search-bar">
        <van-search
          v-model="code"
          :placeholder="def.codeHint"
          shape="round"
          clearable
          @search="onSearch"
          data-testid="asset-search-input"
        />
        <van-button type="primary" size="small" round class="search-btn" @click="onSearch">查询</van-button>
      </div>

      <!-- 示例快捷填充 -->
      <div class="examples">
        <span
          v-for="ex in def.examples"
          :key="ex"
          class="example-chip"
          @click="code = ex; onSearch()"
        >{{ ex }}</span>
      </div>

      <!-- 加载态 -->
      <div v-if="isLoading" class="state-box">
        <van-loading size="24">查询中...</van-loading>
      </div>

      <!-- 错误态 -->
      <van-notice-bar v-else-if="errorMsg" :text="errorMsg" type="danger" />

      <!-- 空态 -->
      <van-empty v-else-if="!quote" :description="'输入' + def.label + '代码查询实时行情'" />

      <!-- 行情卡片 -->
      <div v-else class="quote-card" :class="quote.change >= 0 ? 'up' : 'down'">
        <div class="quote-head">
          <div class="quote-name">{{ quote.name }}</div>
          <div class="quote-symbol">{{ quote.symbol }}</div>
        </div>
        <div class="quote-price">
          <span class="price-value">{{ formatNum(quote.price) }}</span>
          <span class="price-currency">{{ quote.currency }}</span>
        </div>
        <div class="quote-change">
          <span>{{ quote.change >= 0 ? '+' : '' }}{{ formatNum(quote.change) }}</span>
          <span class="quote-pct">{{ quote.changePercent >= 0 ? '+' : '' }}{{ quote.changePercent.toFixed(2) }}%</span>
        </div>

        <div class="quote-grid">
          <div class="q-cell" v-if="quote.open"><span>今开</span><b>{{ formatNum(quote.open) }}</b></div>
          <div class="q-cell" v-if="quote.high"><span>最高</span><b>{{ formatNum(quote.high) }}</b></div>
          <div class="q-cell" v-if="quote.low"><span>最低</span><b>{{ formatNum(quote.low) }}</b></div>
          <div class="q-cell" v-if="quote.prevClose"><span>昨收</span><b>{{ formatNum(quote.prevClose) }}</b></div>
          <div class="q-cell" v-if="quote.volume"><span>成交量</span><b>{{ formatVol(quote.volume) }}</b></div>
          <div class="q-cell" v-if="quote.amount"><span>成交额</span><b>{{ formatVol(quote.amount) }}</b></div>
        </div>

        <div class="quote-extra" v-if="quote.extra && Object.keys(quote.extra).length">
          <div class="extra-row" v-for="(val, key) in quote.extra" :key="key">
            <span>{{ key }}</span><b>{{ val }}</b>
          </div>
        </div>
      </div>
    </div>

    <!-- 不支持的资产类型 -->
    <van-empty v-else description="不支持的资产类型" />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { showToast } from 'vant'
import { ASSET_REGISTRY, type NormalizedQuote } from '@/api/assetRegistry'

const route = useRoute()
const router = useRouter()

const type = computed(() => String(route.params.type || ''))
const def = computed(() => ASSET_REGISTRY[type.value] || null)

const code = ref('')
const quote = ref<NormalizedQuote | null>(null)
const isLoading = ref(false)
const errorMsg = ref('')

function formatNum(n: number): string {
  return n.toLocaleString('zh-CN', { maximumFractionDigits: 4 })
}

function formatVol(n: number): string {
  if (n >= 1e8) return (n / 1e8).toFixed(2) + '亿'
  if (n >= 1e4) return (n / 1e4).toFixed(2) + '万'
  return String(n)
}

async function onSearch() {
  if (!def.value) return
  const c = code.value.trim()
  if (!c) {
    showToast('请输入代码')
    return
  }
  isLoading.value = true
  errorMsg.value = ''
  quote.value = null
  try {
    const q = await def.value.fetchQuote(c)
    if (!q) {
      errorMsg.value = '未查询到行情数据，请检查代码或稍后重试'
    } else {
      quote.value = q
    }
  } catch (err) {
    errorMsg.value = '查询失败：网络异常，请稍后重试'
    console.error('[AssetQuote] 查询失败', err)
  } finally {
    isLoading.value = false
  }
}

onMounted(() => {
  // 进入页面时若注册表有示例，自动带入第一个示例方便演示
  if (def.value && def.value.examples.length && !code.value) {
    code.value = def.value.examples[0]!
  }
})
</script>

<style scoped>
.asset-page {
  height: 100%;
  background: var(--bg-primary, #f5f5f5);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.page-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  background: var(--bg-primary, #f5f5f5);
  border-bottom: 1px solid var(--border-color, #eee);
  padding-top: max(12px, env(safe-area-inset-top, 0px));
}
.header-title { font-size: 18px; font-weight: 600; color: var(--text-primary, #333); }
.scroll-content { flex: 1; overflow-y: auto; padding: 12px 16px 40px; }

.search-bar { display: flex; align-items: center; gap: 8px; }
.search-bar :deep(.van-search) { flex: 1; padding: 0; background: transparent; }
.search-btn { flex-shrink: 0; }

.examples { display: flex; flex-wrap: wrap; gap: 8px; margin: 12px 0; }
.example-chip {
  padding: 6px 12px; border-radius: 14px; font-size: 12px;
  background: var(--bg-card, #fff); border: 1px solid var(--border-color, #eee);
  color: var(--text-secondary, #666); cursor: pointer;
}

.state-box { display: flex; justify-content: center; padding: 48px 0; }

.quote-card {
  margin-top: 12px; padding: 20px; border-radius: 14px;
  background: var(--bg-card, #fff); border: 1px solid var(--border-color, #eee);
  border-left: 4px solid #999;
}
.quote-card.up { border-left-color: #e4393c; }
.quote-card.down { border-left-color: #1db82c; }

.quote-head { display: flex; align-items: baseline; gap: 10px; margin-bottom: 12px; }
.quote-name { font-size: 18px; font-weight: 700; color: var(--text-primary, #333); }
.quote-symbol { font-size: 13px; color: var(--text-muted, #999); }

.quote-price { display: flex; align-items: baseline; gap: 4px; margin-bottom: 6px; }
.price-value { font-size: 30px; font-weight: 800; font-variant-numeric: tabular-nums; }
.quote-card.up .price-value { color: #e4393c; }
.quote-card.down .price-value { color: #1db82c; }
.price-currency { font-size: 14px; color: var(--text-secondary, #666); }

.quote-change { font-size: 15px; font-weight: 600; font-variant-numeric: tabular-nums; }
.quote-card.up .quote-change { color: #e4393c; }
.quote-card.down .quote-change { color: #1db82c; }
.quote-pct { margin-left: 10px; }

.quote-grid {
  display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 12px;
  margin-top: 16px; padding-top: 16px; border-top: 1px solid var(--border-color, #eee);
}
.q-cell { display: flex; flex-direction: column; gap: 4px; }
.q-cell span { font-size: 12px; color: var(--text-muted, #999); }
.q-cell b { font-size: 14px; font-weight: 600; color: var(--text-primary, #333); font-variant-numeric: tabular-nums; }

.quote-extra { margin-top: 14px; padding-top: 14px; border-top: 1px solid var(--border-color, #eee); }
.extra-row { display: flex; justify-content: space-between; font-size: 13px; padding: 4px 0; }
.extra-row span { color: var(--text-muted, #999); }
.extra-row b { color: var(--text-secondary, #666); font-weight: 500; }
</style>
