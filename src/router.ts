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
      meta: { title: '自选', keepAlive: true }
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
    },
    {
      path: '/market',
      name: 'market',
      component: () => import('@/views/Market.vue'),
      meta: { title: '市场指数', keepAlive: true }
    },
    {
      path: '/ai-tracking',
      name: 'ai-tracking',
      component: () => import('@/views/AITracking.vue'),
      meta: { title: 'AI追踪', keepAlive: true }
    },
    {
      path: '/portfolio',
      name: 'portfolio',
      component: () => import('@/views/Portfolio.vue'),
      meta: { title: '持仓总览', keepAlive: true }
    },
    {
      path: '/panorama',
      name: 'panorama',
      component: () => import('@/views/PanoramaDashboard.vue'),
      meta: { title: '全景大屏' }
    },
    {
      path: '/trade-center',
      name: 'trade-center',
      component: () => import('@/views/TradeCenter.vue'),
      meta: { title: '交易中心' }
    },
    {
      path: '/ai-tracking/detail/:sellCode/:sellName/:buyCode/:buyName/:sellNav/:buyNav/:sellPrice/:buyPrice/:sellChange/:buyChange/:date/:sellNavEstimated/:buyNavEstimated',
      name: 'ai-tracking-detail',
      component: () => import('@/views/AITrackingDetail.vue'),
      meta: { title: '调仓详情' }
    }
  ]
})

export default router
