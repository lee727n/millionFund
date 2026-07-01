// [WHY] AI 配置状态管理
// [WHAT] 管理用户自定义 AI API 配置（OpenAI/Claude/Gemini 等）
import { defineStore } from 'pinia'
import { ref } from 'vue'

export interface AIConfig {
  enabled: boolean
  provider: string  // openai, claude, gemini, custom
  apiKey: string
  endpoint: string
  model: string
  temperature: number
  maxTokens: number
}

export const useAISettingsStore = defineStore('aiSettings', () => {
  const config = ref<AIConfig>({
    enabled: false,
    provider: 'openai',
    apiKey: '',
    endpoint: '',
    model: 'gpt-3.5-turbo',
    temperature: 0.7,
    maxTokens: 2000
  })

  const isTesting = ref(false)
  const testResult = ref('')

  function load() {
    const saved = localStorage.getItem('ai-settings')
    if (saved) {
      try {
        const parsed = JSON.parse(saved)
        config.value = { ...config.value, ...parsed }
      } catch (e) {
        console.error('[AISettings] 加载配置失败', e)
      }
    }
  }

  function save() {
    localStorage.setItem('ai-settings', JSON.stringify(config.value))
  }

  async function test(): Promise<boolean> {
    if (!config.value.apiKey) {
      testResult.value = '请先填写 API Key'
      return false
    }

    isTesting.value = true
    testResult.value = '正在测试连接...'

    try {
      let url = ''
      const headers: Record<string, string> = {
        'Content-Type': 'application/json'
      }

      switch (config.value.provider) {
        case 'openai':
          url = config.value.endpoint || 'https://api.openai.com/v1/chat/completions'
          headers['Authorization'] = `Bearer ${config.value.apiKey}`
          break
        case 'claude':
          url = config.value.endpoint || 'https://api.anthropic.com/v1/messages'
          headers['x-api-key'] = config.value.apiKey
          headers['anthropic-version'] = '2023-06-01'
          break
        case 'gemini':
          url = `https://generativelanguage.googleapis.com/v1beta/models/${config.value.model}:generateContent?key=${config.value.apiKey}`
          break
        default:
          url = config.value.endpoint
          headers['Authorization'] = `Bearer ${config.value.apiKey}`
          break
      }

      const response = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          model: config.value.model,
          messages: [{ role: 'user', content: 'Hello' }],
          max_tokens: 10
        })
      })

      if (response.ok) {
        testResult.value = '✅ 连接成功！'
        return true
      } else {
        const error = await response.text()
        testResult.value = `❌ 连接失败: ${response.status} ${error.slice(0, 100)}`
        return false
      }
    } catch (error: any) {
      testResult.value = `❌ 连接失败: ${error.message?.slice(0, 100) || 'Unknown error'}`
      return false
    } finally {
      isTesting.value = false
    }
  }

  // 初始化时加载配置
  load()

  return {
    config,
    isTesting,
    testResult,
    load,
    save,
    test
  }
})
