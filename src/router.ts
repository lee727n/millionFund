// [WHY] 配置 Vue Router，定义页面路由
// [WHAT] 主要页面：首页、持仓、详情

import { createRouter, createWebHistory } from 'vue-router'

const router = createRouter({
  history: createWebHistory(),
  scrollBehavior() {
    return { top: 0 }
  },
  routes: [
    {
      path: '/',
      name: 'home',
      component: () => import('@/views/Home.vue'),
      meta: { title: '自选' }
    },
    {
      path: '/portfolio',
      name: 'portfolio',
      component: () => import('@/views/Portfolio.vue'),
      meta: { title: '资产总览' }
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
      path: '/ai-tracking',
      name: 'ai-tracking',
      component: () => import('@/views/AITracking.vue'),
      meta: { title: 'AI追踪' }
    },
    {
      path: '/news',
      name: 'news',
      component: () => import('@/views/News.vue'),
      meta: { title: '财经资讯' }
    },
    {
      path: '/finance-news',
      name: 'finance-news',
      component: () => import('@/views/FinanceNews.vue'),
      meta: { title: '金融资讯' }
    },
    {
      path: '/market',
      name: 'market',
      component: () => import('@/views/Market.vue'),
      meta: { title: '市场概览' }
    },
    {
      path: '/trades/:code',
      name: 'trades',
      component: () => import('@/views/Trades.vue'),
      meta: { title: '交易记录' }
    },
    {
      path: '/about',
      name: 'about',
      component: () => import('@/views/About.vue'),
      meta: { title: '关于' }
    },
    {
      path: '/watchlist',
      name: 'watchlist',
      component: () => import('@/views/Home.vue'),
      meta: { title: '自选' }
    },
    {
      path: '/mine',
      name: 'mine',
      component: () => import('@/views/Holding.vue'),
      meta: { title: '我的' }
    },
    {
      path: '/alerts',
      name: 'alerts',
      component: () => import('@/views/Alerts.vue'),
      meta: { title: '涨跌提醒' }
    },
    {
      path: '/:pathMatch(.*)*',
      redirect: '/'
    }
  ]
})

export default router
