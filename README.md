# AI百万实盘

一款功能丰富的开源基金管理系统，专为 Android 平台打造。支持自选基金实时估值、持仓盈亏管理、AI 调仓追踪、趋势分析等。

![License](https://img.shields.io/badge/license-MIT-blue.svg)
![Vue](https://img.shields.io/badge/Vue-3.x-brightgreen.svg)
![Capacitor](https://img.shields.io/badge/Capacitor-7.x-blue.svg)
![Platform](https://img.shields.io/badge/Platform-Android-green.svg)

## 核心功能

- **实时估值** — 秒级刷新基金实时估值数据（支持盘中估值 / 收盘净值）
- **自选管理** — 添加自选基金，按来源（支付宝/腾讯/京东）分类筛选
- **持仓追踪** — 记录持仓份额和成本，自动计算浮动盈亏和收益率
- **AI 调仓追踪** — 记录调仓记录，复盘调仓效果，支持成功率统计
- **趋势分析** — 包含均线系统、支撑阻力位预测、相关性分析
- **市场概览** — 查看主要股指、全球指数实时行情
- **基金详情** — 完整的基金信息展示，包含分时图、净值走势、持仓分析
- **深度数据** — 资产配置、持有人结构、同类排名、风格分析

## 更新记录

### v1.8.0
- 启用 TypeScript strict 模式，修复 233 个类型错误，提升运行时稳定性
- 提取硬编码的基金来源配置，便于扩展
- 配置 Capacitor allowNavigation，修复原生 WebView 跨域请求
- 添加 404 路由和 scrollBehavior，优化导航体验
- 移除无用依赖和废弃的 watch 监听

### v1.7.0
- 添加 Material Design 3 样式系统
- 添加 ProGuard/R8 混淆配置，减小 APK 体积
- 修复 JSONP 全局回调冲突，解决请求丢失问题
- 添加 CSP 安全头，防范 XSS 攻击
- 完善 ESLint 配置和类型检查脚本

## 快速开始

```bash
# 克隆项目
git clone https://github.com/ghshhf/millionFund
cd millionFund

# 安装依赖
npm install

# 启动开发服务器
npm run dev

# 构建生产版本
npm run build
```

### Android APK 构建

```bash
# 构建 Web 并同步到 Android
npm run build
npx cap sync

# 命令行构建 Release 版本（需要 JDK 21）
cd android
./gradlew assembleRelease
```

APK 输出位置：
- Debug: `android/app/build/outputs/apk/debug/app-debug.apk`
- Release: `android/app/build/outputs/apk/release/app-release.apk`

## 技术栈

- **前端框架**：Vue 3 + TypeScript
- **构建工具**：Vite 7
- **UI 组件**：Vant 4 (Material Design 3 风格)
- **移动打包**：Capacitor 7
- **路由管理**：Vue Router 4
- **状态管理**：Pinia 3
- **数据可视化**：Lightweight Charts
- **OCR 识别**：Tesseract.js

## 免责声明

⚠️ **重要提示**

- 本工具仅供学习交流使用，不构成任何投资建议
- 基金估值数据仅供参考，以基金公司公布的净值为准
- 数据刷新有延迟，仅供学习和参考
- **投资有风险，理财需谨慎**

## 开源协议

本项目基于 [MIT License](./LICENSE) 开源。
