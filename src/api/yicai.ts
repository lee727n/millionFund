/**
 * 第一财经新闻API
 * TODO: 需找替代数据源（可尝试以下方案）
 * 1. RSS feed: https://www.yicai.com/rss/ (需验证)
 * 2. RSSHub 路由: https://docs.rsshub.app/routes/finance#第一财经 (如有)
 * 3. 使用网页抓取: https://www.yicai.com/
 * 4. 使用 Capitor HTTP 插件绕过 CORS
 */
export async function fetchYicaiNews(page = 1, pageSize = 20): Promise<ApiNewsItem[]> {
  try {
    console.warn('[第一财经] 使用模拟数据（需找替代数据源）')
  } catch (e) {
    console.warn('[第一财经] 抓取失败，使用模拟数据', e)
  }
  
  return generateMockYicaiNews(page, pageSize)
}
