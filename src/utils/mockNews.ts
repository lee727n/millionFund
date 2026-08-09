// [WHY] 新闻源真实 RSS 抓取失败时的兜底数据生成器
// [WHAT] 统一实现各新闻源的 mock 兜底，避免 RSS 失败时调用未定义函数导致崩溃（#26 修复）
// [NOTE] 仅作离线/失败兜底，真实数据优先走 RSS（Capacitor Http 绕过 CORS）
import type { ApiNewsItem } from '@/types/news'

interface MockNewsTemplate {
  title: string
  summary: string
}

// 通用基金市场模拟新闻（兜底用，非真实数据）
const GENERIC_MOCK_NEWS: MockNewsTemplate[] = [
  { title: '沪深两市成交额突破1.2万亿，创年内新高', summary: '今日沪深两市成交额突破1.2万亿元，创年内新高，市场活跃度显著提升。' },
  { title: '北向资金净流入超180亿，外资看好A股', summary: '今日北向资金净流入超180亿元，外资持续看好A股市场，净流入规模创近期新高。' },
  { title: '多只AI概念股涨停，人工智能板块强势', summary: '今日人工智能板块表现强势，多只AI概念股涨停，市场对AI应用前景保持乐观。' },
  { title: '港股恒生指数涨超1.5%，科技股领涨', summary: '香港恒生指数今日涨超1.5%，科技股领涨，权重股表现强劲。' },
  { title: '央行公开市场净投放，流动性边际宽松', summary: '央行今日在公开市场实现净投放，银行间流动性边际宽松，资金面平稳。' },
  { title: '新能源板块估值回归，机构建议关注龙头', summary: '新能源板块经历调整后估值回归合理区间，部分机构建议关注具备成本优势的龙头企业。' },
]

/**
 * 生成指定新闻源的兜底 mock 数据
 * @param sourceName 来源名称（如 '同花顺'）
 * @param idPrefix   id 前缀（如 '10jqka'）
 * @param defaultUrl 兜底链接
 */
export function generateMockNews(
  sourceName: string,
  idPrefix: string,
  defaultUrl: string,
  page: number,
  pageSize: number
): ApiNewsItem[] {
  const start = (page - 1) * pageSize
  return GENERIC_MOCK_NEWS
    .map((news, index) => ({
      id: `${idPrefix}_mock_${page}_${index}`,
      title: news.title,
      summary: news.summary,
      source: sourceName,
      publishedAt: new Date(Date.now() - (index + 1) * 30 * 60 * 1000).toISOString(),
      url: defaultUrl,
      image: undefined,
    }))
    .slice(start, start + pageSize)
}
