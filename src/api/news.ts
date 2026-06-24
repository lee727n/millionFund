// [WHY] 资讯聚合统一入口 - 聚合多个数据源的资讯API
// [WHAT] 提供统一的资讯获取接口，根据数据源类型调用对应的API模块
// [DEPS] 依赖 jin10、cls、xueqiu、choice 等API模块

import type { NewsSource } from '@/types/news'

// 导入金十数据API
import {
  fetchNewsList as jin10FetchNewsList,
  fetchFlashNews as jin10FetchFlash,
  fetchEconomicCalendar as jin10FetchCalendar,
  type NewsItem as Jin10NewsItem,
  type FlashItem as Jin10FlashItem,
  type CalendarItem as Jin10CalendarItem,
} from '@/api/jin10'

// 导入财联社API
import {
  fetchClsTelegram as clsFetchTelegram,
  fetchClsHotTopics as clsFetchHotTopics,
  fetchClsPlateMovement as clsFetchPlate,
  type TelegramItem as ClsTelegramItem,
  type HotTopic as ClsHotTopic,
  type PlateMovement as ClsPlateMovement,
} from '@/api/cls'

// 导入雪球API
import {
  fetchHotDiscussions as xueqiuFetchDiscussions,
  fetchStockSentimentList as xueqiuFetchSentiment,
  fetchUserViews as xueqiuFetchViews,
  type HotDiscussion as XueqiuDiscussion,
  type StockSentiment as XueqiuSentiment,
  type UserView as XueqiuUserView,
} from '@/api/xueqiu'

// 导入东方财富Choice API
import {
  fetchNorthFlow as choiceFetchNorth,
  fetchSectorFlows as choiceFetchSector,
  fetchMainForceFlow as choiceFetchMainForce,
  type NorthFlowData as ChoiceNorthFlow,
  type SectorFlow as ChoiceSectorFlow,
  type MainForceFlow as ChoiceMainForce,
} from '@/api/choice'

// ========== 重新导出类型，保持API一致性 ==========

export type {
  Jin10NewsItem as NewsItem,
  Jin10FlashItem as FlashItem,
  Jin10CalendarItem as CalendarItem,
  ClsTelegramItem as TelegramItem,
  ClsHotTopic as HotTopic,
  ClsPlateMovement as PlateMovement,
  XueqiuDiscussion as HotDiscussion,
  XueqiuSentiment as StockSentiment,
  XueqiuUserView as UserView,
  ChoiceNorthFlow as NorthFlowData,
  ChoiceSectorFlow as SectorFlow,
  ChoiceMainForce as MainForceFlow,
}

// ========== 金十数据 API 封装 ==========

/**
 * 获取金十数据快讯
 * @returns {Promise<Jin10FlashItem[]>} 快讯列表
 */
export async function fetchJin10Flash(): Promise<Jin10FlashItem[]> {
  try {
    return await jin10FetchFlash()
  } catch (error) {
    console.error('[news.ts] 获取金十快讯失败:', error)
    return []
  }
}

/**
 * 获取金十数据新闻列表
 * @param {number} page - 页码
 * @param {number} pageSize - 每页数量
 * @param {string} category - 分类
 * @returns {Promise<Jin10NewsItem[]>} 新闻列表
 */
export async function fetchJin10News(
  page = 1,
  pageSize = 20,
  category = 'all'
): Promise<Jin10NewsItem[]> {
  try {
    return await jin10FetchNewsList(page, pageSize, category)
  } catch (error) {
    console.error('[news.ts] 获取金十新闻失败:', error)
    return []
  }
}

/**
 * 获取金十经济日历
 * @param {string} date - 日期 (YYYY-MM-DD)
 * @returns {Promise<Jin10CalendarItem[]>} 日历事件列表
 */
export async function fetchJin10Calendar(
  date?: string
): Promise<Jin10CalendarItem[]> {
  try {
    return await jin10FetchCalendar(date)
  } catch (error) {
    console.error('[news.ts] 获取金十日历失败:', error)
    return []
  }
}

// ========== 财联社 API 封装 ==========

/**
 * 获取财联社电报快讯
 * @param {number} limit - 数量限制
 * @returns {Promise<ClsTelegramItem[]>} 电报列表
 */
export async function fetchCailianNews(
  limit = 20
): Promise<ClsTelegramItem[]> {
  try {
    return await clsFetchTelegram(limit)
  } catch (error) {
    console.error('[news.ts] 获取财联社电报失败:', error)
    return []
  }
}

/**
 * 获取财联社热门主题
 * @returns {Promise<ClsHotTopic[]>} 热门主题列表
 */
export async function fetchCailianHotTopics(): Promise<ClsHotTopic[]> {
  try {
    return await clsFetchHotTopics()
  } catch (error) {
    console.error('[news.ts] 获取财联社热门主题失败:', error)
    return []
  }
}

/**
 * 获取财联社板块异动
 * @returns {Promise<ClsPlateMovement[]>} 板块异动列表
 */
export async function fetchCailianPlate(): Promise<ClsPlateMovement[]> {
  try {
    return await clsFetchPlate()
  } catch (error) {
    console.error('[news.ts] 获取财联社板块异动失败:', error)
    return []
  }
}

// ========== 雪球 API 封装 ==========

/**
 * 获取雪球热门讨论
 * @param {'fund' | 'stock'} type - 类型
 * @param {number} count - 数量
 * @returns {Promise<XueqiuDiscussion[]>} 讨论列表
 */
