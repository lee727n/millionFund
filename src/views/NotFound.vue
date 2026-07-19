<!-- [WHY] 全局 404 兜底页面
[WHAT] 路由未匹配时展示「页面不存在」并引导用户返回首页 -->
<script setup lang="ts">
import { useRouter } from 'vue-router'

const router = useRouter()

function goHome(): void {
  router.push('/')
}
</script>

<template>
  <div class="not-found">
    <van-icon name="warning-o" class="not-found-icon" />
    <h1 class="not-found-title">页面不存在</h1>
    <p class="not-found-desc">抱歉，您访问的页面不存在或已被移除。</p>
    <van-button type="primary" round @click="goHome">返回首页</van-button>
  </div>
</template>

<style scoped>
.not-found {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 100vh;
  padding: 24px;
  text-align: center;
  gap: 12px;
  background: var(--bg-primary);
}

.not-found-icon {
  font-size: 64px;
  color: var(--text-tertiary);
}

.not-found-title {
  margin: 0;
  font-size: 22px;
  font-weight: 600;
  color: var(--text-primary);
}

.not-found-desc {
  margin: 0 0 12px;
  font-size: 14px;
  color: var(--text-secondary);
}
</style>
