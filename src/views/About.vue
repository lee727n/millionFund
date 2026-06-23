<template>
  <div class="about-page">
    <!-- 导航栏 -->
    <div class="page-header">
      <van-icon name="arrow-left" size="22" @click="router.back()" />
      <span class="header-title">关于</span>
      <div style="width: 22px"></div>
    </div>

    <div class="scroll-content">
      <!-- ========== 应用信息 ========== -->
      <div class="app-hero">
        <div class="app-icon">📊</div>
        <div class="app-name">{{ APP_INFO.name }}</div>
        <div class="app-version">v{{ APP_INFO.version }}</div>
        <div class="app-desc">{{ APP_INFO.description }}</div>
      </div>

      <!-- ========== 更新记录 ========== -->
      <div class="section">
        <div class="section-title">📝 更新记录</div>
        <div class="changelog-list">

          <div class="changelog-item current">
            <div class="changelog-version">v{{ APP_INFO.version }}</div>
            <div class="changelog-date">{{ APP_INFO.releaseDate }}</div>
            <ul class="changelog-bullets">
              <li>新增<strong>涨跌提醒</strong>：设置涨跌幅阈值，触发时自动推送通知</li>
              <li>修复生产环境 API 404 问题</li>
              <li>大幅减少 JSONP 使用，改用 fetch 直接解析</li>
              <li>统一错误处理，提示更友好</li>
            </ul>
          </div>

          <div class="changelog-item">
            <div class="changelog-version">v1.9.0</div>
            <div class="changelog-date">2026-06-14</div>
            <ul class="changelog-bullets">
              <li>API 层合并重构，减少 ~1500 行冗余代码</li>
              <li>解决 JSONP 全局变量污染问题</li>
              <li>GitHub Actions 全平台并行构建</li>
            </ul>
          </div>

          <div class="changelog-item">
            <div class="changelog-version">v1.8.0</div>
            <ul class="changelog-bullets">
              <li>TypeScript strict 模式，修复 233 个类型错误</li>
              <li>Capacitor WebView 跨域修复</li>
            </ul>
          </div>

          <div class="changelog-item">
            <div class="changelog-version">v1.7.0</div>
            <ul class="changelog-bullets">
              <li>Material Design 3 样式系统</li>
              <li>CSP 安全头 + ProGuard 混淆</li>
            </ul>
          </div>

        </div>
        <a class="changelog-more" href="https://github.com/ghshhf/millionFund#更新记录" target="_blank" @click.stop>
          查看完整更新记录 →
        </a>
      </div>

      <!-- ========== 功能列表 ========== -->
      <div class="section">
        <div class="section-title">✨ 功能特性</div>
        <div class="feature-grid">
          <div class="feature-tag"><span class="feature-icon">📈</span><span>实时估值</span></div>
          <div class="feature-tag"><span class="feature-icon">💼</span><span>持仓追踪</span></div>
          <div class="feature-tag"><span class="feature-icon">🔔</span><span>涨跌提醒</span></div>
          <div class="feature-tag"><span class="feature-icon">🤖</span><span>AI 追踪</span></div>
          <div class="feature-tag"><span class="feature-icon">📊</span><span>趋势分析</span></div>
          <div class="feature-tag"><span class="feature-icon">🌍</span><span>市场概览</span></div>
          <div class="feature-tag"><span class="feature-icon">📰</span><span>资讯动态</span></div>
          <div class="feature-tag"><span class="feature-icon">🔍</span><span>深度数据</span></div>
        </div>
      </div>

      <!-- ========== 全平台下载 ========== -->
      <div class="section">
        <div class="section-title">📥 下载安装</div>
        <div class="section-desc">已检测到你正在使用 <strong>{{ platformLabel }}</strong></div>

        <!-- Android -->
        <div class="download-card" v-if="showAndroid">
          <div class="download-icon">📱</div>
          <div class="download-info">
            <div class="download-name">Android APK</div>
            <div class="download-desc">适用于 Android 手机/平板</div>
          </div>
          <div class="download-buttons">
            <van-button type="primary" size="small" round @click="downloadAndInstallApk">📲 安装</van-button>
            <van-button plain size="small" round @click="showApkQr = true">二维码</van-button>
          </div>
        </div>

        <!-- Windows -->
        <div class="download-card">
          <div class="download-icon">🪟</div>
          <div class="download-info">
            <div class="download-name">Windows</div>
            <div class="download-desc">Windows 10/11 x64</div>
          </div>
          <van-button type="primary" size="small" round @click="downloadWin('nsis')">下载</van-button>
        </div>

        <!-- macOS -->
        <div class="download-card">
          <div class="download-icon">🍎</div>
          <div class="download-info">
            <div class="download-name">macOS</div>
            <div class="download-desc">Intel / Apple Silicon</div>
          </div>
          <van-button type="primary" size="small" round @click="downloadMac('dmg')">下载</van-button>
        </div>

        <!-- Linux -->
        <div class="download-card">
          <div class="download-icon">🐧</div>
          <div class="download-info">
            <div class="download-name">Linux</div>
            <div class="download-desc">x64 发行版</div>
          </div>
          <van-button type="primary" size="small" round @click="downloadLinux('appimage')">下载</van-button>
        </div>

        <!-- Web 版 -->
        <div class="download-card" v-if="isWeb()">
          <div class="download-icon">🌐</div>
          <div class="download-info">
            <div class="download-name">Web 在线版</div>
            <div class="download-desc">浏览器访问，无需安装</div>
          </div>
          <van-button plain size="small" round @click="copyWebUrl">复制链接</van-button>
        </div>

        <!-- PWA 安装横幅 -->
        <div v-if="canInstallPwa" class="pwa-install-banner">
          <div class="pwa-install-info">
            <span>📲</span>
            <span>安装到桌面，体验更流畅</span>
          </div>
          <van-button type="primary" size="small" round @click="installPwa">一键安装</van-button>
        </div>
      </div>

      <!-- ========== APK 二维码弹窗 ========== -->
      <van-overlay :show="showApkQr" @click="showApkQr = false">
        <div class="qr-modal" @click.stop>
          <div class="qr-title">📱 扫码安装 Android 版</div>
          <img :src="apkQrUrl" alt="APK 下载二维码" class="qr-image" />
          <div class="qr-url">{{ apkDownloadUrl }}</div>
          <van-button type="primary" size="small" round @click="downloadApk('debug')">直接下载</van-button>
          <van-button plain size="small" round style="margin-top: 8px" @click="showApkQr = false">关闭</van-button>
        </div>
      </van-overlay>

      <!-- ========== 构建信息 ========== -->
      <div class="section">
        <div class="section-title">🔧 构建信息</div>
        <div class="info-grid">
          <div class="info-row"><span class="info-label">版本号</span><span class="info-value">{{ APP_INFO.version }}</span></div>
          <div class="info-row"><span class="info-label">当前平台</span><span class="info-value">{{ platformLabel }}</span></div>
          <div class="info-row"><span class="info-label">构建时间</span><span class="info-value">{{ buildTime }}</span></div>
          <div class="info-row"><span class="info-label">数据源</span><span class="info-value">{{ dataSourceCount }} 个</span></div>
        </div>
      </div>

      <!-- ========== 开源信息 ========== -->
      <div class="section">
        <div class="section-title">📄 开源信息</div>
        <div class="info-grid">
          <div class="info-row"><span class="info-label">开源协议</span><span class="info-value">{{ APP_INFO.license }}</span></div>
          <div class="info-row"><span class="info-label">项目地址</span><span class="info-value link" @click="openUrl(APP_INFO.github)">{{ GITHUB_REPO }}</span></div>
        </div>
        <div class="disclaimer">
          <div class="disclaimer-title">⚠️ 免责声明</div>
          <div class="disclaimer-text">本工具仅供学习交流使用，不构成任何投资建议。基金估值数据仅供参考，以基金公司公布的净值为准。<strong>投资有风险，理财需谨慎。</strong></div>
        </div>
      </div>

      <div class="bottom-spacer"></div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { showToast, showSuccessToast, showConfirmDialog } from 'vant'
