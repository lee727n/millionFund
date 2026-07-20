<template>
  <div class="not-found">
    <van-icon name="failure" size="64" color="#ee0a24" />
    <h2>404</h2>
    <p>抱歉，您访问的页面不存在</p>
    <van-button type="primary" @click="goHome">返回首页</van-button>
  </div>
</template>

<script setup lang="ts">
import { useRouter } from 'vue-router'

const router = useRouter()

function goHome() {
  router.replace('/')
}
</script>

<style scoped>
.not-found {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 60vh;
  gap: 12px;
  text-align: center;
  padding: 24px;
  color: var(--text-color, #323233);
}
.not-found h2 {
  margin: 0;
  font-size: 32px;
}
</style>
