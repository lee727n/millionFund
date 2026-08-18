/**
 * 节假日工具函数
 * [WHY] 用于判断某个日期是否是法定节假日，支持缓存以减少API调用
 * [API] 使用timor.tech节假日API（更稳定，已更新2026年数据）
 */

interface HolidayInfo {
  code: number
  type: {
    type: number // 0工作日、1周末、2节日、3调休放假、4补班
    name: string
  }
  holiday?: {
    holiday: boolean
    name: string
    wage: number
    date: string
    rest: number
  }
}

// 节假日缓存（内存缓存，避免频繁请求API）
const holidayCache = new Map<string, HolidayInfo>()

// localStorage缓存键名
const CACHE_KEY = 'holiday_cache'
const CACHE_EXPIRE_KEY = 'holiday_cache_expire'
const CACHE_EXPIRE_DAYS = 365 // 缓存有效期365天

// API更新频率控制
const LAST_UPDATE_KEY = 'holiday_last_update'
const UPDATE_INTERVAL_DAYS = 1 // 每天只更新一次节假日数据

/**
 * 从localStorage加载缓存
 */
function loadCacheFromStorage(): void {
  try {
    const cacheData = localStorage.getItem(CACHE_KEY)
    const expireTime = localStorage.getItem(CACHE_EXPIRE_KEY)

    if (cacheData && expireTime) {
      const now = Date.now()
      const expire = parseInt(expireTime, 10)

      // 检查缓存是否过期
      if (now < expire) {
        const data = JSON.parse(cacheData)
        Object.entries(data).forEach(([key, value]) => {
          holidayCache.set(key, value as HolidayInfo)
        })
        // console.log('[节假日缓存] 从localStorage加载成功，共', holidayCache.size, '条数据')
      } else {
        // 缓存过期，清除
        localStorage.removeItem(CACHE_KEY)
        localStorage.removeItem(CACHE_EXPIRE_KEY)
        localStorage.removeItem(LAST_UPDATE_KEY)
      }
    }
  } catch (error) {
    console.warn('[节假日缓存] 从localStorage加载失败', error)
  }
}

/**
 * 保存缓存到localStorage
 */
function saveCacheToStorage(): void {
  try {
    const data: Record<string, HolidayInfo> = {}
    holidayCache.forEach((value, key) => {
      data[key] = value
    })

    localStorage.setItem(CACHE_KEY, JSON.stringify(data))

    // 设置过期时间（365天后）
    const expireTime = Date.now() + CACHE_EXPIRE_DAYS * 24 * 60 * 60 * 1000
    localStorage.setItem(CACHE_EXPIRE_KEY, expireTime.toString())
  } catch (error) {
    console.warn('[节假日缓存] 保存到localStorage失败', error)
  }
}

/**
 * 检查是否需要更新节假日数据
 * [WHY] 控制API访问频率，每天只更新一次
 */
function shouldUpdateHolidays(): boolean {
  try {
    const lastUpdate = localStorage.getItem(LAST_UPDATE_KEY)
    if (lastUpdate) {
      const lastUpdateTime = parseInt(lastUpdate, 10)
      const now = Date.now()
      const interval = UPDATE_INTERVAL_DAYS * 24 * 60 * 60 * 1000

      // 如果距离上次更新不到1天，不需要更新
      if (now - lastUpdateTime < interval) {
        return false
      }
    }
    return true
  } catch (error) {
    return true
  }
}

// 预加载锁，防止重复触发
let isPreloading = false

/**
 * 批量更新节假日数据（预加载本年度和下年度数据）
 * [WHY] 减少API调用次数，使用年度API一次性获取全年数据
 */
