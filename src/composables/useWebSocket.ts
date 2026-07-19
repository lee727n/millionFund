// [WHY] WebSocket 实时推送 composable
// [WHAT] 提供 WebSocket 连接管理，支持自动重连（指数退避）、心跳保活、连接状态管理
// [USAGE] const { connectionStatus, connect, disconnect, on } = useWebSocket()

import { ref, onUnmounted } from 'vue'

/**
 * 连接状态
 */
export type WebSocketStatus = 'connecting' | 'connected' | 'disconnected' | 'error'

/**
 * WebSocket 消息格式
 */
export interface WebSocketMessage {
  /** 消息类型 */
  type: 'index_update' | 'nav_update' | 'heartbeat' | 'error' | string
  /** 消息数据 */
  data: any
  /** 时间戳 */
  timestamp: number
}

/**
 * 指数更新数据
 */
export interface IndexUpdateData {
  code: string
  name: string
  current: number
  change: number
  changePercent: number
}

/**
 * 净值更新数据
 */
export interface NAVUpdateData {
  fundCode: string
  nav: number
  navDate: string
  changePercent: number
}

/**
 * WebSocket 配置
 */
interface WebSocketConfig {
  /** WebSocket 服务器 URL */
  url: string
  /** 心跳间隔（毫秒），默认 30000 */
  heartbeatInterval?: number
  /** 最大重连次数，默认 10 */
  maxReconnectAttempts?: number
  /** 初始重连延迟（毫秒），默认 1000 */
  reconnectDelay?: number
  /** 最大重连延迟（毫秒），默认 30000 */
  maxReconnectDelay?: number
}

/**
 * WebSocket 事件回调
 */
type WebSocketEventHandler<T = any> = (data: T) => void

/**
 * WebSocket composable
 * [WHAT] 管理 WebSocket 连接，提供自动重连、心跳、事件监听等功能
 */
