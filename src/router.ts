// [WHY] 配置 Vue Router，定义页面路由
// [WHAT] 主要页面：首页、持仓、详情

import { createRouter, createWebHistory } from 'vue-router'

const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: '/',
      name: 'home',
      component: () => import('@/views/Home.vue'),
      meta: { title: '自选' }
    },
    {
      path: '/holding',
      name: 'holding',
      component: () => import('@/views/Holding.vue'),
      meta: { title: '持仓' }
    },
    {
      path: '/search',
      name: 'search',
      component: () => import('@/views/Search.vue'),
      meta: { title: '搜索基金' }
    },
    {
      path: '/detail/:code',
      name: 'detail',
      component: () => import('@/views/Detail.vue'),
      meta: { title: '基金详情' }
    }
  ]
})

export default router