async function preloadHolidays(): Promise<void> {
  // 防止重复触发
  if (isPreloading) {
    return
  }

  if (!shouldUpdateHolidays()) {
    return
  }

  isPreloading = true

  try {
    const now = new Date()
    const currentYear = now.getFullYear()

    // 加载本年度和下一年度的数据（处理跨年场景）
    const yearsToLoad = [currentYear, currentYear + 1]

    console.log('[节假日缓存] 开始预加载', yearsToLoad.join(', '), '年的数据')

    let successCount = 0

    // 使用timor.tech的年度API批量获取数据
    for (const year of yearsToLoad) {
      const apiUrl = `https://timor.tech/api/holiday/year/${year}`
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 8000) // 8秒超时，手机网络适当放宽

      try {
        const response = await fetch(apiUrl, {
          signal: controller.signal
        })
        clearTimeout(timeoutId)

        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`)
        }

        const data = await response.json()

        // 解析并存储节假日数据
        // timor.tech年度API返回格式: { "10-01": { holiday: true, name: "国庆节", wage: 3, ... }, ... }
        // 需要转换为 HolidayInfo 格式，与单日API返回一致
        if (data && typeof data === 'object') {
          Object.entries(data).forEach(([dateStr, info]) => {
            let fullDateStr = ''
            // 年度API返回的是 MM-DD 格式，需要拼接年份
            if (typeof dateStr === 'string' && dateStr.match(/^\d{2}-\d{2}$/)) {
              fullDateStr = `${year}-${dateStr}`
            } else if (typeof dateStr === 'string' && dateStr.match(/^\d{4}-\d{2}-\d{2}$/)) {
              // 兼容完整日期格式
              fullDateStr = dateStr
            } else {
              return
            }

            const rawInfo = info as any
            // 转换为统一的 HolidayInfo 格式
            // holiday=true 表示节假日（type=2节日 或 type=3调休放假）
            // holiday=false 且不是周末时，可能是补班（type=4）
            let typeNumber = 0
            if (rawInfo.holiday === true) {
              typeNumber = 2 // 标记为节日
            } else if (rawInfo.holiday === false) {
              // 补班日 holiday=false
              const d = new Date(fullDateStr)
              const dayOfWeek = d.getDay()
              if (dayOfWeek === 0 || dayOfWeek === 6) {
                typeNumber = 4 // 周末补班
              }
            }

            const convertedInfo: HolidayInfo = {
              code: 0,
              type: {
                type: typeNumber,
                name: rawInfo.name || ''
              },
              holiday: rawInfo.holiday !== undefined ? {
                holiday: rawInfo.holiday,
                name: rawInfo.name || '',
                wage: rawInfo.wage || 0,
                date: fullDateStr,
                rest: rawInfo.rest || 0
              } : undefined
            }

            holidayCache.set(fullDateStr, convertedInfo)
          })
          successCount++
        }
      } catch (error) {
        console.warn('[节假日缓存] 预加载失败', year, error)
      }
    }

    // 保存到localStorage
    saveCacheToStorage()

    // 只有至少有一个年份加载成功时，才记录更新时间，避免失败后无法重试
    if (successCount > 0) {
      localStorage.setItem(LAST_UPDATE_KEY, Date.now().toString())
    }

    console.log('[节假日缓存] 预加载完成，共', holidayCache.size, '条数据')
  } catch (error) {
    console.warn('[节假日缓存] 预加载失败', error)
  } finally {
    isPreloading = false
  }
}

// 页面加载时从localStorage加载缓存
loadCacheFromStorage()

// 页面加载时异步预加载节假日数据（不阻塞主线程）
setTimeout(() => {
  preloadHolidays().catch(err => {
    console.warn('[节假日缓存] 预加载失败', err)
  })
}, 1000) // 延迟1秒执行，避免阻塞页面加载

/**
 * 同步判断某个日期是否是节假日（使用缓存）
 * [WHY] 用于同步代码中，先检查缓存，如果没有缓存则使用硬编码判断
 * @param date 日期字符串，格式 '2026-06-19'
 * @returns boolean true表示是节假日，false表示不是
 */
export function isHolidaySync(date: string): boolean {
  // 先检查缓存
  if (holidayCache.has(date)) {
    const info = holidayCache.get(date)!
    // type: 2节日、3调休放假 表示节假日
    return info.type.type === 2 || info.type.type === 3
  }

  // 缓存中没有，使用硬编码判断（2026年节假日）
  const holidays2026 = [
    '2026-01-01', '2026-01-02', '2026-01-03', // 元旦
    '2026-02-15', '2026-02-16', '2026-02-17', '2026-02-18', '2026-02-19', '2026-02-20', '2026-02-21', '2026-02-22', '2026-02-23', // 春节
    '2026-04-04', '2026-04-05', '2026-04-06', // 清明节
    '2026-05-01', '2026-05-02', '2026-05-03', '2026-05-04', '2026-05-05', // 劳动节
    '2026-06-19', '2026-06-20', '2026-06-21', // 端午节
    '2026-09-25', '2026-09-26', '2026-09-27', // 中秋节
    '2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04', '2026-10-05', '2026-10-06', '2026-10-07' // 国庆节
  ]

  const isHolidayResult = holidays2026.includes(date)

  // 如果缓存中没有数据，触发预加载（使用预加载锁防止重复触发）
  if (holidayCache.size === 0 && !isPreloading) {
    preloadHolidays().catch(err => {
      console.warn('[节假日缓存] 预加载失败', err)
    })
  }

  return isHolidayResult
}

/**
 * 查询某个日期是否是节假日（异步版本，使用timor.tech API）
 * @param date 日期字符串，格式 '2026-06-19'
 * @returns Promise<boolean> true表示是节假日，false表示不是
 */
export async function isHoliday(date: string): Promise<boolean> {
  // 先检查缓存
  if (holidayCache.has(date)) {
    const info = holidayCache.get(date)!
    // type: 2节日、3调休放假 表示节假日
    return info.type.type === 2 || info.type.type === 3
  }

  try {
    // 调用timor.tech节假日API（添加超时机制）
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 3000) // 3秒超时

    const response = await fetch(`https://timor.tech/api/holiday/info/${date}`, {
      signal: controller.signal
    })
    clearTimeout(timeoutId)

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`)
    }

    const data: HolidayInfo = await response.json()

    // 存入缓存
    holidayCache.set(date, data)

    // 保存到localStorage
    saveCacheToStorage()

    // type: 2节日、3调休放假 表示节假日
    return data.type.type === 2 || data.type.type === 3
  } catch (error) {
    // API调用失败时，不打印错误日志，避免刷屏
    return false
  }
}

/**
 * 获取前一个工作日（跳过周末和节假日）
 * @param date 当前日期
 * @returns string 前一个工作日的日期字符串（同步版本，使用缓存）
 */
export function getPrevWorkdaySync(date: string): string {
  const dateObj = new Date(date)
  let prevDate = new Date(dateObj)
  prevDate.setDate(prevDate.getDate() - 1)

  let prevDateStr = prevDate.toISOString().split('T')[0]
  const dayOfWeek = prevDate.getDay()

  // 如果是周末，先跳到上周五
  if (dayOfWeek === 0) {
    // 周日 → 上周五（2天前）
    prevDate.setDate(prevDate.getDate() - 2)
    prevDateStr = prevDate.toISOString().split('T')[0]
  } else if (dayOfWeek === 6) {
    // 周六 → 昨天（周五）
    prevDate.setDate(prevDate.getDate() - 1)
    prevDateStr = prevDate.toISOString().split('T')[0]
  }

  // 检查是否是节假日，如果是则继续往前推
  let maxAttempts = 10 // 最多往前推10天，避免死循环
  while (maxAttempts > 0) {
    const isHolidayResult = isHolidaySync(prevDateStr)
    if (!isHolidayResult) {
      // 不是节假日，返回这个日期
      return prevDateStr
    }

    // 是节假日，继续往前推一天
    prevDate.setDate(prevDate.getDate() - 1)
    prevDateStr = prevDate.toISOString().split('T')[0]
    maxAttempts--
  }

  // 如果推了10天还是节假日，直接返回当前的前一天（兜底逻辑）
  console.warn('[获取前一个工作日失败]', date, '已往前推10天仍为节假日')
  return prevDateStr
}

/**
 * 获取前一个工作日（跳过周末和节假日）- 异步版本
 * @param date 当前日期
 * @returns Promise<string> 前一个工作日的日期字符串
 */
export async function getPrevWorkday(date: string): Promise<string> {
  const dateObj = new Date(date)
  let prevDate = new Date(dateObj)
  prevDate.setDate(prevDate.getDate() - 1)

  let prevDateStr = prevDate.toISOString().split('T')[0]
  const dayOfWeek = prevDate.getDay()

  // 如果是周末，先跳到上周五
  if (dayOfWeek === 0) {
    // 周日 → 上周五（2天前）
    prevDate.setDate(prevDate.getDate() - 2)
    prevDateStr = prevDate.toISOString().split('T')[0]
  } else if (dayOfWeek === 6) {
    // 周六 → 昨天（周五）
    prevDate.setDate(prevDate.getDate() - 1)
    prevDateStr = prevDate.toISOString().split('T')[0]
  }

  // 检查是否是节假日，如果是则继续往前推
  let maxAttempts = 10 // 最多往前推10天，避免死循环
  while (maxAttempts > 0) {
    const isHolidayResult = await isHoliday(prevDateStr)
    if (!isHolidayResult) {
      // 不是节假日，返回这个日期
      return prevDateStr
    }

    // 是节假日，继续往前推一天
    prevDate.setDate(prevDate.getDate() - 1)
    prevDateStr = prevDate.toISOString().split('T')[0]
    maxAttempts--
  }

  // 如果推了10天还是节假日，直接返回当前的前一天（兜底逻辑）
  console.warn('[获取前一个工作日失败]', date, '已往前推10天仍为节假日')
  return prevDateStr
}

/**
 * 清空节假日缓存
 */
export function clearHolidayCache(): void {
  holidayCache.clear()
  localStorage.removeItem(CACHE_KEY)
  localStorage.removeItem(CACHE_EXPIRE_KEY)
  localStorage.removeItem(LAST_UPDATE_KEY)
}