export function useWebSocket(config?: WebSocketConfig, options?: { autoCleanup?: boolean }) {
  // ========== 状态 ==========
  
  /** 连接状态 */
  const connectionStatus = ref<WebSocketStatus>('disconnected')
  
  /** 当前 WebSocket 实例 */
  let ws: WebSocket | null = null
  
  /** 重连尝试次数 */
  let reconnectAttempts = 0
  
  /** 重连定时器 */
  let reconnectTimer: number | null = null
  
  /** 心跳定时器 */
  let heartbeatTimer: number | null = null
  
  /** 事件监听器 */
  const eventListeners = new Map<string, Set<WebSocketEventHandler>>()
  
  /** 默认配置 */
  const defaultConfig: WebSocketConfig = {
    url: '',
    heartbeatInterval: 30000,
    maxReconnectAttempts: 10,
    reconnectDelay: 1000,
    maxReconnectDelay: 30000
  }
  
  /** 当前配置 */
  let currentConfig: WebSocketConfig = { ...defaultConfig }
  
  // ========== 连接管理 ==========
  
  /**
   * 连接到 WebSocket 服务器
   * [WHAT] 建立 WebSocket 连接，设置事件处理器
   */
  function connect(url?: string): void {
    const wsUrl = url || currentConfig.url
    
    if (!wsUrl) {
      console.error('[useWebSocket] WebSocket URL 未配置')
      connectionStatus.value = 'error'
      return
    }
    
    // 更新配置
    if (url) {
      currentConfig.url = url
    }
    
    // 如果已连接，先断开
    if (ws) {
      ws.close()
    }
    
    try {
      connectionStatus.value = 'connecting'
      ws = new WebSocket(wsUrl)
      
      ws.onopen = handleOpen
      ws.onmessage = handleMessage
      ws.onclose = handleClose
      ws.onerror = handleError
      
    } catch (error) {
      console.error('[useWebSocket] 连接失败:', error)
      connectionStatus.value = 'error'
      scheduleReconnect()
    }
  }
  
  /**
   * 断开连接
   * [WHAT] 主动断开 WebSocket 连接，停止重连
   */
  function disconnect(): void {
    // 清除重连定时器
    if (reconnectTimer) {
      clearTimeout(reconnectTimer)
      reconnectTimer = null
    }
    
    // 清除心跳定时器
    stopHeartbeat()
    
    // 关闭连接
    if (ws) {
      ws.close()
      ws = null
    }
    
    connectionStatus.value = 'disconnected'
    reconnectAttempts = 0
  }
  
  /**
   * 处理连接打开
   */
  function handleOpen(): void {
    console.log('[useWebSocket] 连接成功')
    connectionStatus.value = 'connected'
    reconnectAttempts = 0
    
    // 启动心跳
    startHeartbeat()
    
    // 触发自定义事件
    emit('connected', null)
  }
  
  /**
   * 处理收到的消息
   */
  function handleMessage(event: MessageEvent): void {
    try {
      const message: WebSocketMessage = JSON.parse(event.data)
      
      // 处理心跳响应
      if (message.type === 'heartbeat') {
        // 心跳响应，忽略
        return
      }
      
      // 触发对应类型的事件
      emit(message.type, message.data)
      
      // 触发通用 message 事件
      emit('message', message)
      
    } catch (error) {
      console.error('[useWebSocket] 消息解析失败:', error)
    }
  }
  
  /**
   * 处理连接关闭
   */
  function handleClose(event: CloseEvent): void {
    console.log(`[useWebSocket] 连接关闭: code=${event.code}, reason=${event.reason}`)
    connectionStatus.value = 'disconnected'
    
    // 停止心跳
    stopHeartbeat()
    
    // 触发自定义事件
    emit('disconnected', { code: event.code, reason: event.reason })
    
    // 安排重连（如果不是主动断开）
    if (event.code !== 1000) {
      scheduleReconnect()
    }
  }
  
  /**
   * 处理连接错误
   */
  function handleError(error: Event): void {
    console.error('[useWebSocket] 连接错误:', error)
    connectionStatus.value = 'error'
    
    // 触发自定义事件
    emit('error', error)
  }
  
  // ========== 重连机制 ==========
  
  /**
   * 安排重连
   * [WHAT] 使用指数退避算法安排重连
   */
  function scheduleReconnect(): void {
    if (reconnectAttempts >= (currentConfig.maxReconnectAttempts || 10)) {
      console.log('[useWebSocket] 达到最大重连次数，停止重连')
      return
    }
    
    // 计算重连延迟（指数退避）
    const delay = calculateReconnectDelay()
    reconnectAttempts++
    
    console.log(`[useWebSocket] ${delay}ms 后尝试重连 (第 ${reconnectAttempts} 次)`)
    
    reconnectTimer = window.setTimeout(() => {
      console.log(`[useWebSocket] 正在重连...`)
      connect()
    }, delay)
  }
  
  /**
   * 计算重连延迟（指数退避）
   * [WHAT] 延迟 = min(reconnectDelay * 2^attempts, maxReconnectDelay)
   */
  function calculateReconnectDelay(): number {
    const base = currentConfig.reconnectDelay || 1000
    const max = currentConfig.maxReconnectDelay || 30000
    
    // 指数退避：base * 2^attempts，但不超过 max
    const delay = Math.min(base * Math.pow(2, reconnectAttempts), max)
    
    // 添加随机抖动（±20%），避免多个客户端同时重连
    const jitter = delay * 0.2 * (Math.random() - 0.5) * 2
    
    return Math.floor(delay + jitter)
  }
  
  // ========== 心跳机制 ==========
  
  /**
   * 启动心跳
   * [WHAT] 定期发送心跳消息，保持连接活跃
   */
  function startHeartbeat(): void {
    const interval = currentConfig.heartbeatInterval || 30000
    
    heartbeatTimer = window.setInterval(() => {
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({
          type: 'heartbeat',
          data: null,
          timestamp: Date.now()
        }))
      }
    }, interval)
  }
  
  /**
   * 停止心跳
   */
  function stopHeartbeat(): void {
    if (heartbeatTimer) {
      clearInterval(heartbeatTimer)
      heartbeatTimer = null
    }
  }
  
  // ========== 事件管理 ==========
  
  /**
   * 监听事件
   * [WHAT] 注册事件监听器
   * @param event 事件类型
   * @param handler 事件处理函数
   */
  function on<T = any>(event: string, handler: WebSocketEventHandler<T>): void {
    if (!eventListeners.has(event)) {
      eventListeners.set(event, new Set())
    }
    eventListeners.get(event)!.add(handler)
  }
  
  /**
   * 移除事件监听器
   * [WHAT] 移除指定事件的监听器
   */
  function off(event: string, handler: WebSocketEventHandler): void {
    const listeners = eventListeners.get(event)
    if (listeners) {
      listeners.delete(handler)
      if (listeners.size === 0) {
        eventListeners.delete(event)
      }
    }
  }
  
  /**
   * 触发事件
   * [WHAT] 触发所有注册的监听器
   */
  function emit(event: string, data: any): void {
    const listeners = eventListeners.get(event)
    if (listeners) {
      listeners.forEach(handler => {
        try {
          handler(data)
        } catch (error) {
          console.error(`[useWebSocket] 事件处理器错误 (${event}):`, error)
        }
      })
    }
  }
  
  /**
   * 发送消息
   * [WHAT] 向服务器发送消息
   */
  function send(message: WebSocketMessage): void {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(message))
    } else {
      console.warn('[useWebSocket] WebSocket 未连接，无法发送消息')
    }
  }
  
  // ========== 更新配置 ==========
  
  /**
   * 更新配置
   */
  function updateConfig(newConfig: Partial<WebSocketConfig>): void {
    currentConfig = { ...currentConfig, ...newConfig }
  }
  
  // ========== 清理 ==========
  
  /**
   * 清理资源
   */
  function cleanup(): void {
    disconnect()
    eventListeners.clear()
  }
  
  // 组件卸载时自动清理
  // [FIX] 单例模式（useDefaultWebSocket）下由引用计数统一管理断开，此处不注册自动清理
  if (options?.autoCleanup !== false) {
    onUnmounted(() => {
      cleanup()
    })
  }
  
  // ========== 返回 ==========
  
  return {
    // 状态
    connectionStatus,
    
    // 连接管理
    connect,
    disconnect,
    send,
    updateConfig,
    
    // 事件管理
    on,
    off,
    
    // 清理
    cleanup
  }
}

