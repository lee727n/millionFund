# millionFund 未来架构与改进路线图

**版本**: v0.1-draft  
**最后更新**: 2026-07-02  
**维护者**: ghshhf  
**状态**: 🟢 持续维护，欢迎补充

---

> 本文档记录未来计划中的架构改进、功能增强和技术债务清除任务。  
> 每个条目标注优先级（P0-P3）和状态（待规划/待实现/进行中/已完成）。  
> 这是一个**活文档**，请随项目迭代持续更新。

---

## 目录

1. [拍照识图 OCR 专项优化](#一拍照识图-ocr-专项优化)
2. [资产数据层扩展](#二资产数据层扩展)
3. [UI/UX 体验改进](#三uiux-体验改进)
4. [性能与工程化](#四性能与工程化)
5. [安全加固](#五安全加固)
6. [版本规划时间线](#六版本规划时间线)
7. [附录：当前架构局限分析](#七附录当前架构局限分析)

---

## 一、拍照识图 OCR 专项优化

> 🔴 **当前痛点**：Tesseract.js 仅用 `'eng'` 识别中文截图，无图像预处理，识别率低，尤其对支付宝/天天基金等深色界面截图效果差。

### 1.1 立即修复（P0，1-2天）

| # | 问题 | 当前代码 | 修复方案 | 预期效果 |
|---|------|---------|---------|---------|
| 1 | **语言包只加载了英文** | `src/utils/ocr.ts:86` — `recognize(imageSource, 'eng', ...)` | 改为 `'chi_sim+eng'`（中文简+英文混合） | 中文字符识别率从~30%提升至~80% |
| 2 | **无图像预处理管道** | 原始图片直接送 Tesseract | 加入 Canvas 预处理：灰度化 → 自适应阈值 → 去噪 → 缩放 | 低光照/模糊截图识别率提升 2-3 倍 |
| 3 | **每次调用创建新 Worker** | 每次 `recognizeText` 新建 Worker | 实现 Worker 池（单例复用），懒加载语言数据 | 二次调用速度提升 10x |

**实现要点**：

```typescript
// 改进后的调用方式
const result = await worker.recognize(imageSource, 'chi_sim+eng', {
  logger: makeLogger(),
  // Tesseract.js 可调参数
  tessedit_pageseg_mode: '6',   // 假设为统一文本块
  tessedit_char_whitelist: '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz一二三四五六七八九十百千万亿%.-/¥$',
})
```

```typescript
// Canvas 预处理管道
function preprocessImage(imageSource: File | string): Promise<string> {
  const img = await loadImage(imageSource)
  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')!
  
  // Step 1: 缩放到合理尺寸（OCR 最佳 ~300 DPI）
  const maxDim = 2000
  const scale = Math.min(maxDim / img.width, maxDim / img.height, 1)
  canvas.width = img.width * scale
  canvas.height = img.height * scale
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
  
  // Step 2: 灰度化
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
  grayscale(imageData.data)
  
  // Step 3: 自适应阈值（Otsu 或 Sauvola）
  adaptiveThreshold(imageData)
  
  // Step 4: 去噪（中值滤波或高斯模糊）
  medianFilter(imageData, 3)
  
  ctx.putImageData(imageData, 0, 0)
  return canvas.toDataURL('image/png')
}
```

### 1.2 功能增强（P1，1周）

| # | 功能 | 说明 | 优先级 |
|---|------|------|--------|
| 4 | **多平台截图适配模板** | 支付宝、天天基金、蛋卷基金、蚂蚁财富各有不同布局。为每个平台预置解析模板（基于坐标或关键词），而非通用正则匹配 | P1 |
| 5 | **截图质量实时反馈** | 拍照后分析图片清晰度（拉普拉斯方差检测模糊），模糊时提示用户重拍 | P1 |
| 6 | **OCR 失败重试 + 参数自适应** | 首次识别置信度低时，自动切换 PSM 模式重试（如从 `6` 切到 `3`） | P1 |
| 7 | **手动裁剪/增强工具** | 识别前允许用户在图片上框选区域，排除无关背景干扰 | P2 |

### 1.3 长期演进（P2-P3，2-4周）

| # | 方向 | 方案 | 对比评估 |
|---|------|------|---------|
| 8 | **替代引擎调研** | 对比 Tesseract.js vs **PaddleOCR.js**（百度，中文本地优化）vs **ML Kit**（Google，原生） | PaddleOCR 中文识别率最高但 WASM 包~15MB；ML Kit 仅 Capacitor 原生可用 |
| 9 | **端侧 AI 识别** | 用 ONNX Runtime Web 跑轻量 OCR 模型（如 PP-OCR mobile），摆脱 Tesseract 依赖 | 初期投入大，但长期准确率和速度最优 |
| 10 | **截图中多资产类别识别** | 当前只识别基金。扩展到识别 A 股持仓、加密货币持仓截图（如币安截图） | 依赖 P1 的多平台模板能力 |
| 11 | **批量导入 + 去重** | 多张截图连续识别、智能合并去重（按基金代码 + 日期），可选覆盖/跳过 | P2 |

### 1.4 替代方案对比总表

| 方案 | 中文识别率 | 包体积 | 首次加载 | 离线可用 | 开发成本 | 推荐场景 |
|------|-----------|--------|---------|---------|---------|---------|
| Tesseract.js (eng) 🟢 当前 | ~30% | ~3MB | 快 | ✅ | 低 | 🚫 不适用于中文截图 |
| Tesseract.js (chi_sim+eng) | ~80% | ~12MB | 中 | ✅ | 低 | **短期最优解** |
| PaddleOCR.js | ~95% | ~15MB | 慢 | ✅ | 中 | 中期目标 |
| ML Kit (原生) | ~90% | ~5MB | 快 | ✅ | 高（需原生代码） | Android/iOS 专用 |
| 自训练模型 (ONNX) | 可定制 | 可变 | 中 | ✅ | 高 | 长期目标 |

---

## 二、资产数据层扩展

### 2.1 统一资产数据模型（P1）

当前 `types/` 下有 7 个独立类型文件（`fund.ts`, `astock.ts`, `hkstock.ts`, `usstock.ts`, `crypto.ts`, `convertible.ts`, `future.ts`），API 层也有各自独立的实现。

**目标**：对齐 `ARCHITECTURE_v2.md` 中的统一模型设计

- [ ] 定义 `UnifiedHolding` 接口，覆盖所有资产类别
- [ ] 迁移 `stores/holding.ts` 使用统一类型
- [ ] 实现汇率转换层（CNY/USD/HKD → CNY 汇总）

### 2.2 新增数据源（P1-P2）

| 资产类别 | 数据源 | 优先级 | API 接入状态 |
|---------|--------|--------|-------------|
| **期货** | 东方财富期货 | P2 | `future.ts` 已接入 |
| **外汇** | 新浪外汇/Investing.com | P2 | `forex.ts` 已接入 |
| **国债收益率** | 中国债券信息网 | P3 | 待接入 |
| **宏观经济指标** | 国家统计局/金十数据 | P2 | 部分在金十数据中 |
| **区块链链上数据** | Glassnode（免费层级） | P3 | 待调研 |
| **北向资金流向** | 东方财富 | P1 | `choice.ts` 部分支持 |

### 2.3 缓存层升级（P2）

当前 `unifiedCache.ts` 已实现基础缓存。改进方向：

- [ ] IndexedDB 持久化（替代 localStorage，支持更大数据量）
- [ ] 增量更新策略（ETag / Last-Modified 头）
- [ ] 离线模式的"缓存优先"策略
- [ ] 缓存预加载（用户可能查看的资产）

---

## 三、UI/UX 体验改进

### 3.1 资产总览 Dashboard（P1）

按照 ARCHITECTURE_v2.md 的 Phase 1 计划：

- [ ] 首页顶部：总资产、今日盈亏、累计盈亏卡片
- [ ] 资产分配饼图/柱状图（双视图切换 — 已有雏形）
- [ ] 持仓列表按盈亏排序（红涨绿跌）
- [ ] 资产趋势图（7天/30天/90天 — 已有雏形）

### 3.2 OCR 体验优化（P1）

- [ ] 拍照后立即显示**裁剪预览**，允许用户框选持仓区域
- [ ] 识别过程中显示**实时文字覆层**（在图片上标出已识别的文字框）
- [ ] 识别完成后给出**信心分数**（哪些条目可靠，哪些可能需要手动核对）
- [ ] **一键重拍**：识别不满意可直接拍照替换，无需返回上级

### 3.3 国际化补充（P2）

当前已覆盖 15 View + 11 Component。剩余：

- [ ] OCR 组件 i18n：当前有多处中文字符串硬编码（见 `ScreenshotImport.vue` 第 442/462 行等）
- [ ] 行情页面英文适配
- [ ] 繁体中文支持（zh-TW/zh-HK）

### 3.4 更多 UI 改进

| # | 功能 | 优先级 |
|---|------|--------|
| 12 | **暗色模式增强**：当前已有 theme store，优化暗色模式下图表/OCR 预览对比度 | P2 |
| 13 | **Haptics 触感反馈**：拍照/导入/刷新操作增加振动反馈（Capacitor Haptics API） | P3 |
| 14 | **Pull-to-refresh 手势**：所有列表页统一下拉刷新 | P2 |
| 15 | **骨架屏加载**：数据未返回时显示骨架占位，减少白屏感 | P3 |
| 16 | **桌面端多窗口**：Electron 支持拆分窗口（行情窗口独立） | P3 |

---

## 四、性能与工程化

### 4.1 代码拆分（P1）

| # | 拆分目标 | 当前大小 | 拆分方案 | 优先级 |
|---|---------|---------|---------|--------|
| 17 | `src/api/fundFast.ts` | 1,593 行 | 按功能拆分：估值/净值/搜索/列表 | P1 |
| 18 | `src/utils/ocr.ts` | 607 行 | 拆为核心 OCR、文本解析引擎、名称匹配器 | P1 |
| 19 | `ScreenshotImport.vue` | 825 行 | 拆分逻辑到 composable + store | P2 |

### 4.2 测试覆盖

| # | 目标 | 当前 | 计划 |
|---|------|------|------|
| 20 | OCR 解析引擎覆盖 | 基础 mock 测试 | + 真实样本截图测试（存为测试 fixture） |
| 21 | API 测试覆盖 | 有单个模块测试 | + 集成测试（mock fetch） |
| 22 | E2E OCR 流程 | 无 | + Playwright 上传截图验证完整流程 |

OCR 测试样张计划：
```
tests/fixtures/
├── alipay-holdings.jpg      # 支付宝持仓截图
├── tiantian-fund.jpg        # 天天基金截图
├── danjuan-fund.jpg         # 蛋卷基金截图
├── blurry-screenshot.jpg    # 模糊图像（验证容错）
└── multi-line-holdings.jpg  # 多行复杂持仓
```

### 4.3 构建优化

| # | 措施 | 预期效果 |
|---|------|---------|
| 23 | OCR 语言包按需加载（chi_sim 约 10MB） | 减小首次安装包体积 |
| 24 | Vite 分包策略（Tesseract WASM 单独 chunk） | 减小主包，并行下载 |
| 25 | PWA 预缓存 OCR 语言包 | 离线环境可直接识别 |
| 26 | Android AAB 拆分（按语言） | Play Store 按需分发 |

---

## 五、安全加固

| # | 问题 | 当前状态 | 改进方案 | 优先级 |
|---|------|---------|---------|--------|
| 27 | OCR 图片数据残留 | 图片以 Base64 存于组件状态 | 识别完成后主动释放（`URL.revokeObjectURL` + 清空变量） | P1 |
| 28 | Tesseract WASM 加载来源固定 | 从 CDN 加载 | CSP 确认 + SRI 完整性校验 | P2 |
| 29 | OCR 结果中隐私数据 | 识别到的持仓金额可能包含敏感信息 | 确认不写入 `globalThis`（已有 `__lastOcrData`，检查是否需清理） | P1 |

---

## 六、版本规划时间线

### v1.10.x — "OCR 重制版"（预计 2 周）

| 任务 | 类型 | 工时 | 优先级 |
|------|------|------|--------|
| 语言包切换 chi_sim+eng | 🐛 修复 | 2h | P0 |
| Canvas 预处理管道（灰度+阈值+去噪） | ✨ 功能 | 4h | P0 |
| Worker 单例复用 + 懒加载 | 🚀 性能 | 3h | P1 |
| 多平台截图适配模板 | ✨ 功能 | 1d | P1 |
| 截图质量实时反馈 | ✨ 功能 | 4h | P1 |
| OCR 组件 i18n 补完 | 🌐 i18n | 2h | P2 |
| OCR 解析引擎测试（真实样张） | 🧪 测试 | 1d | P1 |

### v1.11.x — "资产统一"（预计 2 周）

| 任务 | 类型 | 工时 | 优先级 |
|------|------|------|--------|
| 统一资产数据模型 | 🏗 架构 | 2d | P1 |
| 汇率转换层 | 🏗 架构 | 1d | P1 |
| 资产总览 Dashboard 升级 | ✨ 功能 | 2d | P1 |
| 北向资金流向数据 | ✨ 功能 | 1d | P2 |
| 缓存层 IndexedDB 迁移 | 🚀 性能 | 2d | P2 |

### v2.0 — "全品种平台"（预计 6-8 周）

| 任务 | 类型 | 工时 | 优先级 |
|------|------|------|--------|
| PaddleOCR.js 或 ML Kit 迁移 | 🏗 架构 | 1w | P2 |
| 期货/宏观经济等数据接入 | ✨ 功能 | 1w | P2 |
| AI 资讯摘要 | ✨ 功能 | 1w | P2 |
| 骨架屏 + 下拉刷新 | ✨ 功能 | 3d | P3 |
| Electron 多窗口 | ✨ 功能 | 3d | P3 |
| E2E 测试覆盖 | 🧪 测试 | 持续 | P1 |

---

## 七、附录：当前架构局限分析

### 7.1 OCR 模块诊断（2026-07-02）

| 检查项 | 当前状态 | 严重程度 |
|--------|---------|---------|
| Tesseract 语言模型 | `'eng'` 仅英文 | 🔴 P0 |
| 图像预处理 | ❌ 无 | 🔴 P0 |
| Worker 管理 | 每次新建，无缓存 | 🟠 P1 |
| 超时处理 | 30s 硬超时，无重试 | 🟡 P2 |
| 错误消息 | 有中文提示，但泛化 | 🟢 P3 |
| 解析引擎 | 4 种正则模式 + 3 种回退 | ✅ 良好 |
| 名称匹配 | bigram + pinyin 评分 | ✅ 良好 |
| 测试覆盖 | 基础 mock | 🟠 P1 |
| 隐私保护 | 无全局写入（已修复） | ✅ 安全 |
| i18n 覆盖 | 部分硬编码 | 🟡 P2 |

### 7.2 命名约定备注

- 当前代码中使用 `RecognizedHolding`（ts 类型）与 `EnhancedHolding`（组件扩展），建议统一
- OCR 相关函数命名建议按 `recognize*` → `parse*` → `match*` 分层
- 文件组织：`ocr/engine.ts` / `ocr/parser.ts` / `ocr/matcher.ts` / `ocr/preprocessor.ts`

### 7.3 已知兼容性问题

- **Android WebView**：部分旧设备无法创建 Web Worker，Tesseract.js 不可用（已有 `isTesseractSupported` 检测）
- **iOS WKWebView**：WASM 内存限制（~2GB），大图可能 OOM
- **Electron**：Node.js 环境下可考虑使用 `tesseract.js` 原生绑定，性能优于 WASM

---

## 更新记录

| 日期 | 版本 | 变更内容 | 作者 |
|------|------|---------|------|
| 2026-07-02 | v0.1 | 初稿：OCR 专项 + 未来路线图 | ghshhf |
| — | — | 待补充 | — |

---

> 📝 **使用说明**：  
> - 完成某项任务后，将 `[ ]` 改为 `[x]`  
> - 新增想法时，按优先级插入对应章节，标注 P0-P3 和工时预估  
> - 大版本发布后将已完成的条目清理到 "历史版本" 章节  
> - 遇到新的架构决策，记录到 `ARCHITECTURE_v2.md` 的 ADR 章节
