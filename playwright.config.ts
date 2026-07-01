// [WHY] Playwright 配置文件 — 配置 E2E 测试环境、浏览器、报告器等
// [WHAT] 定义测试目录、baseURL、超时、报告器、重试策略等
// [DEPS] @playwright/test

import { defineConfig, devices } from '@playwright/test'

/**
 * Playwright 配置
 * @see https://playwright.dev/docs/test-configuration
 */
export default defineConfig({
  /** 测试文件目录 */
  testDir: './e2e',

  /** 是否并发执行测试 */
  fullyParallel: false,

  /** 测试失败重试次数 */
  retries: 2,

  /** 测试超时时间（毫秒）— CI 环境需要更长 */
  timeout: 60000,

  /** 预期超时时间 */
  expect: {
    timeout: 10000,
  },

  /** 是否使用 CI 模式 */
  CI: !!process.env.CI,

  /** 报告器配置 */
  reporter: [
    ['html', { outputFolder: 'playwright-report', open: 'never' }],
    ['json', { outputFile: 'test-results/results.json' }],
    ['list'],
  ],

  /** 使用全局 setup/teardown */
  globalSetup: './e2e/global-setup.ts',
  globalTeardown: './e2e/global-teardown.ts',

  /** 项目配置 */
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        /** 基础 URL */
        baseURL: 'http://localhost:5173',
        /** 是否录制视频 */
        video: 'retain-on-failure',
        /** 是否截图 */
        screenshot: 'only-on-failure',
        /** 是否记录 trace */
        trace: 'retain-on-failure',
      },
    },
    {
      name: 'firefox',
      use: {
        ...devices['Desktop Firefox'],
        baseURL: 'http://localhost:5173',
        video: 'retain-on-failure',
        screenshot: 'only-on-failure',
        trace: 'retain-on-failure',
      },
    },
    {
      name: 'mobile-chrome',
      use: {
        ...devices['Pixel 5'],
        baseURL: 'http://localhost:5173',
      },
    },
  ],

  /** Web 服务器配置（自动启动开发服务器） */
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:5173',
    reuseExistingServer: !process.env.CI,
    timeout: 60000,
  },

  /** 输出目录 */
  outputDir: 'test-results',

  /** 是否保留测试输出 */
  preserveOutput: 'failures-only',
})
