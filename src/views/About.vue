<template>
  <div class="about-page">
    <!-- 导航栏 -->
    <div class="page-header">
      <van-icon name="arrow-left" size="22" @click="router.back()" />
      <span class="header-title">{{ t('about.title') }}</span>
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

      <!-- ========== {{ t('about.changelog') }} ========== -->
      <div class="section">
        <div class="section-title">📝 {{ t('about.changelog') }}</div>
        <div class="changelog-list">

          <div class="changelog-item current">
            <div class="changelog-version">v{{ APP_INFO.version }}</div>
            <div class="changelog-date">{{ APP_INFO.releaseDate }}</div>
            <ul class="changelog-bullets">
              <li>{{ t('about.changelog_new') }}<strong>{{ t('about.feature_alert') }}</strong>：设置涨跌幅阈值，触发时自动推送通知</li>
              <li>{{ t('about.changelog_fix') }}生产环境 API 404 问题</li>
              <li>{{ t('about.li_fetch') }}</li>
              <li>{{ t('about.li_error') }}</li>
            </ul>
          </div>

          <div class="changelog-item">
            <div class="changelog-version">v1.9.0</div>
            <div class="changelog-date">2026-06-14</div>
            <ul class="changelog-bullets">
              <li>{{ t('about.li_refactor') }}</li>
              <li>{{ t('about.li_jsonp') }}</li>
              <li>{{ t('about.li_ci') }}</li>
            </ul>
          </div>

          <div class="changelog-item">
            <div class="changelog-version">v1.8.0</div>
            <ul class="changelog-bullets">
              <li>TypeScript strict 模式，{{ t('about.changelog_fix') }} 233 个类型错误</li>
              <li>Capacitor WebView 跨域{{ t('about.changelog_fix') }}</li>
            </ul>
          </div>

          <div class="changelog-item">
            <div class="changelog-version">v1.7.0</div>
            <ul class="changelog-bullets">
              <li>{{ t('about.li_m3') }}</li>
              <li>{{ t('about.li_security') }}</li>
            </ul>
          </div>

        </div>
        <a class="changelog-more" href="https://github.com/ghshhf/millionFund#{{ t('about.changelog') }}" target="_blank" @click.stop>
          查看完整{{ t('about.changelog') }} →
        </a>
      </div>

      <!-- ========== 功能列表 ========== -->
      <div class="section">
        <div class="section-title">✨ {{ t('about.features') }}</div>
        <div class="feature-grid">
          <div class="feature-tag"><span class="feature-icon">📈</span><span>{{ t('about.feature_realtime') }}</span></div>
          <div class="feature-tag"><span class="feature-icon">💼</span><span>{{ t('about.feature_tracking') }}</span></div>
          <div class="feature-tag"><span class="feature-icon">🔔</span><span>{{ t('about.feature_alert') }}</span></div>
          <div class="feature-tag"><span class="feature-icon">🤖</span><span>{{ t('about.feature_ai') }}</span></div>
          <div class="feature-tag"><span class="feature-icon">📊</span><span>{{ t('about.feature_trend') }}</span></div>
          <div class="feature-tag"><span class="feature-icon">🌍</span><span>{{ t('about.feature_market') }}</span></div>
          <div class="feature-tag"><span class="feature-icon">📰</span><span>{{ t('about.feature_news') }}</span></div>
          <div class="feature-tag"><span class="feature-icon">🔍</span><span>{{ t('about.feature_data') }}</span></div>
        </div>
      </div>

      <!-- ========== 全平台{{ t('common.download') }} ========== -->
      <div class="section">
        <div class="section-title">📥 {{ t('about.download') }}</div>
        <div class="section-desc">{{ t('about.detected_platform') }} <strong>{{ platformLabel }}</strong></div>

        <!-- Android -->
        <div class="download-card" v-if="showAndroid">
          <div class="download-icon">📱</div>
          <div class="download-info">
            <div class="download-name">Android APK</div>
            <div class="download-desc">{{ t('about.android_desc') }}</div>
          </div>
          <div class="download-buttons">
            <van-button type="primary" size="small" round @click="downloadAndInstallApk">📲 {{ t('common.install') }}</van-button>
            <van-button plain size="small" round @click="showApkQr = true">{{ t('common.qr_code') }}</van-button>
          </div>
        </div>

        <!-- Windows -->
        <div class="download-card">
          <div class="download-icon">🪟</div>
          <div class="download-info">
            <div class="download-name">Windows</div>
            <div class="download-desc">{{ t('about.windows_desc') }}</div>
          </div>
          <van-button type="primary" size="small" round @click="downloadWin('nsis')">{{ t('common.download') }}</van-button>
        </div>

        <!-- macOS -->
        <div class="download-card">
          <div class="download-icon">🍎</div>
          <div class="download-info">
            <div class="download-name">macOS</div>
            <div class="download-desc">{{ t('about.macos_desc') }}</div>
          </div>
          <van-button type="primary" size="small" round @click="downloadMac('dmg')">{{ t('common.download') }}</van-button>
        </div>

        <!-- Linux -->
        <div class="download-card">
          <div class="download-icon">🐧</div>
          <div class="download-info">
            <div class="download-name">Linux</div>
            <div class="download-desc">{{ t('about.linux_desc') }}</div>
          </div>
          <van-button type="primary" size="small" round @click="downloadLinux('appimage')">{{ t('common.download') }}</van-button>
        </div>

        <!-- Web 版 -->
        <div class="download-card" v-if="isWeb()">
          <div class="download-icon">🌐</div>
          <div class="download-info">
            <div class="download-name">{{ t('about.web_title') }}</div>
            <div class="download-desc">{{ t('about.web_desc') }}</div>
          </div>
          <van-button plain size="small" round @click="copyWebUrl">{{ t('common.copy_link') }}</van-button>
        </div>

        <!-- PWA {{ t('common.install') }}横幅 -->
        <div v-if="canInstallPwa" class="pwa-install-banner">
          <div class="pwa-install-info">
            <span>📲</span>
            <span>{{ t('about.install_pwa') }}</span>
          </div>
          <van-button type="primary" size="small" round @click="installPwa">{{ t('about.pwa_install') }}</van-button>
        </div>
      </div>

      <!-- ========== APK {{ t('common.qr_code') }}弹窗 ========== -->
      <van-overlay :show="showApkQr" @click="showApkQr = false">
        <div class="qr-modal" @click.stop>
          <div class="qr-title">📱 {{ t('about.qr_title') }}</div>
          <img :src="apkQrUrl" alt="APK {{ t('common.download') }}{{ t('common.qr_code') }}" class="qr-image" />
          <div class="qr-url">{{ apkDownloadUrl }}</div>
          <van-button type="primary" size="small" round @click="downloadApk('debug')">{{ t('about.direct_download') }}</van-button>
          <van-button plain size="small" round style="margin-top: 8px" @click="showApkQr = false">{{ t('about.qr_close') }}</van-button>
        </div>
      </van-overlay>

      <!-- ========== {{ t('about.build_info') }} ========== -->
      <div class="section">
        <div class="section-title">🔧 {{ t('about.build_info') }}</div>
        <div class="info-grid">
          <div class="info-row"><span class="info-label">{{ t('about.version_label') }}</span><span class="info-value">{{ APP_INFO.version }}</span></div>
          <div class="info-row"><span class="info-label">{{ t('about.platform_label') }}</span><span class="info-value">{{ platformLabel }}</span></div>
          <div class="info-row"><span class="info-label">{{ t('about.build_time') }}</span><span class="info-value">{{ buildTime }}</span></div>
          <div class="info-row"><span class="info-label">{{ t('about.data_source_count') }}</span><span class="info-value">{{ dataSourceCount }} 个</span></div>
        </div>
      </div>

      <!-- ========== {{ t('about.open_source') }} ========== -->
      <div class="section">
        <div class="section-title">📄 {{ t('about.open_source') }}</div>
        <div class="info-grid">
          <div class="info-row"><span class="info-label">{{ t('about.license') }}</span><span class="info-value">{{ APP_INFO.license }}</span></div>
          <div class="info-row"><span class="info-label">{{ t('about.project_url') }}</span><span class="info-value link" @click="openUrl(APP_INFO.github)">{{ GITHUB_REPO }}</span></div>
        </div>
        <div class="disclaimer">
          <div class="disclaimer-title">{{ t('about.disclaimer_title') }}</div>
          <div class="disclaimer-text">本工具仅供学习交流使用，不构成任何投资建议。基金估值数据仅供参考，以基金公司公布的净值为准。<strong>{{ t('about.invest_risk') }}</strong></div>
        </div>
      </div>

      <div class="bottom-spacer"></div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { showToast, showSuccessToast, showConfirmDialog } from 'vant'