/**
 * 创建默认 WebSocket 实例（单例）
 * [WHAT] 提供一个全局 WebSocket 实例，供多个组件共享
 */
let defaultWebSocketInstance: ReturnType<typeof useWebSocket> | null = null
// [FIX] 引用计数：多个组件共享单例时，仅最后一个使用者卸载才真正断开
let wsRefCount = 0

export function useDefaultWebSocket(config?: WebSocketConfig): ReturnType<typeof useWebSocket> {
  if (!defaultWebSocketInstance) {
    // [FIX] 单例内部不自动清理，交由引用计数管理
    defaultWebSocketInstance = useWebSocket(config, { autoCleanup: false })
  }
  wsRefCount++

  // [FIX] 每个使用者卸载时减少引用计数，最后一个才真正断开，避免首个组件卸载就断开所有
  onUnmounted(() => {
    wsRefCount--
    if (wsRefCount <= 0) {
      wsRefCount = 0
      defaultWebSocketInstance?.cleanup()
      defaultWebSocketInstance = null
    }
  })

  return defaultWebSocketInstance
}

/**
 * 重置默认 WebSocket 实例
 * [WHAT] 用于测试或重新配置
 */
export function resetDefaultWebSocket(): void {
  if (defaultWebSocketInstance) {
    defaultWebSocketInstance.cleanup()
    defaultWebSocketInstance = null
  }
  wsRefCount = 0
}
