// [WHY] ESLint flat config - 统一代码风格和质量检查
// [WHAT] 支持 Vue 3 + TypeScript，仅在 CI/手动运行时生效，不影响构建

import pluginVue from 'eslint-plugin-vue'
import ts from '@typescript-eslint/eslint-plugin'
import tsParser from '@typescript-eslint/parser'
import vueParser from 'vue-eslint-parser'

export default [
  // [WHAT] 忽略目录
  {
    ignores: [
      'dist/**',
      'node_modules/**',
      'android/**',
      '*.json',
      '*.d.ts',
      'components.d.ts',
    ],
  },

  // [WHAT] 核心规则：src 下的 .ts 和 .vue 文件
  {
    files: ['src/**/*.{ts,vue}'],
    languageOptions: {
      parser: vueParser,
      parserOptions: {
        parser: tsParser,
        sourceType: 'module',
        ecmaVersion: 'latest',
      },
    },
    plugins: {
      vue: pluginVue,
      '@typescript-eslint': ts,
    },
    rules: {
      // --- 已禁用（现有代码库风格，逐步收紧） ---

      // TypeScript 规则
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_', caughtErrors: 'none' }],
      '@typescript-eslint/no-require-imports': 'off',
      '@typescript-eslint/ban-ts-comment': 'off',

      // Vue 规则
      'vue/multi-word-component-names': 'off',
      'vue/max-attributes-per-line': 'off',
      'vue/singleline-html-element-content-newline': 'off',
      'vue/html-self-closing': 'off',
      'vue/no-v-html': 'off',

      // 通用规则
      'no-console': ['warn', { allow: ['warn', 'error'] }],
      'prefer-const': 'warn',
      'no-var': 'error',
    },
  },
]
