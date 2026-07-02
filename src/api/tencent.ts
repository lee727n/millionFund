/**
 * 腾讯财经新闻API
 */
import type { ApiNewsItem } from '../types/news'

/**
 * 抓取腾讯财经新闻
 * TODO: 需找替代数据源（可尝试以下方案）
 * 1. RSS feed: https://finance.qq.com/rss.htm (需验证)
 * 2. RSSHub 路由: https://docs.rsshub.app/routes/finance#腾讯财经 (如有)
 * 3. 使用网页抓取（需处理反爬）
 * 4. 寻找公开的腾讯财经 API
 */
export async function fetchTencentNews(page = 1, pageSize = 20): Promise<ApiNewsItem[]> {
  try {
    // TODO: 实现真实 API 调用
    console.warn('[腾讯财经] 使用模拟数据（需找替代数据源）')
  } catch (e) {
    console.warn('[腾讯财经] 抓取失败，使用模拟数据', e)
  }
  
  // 模拟数据
  return generateMockTencentNews(page, pageSize)
}
