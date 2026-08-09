#!/usr/bin/env node
/**
 * fix-capacitor-http-namespace.mjs
 *
 * [WHY] `@capacitor-community/http@1.4.1` 是一个 Capacitor 3 时代的废弃插件，
 * 其 `android/build.gradle` 没有声明 AGP 8 强制要求的 `namespace`，
 * 导致 Android Release 构建在 `configure project :capacitor-community-http` 阶段失败：
 *   > Namespace not specified. Specify a namespace in the module's build file.
 *
 * 该插件没有兼容 Capacitor 8 的正式版本（latest 仍是 1.4.1），因此无法直接升级。
 * 在 CI 与本地 `cap sync` 之前，注入缺失的 `namespace` 是最低风险的修复手段。
 *
 * [SAFETY] 幂等、防御式：
 *   - 找不到插件文件时仅告警并退出 0（web-only 环境不受影响）。
 *   - 已存在 namespace 时不做任何改动。
 *   - 失败绝不抛出，避免破坏 `npm ci`。
 *
 * 长期方案：将应用迁移到 Capacitor 内置或维护中的 HTTP 能力，移除该废弃插件。
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(__dirname, '..')

// Capacitor 8 直接引用 node_modules 中的插件 android 源码
const target = resolve(
  repoRoot,
  'node_modules/@capacitor-community/http/android/build.gradle'
)

const NAMESPACE = 'com.capacitorcommunity.http'

function log(msg) {
  console.log(`[fix-capacitor-http] ${msg}`)
}

if (!existsSync(target)) {
  log(`未找到 ${target}，跳过（web-only 或非 Android 环境）。`)
  process.exit(0)
}

try {
  let content = readFileSync(target, 'utf8')

  // [FIX] 全文件检测（不限于行首），避免同行注入后被二次注入
  if (/namespace\s+["'][^"']+["']/.test(content)) {
    log('已包含 namespace，无需修改。')
    process.exit(0)
  }

  // 在 `android {` 之后注入独立新行的 namespace
  const androidOpen = content.match(/android\s*\{/)
  if (!androidOpen) {
    log('未找到 `android {` 块，无法注入 namespace，请人工检查。')
    process.exit(0)
  }
  const idx = androidOpen.index + androidOpen[0].length
  const injected = `\n    namespace "${NAMESPACE}"`
  content = content.slice(0, idx) + injected + content.slice(idx)

  writeFileSync(target, content, 'utf8')
  log(`已注入 namespace "${NAMESPACE}" -> ${target}`)
} catch (err) {
  log(`补丁执行出错（已忽略，不阻断安装）：${err && err.message ? err.message : err}`)
  process.exit(0)
}
