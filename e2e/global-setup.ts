// [WHY] E2E 测试全局设置 — 在所有测试开始前执行一次
// [WHAT] 设置测试环境、Mock API、初始化数据等
// [DEPS] @playwright/test

import { chromium, type FullConfig } from '@playwright/test'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

// ES 模块中获取 __dirname
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

/**
 * 全局设置函数
 * @param config - Playwright 配置
 */
async function globalSetup(config: FullConfig) {
  console.log('[E2E Global Setup] Started')

  // 创建测试结果目录
  const resultsDir = path.join(__dirname, '..', 'test-results')
  if (!fs.existsSync(resultsDir)) {
    fs.mkdirSync(resultsDir, { recursive: true })
  }

  // 创建 Mock API 服务器（如果需要）
  // 这里我们使用 Playwright 的 route 功能来 mock API，不需要单独启动服务器

  console.log('[E2E Global Setup] Completed')
}

export default globalSetup
