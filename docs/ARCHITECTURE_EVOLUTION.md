# millionFund 底层架构分析与演进路线

**版本**: v0.1-draft  
**最后更新**: 2026-07-02  
**维护者**: ghshhf  
**状态**: 🟢 持续维护

---

> 本文档聚焦底层基础设施的技术债、跨模块问题和架构演进方向。  
> 与 `ARCHITECTURE_v2.md` 互补：ARCHITECTURE_v2 描述目标架构，本文记录当前差距和演进路径。

---

## 一、整体技术债画像

### 1.1 代码规模全景

| 层级 | 行数 | 文件数 | 健康度 |
|------|------|--------|--------|
| **Views** (页面) | ~18,000 | 28 .vue | 🟠 `Home.vue` 3,251 行超大 |
| **API** (数据层) | ~10,000 | 35 .ts | 🟠 `fundFast.ts` 1,593 行超大 |
| **Stores** (状态) | ~2,500 | 12 .ts | 🟢 合理 |
| **Components** (组件) | ~3,000 | 11 .vue | 🟢 合理 |
| **Composables** (逻辑) | ~1,000 | 6 .ts | 🟢 合理 |
| **Utils** (工具) | ~3,000 | 15 .ts | 🟢 合理 |
| **Types** (类型) | ~500 | 10 .ts | 🟡 部分过时 |
| **Styles** (样式) | ~1,500 | 3 .css | 🟢 OK |
| **Config** (配置) | ~200 | 4 .ts | 🟢 OK |
| **测试** | ~7,000 | 72 .test.ts | 🟢 覆盖率 60.73% |
| **总计** | **~44,000** | **183 文件** | |

### 1.2 跨模块问题总表

| # | 问题 | 影响范围 | 严重度 | 类型 |
|---|------|---------|--------|------|
| A-01 | **Home.vue 3,251 行超大** | 首页维护性 | 🔴 P0 | 代码拆分 |
| A-02 | **fundFast.ts 1,593 行超大** | 基金数据层 | 🔴 P0 | 代码拆分 |
| A-03 | **两个冲突的新闻页面** | 新闻模块 | 🔴 P0 | 代码合并 |
| A-04 | **NewsSource 类型过时 (4→12)** | 类型安全 | 🟠 P1 | 类型更新 |
| A-05 | **多个 UI 层未走 i18n** | 国际化 | 🟠 P1 | i18n 补全 |
| A-06 | **TypeScript strict 模式有例外** | 类型安全 | 🟠 P1 | 已修复但需维护 |
| A-07 | **测试覆盖率低于 70%** | 质量保障 | 🟠 P1 | 测试补充 |
| A-08 | **IndexedDB 替代 localStorage** | 存储容量 | 🟡 P2 | 存储升级 |
| A-09 | **无统一的构建时环境变量** | 跨平台 | 🟡 P2 | 配置统一 |
| A-10 | **无 E2E CRUD 测试** | 质量保障 | 🟡 P2 | 测试补充 |

---

## 二、架构差距分析

### 2.1 目标 vs 现状对比

对照 `ARCHITECTURE_v2.md` 的目标设计：

| 架构目标 | 目标描述 | 当前状态 | 差距 |
|---------|---------|---------|------|
| 统一资产数据模型 `UnifiedHolding` | 单个接口覆盖所有资产类别 | ❌ 7 个独立类型文件 | 大 |
| `portfolio` store | 资产汇总计算 | ❌ 仍在 `holding.ts` 中 | 中 |
| `news` store | 资讯聚合独立状态管理 | ❌ 直接在组件中加载 | 中 |
| `market` store | 行情中心独立状态管理 | ❌ 无独立行情 store | 中 |
| 汇率转换层 | CNY/USD/HKD → CNY 统一汇总 | ❌ 无 | 大 |
| 按资产类别的盈亏分组 | `byAssetClass` 分组汇总 | ⚠️ 部分 | 中 |
| IndexedDB 持久化 | 替代 localStorage | ❌ 仍用 localStorage | 中 |
| WebSocket 实时推送 | 金十/财联社走 WebSocket | ❌ 全 HTTP 轮询 | 大 |

### 2.2 数据流架构问题

当前数据流存在**分层不清**的问题：

```
🔴 当前：组件直调 API
Home.vue → fundFast.fetchBatchFundEstimate() → 直接渲染
        → jin10.fetchFlashNews() → 直接渲染
        → cls.fetchClsTelegram() → 直接渲染

✅ 目标：分层清晰
Home.vue → portfolioStore.loadDashboard() 
          → fundStore.fetchEstimates()     → fundFast
          → newsStore.fetchHighlights()    → news.ts
          → marketStore.fetchIndices()     → eastmoney
          
          portfolioStore 负责合并汇总
          Home.vue 只做渲染
```

---

## 三、演进路线图

### 3.1 Phase 1 — 代码拆分与清理 (v1.10.x)

