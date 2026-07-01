<template>
  <div class="ai-settings-page">
    <van-nav-bar title="AI 配置" left-text="返回" @click-left="$router.back()" />
    
    <div class="p-4">
      <!-- 启用开关 -->
      <van-cell-group inset class="mb-4">
        <van-cell>
          <template #title>
            <span class="font-medium">启用 AI 功能</span>
          </template>
          <template #right-icon>
            <van-switch v-model="config.enabled" @change="onConfigChange" />
          </template>
        </van-cell>
      </van-cell-group>

      <!-- 提供商选择 -->
      <van-cell-group inset class="mb-4">
        <van-field
          v-model="config.provider"
          label="AI 提供商"
          is-link
          readonly
          placeholder="选择提供商"
          @click="showProviderPicker = true"
        />
      </van-cell-group>

      <!-- API 配置 -->
      <van-cell-group inset class="mb-4">
        <van-field
          v-model="config.apiKey"
          label="API Key"
          type="password"
          placeholder="输入你的 API Key"
          @blur="onConfigChange"
        >
          <template #right-icon>
            <van-icon name="eye-o" @click="toggleApiKeyVisible" class="cursor-pointer" />
          </template>
        </van-field>

        <van-field
          v-model="config.endpoint"
          label="自定义端点"
          placeholder="留空使用默认地址"
          @blur="onConfigChange"
        />

        <van-field
          v-model="config.model"
          label="模型名称"
          placeholder="如 gpt-3.5-turbo, claude-3-sonnet"
          @blur="onConfigChange"
        />

        <van-cell title="温度 (Temperature)">
          <template #value>
            <van-slider 
              v-model="temperatureValue" 
              :min="0" 
              :max="100" 
              :step="10"
              @change="onTempChange"
              class="w-48"
            />
          </template>
        </van-cell>

        <van-field
          v-model.number="config.maxTokens"
          label="最大 Token"
          type="number"
          placeholder="2000"
          @blur="onConfigChange"
        />
      </van-cell-group>

      <!-- 测试连接按钮 -->
      <div class="px-4 mb-4">
        <van-button 
          type="primary" 
          block 
          :loading="isTesting"
          @click="testConnection"
          class="h-12 text-base"
        >
          {{ isTesting ? '测试中...' : '测试连接' }}
        </van-button>
        
        <!-- 测试结果 -->
        <div 
          v-if="testResult" 
          class="mt-3 p-3 rounded-lg text-sm"
          :class="testResult.includes('✅') ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'"
        >
          {{ testResult }}
        </div>
      </div>

      <!-- 使用说明 -->
      <van-collapse v-model="activeHelp" class="mx-4">
        <van-collapse-item title="如何获取 API Key？" name="help1">
          <div class="text-sm text-gray-600 space-y-2">
            <p><strong>OpenAI:</strong> 访问 platform.openai.com 创建 API Key</p>
            <p><strong>Claude:</strong> 访问 console.anthropic.com 创建 Key</p>
            <p><strong>Gemini:</strong> 访问 ai.google.dev 获取 Key</p>
            <p><strong>自定义:</strong> 填写兼容 OpenAI 格式的端点地址</p>
          </div>
        </van-collapse-item>
        
        <van-collapse-item title="隐私说明" name="help2">
          <div class="text-sm text-gray-600">
            <p>你的 API Key 仅存储在本地设备上，不会上传到任何服务器。</p>
            <p class="mt-2">所有 AI 请求直接发送到你指定的 API 端点，本应用不做中转。</p>
          </div>
        </van-collapse-item>
      </van-collapse>
    </div>

    <!-- 提供商选择器 -->
    <van-popup v-model:show="showProviderPicker" position="bottom" round>
      <van-picker
        :columns="providerColumns"
        @confirm="onProviderConfirm"
        @cancel="showProviderPicker = false"
      />
    </van-popup>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { showToast } from 'vant'
import { useAISettingsStore } from '@/stores/aiSettings'

const store = useAISettingsStore()
const config = computed(() => store.config)
const isTesting = computed(() => store.isTesting)
const testResult = computed(() => store.testResult)

// UI 状态
const showProviderPicker = ref(false)
const activeHelp = ref<string[]>([])

// 温度值转换 (0-100 -> 0.0-2.0)
const temperatureValue = ref(Math.round((config.value.temperature || 0.7) * 50))

const providerColumns = [
  { text: 'OpenAI', value: 'openai' },
  { text: 'Claude (Anthropic)', value: 'claude' },
  { text: 'Gemini (Google)', value: 'gemini' },
  { text: '自定义/其他', value: 'custom' }
]

function onConfigChange() {
  store.save()
  showToast('配置已保存')
}

function onProviderConfirm({ selectedOptions }: any) {
  config.value.provider = selectedOptions[0].value
  showProviderPicker.value = false
  
  // 根据提供商设置默认模型
  const defaultModels: Record<string, string> = {
    openai: 'gpt-3.5-turbo',
    claude: 'claude-3-sonnet-20240229',
    gemini: 'gemini-pro',
    custom: ''
  }
  
  if (!config.value.model || config.value.model in defaultModels === false) {
    config.value.model = defaultModels[config.value.provider] || ''
  }
  
  store.save()
  showToast(`已选择 ${selectedOptions[0].text}`)
}

function onTempChange(value: number) {
  config.value.temperature = value / 50 // 转换为 0.0-2.0
  store.save()
}

function toggleApiKeyVisible() {
  // 切换 API Key 可见性（简单实现）
  showToast('请查看输入框')
}

async function testConnection() {
  const success = await store.test()
  if (success) {
    showToast({ message: '连接成功！', type: 'success' })
  } else {
    showToast({ message: '连接失败，请检查配置', type: 'fail' })
  }
}
</script>

<style scoped>
.ai-settings-page {
  min-height: 100vh;
  background: #f5f5f5;
}
</style>
