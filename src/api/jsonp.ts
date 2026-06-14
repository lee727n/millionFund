// [WHY] 统一 JSONP 回调管理
// [WHAT] fund.ts 和 fundFast.ts 各自注册了 window.jsonpgz，后注册的覆盖先注册的
//        导致先注册那一方的请求永远得不到响应。本模块提供共享回调 + 多 handler 分发。
// [HOW] 两个 API 模块分别注册自己的 handler，window.jsonpgz 只注册一次，响应分发给所有 handler。

type JsonpHandler = (data: any) => void

const handlers = new Set<JsonpHandler>()
let initialized = false

/**
 * 注册 JSONP 响应处理器。
 * 每个 handler 在自己的 pending 队列中查找匹配的请求并 resolve。
 */
export function registerJsonpHandler(handler: JsonpHandler) {
  handlers.add(handler)
}

/**
 * 初始化全局 window.jsonpgz 回调（仅一次）
 */
export function initJsonpCallback() {
  if (initialized) return
  initialized = true

  ;(window as any).jsonpgz = (data: any) => {
    for (const handler of handlers) {
      try {
        handler(data)
      } catch (e) {
        console.error('[jsonp] handler error:', e)
      }
    }
  }
}
