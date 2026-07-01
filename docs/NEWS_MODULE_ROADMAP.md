# millionFund 新闻资讯模块分析与改进路线图

**版本**: v0.1-draft  
**最后更新**: 2026-07-02  
**维护者**: ghshhf  
**状态**: 🟢 持续维护

---

> 本文档聚焦新闻资讯模块的问题诊断、架构缺陷和改进计划。

---

## 一、模块全景

### 1.1 两个冲突的新闻页面

当前项目存在**两个**新闻页面，功能重叠且数据结构不一致：

|  | News.vue | FinanceNews.vue |
|---|---------|----------------|
| **行数** | 919 行 | 538 行 |
| **数据源数** | 4 个（金十/财联社/雪球/Choice） | 12 个（全部数据源） |
| **交叉验证** | ❌ 无 | ✅ 有 |
| **搜索功能** | ❌ 无 | ❌ **无** |
| **TypeScript** | ✅ 完整类型定义 | ❌ `<script setup>` 无 TS |
| **i18n** | ✅ 完整 | ❌ 有硬编码中文 |
| **路由路径** | `/news` | `/finance-news` |
| **样式系统** | CSS 变量 | 硬编码颜色 |
| **状态** | 🟢 旧版，稳定 | 🟠 新版，不完整 |

### 1.2 数据源覆盖

| # | 数据源 | API 文件 | FinanceNews | News | 真实数据可用 |
|---|--------|---------|:-----------:|:----:|:----------:|
| 1 | 金十数据 | `jin10.ts` | ✅ | ✅ | ✅ |
| 2 | 财联社 | `cls.ts` | ✅ | ✅ | ⚠️ 部分 |
| 3 | 今日头条 | `toutiao.ts` | ✅ | ❌ | ❌ 反爬，全 mock |
| 4 | 新浪财经 | `sina.ts` | ✅ | ❌ | ❌ 全 mock |
| 5 | 网易财经 | `netease.ts` | ✅ | ❌ | ⚠️ 部分 mock |
| 6 | 腾讯财经 | `tencent.ts` | ✅ | ❌ | ❌ 全 mock |
| 7 | 雪球 | `xueqiu.ts` | ✅ | ✅ | ✅ |
| 8 | 东方财富 | `eastmoney.ts` | ✅ | ✅ | ⚠️ 部分 |
| 9 | 同花顺 | `10jqka.ts` | ✅ | ❌ | ❌ 全 mock |
| 10 | 证券时报 | `stcn.ts` | ✅ | ❌ | ❌ 全 mock |
| 11 | 中国证券报 | `csnews.ts` | ✅ | ❌ | ❌ 全 mock |
| 12 | 第一财经 | `yicai.ts` | ✅ | ❌ | ❌ 全 mock |

> 🔴 **8/12 数据源使用 mock 数据** — 交叉验证在假数据上匹配，结果毫无意义

### 1.3 类型定义现状

`src/types/news.ts` 中 `NewsSource` 只定义了 4 种来源：

```typescript
// 🔴 当前 —— 只有 4 个
export type NewsSource = 'jin10' | 'cailian' | 'xueqiu' | 'eastmoney'

// ✅ 应是 12 个
export type NewsSource = 'jin10' | 'cailian' | 'toutiao' | 'sina' | 'netease' 
  | 'tencent' | 'xueqiu' | 'eastmoney' | '10jqka' | 'stcn' | 'csnews' | 'yicai'
```

---

## 二、问题诊断

### 🔴 P0 — 阻塞性

| # | 问题 | 位置 | 原因 |
|---|------|------|------|
| N-01 | **搜索功能完全缺失** | `FinanceNews.vue` + `News.vue` | 两个新闻页面均**没有搜索框、搜索入口、搜索逻辑**。用户添加了 12 个数据源却无法用关键词过滤搜索结果 |
| N-02 | **两个新闻页面并存** | `News.vue` + `FinanceNews.vue` | 功能重复，路由冲突，用户混淆。旧页面 `/news` 有 i18n 和 TS，新页面 `/finance-news` 有交叉验证但没有 TS |
| N-03 | **交叉验证算法缺陷** | `FinanceNews.vue:313` | `extractKeywords` 只取前 3 个 ≥2 字符的词片段做匹配，导致 "A股三大指数上涨" 和 "A股市场低迷" 因为都含 "A股" 被匹配为同一新闻 |

### 🟠 P1 — 高优先级

| # | 问题 | 原因 |
|---|------|------|
| N-04 | **8/12 数据源返回 mock 数据** | 今日头条/新浪/腾讯/同花顺等有反爬，`try/catch` 后直接 fallback 到 `generateMockXxxNews()` |
| N-05 | **交叉验证去重太粗暴** | `title.substring(0, 20)` 截断前 20 字符去重，可能把完全不同的新闻误判为重复 |
| N-06 | **NewsSource 类型未更新** | `types/news.ts` 只定义 4 个源，但实际用了 12 个 |
| N-07 | **FinanceNews.vue 无 TypeScript** | 使用 `<script setup>` 而非 `<script setup lang="ts">`，与其他文件不一致 |
| N-08 | **无统一新闻数据模型** | 每个 API 文件定义自己的 `NewsItem` 接口，类型不统一 |
| N-09 | **FinanceNews 有硬编码中文** | 多处中文串未走 i18n（如第 87-98 行的 `sourceOptions`、提示文本） |

