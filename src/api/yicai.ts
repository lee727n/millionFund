/**
 * 第一财经新闻API
 */
import type { ApiNewsItem } from '../types/news'

/**
 * 抓取第一财经新闻
 * TODO: 需找替代数据源（可尝试 RSS 或网页抓取）
 */
export async function fetchYicaiNews(page = 1, pageSize = 20): Promise<ApiNewsItem[]> {
  try {
    // TODO: 实现真实 API 调用
    // 可尝试的替代方案：
    // 1. 第一财经 RSS: https://www.yicai.com/rss/ (需验证)
    // 2. 网页抓取: https://www.yicai.com/
    // 3. 使用 Capitor HTTP 插件绕过 CORS
    
    // 暂时返回模拟数据
    console.warn('[第一财经] 使用模拟数据（需找替代数据源）')
  } catch (e) {
    console.warn('[第一财经] 抓取失败，使用模拟数据', e)
  }
  
  // 模拟数据
  const mockNews: ApiNewsItem[] = [
    {
      id: `yicai_mock_${page}_0`,
      title: 'G20峰会聚焦全球经济复苏，多国承诺加强合作',
      summary: 'G20峰会聚焦全球经济复苏议题，多国领导人承诺加强宏观经济政策协调，共同应对全球性挑战。',
      source: '第一财经',
      publishedAt: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
      url: 'https://www.yicai.com/',
      image: undefined
    },
    {
      id: `yicai_mock_${page}_1`,
      title: '原油价格突破90美元，地缘政治因素推动',
      summary: '国际原油价格突破90美元/桶，地缘政治因素推动油价上涨，全球能源市场供应紧张。',
      source: '第一财经',
      publishedAt: new Date(Date.now() - 2.5 * 60 * 60 * 1000).toISOString(),
      url: 'https://www.yicai.com/',
      image: undefined
    },
    {
      id: `yicai_mock_${page}_2`,
      title: '黄金价格创历史新高，避险需求上升',
      summary: '国际黄金价格创下历史新高，全球避险需求上升，贵金属资产配置价值凸显。',
      source: '第一财经',
      publishedAt: new Date(Date.now() - 3.5 * 60 * 60 * 1000).toISOString(),
      url: 'https://www.yicai.com/',
      image: undefined
    },
    {
      id: `yicai_mock_${page}_3`,
      title: '欧洲央行维持利率不变，关注通胀走势',
      summary: '欧洲央行宣布维持基准利率不变，同时密切关注通胀走势，为未来政策调整预留空间。',
      source: '第一财经',
      publishedAt: new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString(),
      url: 'https://www.yicai.com/',
      image: undefined
    },
    {
      id: `yicai_mock_${page}_4`,
      title: '日本央行调整YCC政策，允许利率适度上升',
      summary: '日本央行调整收益率曲线控制政策，允许长期利率适度上升，货币政策正常化进程启动。',
      source: '第一财经',
      publishedAt: new Date(Date.now() - 6.5 * 60 * 60 * 1000).toISOString(),
      url: 'https://www.yicai.com/',
      image: undefined
    }
  ]
  
  return mockNews
}
