// [WHY] E2E 测试全局清理 — 在所有测试结束后执行一次
// [WHAT] 清理测试环境、关闭服务器、生成报告等
// [DEPS] @playwright/test

import { type FullConfig } from '@playwright/test'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

// ES 模块中获取 __dirname
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

/**
 * 全局清理函数
 * @param config - Playwright 配置
 */
async function globalTeardown(config: FullConfig) {
  console.log('[E2E Global Teardown] Started')

  // 清理测试临时文件（可选）
  const tempDir = path.join(__dirname, '..', 'test-results', 'temp')
  if (fs.existsSync(tempDir)) {
    fs.rmSync(tempDir, { recursive: true, force: true })
  }

  console.log('[E2E Global Teardown] Completed')
}

export default globalTeardown