### 🟡 P2 — 中等优先级

| # | 问题 | 说明 |
|---|------|------|
| N-10 | **无新闻缓存** | 每次进入页面重新加载所有数据源，浪费带宽 |
| N-11 | **无分页加载** | FinanceNews 只展示 50 条，无法翻页 |
| N-12 | **无新闻分类筛选** | 只能按来源筛选，不能按主题/资产类别分类 |
| N-13 | **无已读/未读标记** | 看过和没看过的新闻没有区分 |
| N-14 | **新闻详情弹窗太简陋** | 只显示标题+摘要，无富文本、无图片、无原文 embed |
| N-15 | **FinanceNews 路由路径不规范** | `/finance-news` 应统一为 `/news` 或 `/news/cross` |

---

## 三、改进路线图

### 3.1 立即修复 (P0-P1，3-5 天)

| # | 任务 | 类型 | 工时 | 说明 |
|---|------|------|------|------|
| **N-01** | **添加搜索功能** | ✨ 功能 | 1d | FinanceNews 添加搜索框，前端实时过滤标题/摘要/来源 |
| **N-02** | **合并两个新闻页面** | 🏗 重构 | 1d | 保留 FinanceNews 的交叉验证，合并 News 的 i18n/TS 和子 Tab 结构 |
| **N-03** | **修复交叉验证算法** | 🐛 修复 | 4h | 改用 Jaccard 相似度 + TF 关键词加权，避免单关键词误匹配 |
| **N-06** | **更新 NewsSource 类型** | 🐛 修复 | 1h | 补全 12 个数据源到 `types/news.ts` |
| **N-07** | **FinanceNews 迁移到 TypeScript** | 🏗 重构 | 2h | 加 `lang="ts"`，补类型定义 |
| **N-09** | **i18n 补全** | 🌐 修复 | 2h | 迁移硬编码中文到语言包 |

#### 搜索功能实现方案

```typescript
// 在 FinanceNews.vue 中添加
const searchKeyword = ref('')
const searchResults = computed(() => {
  if (!searchKeyword.value.trim()) return newsList.value
  
  const kw = searchKeyword.value.trim().toLowerCase()
  return newsList.value.filter(news => {
    return (
      news.title.toLowerCase().includes(kw) ||
      news.summary.toLowerCase().includes(kw) ||
      news.source.toLowerCase().includes(kw)
    )
  })
})
```

```html
<!-- 搜索框 UI -->
<div class="search-bar">
  <van-search
    v-model="searchKeyword"
    :placeholder="t('finance_news.search_placeholder')"
    shape="round"
    clearable
  />
</div>
```

#### 交叉验证修复方案

```typescript
// 改进后的交叉验证 — 基于 Jaccard 相似度
function jaccardSimilarity(titleA: string, titleB: string): number {
  const tokensA = new Set(tokenize(titleA))
  const tokensB = new Set(tokenize(titleB))
  
  if (tokensA.size === 0 || tokensB.size === 0) return 0
  
  let intersection = 0
  for (const token of tokensA) {
    if (tokensB.has(token)) intersection++
  }
  
  const union = new Set([...tokensA, ...tokensB]).size
  return intersection / union
}

// 改进后的关键词提取 — 去停用词 + TF 加权
function tokenize(text: string): string[] {
  const stopWords = new Set([
    '今日', '昨日', '明日', '目前', '已经', '可能', '预计', '关于',
    '一个', '中国', '美国', '市场', '数据', '报告', '表示', '显示',
    'A股', '股市'  // 保留高价值词但降低权重
  ])
  
  return text
    .replace(/[，。！？、；：""''《》（）【】\s]/g, ' ')
    .split(' ')
    .filter(w => w.length >= 2 && !stopWords.has(w))
    .slice(0, 5)  // 取前5个关键词
}

// 交叉验证阈值：Jaccard ≥ 0.3 视为同一新闻
const CROSS_VALIDATION_THRESHOLD = 0.3
```

### 3.2 功能增强 (P1-P2，1-2 周)

| # | 任务 | 类型 | 工时 | 说明 |
|---|------|------|------|------|
| **N-04** | **数据源真实数据接入** | ✨ 功能 | 1w | 对 8 个 mock 数据源逐个分析反爬策略：RSS 替代、Capacitor 原生请求、第三方聚合 API |
| N-12 | **新闻分类筛选** | ✨ 功能 | 2d | 按类别（宏观/行业/加密/自选）和资产类别（基金/股票/加密）筛选 |
| N-10 | **新闻缓存** | 🚀 性能 | 1d | IndexedDB 缓存最近 200 条，LRU 淘汰策略 |
| N-11 | **分页加载** | ✨ 功能 | 1d | 无限滚动，每次加载 20 条 |

