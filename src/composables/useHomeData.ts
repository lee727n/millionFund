// [WHY] 首页数据 composable - 分离数据获取逻辑与 UI 渲染
// [WHAT] 集中管理大盘指数、全球指数、交易状态等数据的获取和缓存
// [USAGE] const { indices, globalIndices, tradingSession, refreshAll, loadIndices, loadGlobalIndices } = useHomeData()

import { ref, computed, onMounted, onUnmounted } from 'vue'
import { fetchMarketIndicesFast, fetchGlobalIndices, type MarketIndexSimple, type GlobalIndex } from '@/api/fundMarket'
import { getTradingSession, type TradingSession } from '@/api/tiantianApi'
import { logger } from '@/utils/logger'
import { useDefaultWebSocket, type IndexUpdateData } from './useWebSocket'

export function useHomeData() {
  // 大盘指数
  const indices = ref<MarketIndexSimple[]>([])
  
  // 全球指数
  const globalIndices = ref<GlobalIndex[]>([])
  
  // 当前交易时段
  const tradingSession = ref<TradingSession>('closed')
  
  // 当前时间（每秒更新）
  const currentTime = ref(new Date())
  
  // 刷新状态
  const isRefreshing = ref(false)
  
  // WebSocket 连接（用于实时更新）- 使用单例
  const { connectionStatus, connect, on, off } = useDefaultWebSocket()
  
  // 沪深300实时涨跌幅
  const hs300ChangePercent = computed(() => {
    const hs300 = indices.value.find(idx => idx.code === '000300')
    return hs300 ? hs300.changePercent : 0
  })
  
  // 顶部展示指数
  const topIndices = computed(() => {
    const result: MarketIndexSimple[] = []
    const shIndex = indices.value.find(idx => idx.code === '000001')
    const cyIndex = indices.value.find(idx => idx.code === '399006')
    const nasdaqIndex = globalIndices.value.find(idx => idx.name.includes('纳斯达克'))
    
    if (shIndex) result.push(shIndex)
    if (cyIndex) result.push(cyIndex)
    if (nasdaqIndex) {
      result.push({
        code: nasdaqIndex.code,
        name: '纳斯达克',
        current: nasdaqIndex.price,
        change: nasdaqIndex.price * nasdaqIndex.changePercent / 100,
        changePercent: nasdaqIndex.changePercent
      })
    }
    
    return result
  })
  
  // 合并后的指数列表
  const combinedIndices = computed(() => {
    const addedIndexNames = new Set(indices.value.map(idx => idx.name))
    const result: MarketIndexSimple[] = [...indices.value]
    
    globalIndices.value.forEach(gidx => {
      if (!addedIndexNames.has(gidx.name)) {
        addedIndexNames.add(gidx.name)
        result.push({
          code: gidx.code,
          name: gidx.name,
          current: gidx.price,
          change: gidx.price * gidx.changePercent / 100,
          changePercent: gidx.changePercent
        })
      }
    })
    
    return result
  })
  
  // 移动端专用指数列表
  const mobileIndices = computed(() => {
    const targetIndices = ['上证指数', '恒生指数', '日经225', '道琼斯', '标普500', '纳斯达克']
    return targetIndices.map(name => combinedIndices.value.find(idx => idx.name === name)).filter(Boolean) as MarketIndexSimple[]
  })
  
  // 交易状态定时器
  let tradingSessionInterval: number | undefined
  
  // [WHAT] 处理指数更新（WebSocket 推送）
  function handleIndexUpdate(updateData: IndexUpdateData): void {
    logger.debug('收到指数更新', updateData)
    
    // 更新大盘指数
    const indexIdx = indices.value.findIndex(idx => idx.code === updateData.code)
    if (indexIdx !== -1) {
      indices.value[indexIdx] = {
        ...indices.value[indexIdx],
        current: updateData.current,
        change: updateData.change,
        changePercent: updateData.changePercent
      }
    }
    
    // 更新全球指数
    const globalIdx = globalIndices.value.findIndex(idx => idx.code === updateData.code)
    if (globalIdx !== -1) {
      globalIndices.value[globalIdx] = {
        ...globalIndices.value[globalIdx],
        price: updateData.current,
        changePercent: updateData.changePercent
      }
    }
  }
  
  // [WHAT] 加载大盘指数
  async function loadIndices() {
    try {
      logger.debug('loadIndices start')
      indices.value = await fetchMarketIndicesFast()
      logger.info('loadIndices ok', { count: indices.value.length })
    } catch (err) {
      logger.error('loadIndices failed', err)
    }
  }
  
  // [WHAT] 加载全球指数
  async function loadGlobalIndices() {
    try {
      logger.debug('loadGlobalIndices start')
      globalIndices.value = await fetchGlobalIndices()
      logger.info('loadGlobalIndices ok', { count: globalIndices.value.length })
    } catch (err) {
      logger.error('loadGlobalIndices failed', err)
    }
  }
  
  // [WHAT] 更新交易状态
  function updateTradingSession() {
    tradingSession.value = getTradingSession()
    currentTime.value = new Date()
  }
  
  // [WHAT] 刷新所有市场数据
  async function refreshAll() {
    if (isRefreshing.value) return
    isRefreshing.value = true
    logger.info('refreshData start')
    try {
      await Promise.all([
        loadIndices(),
        loadGlobalIndices(),
      ])
      logger.info('refreshData ok', {
        indicesCount: indices.value.length,
        globalCount: globalIndices.value.length,
      })
    } catch (err) {
      logger.error('refreshData failed', err)
    } finally {
      isRefreshing.value = false
    }
  }
  
  // [WHAT] 初始化数据
  function init() {
    updateTradingSession()
    // 每秒更新交易状态，确保秒钟显示准确
    tradingSessionInterval = window.setInterval(updateTradingSession, 1000)
    
    // 连接 WebSocket（如果有配置 URL）
    const wsUrl = import.meta.env.VITE_WS_URL as string | undefined
    if (wsUrl) {
      // 注册指数更新监听器
      on('index_update', handleIndexUpdate)
      
      // 连接 WebSocket
      connect(wsUrl)
      logger.info('WebSocket 连接中...', { url: wsUrl })
    }
  }
  
  // [WHAT] 清理定时器
  function cleanup() {
    if (tradingSessionInterval) {
      clearInterval(tradingSessionInterval)
      tradingSessionInterval = undefined
    }
    
    // 清理 WebSocket
    off('index_update', handleIndexUpdate)
    // Note: 不主动断开 WebSocket，因为它可能被多个组件共享
  }
  
  onMounted(init)
  onUnmounted(cleanup)
  
  return {
    // 状态
    indices,
    globalIndices,
    tradingSession,
    currentTime,
    isRefreshing,
    // WebSocket 连接状态
    connectionStatus,
    // 计算属性
    hs300ChangePercent,
    topIndices,
    combinedIndices,
    mobileIndices,
    // 方法
    loadIndices,
    loadGlobalIndices,
    updateTradingSession,
    refreshAll,
    cleanup,
  }
}