import { APP_INFO, GITHUB_REPO, DOWNLOAD_URLS, getBuildTime } from '@/config/release'
import { getPlatform, isWeb, isAndroid } from '@/utils/platform'

const router = useRouter()
const { t } = useI18n()
const buildTime = ref(getBuildTime())

// ========== PWA {{ t('common.install') }} ==========
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
    showSuccessToast(t('about.install_success') + ' 🎉')
  })
})

async function installPwa() {
  if (!pwaInstallEvent.value) {
    showToast(t('about.use_browser_menu'))
    return
  }
  pwaInstallEvent.value.prompt()
  const result = await pwaInstallEvent.value.userChoice
  if (result.outcome === 'accepted') showSuccessToast(t('about.install_success') + ' 🎉')
  pwaInstallEvent.value = null
  canInstallPwa.value = false
}

/** 点击{{ t('common.install') }}/{{ t('common.download') }} APK */
async function downloadAndInstallApk() {
  const dlUrl = DOWNLOAD_URLS.android.debug
  if (isAndroid()) {
    window.open(dlUrl, '_system')
    showToast(t('about.apk_downloading'))
    return
  }
  window.open(dlUrl, '_blank')
  showToast(t('about.downloading_apk') + '...')
  showConfirmDialog({
    title: '📱 手机' + t('common.install'),
    message: t('about.scan_install'),
    confirmButtonText: '扫码' + t('common.install'),
  }).then(() => showApkQr.value = true).catch(() => {})
}

