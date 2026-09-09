// [WHY] 底部 Tabbar 由 App.vue 统一渲染，但全景大屏想「默认隐藏 + 顶部按钮手动开关」
// [WHAT] 用一个模块级 ref 做跨组件共享的「强制显示」开关
// [HOW] App.vue 里 hiddenTabbarPages 负责路由级默认隐藏；这里负责用户手动覆盖
// [NOTE] 故意不做持久化：全景页默认隐藏是设计意图，刷新后回到隐藏态才符合预期

import { ref, computed } from 'vue'

// [WHAT] 手动强制显示底部导航（仅在当前会话内有效）
const forceShow = ref(false)

export function useTabbar() {
  /** [WHAT] 当前是否处于「手动强制显示」状态 */
  const tabbarForceShow = computed(() => forceShow.value)

  /** [WHAT] 切换强制显示状态 */
  function toggleTabbar() {
    forceShow.value = !forceShow.value
  }

  /** [WHAT] 直接设置强制显示状态（进入/离开页面时复位用） */
  function setTabbarForceShow(value: boolean) {
    forceShow.value = value
  }

  return { tabbarForceShow, toggleTabbar, setTabbarForceShow }
}