#### 数据源真实化方案

| 数据源 | 当前状态 | 改造方案 | 难度 |
|--------|---------|---------|------|
| 今日头条 | 全 mock | RSS 替代：`https://www.toutiao.com/hot-event/hot-board/` JSONP | 🟡 中 |
| 新浪财经 | 全 mock | RSS: `https://feed.mix.sina.com.cn/api/roll/get` | 🟢 低 |
| 腾讯财经 | 全 mock | RSS: `https://new.qq.com/ch/finance/` | 🟢 低 |
| 同花顺 | 全 mock | 改用东方财富 API 覆盖 | 🟡 中 |
| 证券时报 | 全 mock | 官网 RSS: `https://www.stcn.com/` | 🟢 低 |
| 中国证券报 | 全 mock | RSS: `https://www.cs.com.cn/` | 🟢 低 |
| 第一财经 | 全 mock | RSS: `https://www.yicai.com/` | 🟢 低 |

### 3.3 长期演进 (P2-P3，2-4 周)

| # | 任务 | 说明 |
|---|------|------|
| N-16 | **AI 资讯摘要** | 用本地 LLM 或 API 对长文生成一句话摘要 |
| N-17 | **自选资产关联资讯** | 根据持仓代码自动匹配相关新闻，标记"与你相关" |
| N-18 | **新闻时间线视图** | 按时间轴展示重大事件的可视化时间线 |
| N-19 | **WebSocket 实时推送** | 金十数据/财联社实时快讯走 WebSocket 而非轮询 |
| N-20 | **社交分享** | 一键分享新闻到微信/微博，生成分享卡片 |

---

## 四、合并方案：News + FinanceNews

### 4.1 建议路线

```
v1.10.x:  合并为统一的 /news 页面
  ├── 保留 FinanceNews 的 12 数据源 + 交叉验证
  ├── 迁移 News.vue 的 i18n + TS + 子 Tab 结构
  ├── 添加搜索功能
  └── 删除旧 News.vue

v1.11.x:  数据源真实化
  ├── 逐个替换 mock 数据为真实 API
  ├── 交叉验证在真实数据上运行
  └── 添加新闻缓存 + 分页

v2.0.x:   智能新闻引擎
  ├── AI 摘要
  ├── 自选资产关联
  └── WebSocket 实时推送
```

### 4.2 合并后页面结构

```
/news
├── 搜索框 (实时过滤)
├── 数据源选择器 [全部 | 金十 | 财联社 | ...] (Dropdown)
├── 分类筛选 [全部 | 快讯 | 市场 | 宏观 | 加密 | 自选]
├── 交叉验证开关
│
├── 新闻列表 (无限滚动)
│   ├── 标题 + 摘要 + 来源标签
│   ├── 交叉验证标记 (在X个来源中出现)
│   ├── 关联资产标记 (与你持有的XX相关)
│   └── 已读/未读状态
│
└── 新闻详情弹窗 (增强版)
    ├── 富文本正文
    ├── 交叉来源列表
    ├── 相关资产链接
    └── 分享按钮
```

---

## 五、附录：代码缺陷明细

### 5.1 FinanceNews.vue 硬编码字符串

| 行号 | 内容 | 应改为 i18n key |
|------|------|-----------------|
| 87-98 | `sourceOptions` 中的 `text` | `finance_news.source_xxx` |
| 12 | "当前来源" | `finance_news.current_source` |
| 13 | "新闻数量" | `finance_news.news_count` |
| 14 | "交叉验证: 已启用" | `finance_news.cross_validation_enabled` |
| 26 | "在X个来源中出现" | `finance_news.cross_count` |

### 5.2 各数据源 mock 数据占比

| API 文件 | 总行数 | Mock 数据行数 | Mock 占比 |
|---------|--------|-------------|----------|
| `toutiao.ts` | 91 | 40 | 44% |
| `sina.ts` | 96 | 45 | 47% |
| `tencent.ts` | 45 | 40 | 89% |
| `10jqka.ts` | 44 | 42 | 95% |
| `stcn.ts` | 44 | 42 | 95% |
| `csnews.ts` | 44 | 42 | 95% |
| `yicai.ts` | 44 | 42 | 95% |
| `netease.ts` | 95 | 40 | 42% |
| `eastmoney.ts` | 44 | 38 | 86% |

### 5.3 测试覆盖

| 文件 | 测试文件 | 覆盖情况 |
|------|---------|---------|
| `news.ts` | `news.test.ts` | 🟡 部分 |
| `FinanceNews.vue` | ❌ 无 | 🔴 |
| `toutiao.ts` / `sina.ts` 等 | ❌ 无 | 🔴 |

---

## 更新记录

| 日期 | 版本 | 变更 | 作者 |
|------|------|------|------|
| 2026-07-02 | v0.1 | 初稿 | ghshhf |

---

> 📝 **使用说明**：完成任务后 `[ ]` → `[x]`，新增想法按优先级插入对应章节
