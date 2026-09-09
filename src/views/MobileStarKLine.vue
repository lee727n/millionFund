<script setup lang="ts">
// [WHY] 手机版专属的星标K线页：手机上原来只能从「趋势行情 → 全景面板」绕进去，没有直达入口
// [WHAT] 顶部只留「返回 + 标题 + 数量 + 基准 + 刷新」和「周期切换」两行（含安全区），其余全给 K 线
// [HOW] 列表 / 按账户排序 / 周期 / 估值口径 / 图表绘制 全部复用 StarKLinePanel ——
//       就是全景大屏第二列那个组件。本页只负责「手机尺寸的壳 + 自己的头部」，不复制任何业务逻辑。
// [NOTE] columns=2：一行两个图，和全景大屏第二列完全一致的排布
// [NOTE] aspect-ratio 4/3（全景是 16/10）：手机上卡片只有 186px 宽，按 16/10 是一张 116px 高的扁条，
//       信息条一行塞不下「名称 + 涨跌幅 + 累计涨幅」会压字。拉高到 4/3 后 MiniKLineChart 会自动
//       切成两行信息条（基金名独占一行），既不挡也更好读。
// [NOTE] show-detail=false：手机上不要「放大」按钮，右上角只留一个「移除」

import { ref } from 'vue'
import { useRouter } from 'vue-router'
import StarKLinePanel from '@/components/StarKLinePanel.vue'

const router = useRouter()

const klinePeriod = ref<'1m' | '3m' | '6m' | '1y'>('3m')

const periodTabs = [
  { key: '1m' as const, label: '1月' },
  { key: '3m' as const, label: '3月' },
  { key: '6m' as const, label: '6月' },
  { key: '1y' as const, label: '1年' },
]
</script>

<template>
  <div class="msk-page">
    <div class="msk-panel">
      <StarKLinePanel
        v-model:period="klinePeriod"
        :columns="2"
        color-scheme="auto"
        :show-market-value="false"
        :show-detail="false"
        aspect-ratio="4 / 3"
      >
        <!--
          [WHAT] 用 #toolbar 插槽顶掉组件自带工具条，换成手机版的头部：
                 第一行 = 返回 + 标题 + 数量 + 估值基准 + 刷新
                 第二行 = 4 个等宽周期按钮（手机上好点）
          [WHY] 插槽内容编译在本页作用域，所以下面 scoped 样式直接生效，不用 :deep
        -->
        <template #toolbar="{ count, valueBasis, forceRefresh }">
          <div class="msk-title">
            <button class="msk-back" @click="router.back()" aria-label="返回">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M15 18l-6-6 6-6" />
              </svg>
            </button>
            <span class="msk-title-text">星标K线</span>
            <span v-if="count" class="msk-badge">{{ count }}</span>
            <span v-if="valueBasis" class="msk-basis" :class="valueBasis === '估值' ? 'est' : 'nav'">
              {{ valueBasis }}
            </span>
            <span class="msk-spacer"></span>
            <button class="msk-refresh" @click="forceRefresh" title="刷新">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M21 12a9 9 0 11-9-9c2.52 0 4.93 1 6.74 2.74L21 8" />
                <path d="M21 3v5h-5" />
              </svg>
            </button>
          </div>

          <div class="msk-seg">
            <button
              v-for="t in periodTabs"
              :key="t.key"
              class="msk-seg-btn"
              :class="{ active: klinePeriod === t.key }"
              @click="klinePeriod = t.key"
            >{{ t.label }}</button>
          </div>
        </template>
      </StarKLinePanel>
    </div>
  </div>
</template>

<style scoped>
/* [WHAT] 页面铺满、不整页滚动 —— 滚动交给 StarKLinePanel 内部的 .skp-body */
.msk-page {
  height: 100%;
  display: flex;
  flex-direction: column;
  background: var(--bg-primary);
  overflow: hidden;
}

.msk-panel {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

/* ========== 头部第一行 ========== */
/* [WHY] padding-top 取「iOS 安全区」和 Capacitor 注入的 --status-bar-height 的较大值 */
.msk-title {
  display: flex;
  align-items: center;
  gap: 6px;
  height: 44px;
  padding: 0 10px;
  padding-top: max(env(safe-area-inset-top, 0px), var(--status-bar-height, 0px));
  box-sizing: content-box;
  background: var(--bg-secondary);
  border-bottom: 1px solid var(--border-light);
  flex-shrink: 0;
}

.msk-back {
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: none;
  border: none;
  color: var(--text-primary);
  cursor: pointer;
  padding: 0;
  margin-left: -6px;
  border-radius: 8px;
  flex-shrink: 0;
}
.msk-back:active { background: var(--bg-tertiary); }

.msk-title-text {
  font-size: 15px;
  font-weight: 700;
  color: var(--text-primary);
  letter-spacing: 0.5px;
  flex-shrink: 0;
}

.msk-badge {
  font-size: 11px;
  font-weight: 600;
  color: var(--primary-color);
  background: var(--bg-tertiary);
  padding: 1px 7px;
  border-radius: 8px;
  flex-shrink: 0;
}

.msk-basis {
  font-size: 10px;
  padding: 1px 6px;
  border-radius: 4px;
  border: 1px solid var(--border-light);
  color: var(--text-secondary);
  flex-shrink: 0;
}
.msk-basis.est { color: #f0a020; border-color: rgba(240, 160, 32, 0.4); }
.msk-basis.nav { color: #12b886; border-color: rgba(18, 184, 134, 0.4); }

.msk-spacer { flex: 1; }

.msk-refresh {
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: none;
  border: none;
  border-radius: 8px;
  color: var(--text-secondary);
  cursor: pointer;
  padding: 0;
  flex-shrink: 0;
}
.msk-refresh:active { background: var(--bg-tertiary); color: var(--primary-color); }

/* ========== 头部第二行：周期切换 ========== */
.msk-seg {
  display: flex;
  gap: 4px;
  padding: 6px 10px;
  background: var(--bg-secondary);
  border-bottom: 1px solid var(--border-light);
  flex-shrink: 0;
}

.msk-seg-btn {
  flex: 1;
  height: 30px;
  border: 1px solid var(--border-light);
  background: var(--bg-tertiary);
  color: var(--text-secondary);
  font-size: 12px;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.15s;
}

.msk-seg-btn.active {
  background: var(--primary-color);
  border-color: var(--primary-color);
  color: #fff;
  font-weight: 600;
}

/* ========== 图表区：手机上间距收紧 ========== */
/* [WHY] 底部安全区 App.vue 的 .app-container 已经统一加过了，这里再加会多出一截空白 */
:deep(.skp-grid) { gap: 6px; }
:deep(.skp-body) { padding: 6px; }
</style>