import { APP_INFO, GITHUB_REPO, DOWNLOAD_URLS, getBuildTime } from '@/config/release'
import { getPlatform, isWeb, isAndroid } from '@/utils/platform'

const router = useRouter()
const buildTime = ref(getBuildTime())

// ========== PWA 安装 ==========
const pwaInstallEvent = ref<any>(null)
const canInstallPwa = ref(false)

onMounted(() => {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault()
    pwaInstallEvent.value = e
    canInstallPwa.value = true
  })
  window.addEventListener('appinstalled', () => {
    canInstallPwa.value = false
    pwaInstallEvent.value = null
    showSuccessToast('安装成功 🎉')
  })
})

async function installPwa() {
  if (!pwaInstallEvent.value) {
    showToast('请使用浏览器菜单"添加到主屏幕"')
    return
  }
  pwaInstallEvent.value.prompt()
  const result = await pwaInstallEvent.value.userChoice
  if (result.outcome === 'accepted') showSuccessToast('安装成功 🎉')
  pwaInstallEvent.value = null
  canInstallPwa.value = false
}

/** 点击安装/下载 APK */
async function downloadAndInstallApk() {
  const dlUrl = DOWNLOAD_URLS.android.debug
  if (isAndroid()) {
    window.open(dlUrl, '_system')
    showToast('APK 下载中，请查看通知栏')
    return
  }
  window.open(dlUrl, '_blank')
  showToast('正在下载 APK...')
  showConfirmDialog({
    title: '📱 手机安装',
    message: '扫码即可安装到手机',
    confirmButtonText: '扫码安装',
  }).then(() => showApkQr.value = true).catch(() => {})
}

