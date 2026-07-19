/**
 * 应用版本配置
 * [WHY] 集中管理版本号，便于版本更新检查
 * [WHAT] 版本号遵循语义化版本规范 MAJOR.MINOR.PATCH
 */

/** 当前应用版本号（由 vite define 注入，源自 package.json，避免手动同步） */
export const APP_VERSION = import.meta.env.VITE_APP_VERSION

/** 应用名称 */
export const APP_NAME = 'AI百万资产'

/** 构建时间（由构建工具注入） */
export const BUILD_TIME = __BUILD_TIME__ || new Date().toISOString()
