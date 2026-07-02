/**
 * 同花顺财经新闻API
 * TODO: 需找替代数据源（可尝试以下方案）
 * 1. RSS feed: https://news.10jqka.com.cn/rss/ (需验证)
 * 2. RSSHub 路由: https://docs.rsshub.app/routes/finance#同花顺 (如有)
 * 3. 使用网页抓取（需处理反爬）
 * 4. 寻找同花顺开放平台 API
 */
export async function fetch10jqkaNews(page = 1, pageSize = 20): Promise<ApiNewsItem[]> {
  try {
    console.warn('[同花顺] 使用模拟数据（需找替代数据源）')
  } catch (e) {
    console.warn('[同花顺] 抓取失败，使用模拟数据', e)
  }
  
  return generateMock10jqkaNews(page, pageSize)
}
