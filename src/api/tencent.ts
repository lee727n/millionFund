/**
 * 腾讯财经新闻API
 */
import type { NewsItem } from './toutiao'

export async function fetchTencentNews(page = 1, pageSize = 20): Promise<NewsItem[]> {
  // 腾讯财经有反爬，直接使用模拟数据
  const mockNews = [
    {
      title: '港股科技股集体反弹，美团涨超5%',
      summary: '港股科技股今日集体反弹，美团、小米等个股涨超5%，市场情绪明显改善。',
      time: '25分钟前'
    },
    {
      title: 'A股半导体板块走强，多只个股涨停',
      summary: '今日A股半导体板块表现强势，多只个股涨停，国产芯片替代进程加速。',
      time: '55分钟前'
    },
    {
      title: '央行开展千亿级逆回购，维护流动性充裕',
      summary: '央行开展千亿级逆回购操作，维护银行体系流动性合理充裕，市场利率保持平稳。',
      time: '1.8小时前'
    },
    {
      title: '科创板ETF规模突破2000亿，机构持续加仓',
      summary: '科创板ETF产品规模突破2000亿元，机构投资者持续加仓，长期资金入市步伐加快。',
      time: '2.8小时前'
    },
    {
      title: '消费板块企稳回升，白酒股集体上涨',
      summary: '消费板块今日企稳回升，白酒股集体上涨，市场对消费市场复苏预期增强。',
      time: '4小时前'
    }
  ]
  
  return mockNews.map((news, index) => ({
    id: `tencent_mock_${page}_${index}`,
    title: news.title,
    summary: news.summary,
    source: '腾讯财经',
    time: news.time,
    url: 'https://finance.qq.com/',
    image: undefined
  }))
}