| # | 任务 | 工时 | 优先级 | 涉及文件 |
|---|------|------|--------|---------|
| A-01 | Home.vue 拆分为 5-8 个子组件 | 2d | P0 | `Home.vue` |
| A-02 | fundFast.ts 按功能拆分 5 模块 | 2d | P0 | `api/fundFast.ts` |
| A-03 | 合并 News.vue + FinanceNews.vue | 1d | P0 | `views/News.vue`, `views/FinanceNews.vue` |
| A-04 | 更新 NewsSource 类型 | 1h | P1 | `types/news.ts` |
| A-06 | TypeScript strict 例外清零 | 1d | P1 | 全局 |
| A-05 | i18n 硬编码清零扫尾 | 1d | P1 | Views/Components |

#### Home.vue 拆分方案

```
Home.vue (3,251行) → 首页容器
├── DashboardSummary.vue      # 资产总览卡片 (总资产/今日盈亏)
├── AssetAllocationChart.vue  # 资产分配图 (饼图/条形图)
├── WatchlistSection.vue      # 自选列表 (含估值刷新)
├── MarketOverview.vue        # 市场概览 (指数行情)
├── NewsFlashSection.vue      # 资讯快讯摘要
└── QuickActionsBar.vue       # 快捷操作 (搜索/导入/刷新)
```

### 3.2 Phase 2 — 数据层统一 (v1.11.x)

| # | 任务 | 工时 | 优先级 |
|---|------|------|--------|
| 统一资产数据模型 | 2d | P1 |
| Portfolio store 拆分 | 1d | P1 |
| News store 创建 | 1d | P1 |
| 汇率转换层 | 1d | P1 |
| IndexedDB 迁移 | 2d | P2 |
| 缓存版本化 | 1d | P1 |

#### Store 拆分方案

```
当前:
stores/
├── fund.ts        # 自选管理 + 估值刷新 (职责过多)
├── holding.ts     # 持仓 CRUD + 盈亏计算 (职责过多)

目标:
stores/
├── portfolio.ts   # 资产汇总计算 (新)
├── fund.ts        # 自选管理 (缩减)
├── holding.ts     # 持仓 CRUD (缩减)
├── news.ts        # 资讯状态 (新)
├── market.ts      # 行情状态 (新)
├── alerts.ts      # 涨跌提醒 (已有)
├── trade.ts       # 交易记录 (已有)
├── theme.ts       # 主题 (已有)
└── network.ts     # 网络状态 (已有)
```

### 3.3 Phase 3 — 平台化 (v2.0.x)

| # | 任务 | 工时 | 优先级 |
|---|------|------|--------|
| WebSocket 实时推送 | 3d | P2 |
| 离线模式 (PWA 完整) | 2d | P2 |
| Electron 多窗口 | 3d | P3 |
| 资产数据导入/导出 | 1d | P2 |
| 用户反馈系统 | 2d | P3 |

---

## 四、数据存储演进

### 4.1 当前存储方案

| 数据类型 | 存储方式 | 容量限制 | 问题 |
|---------|---------|---------|------|
| 持仓记录 | localStorage | ~5MB | 数据多时可能超限 |
| 缓存数据 | Map (内存) | 无上限 | 页面刷新丢失 |
| 缓存持久化 | localStorage + TTL | ~5MB | 共享空间，可能覆盖 |
| i18n 语言选择 | localStorage | 小 | OK |
| 主题设置 | localStorage | 小 | OK |

### 4.2 目标存储方案

```typescript
// 存储分层
interface StorageTier {
  memory: Map<string, { data: any; ttl: number }>   // 热数据 (Session)
  indexedDB: IDBDatabase                             // 温数据 (持久化)
  localStorage: Storage                              // 冷数据 (配置)
}

// 具体分配
const storageMapping = {
  // IndexedDB (大容量，结构化)
  news_cache:        { tier: 'indexedDB', ttl: '30min', maxItems: 200 },
  netvalue_history:  { tier: 'indexedDB', ttl: '1d' },
  fund_list:         { tier: 'indexedDB', ttl: '1d' },
  
  // Memory (热数据，快速访问)
  estimate:          { tier: 'memory', ttl: '30s' },
  batch_estimate:    { tier: 'memory', ttl: '15s' },
  
  // localStorage (配置项)
  holdings:          { tier: 'localStorage' },
  theme:             { tier: 'localStorage' },
  language:          { tier: 'localStorage' },
  alert_rules:       { tier: 'localStorage' },
  trade_records:     { tier: 'localStorage' },
}
```

---

## 五、跨平台构建架构

### 5.1 当前架构

```
Vite Build → dist/
├── Web (GitHub Pages)
├── Capacitor Sync → Android (Gradle)
├── Capacitor Sync → iOS (Xcode)
└── Electron Builder → Windows/macOS/Linux
```

### 5.2 构建问题

