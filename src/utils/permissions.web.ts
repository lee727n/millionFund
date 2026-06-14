// [WHY] Web 环境下权限插件的空实现
// [WHAT] Web 不需要运行时权限，始终返回 GRANTED

import type { PermissionStatus, PermissionPlugin } from './permissions'

export class PermissionPluginWeb implements PermissionPlugin {
  async checkPermissions(): Promise<PermissionStatus> {
    return { camera: 'GRANTED', storage: 'GRANTED', allGranted: true }
  }

  async requestPermissions(): Promise<PermissionStatus> {
    return { camera: 'GRANTED', storage: 'GRANTED', allGranted: true }
  }
}