export async function fetchXueqiuDiscussions(
  type: 'fund' | 'stock' = 'fund',
  count = 20
): Promise<XueqiuDiscussion[]> {
  try {
    return await xueqiuFetchDiscussions(type, count)
  } catch (error) {
    console.error('[news.ts] 获取雪球讨论失败:', error)
    return []
  }
}

/**
 * 获取雪球股票/基金情绪
 * @param {'fund' | 'stock'} type - 类型
 * @param {number} count - 数量
 * @returns {Promise<XueqiuSentiment[]>} 情绪列表
 */
export async function fetchXueqiuSentiment(
  type: 'fund' | 'stock' = 'fund',
  count = 10
): Promise<XueqiuSentiment[]> {
  try {
    return await xueqiuFetchSentiment(type, count)
  } catch (error) {
    console.error('[news.ts] 获取雪球情绪失败:', error)
    return []
  }
}

/**
 * 获取雪球大V观点
 * @param {number} count - 数量
 * @returns {Promise<XueqiuUserView[]>} 观点列表
 */
export async function fetchXueqiuViews(
  count = 10
): Promise<XueqiuUserView[]> {
  try {
    return await xueqiuFetchViews(count)
  } catch (error) {
    console.error('[news.ts] 获取雪球大V观点失败:', error)
    return []
  }
}

// ========== 东方财富 Choice API 封装 ==========

/**
 * 获取北向资金数据
 * @returns {Promise<ChoiceNorthFlow | null>} 北向资金数据
 */
export async function fetchChoiceNorthFlow(): Promise<ChoiceNorthFlow | null> {
  try {
    return await choiceFetchNorth()
  } catch (error) {
    console.error('[news.ts] 获取北向资金失败:', error)
    return null
  }
}

/**
 * 获取板块资金流向
 * @param {number} count - 数量
 * @returns {Promise<ChoiceSectorFlow[]>} 板块资金列表
 */
export async function fetchChoiceSectorFlows(
  count = 10
): Promise<ChoiceSectorFlow[]> {
  try {
    return await choiceFetchSector(count)
  } catch (error) {
    console.error('[news.ts] 获取板块资金失败:', error)
    return []
  }
}

/**
 * 获取主力资金流向
 * @returns {Promise<ChoiceMainForce[]>} 主力资金列表
 */
export async function fetchChoiceMainForce(): Promise<ChoiceMainForce[]> {
  try {
    return await choiceFetchMainForce()
  } catch (error) {
    console.error('[news.ts] 获取主力资金失败:', error)
    return []
  }
}

// ========== 统一入口函数 ==========

/**
 * 统一资讯获取入口
 * 根据数据源类型调用对应的API
 * 
 * @param {NewsSource} source - 数据源类型
 * @param {Object} options - 可选参数
 * @returns {Promise<any>} 对应数据源的数据
 * 
 * @example
 * // 获取金十快讯
 * const flash = await fetchNews('jin10', { type: 'flash' })
 * 
 * @example
 * // 获取财联社电报
 * const telegram = await fetchNews('cailian', { type: 'telegram' })
 */
export async function fetchNews(
  source: NewsSource,
  options?: {
    type?: string
    page?: number
    pageSize?: number
    category?: string
    limit?: number
    count?: number
  }
): Promise<any> {
  switch (source) {
    case 'jin10':
      if (options?.type === 'flash') {
        return await fetchJin10Flash()
      } else if (options?.type === 'calendar') {
        return await fetchJin10Calendar()
      } else {
        return await fetchJin10News(
          options?.page,
          options?.pageSize,
          options?.category
        )
      }

    case 'cailian':
      if (options?.type === 'telegram') {
        return await fetchCailianNews(options?.limit)
      } else if (options?.type === 'hotTopics') {
        return await fetchCailianHotTopics()
      } else if (options?.type === 'plate') {
        return await fetchCailianPlate()
      } else {
        // 默认返回电报
        return await fetchCailianNews(options?.limit)
      }

    case 'xueqiu':
      if (options?.type === 'discussion') {
        return await fetchXueqiuDiscussions(
          (options?.category as 'fund' | 'stock') || 'fund',
          options?.count
        )
      } else if (options?.type === 'sentiment') {
        return await fetchXueqiuSentiment(
          (options?.category as 'fund' | 'stock') || 'fund',
          options?.count
        )
      } else if (options?.type === 'views') {
        return await fetchXueqiuViews(options?.count)
      } else {
        // 默认返回讨论
        return await fetchXueqiuDiscussions('fund', options?.count)
      }

    case 'eastmoney':
      if (options?.type === 'north') {
        return await fetchChoiceNorthFlow()
      } else if (options?.type === 'sector') {
        return await fetchChoiceSectorFlows(options?.count)
      } else if (options?.type === 'mainforce') {
        return await fetchChoiceMainForce()
      } else {
        // 默认返回北向资金
        return await fetchChoiceNorthFlow()
      }

    default:
      console.warn(`[news.ts] 未知的数据源: ${source}`)
      return []
  }
}

// ========== 默认导出 ==========

export default {
  fetchJin10Flash,
  fetchJin10News,
  fetchJin10Calendar,
  fetchCailianNews,
  fetchCailianHotTopics,
  fetchCailianPlate,
  fetchXueqiuDiscussions,
  fetchXueqiuSentiment,
  fetchXueqiuViews,
  fetchChoiceNorthFlow,
  fetchChoiceSectorFlows,
  fetchChoiceMainForce,
  fetchNews,
}
