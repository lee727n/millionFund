// [WHY] 统一管理组件内 setTimeout / setInterval / requestAnimationFrame 的生命周期
// [WHAT] 在 onUnmounted 时自动清除所有注册的定时器，防止内存泄漏
// [USAGE]
//   const { setTimeout: safeTimeout, setInterval: safeInterval, onUnmounted } = useTimer()
//   safeTimeout(() => doSomething(), 1000)
//   safeInterval(() => pollData(), 5000)
//   // --> 组件卸载时自动清理，无需手动调 clearTimeout/clearInterval

import { onScopeDispose, onUnmounted, getCurrentScope, getCurrentInstance } from 'vue'

export function useTimer() {
  const timeouts = new Set<ReturnType<typeof setTimeout>>()
  const intervals = new Set<ReturnType<typeof setInterval>>()
  const animationFrames = new Set<number>()

  function safeTimeout(fn: (...args: unknown[]) => void, delay: number, ...args: unknown[]): ReturnType<typeof setTimeout> {
    const id = setTimeout(() => {
      timeouts.delete(id)
      fn(...args)
    }, delay, ...args)
    timeouts.add(id)
    return id
  }

  function safeInterval(fn: (...args: unknown[]) => void, delay: number, ...args: unknown[]): ReturnType<typeof setInterval> {
    const id = setInterval(fn, delay, ...args)
    intervals.add(id)
    return id
  }

  function safeRaf(fn: FrameRequestCallback): number {
    const id = requestAnimationFrame(fn)
    animationFrames.add(id)
    return id
  }

  function clearSafeTimeout(id: ReturnType<typeof setTimeout> | undefined | null) {
    if (id != null) {
      clearTimeout(id)
      timeouts.delete(id)
    }
  }

  function clearSafeInterval(id: ReturnType<typeof setInterval> | undefined | null) {
    if (id != null) {
      clearInterval(id)
      intervals.delete(id)
    }
  }

  function clearSafeRaf(id: number | undefined | null) {
    if (id != null) {
      cancelAnimationFrame(id)
      animationFrames.delete(id)
    }
  }

  function cleanup() {
    timeouts.forEach(clearTimeout)
    timeouts.clear()
    intervals.forEach(clearInterval)
    intervals.clear()
    animationFrames.forEach(cancelAnimationFrame)
    animationFrames.clear()
  }

  // [WHY] 自动清理：组件卸载/作用域销毁时清除所有定时器，避免内存泄漏。
  // [WHAT] 优先用 onScopeDispose（任何 effect scope 内可用，含组件 setup）；
  //        若处于非组件作用域（无活跃 scope）但有组件实例，则退化为 onUnmounted。
  if (getCurrentScope()) {
    onScopeDispose(cleanup)
  } else if (getCurrentInstance()) {
    onUnmounted(cleanup)
  }

  return {
    safeTimeout,
    safeInterval,
    safeRaf,
    clearSafeTimeout,
    clearSafeInterval,
    clearSafeRaf,
    cleanup,
    timeouts,
    intervals,
    animationFrames,
  }
}