const showApkQr = ref(false)
const apkDownloadUrl = DOWNLOAD_URLS.android.debug

const apkQrUrl = computed(() =>
  `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(apkDownloadUrl)}`
)

const platformLabel = computed(() => ({
  android: 'Android', ios: 'iOS', electron: 'Windows/Mac/Linux 桌面端',
}[getPlatform()] || 'Web 浏览器'))

const showAndroid = computed(() => !isAndroid())
const dataSourceCount = 10

// ========== 下载处理 ==========
function downloadApk(type: 'debug' | 'release') { window.open(DOWNLOAD_URLS.android[type], '_blank'); showToast('正在下载 APK...') }
function downloadWin(type: 'nsis' | 'portable') { window.open(DOWNLOAD_URLS.windows[type], '_blank'); showToast('正在下载 Windows 安装包...') }
function downloadMac(type: 'dmg' | 'arm64') { window.open(DOWNLOAD_URLS.macos[type], '_blank'); showToast('正在下载 macOS 安装包...') }
function downloadLinux(type: 'appimage' | 'deb') { window.open(DOWNLOAD_URLS.linux[type], '_blank'); showToast('正在下载 Linux 安装包...') }

async function copyWebUrl() {
  try { await navigator.clipboard.writeText(window.location.origin); showSuccessToast('链接已复制') }
  catch { showToast('复制失败，请手动复制地址栏链接') }
}
function openUrl(url: string) { window.open(url, '_blank') }
</script>

<style scoped>
.about-page {
  height: 100%;
  background: var(--bg-primary);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.page-header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 12px 16px; background: var(--bg-primary);
  border-bottom: 1px solid var(--border-color);
  padding-top: max(12px, env(safe-area-inset-top, 0px));
}
.header-title { font-size: 18px; font-weight: 600; color: var(--text-primary); }
.scroll-content { flex: 1; overflow-y: auto; -webkit-overflow-scrolling: touch; }

