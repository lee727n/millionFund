#!/usr/bin/env node

/**
 * AI百万实盘 - 全平台统一打包脚本
 * 
 * 支持构建:
 *   - Web (静态站点)
 *   - Android APK (需要 Android SDK)
 *   - iOS (需要 macOS + Xcode)
 *   - Windows 桌面端 (NSIS 安装包)
 *   - macOS 桌面端 (DMG)
 *   - Linux 桌面端 (AppImage + deb)
 * 
 * 用法:
 *   node scripts/build-all-platforms.mjs [平台]
 * 
 * 平台参数 (可选，默认构建当前平台支持的所有目标):
 *   web       - 仅构建 Web
 *   android   - 仅构建 Android APK
 *   ios       - 仅构建 iOS (需要 macOS)
 *   desktop   - 构建桌面端 (当前系统)
 *   all       - 构建所有可用平台
 */

import { execSync } from 'child_process'
import { existsSync, mkdirSync, copyFileSync, readdirSync, statSync, renameSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { platform } from 'os'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')
const RELEASE = join(ROOT, 'release')
const DIST = join(ROOT, 'dist')

// ═══════════════════════════════════════════
// 工具函数
// ═══════════════════════════════════════════

function run(cmd, opts = {}) {
  console.log(`\n  → ${cmd}`)
  try {
    return execSync(cmd, { cwd: ROOT, stdio: 'inherit', ...opts })
  } catch (e) {
    if (!opts.ignoreError) {
      console.error(`  ✗ 命令失败: ${cmd}`)
      throw e
    }
    console.warn(`  ⚠ 命令警告 (已忽略): ${cmd}`)
  }
}

function ensureDir(dir) {
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
}

function banner(text) {
  const line = '═'.repeat(60)
  console.log(`\n${line}`)
  console.log(`  ${text}`)
  console.log(`${line}\n`)
}

function copyDir(src, dest) {
  ensureDir(dest)
  if (!existsSync(src)) return
  run(`cp -r "${src}/"* "${dest}/" 2>/dev/null || true`, { ignoreError: true })
}

// ═══════════════════════════════════════════
// 构建步骤
// ═══════════════════════════════════════════

function buildWeb() {
  banner('📦 构建 Web 应用')
  run('npm run build')
  
  // 复制到 release/web
  const webDir = join(RELEASE, 'web')
  ensureDir(webDir)
  copyDir(DIST, webDir)
  console.log(`  ✓ Web 构建完成 → ${webDir}`)
}

function buildAndroid() {
  banner('📱 构建 Android APK')
  
  // 先构建 web
  run('npm run build')
  run('npx cap sync android')
  
  // 检查是否有 Android SDK
  const androidDir = join(ROOT, 'android')
  if (!existsSync(androidDir)) {
    console.warn('  ⚠ 未找到 android 目录，跳过 Android 构建')
    return
  }

  // 构建 debug APK
  console.log('  构建 Debug APK...')
  if (platform() === 'win32') {
    run('cd android && gradlew.bat assembleDebug', { ignoreError: true })
  } else {
    run('cd android && chmod +x gradlew && ./gradlew assembleDebug --no-daemon', { ignoreError: true })
  }

  // 复制 APK 到 release
  const apkDir = join(RELEASE, 'android')
  ensureDir(apkDir)
  
  const apkPaths = [
    join(androidDir, 'app/build/outputs/apk/debug/app-debug.apk'),
    join(androidDir, 'app/build/outputs/apk/release/app-release.apk'),
  ]
  
  let found = false
  for (const apkPath of apkPaths) {
    if (existsSync(apkPath)) {
      const destName = apkPath.includes('release') ? 'AI百万实盘-release.apk' : 'AI百万实盘-debug.apk'
      copyFileSync(apkPath, join(apkDir, destName))
      console.log(`  ✓ APK → ${join(apkDir, destName)}`)
      found = true
    }
  }
  
  if (!found) {
    console.warn('  ⚠ 未找到 APK 文件，请检查 Android SDK 配置')
  }
}

function buildIOS() {
  banner('🍎 构建 iOS')
  
  if (platform() !== 'darwin') {
    console.warn('  ⚠ iOS 构建需要 macOS 环境，当前系统不支持')
    console.log('  提示: 可在 macOS 上运行此脚本或使用 GitHub Actions')
    return
  }
  
  run('npm run build')
  run('npx cap sync ios')
  console.log('  ✓ iOS 项目已同步 → ios/App/')
  console.log('  提示: 使用 Xcode 打开 ios/App/App.xcworkspace 进行打包')
}

function buildDesktop() {
  banner('🖥  构建桌面端 (' + { win32: 'Windows', darwin: 'macOS', linux: 'Linux' }[platform()] + ')')
  
  run('npm run build')
  
  const currentPlatform = platform()
  let targetFlag = ''

  if (currentPlatform === 'win32') {
    targetFlag = '--win'
  } else if (currentPlatform === 'darwin') {
    targetFlag = '--mac'
  } else {
    targetFlag = '--linux'
  }

  run(`npx electron-builder ${targetFlag}`)

  // 移动产物到 release/desktop
  const electronOutput = join(ROOT, 'release', 'desktop')
  if (existsSync(electronOutput)) {
    console.log(`  ✓ 桌面端构建完成 → ${electronOutput}`)
  } else {
    console.warn('  ⚠ 桌面端构建产物未找到，请检查 electron-builder 配置')
  }
}

// ═══════════════════════════════════════════
// 主流程
// ═══════════════════════════════════════════

async function main() {
  const target = process.argv[2] || 'all'

  console.log('')
  console.log('  🤖 AI百万实盘 - 全平台构建工具')
  console.log(`  版本: ${JSON.parse(execSync('node -e "console.log(JSON.stringify(require(\'./package.json\').version))"', { cwd: ROOT })).toString().trim()}`)
  console.log(`  目标: ${target}`)
  console.log(`  系统: ${platform()}`)

  ensureDir(RELEASE)

  const targets = target === 'all'
    ? ['web', 'android', platform() === 'darwin' ? 'ios' : null, 'desktop'].filter(Boolean)
    : [target]

  for (const t of targets) {
    switch (t) {
      case 'web':     buildWeb(); break
      case 'android': buildAndroid(); break
      case 'ios':     buildIOS(); break
      case 'desktop': buildDesktop(); break
      default:
        console.error(`  未知目标: ${t}`)
        console.log('  可用目标: web, android, ios, desktop, all')
        process.exit(1)
    }
  }

  // 生成构建报告
  banner('📋 构建报告')
  console.log('')
  listReleaseDir(RELEASE, 0)
  console.log('')
  console.log('  ✅ 全平台构建完成！')
  console.log(`  产物目录: ${RELEASE}`)
  console.log('')
}

function listReleaseDir(dir, depth) {
  if (!existsSync(dir)) return
  const prefix = '  '.repeat(depth + 1)
  const items = readdirSync(dir)
  for (const item of items) {
    const full = join(dir, item)
    const stat = statSync(full)
    if (stat.isDirectory()) {
      console.log(`${prefix}📁 ${item}/`)
      if (depth < 2) listReleaseDir(full, depth + 1)
    } else {
      const sizeMB = (stat.size / 1024 / 1024).toFixed(1)
      console.log(`${prefix}📄 ${item} (${sizeMB} MB)`)
    }
  }
}

main().catch(e => {
  console.error('\n  ✗ 构建失败:', e.message)
  process.exit(1)
})
