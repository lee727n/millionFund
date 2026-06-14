// [WHY] Capacitor 权限插件桥接 - 管理 Android 运行时权限
// [WHAT] 封装对原生 PermissionPlugin 的调用，提供 checkPermissions / requestPermissions
// [DEPS] 依赖 android/app/.../PermissionPlugin.java

import { registerPlugin } from '@capacitor/core'

export interface PermissionStatus {
  camera: 'GRANTED' | 'DENIED' | 'PROMPT' | 'PROMPT_WITH_RATIONALE'
  storage: 'GRANTED' | 'DENIED' | 'PROMPT' | 'PROMPT_WITH_RATIONALE'
  allGranted: boolean
}

export interface PermissionPlugin {
  checkPermissions(): Promise<PermissionStatus>
  requestPermissions(): Promise<PermissionStatus>
}

const Permissions = registerPlugin<PermissionPlugin>('PermissionPlugin', {
  web: () => import('./permissions.web').then(m => new m.PermissionPluginWeb()),
})

export async function checkPermissions(): Promise<PermissionStatus> {
  return await Permissions.checkPermissions()
}

export async function requestPermissions(): Promise<PermissionStatus> {
  return await Permissions.requestPermissions()
}