/* ========== 应用信息 ========== */
.app-hero { text-align: center; padding: 28px 20px 20px; background: linear-gradient(135deg, var(--color-primary-bg), transparent); }
.app-icon { font-size: 52px; margin-bottom: 10px; }
.app-name { font-size: 22px; font-weight: 700; color: var(--text-primary); margin-bottom: 6px; }
.app-version { display: inline-block; font-size: 14px; font-weight: 600; color: #1677ff; background: rgba(22,119,255,0.1); padding: 4px 16px; border-radius: 12px; margin-bottom: 10px; }
.app-desc { font-size: 13px; color: var(--text-secondary); line-height: 1.5; max-width: 280px; margin: 0 auto; }

/* ========== 区块通用 ========== */
.section { margin: 12px 16px; }
.section-title { font-size: 16px; font-weight: 600; color: var(--text-primary); margin-bottom: 4px; }
.section-desc { font-size: 12px; color: var(--text-muted); margin-bottom: 10px; line-height: 1.4; }

/* ========== 更新记录 ========== */
.changelog-list { display: flex; flex-direction: column; gap: 10px; }
.changelog-item {
  background: var(--bg-card); border: 1px solid var(--border-color);
  border-radius: 12px; padding: 14px 16px;
}
.changelog-item.current {
  border-color: rgba(22, 119, 255, 0.3);
  background: linear-gradient(135deg, rgba(22,119,255,0.04), var(--bg-card));
}
.changelog-version {
  font-size: 15px; font-weight: 700; color: var(--text-primary);
}
.changelog-item.current .changelog-version { color: #1677ff; }
.changelog-date {
  font-size: 11px; color: var(--text-muted); margin-bottom: 8px;
}
.changelog-bullets { margin: 0; padding-left: 18px; list-style: disc; }
.changelog-bullets li {
  font-size: 13px; color: var(--text-secondary); line-height: 1.7;
}
.changelog-more {
  display: block; text-align: center; font-size: 13px; color: #1677ff;
  text-decoration: none; margin-top: 10px; padding: 8px 0;
}

/* ========== 功能网格 ========== */
.feature-grid {
  display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px;
}
.feature-tag {
  display: flex; flex-direction: column; align-items: center; gap: 4px;
  padding: 12px 6px; background: var(--bg-card);
  border: 1px solid var(--border-color); border-radius: 10px;
}
.feature-icon { font-size: 24px; }
.feature-tag span:last-child { font-size: 11px; color: var(--text-secondary); white-space: nowrap; }

/* ========== 下载卡片 ========== */
.download-card {
  display: flex; align-items: center; gap: 12px;
  padding: 12px 16px; background: var(--bg-card);
  border: 1px solid var(--border-color); border-radius: 12px; margin-bottom: 8px;
  transition: all 0.2s;
}
.download-card:active { transform: scale(0.99); }
.download-icon { font-size: 26px; min-width: 36px; text-align: center; }
.download-info { flex: 1; min-width: 0; }
.download-name { font-size: 14px; font-weight: 600; color: var(--text-primary); margin-bottom: 2px; }
.download-desc { font-size: 11px; color: var(--text-muted); }
.download-buttons { display: flex; gap: 6px; flex-shrink: 0; }

/* ========== 信息网格 ========== */
.info-grid { background: var(--bg-card); border: 1px solid var(--border-color); border-radius: 12px; overflow: hidden; }
.info-row {
  display: flex; justify-content: space-between; align-items: center;
  padding: 11px 16px; border-bottom: 1px solid var(--border-color);
}
.info-row:last-child { border-bottom: none; }
.info-label { font-size: 14px; color: var(--text-secondary); }
.info-value { font-size: 14px; color: var(--text-primary); font-weight: 500; }
.info-value.link { color: #1677ff; cursor: pointer; }

/* ========== 免责声明 ========== */
.disclaimer { margin-top: 10px; padding: 12px 16px; background: rgba(255,152,0,0.08); border: 1px solid rgba(255,152,0,0.2); border-radius: 10px; }
.disclaimer-title { font-size: 14px; font-weight: 600; color: #e6a23c; margin-bottom: 6px; }
.disclaimer-text { font-size: 12px; color: var(--text-secondary); line-height: 1.6; }

/* ========== PWA 横幅 ========== */
.pwa-install-banner {
  display: flex; align-items: center; justify-content: space-between;
  padding: 10px 16px; margin-top: 8px;
  background: linear-gradient(135deg, rgba(22,119,255,0.1), rgba(22,119,255,0.05));
  border: 1px solid rgba(22,119,255,0.2); border-radius: 12px;
}
.pwa-install-info { display: flex; align-items: center; gap: 8px; font-size: 13px; color: var(--text-primary); }

/* ========== 二维码弹窗 ========== */
.qr-modal {
  position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%);
  width: 280px; background: var(--bg-card); border-radius: 16px; padding: 24px;
  display: flex; flex-direction: column; align-items: center; gap: 12px;
}
.qr-title { font-size: 16px; font-weight: 600; color: var(--text-primary); }
.qr-image { width: 180px; height: 180px; border-radius: 8px; background: #fff; padding: 8px; }
.qr-url { font-size: 10px; color: var(--text-muted); word-break: break-all; text-align: center; max-width: 100%; }

.bottom-spacer { height: 40px; }
</style>
