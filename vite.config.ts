import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import Components from 'unplugin-vue-components/vite'
import { VantResolver } from '@vant/auto-import-resolver'
import { fileURLToPath, URL } from 'node:url'
import fs from 'node:fs'
import path from 'node:path'

function getPackageVersion(): string {
  try {
    const pkg = JSON.parse(fs.readFileSync(path.resolve(__dirname, 'package.json'), 'utf-8'))
    return pkg.version || '0.0.0'
  } catch {
    return '0.0.0'
  }
}

const APP_VERSION = getPackageVersion()

// [WHY] 配置 Vite 构建工具，支持 Vue3 和 Vant 组件自动导入
// [WHAT] 使用 unplugin-vue-components 自动导入 Vant 组件，无需手动 import
// [WHY] Capacitor Android/iOS 用绝对路径 (本地HTTP服务器)，Electron/Web 用相对路径 (file:// 协议)
const isCapacitor = process.env.CAPACITOR === 'true'
export default defineConfig({
  base: isCapacitor ? '/' : './',
  plugins: [
    vue(),
    Components({
      resolvers: [VantResolver()],
    }),
    {
      // [WHY] GitHub Pages 使用 history 模式路由，直接访问子路径会 404
      // [WHAT] 构建后复制 index.html 为 404.html，让 Pages 能正确回退到 SPA 入口
      name: 'spa-fallback',
      closeBundle() {
        const srcFile = path.resolve(__dirname, 'dist/index.html')
        const destFile = path.resolve(__dirname, 'dist/404.html')
        if (fs.existsSync(srcFile)) {
          fs.copyFileSync(srcFile, destFile)
          console.log('\n  ✅ SPA fallback generated: dist/404.html')
        }
      },
    },
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url))
    }
  },
  define: {
    __BUILD_TIME__: JSON.stringify(new Date().toISOString()),
    // [WHY] 在构建时注入版本号，logger 与页面都能直接读取
    'import.meta.env.VITE_APP_VERSION': JSON.stringify(APP_VERSION),
  },
  esbuild: {
    drop: ['debugger'],
  },
  server: {
    host: '0.0.0.0',
    port: 5173,
    proxy: {
      // [WHY] 解决开发环境第三方 API 跨域问题
      
      // === 天天基金相关 ===
      '/api/fundgz': {
        target: 'https://fundgz.1234567.com.cn',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/fundgz/, ''),
      },
      '/api/pingzhongdata': {
        target: 'https://fund.eastmoney.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/pingzhongdata/, ''),
      },
      '/api/fund': {
        target: 'https://fund.eastmoney.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/fund/, ''),
      },
      
      // === 东方财富相关 ===
      '/api/qt': {
        target: 'https://push2.eastmoney.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/qt/, ''),
      },
      '/api/nplistapi': {
        target: 'https://np-listapi.eastmoney.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/nplistapi/, ''),
      },
      '/api/apifund': {
        target: 'https://api.fund.eastmoney.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/apifund/, ''),
      },
      '/api/fundmobapi': {
        target: 'https://fundmobapi.eastmoney.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/fundmobapi/, ''),
      },
      
      // === 腾讯财经（股票行情） ===
      '/api/qttencent': {
        target: 'https://qt.gtimg.cn',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/qttencent/, ''),
      },

      // === 其他数据源 ===
      '/api/jin10': {
        target: 'https://www.jin10.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/jin10/, ''),
      },
      '/api/cls': {
        target: 'https://www.cls.cn',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/cls/, ''),
      },
      '/api/xueqiu': {
        target: 'https://stock.xueqiu.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/xueqiu/, ''),
      },
      '/api/choice': {
        target: 'https://data.eastmoney.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/choice/, ''),
      },
    },
  },
})
