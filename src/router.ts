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
      path: '/alerts',
      name: 'alerts',
      component: () => import('@/views/Alerts.vue'),
      meta: { title: '涨跌提醒' }
    },
    {
      path: '/holding/add',
      name: 'holding-add',
      component: () => import('@/views/HoldingEdit.vue'),
      meta: { title: '添加持仓' }
    },
    {
      path: '/holding/edit/:code',
      name: 'holding-edit',
      component: () => import('@/views/HoldingEdit.vue'),
      meta: { title: '编辑持仓' }
    },
    {
      path: '/watchlist',
      name: 'watchlist',
      component: () => import('@/views/Watchlist.vue'),
      meta: { title: '自选列表' }
    },
    {
      path: '/mine',
      name: 'mine',
      component: () => import('@/views/Mine.vue'),
      meta: { title: '我的' }
    },
    {
      path: '/ai-settings',
      name: 'ai-settings',
      component: () => import('@/views/AISettings.vue'),
      meta: { title: 'AI 配置' }
    },
    {
      path: '/:pathMatch(.*)*',
      redirect: '/'
    }
  ]
})

export default router
