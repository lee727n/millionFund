import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import Components from 'unplugin-vue-components/vite'
import { VantResolver } from '@vant/auto-import-resolver'
import { fileURLToPath, URL } from 'node:url'

// [WHY] 配置 Vite 构建工具，支持 Vue3 和 Vant 组件自动导入
// [WHAT] 使用 unplugin-vue-components 自动导入 Vant 组件，无需手动 import
export default defineConfig({
  plugins: [
    vue(),
    // [HOW] VantResolver 会自动识别 Vant 组件并导入对应的样式
    Components({
      resolvers: [VantResolver()],
    }),
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url))
    }
  },
  // [WHAT] 定义全局常量，构建时注入
  define: {
    __BUILD_TIME__: JSON.stringify(new Date().toISOString())
  },
  server: {
    host: '0.0.0.0',
    port: 5173,
    proxy: {
      '/baidu-ocr-api': {
        target: 'https://aip.baidubce.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/baidu-ocr-api/, '')
      },
      '/fundgz': {
        target: 'https://fundgz.1234567.com.cn',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/fundgz/, '')
      },
      '/push2': {
        target: 'https://push2.eastmoney.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/push2/, '')
      },
      '/pingzhongdata': {
        target: 'https://fund.eastmoney.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/pingzhongdata/, '/pingzhongdata')
      },
      '/fund-detail': {
        target: 'https://fund.eastmoney.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/fund-detail/, '')
      },
      '/fundf10': {
        target: 'https://fundf10.eastmoney.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/fundf10/, '')
      }
    }
  }
})
