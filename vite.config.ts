import { defineConfig, type Plugin } from 'vite'
import vue from '@vitejs/plugin-vue'
import Components from 'unplugin-vue-components/vite'
import { VantResolver } from '@vant/auto-import-resolver'
import { fileURLToPath, URL } from 'node:url'

// [WHY] 生产构建时仅移除 console.log（保留 warn/error 供线上调试）
function stripConsoleLog(): Plugin {
  return {
    name: 'strip-console-log',
    enforce: 'post',
    transform(code, id) {
      if (id.includes('node_modules')) return
      if (!code.includes('console.log')) return

      const result: string[] = []
      let lastIndex = 0
      const re = /console\.log\s*\(/g
      let match: RegExpExecArray | null

      while ((match = re.exec(code)) !== null) {
        result.push(code.slice(lastIndex, match.index))
        // 找到匹配的右括号（处理嵌套括号）
        let depth = 1
        let i = match.index + match[0].length
        while (i < code.length && depth > 0) {
          if (code[i] === '(') depth++
          else if (code[i] === ')') depth--
          i++
        }
        result.push('void 0')
        lastIndex = i
      }
      result.push(code.slice(lastIndex))
      return result.join('')
    },
  }
}

// [WHY] 配置 Vite 构建工具，支持 Vue3 和 Vant 组件自动导入
// [WHAT] 使用 unplugin-vue-components 自动导入 Vant 组件，无需手动 import
// [WHY] 全平台打包（Electron + Capacitor）需要相对路径，file:// 协议下绝对路径会失效
export default defineConfig({
  base: './',
  plugins: [
    vue(),
    // [HOW] VantResolver 会自动识别 Vant 组件并导入对应的样式
    Components({
      resolvers: [VantResolver()],
    }),
    // [WHY] 生产构建移除 console.log（保留 warn/error 供线上调试）
    stripConsoleLog(),
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
  // [WHY] 仅移除 debugger 语句，不碰 console
  esbuild: {
    drop: ['debugger'],
  },
  server: {
    host: '0.0.0.0',
    port: 5173
  }
})
