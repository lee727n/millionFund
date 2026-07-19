import { defineConfig } from 'vitest/config'
import { fileURLToPath, URL } from 'node:url'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url))
    }
  },
  define: {
    __BUILD_TIME__: JSON.stringify(new Date().toISOString()),
  },
  test: {
    globals: true,
    environment: 'happy-dom',
    setupFiles: ['./vitest.setup.ts'],
    include: ['src/**/*.test.ts', 'src/**/*.spec.ts'],
    
    // 防止 CI 环境因网络错误导致测试失败
    failOnConsoleError: false,
    
    // 测试超时设置
    testTimeout: 30000,
    hookTimeout: 30000,
    
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'json-summary'],
      include: ['src/**/*'],
      exclude: ['src/**/*.d.ts', 'src/**/*.test.ts', 'src/**/*.spec.ts', 'src/views/**', 'src/api/fundFast.ts'],
      
      // [M16] 覆盖率门禁基线：当前覆盖率约 6%，先设 5% 基线避免 CI 失败。
      // 后续应随测试用例补充逐步提高至 60%。
      thresholds: {
        lines: 5,
        functions: 5,
        branches: 5,
        statements: 5
      }
    },
  },
})