const showApkQr = ref(false)
const apkDownloadUrl = DOWNLOAD_URLS.android.debug

const apkQrUrl = computed(() =>
  `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(apkDownloadUrl)}`
)

const platformLabel = computed(() => ({
  web: 'Web 浏览器',
  android: 'Android',
  ios: 'iOS',
  electron: 'Windows/Mac/Linux 桌面端',
}[getPlatform()] || 'Web 浏览器'))

const showAndroid = computed(() => !isAndroid())
const dataSourceCount = 10

// ========== {{ t('common.download') }}处理 ==========
function downloadApk(type: 'debug' | 'release') { window.open(DOWNLOAD_URLS.android[type], '_blank'); showToast(t('about.downloading_apk') + '...') }
function downloadWin(type: 'nsis' | 'portable') { window.open(DOWNLOAD_URLS.windows[type], '_blank'); showToast(t('about.downloading_windows') + '...') }
function downloadMac(type: 'dmg' | 'arm64') { window.open(DOWNLOAD_URLS.macos[type], '_blank'); showToast(t('about.downloading_mac') + '...') }
function downloadLinux(type: 'appimage' | 'deb') { window.open(DOWNLOAD_URLS.linux[type], '_blank'); showToast(t('about.downloading_linux') + '...') }

async function copyWebUrl() {
  try { await navigator.clipboard.writeText(window.location.origin); showSuccessToast(t('about.copy_success')) }
  catch { showToast(t('about.copy_failed')) }
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

/* ========== {{ t('about.changelog') }} ========== */
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

/* ========== {{ t('common.download') }}卡片 ========== */
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

/* ========== {{ t('common.qr_code') }}弹窗 ========== */
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
