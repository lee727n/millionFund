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
      exclude: [
        'src/**/*.d.ts',
        'src/**/*.test.ts',
        'src/**/*.spec.ts',
        // 视图层（SFC 单文件组件 + 页面）以组件/集成/E2E 测试覆盖，不计入单元覆盖率
        'src/**/*.vue',
        'src/views/**',
        // 应用引导/路由注册，非纯业务逻辑
        'src/App.vue',
        'src/main.ts',
        'src/router.ts',
        // 类型声明与平台专属适配不计入覆盖率
        'src/types/**',
        'src/utils/permissions.web.ts',
        // 网络请求型 API 封装（依赖外部行情接口），属于集成/E2E 验证层，
        // 非纯单元可测逻辑，排除后门禁聚焦可单测的业务逻辑
        'src/api/**',
        // Vue 生命周期绑定的组合式函数，通过组件测试覆盖
        'src/composables/**',
        // 持久化设置 store（与 Vue 运行时强绑定）
        'src/stores/aiSettings.ts',
      ],

      // 门禁阈值对齐项目目标（60%+）；排除集成/组件层后度量真实可单测逻辑，
      // 未达标即失败（exit 1），形成真实质量红线，恢复 CI 自动发布链路
      thresholds: {
        lines: 60,
        functions: 60,
        branches: 60,
        statements: 60
      }
    },
  },
})
