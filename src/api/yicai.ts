/**
 * 第一财经新闻API
 */
import type { NewsItem } from './toutiao'

export async function fetchYicaiNews(page = 1, pageSize = 20): Promise<NewsItem[]> {
  const mockNews = [
    {
      title: 'G20峰会聚焦全球经济复苏，多国承诺加强合作',
      summary: 'G20峰会聚焦全球经济复苏议题，多国领导人承诺加强宏观经济政策协调，共同应对全球性挑战。',
      time: '1小时前'
    },
    {
      title: '原油价格突破90美元，地缘政治因素推动',
      summary: '国际原油价格突破90美元/桶，地缘政治因素推动油价上涨，全球能源市场供应紧张。',
      time: '2.5小时前'
    },
    {
      title: '黄金价格创历史新高，避险需求上升',
      summary: '国际黄金价格创下历史新高，全球避险需求上升，贵金属资产配置价值凸显。',
      time: '3.5小时前'
    },
    {
      title: '欧洲央行维持利率不变，关注通胀走势',
      summary: '欧洲央行宣布维持基准利率不变，同时密切关注通胀走势，为未来政策调整预留空间。',
      time: '5小时前'
    },
    {
      title: '日本央行调整YCC政策，允许利率适度上升',
      summary: '日本央行调整收益率曲线控制政策，允许长期利率适度上升，货币政策正常化进程启动。',
      time: '6.5小时前'
    }
  ]
  
  return mockNews.map((news, index) => ({
    id: `yicai_mock_${page}_${index}`,
    title: news.title,
    summary: news.summary,
    source: '第一财经',
    time: news.time,
    url: 'https://www.yicai.com/',
    image: undefined
  }))
}