| 问题 | 当前状态 | 影响 |
|------|---------|------|
| Android 构建需本地 keystore | 已生成 `android/keystore.jks` | CI 需安全传递 |
| 环境变量管理 | `.env.example` 存在，无自动化 | 新开发者配置困难 |
| iOS 构建 | 需 macOS CI runner | CI 成本高 |
| APK 分发 | GitHub Releases + 应用内下载 | 无法自动更新 |

### 5.3 改进方案

```yaml
# 目标 CI 流程
on: [push, tag]
jobs:
  test:        # ✅ 已有
  build-web:   # ✅ 已有
  build-android:  # ✅ 已有
    ├── 签名 (CI secrets → keystore)
    ├── 构建 APK + AAB
    └── 上传到 Release (tag) 或 Artifact (push)
  
  build-ios:  # 🔴 需 macOS runner
  build-desktop:  # ✅ 已有
  
  deploy:     # 🆕 新增
    └── 发布到 GitHub Pages / 更新 Release notes
```

---

## 六、技术栈演进建议

| 组件 | 当前版本 | 考虑升级 | 时机 | 原因 |
|------|---------|---------|------|------|
| Vite | 7.x | 保持 | — | 最新 |
| Vue | 3.5 | 3.6+ | v2.0 | 等正式版 |
| TypeScript | 5.9 | 保持 | — | 最新 |
| Vant | 4.9 | 4.x 保持 | — | 稳定 |
| Pinia | 3.x | 保持 | — | 最新 |
| Capacitor | 7.x | 保持 | — | 最新 |
| Tesseract.js | 4.x | 替换为 PaddleOCR.js | v2.0 | 中文 OCR 准确率差异大 |
| Lightweight Charts | 5.x | 保持 | — | 稳定 |
| Electron | 42.x | 保持 | — | 最新 |

---

## 七、测试架构

### 7.1 当前覆盖

```
测试架构:
├── 单元测试: Vitest + Happy-DOM (576+ 用例)
│   ├── API 层: 各数据源独立测试
│   ├── Store: fund/holding/alerts/theme/network 等
│   ├── Utils: format/logger/ocr/storage/statistics 等
│   ├── Types: error 类型测试
│   └── Components: TrendPrediction/Dividend/Announcement 等
│
├── E2E 测试: Playwright (POM 模式)
│   ├── fund-add.spec.ts (18 用例)
│   └── portfolio 测试
│
└── 覆盖率: 60.73%
```

### 7.2 覆盖缺口

| 测试类型 | 目标覆盖 | 当前 | 缺口 |
|---------|---------|------|------|
| 单元测试行覆盖率 | 75% | 60.73% | -15% |
| E2E 核心流程 | 100% | ~30% | -70% |
| 组件测试 | 100% | ~40% | -60% |
| API Mock 测试 | 100% | ~50% | -50% |

### 7.3 E2E 测试扩展计划

```
e2e/
├── fund-add.spec.ts          # ✅ 已有 (18 用例)
├── fund-search.spec.ts       # ❌ 待补充
├── fund-detail.spec.ts       # ❌ 待补充
├── news-cross-validate.spec.ts # ❌ 待补充
├── holding-crud.spec.ts      # ❌ 待补充
├── alert-system.spec.ts      # ❌ 待补充
├── ocr-import.spec.ts        # ❌ 待补充 (复杂，依赖 Tesseract)
├── portfolio-view.spec.ts    # ❌ 待补充
├── multi-asset-display.spec.ts # ❌ 待补充
├── i18n-switch.spec.ts       # ❌ 待补充
└── offline-mode.spec.ts      # ❌ 待补充 (PWA)
```

---

## 八、安全架构

### 8.1 当前安全措施

| 措施 | 状态 | 说明 |
|------|------|------|
| CSP 安全头 | ✅ | 已配置，移除 `new Function` |
| JSONP 清零 | ✅ | 所有接口换 fetch + 正则 |
| TypeScript strict | ✅ | 全量通过 |
| OCR 无全局泄露 | ✅ | `__lastOcrData` 需确认是否清理 |
| 持仓数据本地存储 | ✅ | 不上传服务器 |
| Capacitor allowNavigation | ✅ | 限制可访问域名 |

### 8.2 安全增强计划

| # | 措施 | 优先级 | 说明 |
|---|------|--------|------|
| S-01 | 依赖版本审计 | P1 | `npm audit` 定期检查 |
| S-02 | SRI 完整性校验 | P2 | CDN 加载的 WASM/JS 加 integrity |
| S-03 | 敏感数据清理验证 | P1 | OCR 图片 Base64 用完释放 |
| S-04 | CI 安全扫描 | P2 | 加入 CodeQL 或 Trivy |
| S-05 | Android 混淆确认 | P2 | `android/keystore.jks` 验证有效期 |
| S-06 | 隐私政策合规 | P2 | 数据不收集、不分享的声明 |

---

## 更新记录

| 日期 | 版本 | 变更 | 作者 |
|------|------|------|------|
| 2026-07-02 | v0.1 | 初稿 | ghshhf |

---

> 📝 **使用说明**：完成任务后 `[ ]` → `[x]`，新增想法按优先级插入对应章节
