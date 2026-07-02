/**
 * 腾讯财经新闻API
 */
import type { ApiNewsItem } from '../types/news'

/**
 * 抓取腾讯财经新闻
 * TODO: 需找替代数据源（腾讯财经有反爬，建议使用 RSS 或公开 API）
 */
export async function fetchTencentNews(page = 1, pageSize = 20): Promise<ApiNewsItem[]> {
  try {
    // TODO: 实现真实 API 调用
    // 可尝试的替代方案：
    // 1. 腾讯财经 RSS: https://finance.qq.com/rss.htm (需验证)
    // 2. 使用网页抓取（需处理反爬）
    // 3. 寻找公开的腾讯财经 API
    
    // 暂时返回模拟数据
    console.warn('[腾讯财经] 使用模拟数据（需找替代数据源）')
  } catch (e) {
    console.warn('[腾讯财经] 抓取失败，使用模拟数据', e)
  }
  
  // 模拟数据
  const mockNews: ApiNewsItem[] = [
    {
      id: `tencent_mock_${page}_0`,
      title: '港股科技股集体反弹，美团涨超5%',
      summary: '港股科技股今日集体反弹，美团、小米等个股涨超5%，市场情绪明显改善。',
      source: '腾讯财经',
      publishedAt: new Date(Date.now() - 25 * 60 * 1000).toISOString(),
      url: 'https://finance.qq.com/',
      image: undefined
    },
    {
      id: `tencent_mock_${page}_1`,
      title: 'A股半导体板块走强，多只个股涨停',
      summary: '今日A股半导体板块表现强势，多只个股涨停，国产芯片替代进程加速。',
      source: '腾讯财经',
      publishedAt: new Date(Date.now() - 55 * 60 * 1000).toISOString(),
      url: 'https://finance.qq.com/',
      image: undefined
    },
    {
      id: `tencent_mock_${page}_2`,
      title: '央行开展千亿级逆回购，维护流动性充裕',
      summary: '央行开展千亿级逆回购操作，维护银行体系流动性合理充裕，市场利率保持平稳。',
      source: '腾讯财经',
      publishedAt: new Date(Date.now() - 1.8 * 60 * 60 * 1000).toISOString(),
      url: 'https://finance.qq.com/',
      image: undefined
    },
    {
      id: `tencent_mock_${page}_3`,
      title: '科创板ETF规模突破2000亿，机构持续加仓',
      summary: '科创板ETF产品规模突破2000亿元，机构投资者持续加仓，长期资金入市步伐加快。',
      source: '腾讯财经',
      publishedAt: new Date(Date.now() - 2.8 * 60 * 60 * 1000).toISOString(),
      url: 'https://finance.qq.com/',
      image: undefined
    },
    {
      id: `tencent_mock_${page}_4`,
      title: '消费板块企稳回升，白酒股集体上涨',
      summary: '消费板块今日企稳回升，白酒股集体上涨，市场对消费市场复苏预期增强。',
      source: '腾讯财经',
      publishedAt: new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString(),
      url: 'https://finance.qq.com/',
      image: undefined
    }
  ]
  
  return mockNews
}
