/**
 * 同花顺财经新闻API
 */
import type { ApiNewsItem } from '../types/news'

/**
 * 抓取同花顺财经新闻
 * TODO: 需找替代数据源（同花顺无公开 API，建议使用网页抓取或 RSS）
 */
export async function fetch10jqkaNews(page = 1, pageSize = 20): Promise<ApiNewsItem[]> {
  try {
    // TODO: 实现真实 API 调用
    // 可尝试的替代方案：
    // 1. 同花顺新闻页抓取: https://news.10jqka.com.cn/
    // 2. 使用 Capitor HTTP 插件绕过 CORS
    // 3. 寻找同花顺开放平台 API
    
    // 暂时返回模拟数据
    console.warn('[同花顺] 使用模拟数据（需找替代数据源）')
  } catch (e) {
    console.warn('[同花顺] 抓取失败，使用模拟数据', e)
  }
  
  // 模拟数据
  const mockNews: ApiNewsItem[] = [
    {
      id: `10jqka_mock_${page}_0`,
      title: '创业板注册制改革深化，市场化程度提升',
      summary: '创业板注册制改革持续深化，市场化程度不断提升，服务创新创业企业能力增强。',
      source: '同花顺',
      publishedAt: new Date(Date.now() - 40 * 60 * 1000).toISOString(),
      url: 'https://www.10jqka.com.cn/',
      image: undefined
    },
    {
      id: `10jqka_mock_${page}_1`,
      title: '新能源汽车产业链全面爆发，上下游企业受益',
      summary: '新能源汽车产业链今日全面爆发，上下游企业集体受益，行业高景气度延续。',
      source: '同花顺',
      publishedAt: new Date(Date.now() - 1.5 * 60 * 60 * 1000).toISOString(),
      url: 'https://www.10jqka.com.cn/',
      image: undefined
    },
    {
      id: `10jqka_mock_${page}_2`,
      title: '5G应用加速落地，相关概念股表现活跃',
      summary: '5G应用场景加速落地，相关概念股表现活跃，新一代信息技术产业迎来发展机遇。',
      source: '同花顺',
      publishedAt: new Date(Date.now() - 2.5 * 60 * 60 * 1000).toISOString(),
      url: 'https://www.10jqka.com.cn/',
      image: undefined
    },
    {
      id: `10jqka_mock_${page}_3`,
      title: '环保板块走强，碳中和政策持续加码',
      summary: '环保板块今日走势强劲，碳中和政策持续加码，绿色产业发展前景广阔。',
      source: '同花顺',
      publishedAt: new Date(Date.now() - 3.5 * 60 * 60 * 1000).toISOString(),
      url: 'https://www.10jqka.com.cn/',
      image: undefined
    },
    {
      id: `10jqka_mock_${page}_4`,
      title: '物流板块表现亮眼，电商旺季带动需求',
      summary: '物流板块今日表现亮眼，电商旺季带动行业需求，龙头企业业绩增长确定性强。',
      source: '同花顺',
      publishedAt: new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString(),
      url: 'https://www.10jqka.com.cn/',
      image: undefined
    }
  ]
  
  return mockNews
}
