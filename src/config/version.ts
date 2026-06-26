/**
 * 应用版本配置
 * [WHY] 集中管理版本号，便于版本更新检查
 * [WHAT] 版本号遵循语义化版本规范 MAJOR.MINOR.PATCH
 */

/** 当前应用版本号 */
export const APP_VERSION = '1.9.8'

/** 应用名称 */
export const APP_NAME = 'AI百万实盘'

/** 构建时间（由构建工具注入） */
export const BUILD_TIME = __BUILD_TIME__ || new Date().toISOString()
