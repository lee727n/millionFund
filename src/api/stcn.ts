/**
 * 证券时报新闻API
 * TODO: 需找替代数据源（可尝试以下方案）
 * 1. RSS feed: http://www.stcn.com/rss/ (需验证)
 * 2. RSSHub 路由: https://docs.rsshub.app/routes/finance#证券时报 (如有)
 * 3. 使用网页抓取: http://www.stcn.com/
 * 4. 使用 Capitor HTTP 插件绕过 CORS
 */
export async function fetchSTCNNews(page = 1, pageSize = 20): Promise<ApiNewsItem[]> {
  try {
    console.warn('[证券时报] 使用模拟数据（需找替代数据源）')
  } catch (e) {
    console.warn('[证券时报] 抓取失败，使用模拟数据', e)
  }
  
  return generateMockSTCNNews(page, pageSize)
}
