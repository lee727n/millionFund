<script setup lang="ts">
// [WHY] 截图导入组件 - 通过 PaddleOCR 识别截图中的持仓信息
// [WHAT] 支持拍照/选择图片，识别基金持仓并批量导入
// [DEPS] 依赖 ocr.ts (PaddleOCR) 进行文字识别

import { ref, computed, onMounted, watch } from 'vue'
import { showToast, showLoadingToast, closeToast, showConfirmDialog } from 'vant'
import { recognizeHoldings, recognizeText, recognizeTextLocal, parseHoldingTextOnline, parseHoldingTextLocal, type RecognizedHolding, setBaiduOcrConfig, getBaiduOcrConfig, setPreferredLocalOcr, getPreferredLocalOcr } from '@/utils/ocr'
import { searchFund, fetchFundEstimate, fetchFundList } from '@/api/fund'
import { fetchLatestNetValue, fetchFundAccurateData } from '@/api/fundFast'
import { useHoldingStore } from '@/stores/holding'
import { addTrade } from '@/utils/storage'
import type { HoldingRecord, FundInfo } from '@/types/fund'

const props = defineProps<{
  show: boolean
}>()

const emit = defineEmits<{
  (e: 'update:show', value: boolean): void
  (e: 'imported', count: number): void
}>()

const holdingStore = useHoldingStore()

// [WHAT] 百度 OCR 配置
const apiKey = ref('')
const secretKey = ref('')
const hasConfig = ref(false)

// [WHAT] 组件状态
const step = ref<'config' | 'upload' | 'recognizing' | 'preview' | 'importing'>('upload')
const selectedImage = ref<string>('')
const ocrProgress = ref(0)
const ocrStatus = ref('')

// [WHAT] 是否使用在线 OCR（默认关闭，默认为本地识别）
const useOnlineOcr = ref(false)

// DEBUG: 临时跳过远程净值/估值请求（用于调试网络超时问题），
// 设为 `false` 以恢复远程请求
const DEBUG_SKIP_REMOTE_ESTIMATE = true

// [WHAT] 增强后的持仓信息（包含从 API 获取的名称和净值）
interface EnhancedHolding extends RecognizedHolding {
  fundInfo?: FundInfo
  netValue?: number
  loading?: boolean
  selected?: boolean
}
const enhancedHoldings = ref<EnhancedHolding[]>([])

// [WHAT] 调试用：存储原始识别文本
const rawOcrText = ref('')

// [WHAT] 初始化时检查配置
onMounted(() => {
  // [DEV] 检查本地存储的配置
  const config = getBaiduOcrConfig()
  if (config && config.apiKey && config.secretKey) {
    apiKey.value = config.apiKey
    secretKey.value = config.secretKey
    hasConfig.value = true
    step.value = 'upload'
  }

  // 读取本地识别偏好
  try {
    const pref = getPreferredLocalOcr()
    // if user preferred local engines, keep online off
    useOnlineOcr.value = !(pref === 'tesseract' || pref === 'paddle')
  } catch (err) {
    useOnlineOcr.value = false
  }
})

// [WHAT] 保存配置
function saveConfig() {
  if (!apiKey.value.trim() || !secretKey.value.trim()) {
    showToast('请填写完整的 API Key 和 Secret Key')
    return
  }

  setBaiduOcrConfig({
    apiKey: apiKey.value.trim(),
    secretKey: secretKey.value.trim()
  })

  hasConfig.value = true
  step.value = 'upload'
  showToast('配置保存成功')
}

// 监听开关并保存偏好（如果用户选择本地，则记为本地偏好）
watch(useOnlineOcr, (v) => {
  try {
    setPreferredLocalOcr(v ? 'auto' : 'tesseract')
  } catch (err) { /* ignore */ }
})

// [WHAT] 计算选中数量
const selectedCount = computed(() => {
  return enhancedHoldings.value.filter(h => h.selected && h.code).length
})

// [WHAT] 文件选择处理
async function handleFileChange(event: Event) {
  const target = event.target as HTMLInputElement
  const file = target.files?.[0]
  if (!file) return
  
  if (!file.type.startsWith('image/')) {
    showToast('请选择图片文件')
    return
  }
  
  const reader = new FileReader()
  reader.onload = async (e) => {
    selectedImage.value = e.target?.result as string
    await startRecognition(file)
  }
  reader.readAsDataURL(file)
}

// [WHAT] 开始 OCR 识别
async function startRecognition(file: File) {
  step.value = 'recognizing'
  ocrProgress.value = 0
  ocrStatus.value = '准备识别...'
  
  try {
    // 先获取原始文本用于调试
    let text: string
    if (!useOnlineOcr.value) {
      text = await recognizeTextLocal(file, (progress, status) => {
        ocrProgress.value = Math.round(progress * 50)
        ocrStatus.value = status
      })
    } else {
      // 使用在线识别前确保已配置 Key
      const cfg = getBaiduOcrConfig()
      if (!cfg || !cfg.apiKey || !cfg.secretKey) {
        await showConfirmDialog({
          title: '需要配置百度 OCR',
          message: '在线识别需要先配置 API Key 和 Secret Key，请在设置页填写后重试',
          confirmButtonText: '确定'
        })
        step.value = 'config'
        return
      }
      text = await recognizeText(file, (progress, status) => {
        ocrProgress.value = Math.round(progress * 50) // OCR 占用 50%
        ocrStatus.value = status
      })
    }
    rawOcrText.value = text
    console.log('【OCR原始文本】', text)

    const holdings = !useOnlineOcr.value ? await parseHoldingTextLocal(text) : await parseHoldingTextOnline(text)
    ocrProgress.value = 60
    ocrStatus.value = '解析持仓信息...'
    
    if (holdings.length === 0) {
      // 解析失败，输出调试信息
      console.log('【解析失败】未能从上述文本中解析出持仓信息')
      console.log('【调试提示】请检查控制台中的【OCR原始文本】，确认是否包含：')
      console.log('  - 6位基金代码（如 006751）')
      console.log('  - 持仓金额（如 74,870.07）')
      console.log('  - 基金名称（如 浦银安盛全球智能科技A）')
      
      showToast('未识别到持仓信息，请查看控制台调试信息')
      step.value = 'upload'
      return
    }
    
    ocrProgress.value = 70
    await enhanceHoldings(holdings)
    step.value = 'preview'
    
  } catch (error: any) {
    console.error('OCR识别失败:', error)
    const msg = error?.message || String(error)
    // 当未配置百度 Key/Secret 时，ocr.ts 会抛出 NO_BAIDU_CONFIG 错误
    if (typeof msg === 'string' && msg.startsWith('NO_BAIDU_CONFIG')) {
      // 提示用户：前往设置或切换为本地识别
      try {
        await showConfirmDialog({
          title: '未配置百度 OCR',
          message: '未检测到百度 OCR 的 API Key/Secret。请选择：\n- 前往设置并配置密钥（去设置）\n- 或切换为"使用本地识别"',
          confirmButtonText: '使用本地识别',
          cancelButtonText: '去设置'
        })
        // 用户选择使用本地识别 -> 切换并重试一次
        useOnlineOcr.value = false
        // 保存偏好
        try { setPreferredLocalOcr('tesseract') } catch (_) {}
        await startRecognition(file)
      } catch (dialogErr) {
        // 用户选择去设置（或关闭对话框），切换到配置步骤
        step.value = 'config'
      }
      return
    }

    showToast('识别失败，请重试')
    step.value = 'upload'
  }
}

// [WHAT] 增强持仓信息（获取基金名称和净值）
async function enhanceHoldings(holdings: RecognizedHolding[]) {
  // 预合并：合并相同 code 或标准化名称的条目，避免 OCR 拆分导致重复（例如同一基金被识别为两行）
  const mergedMap = new Map<string, RecognizedHolding>()
  const normalizeKey = (h: RecognizedHolding) => {
    if (h.code) return `c:${h.code}`
    return `n:${(h.name || '').toLowerCase().replace(/\s+/g, '').replace(/[()（）]/g, '')}`
  }

  for (const h of holdings) {
    if ((!h.code || h.code.trim() === '') && (!h.name || h.name.trim() === '')) continue
    const key = normalizeKey(h)
    const existing = mergedMap.get(key)
    if (!existing) {
      mergedMap.set(key, { ...h })
    } else {
      existing.amount = Math.max(existing.amount || 0, h.amount || 0)
      existing.profit = (existing.profit || 0) + (h.profit || 0)
      existing.confidence = Math.max(existing.confidence || 0, h.confidence || 0)
      if (!existing.name && h.name) existing.name = h.name
      if (!existing.code && h.code) existing.code = h.code
      mergedMap.set(key, existing)
    }
  }

  const merged = Array.from(mergedMap.values())

  enhancedHoldings.value = merged.map(h => ({
    ...h,
    loading: true,
    selected: h.code && h.amount > 0 && !holdingStore.hasHolding(h.code)
  }))
  
  const promises = merged.map(async (h, index) => {
    if (!h.code && !h.name) {
      enhancedHoldings.value[index].loading = false
      return
    }
    
    try {
      // 优先用代码搜索；若无代码则用名称搜索
      const query = (h.code && h.code.trim()) ? h.code : (h.name || '')
      // 判断是精确的6位基金代码搜索还是名称搜索
      const isCodeQuery = /^\d{6}$/.test(query.trim())
      if (query) {
        let results: FundInfo[] = []
        if (isCodeQuery) {
          // 代码精确查询：直接取第1条即可
          results = await searchFund(query, 1)
        } else {
          // 名称模糊查询：多取一些候选，再用相似度函数 chooseBestMatch 挑最佳
          // [WHY] 避免 searchFund 排序把同类名（招商A/招商C/精选A/精选C）排错导致错配
          const candidates = await searchFund(query, 20)
          if (candidates && candidates.length > 0) {
            const best = chooseBestMatch(candidates, h.name || query)
            if (best) {
              results = [best]
            } else {
              // 找不到高分匹配时，作为兜底仍然取第一条，但降低置信度
              results = [candidates[0]]
            }
          }
        }

        // 二次兜底：若上一步没找到结果，再用名称广撒网+匹配
        if ((!results || results.length === 0) && h.name) {
          const broader = await searchFund(h.name, 20)
          if (broader && broader.length > 0) {
            const best = chooseBestMatch(broader, h.name)
            if (best) results = [best]
            else results = [broader[0]]
          }
        }

        if (results && results.length > 0) {
          enhancedHoldings.value[index].fundInfo = results[0]
          if (!h.name) {
            enhancedHoldings.value[index].name = results[0].name
          }
          if (!h.code && results[0].code) {
            enhancedHoldings.value[index].code = results[0].code
            if (!enhancedHoldings.value[index].selected && enhancedHoldings.value[index].amount > 0 && !holdingStore.hasHolding(results[0].code)) {
              enhancedHoldings.value[index].selected = true
            }
          }
        }
      }

      // 回退：本地基金列表模糊匹配
      if (!enhancedHoldings.value[index].code && h.name) {
        try {
          const fullList = await fetchFundList()
          let best: any = null
          let bestScore = -1
          for (const f of fullList) {
            const score = matchScore(f.name || f.pinyin || '', h.name)
            if (score > bestScore) { bestScore = score; best = f }
          }
          if (best && bestScore >= 30) {
            enhancedHoldings.value[index].code = best.code
            enhancedHoldings.value[index].fundInfo = best
            if (!enhancedHoldings.value[index].name) enhancedHoldings.value[index].name = best.name
            if (!enhancedHoldings.value[index].selected && enhancedHoldings.value[index].amount > 0 && !holdingStore.hasHolding(best.code)) {
              enhancedHoldings.value[index].selected = true
            }
          }
        } catch (err) {
          console.warn('本地基金列表模糊匹配失败', err)
        }
      }

      // 获取当前净值：为避免当前调试期间网络 JSONP 超时导致过多错误，
      // 可通过 DEBUG_SKIP_REMOTE_ESTIMATE 临时跳过远程请求。
      if (enhancedHoldings.value[index].code) {
        if (!DEBUG_SKIP_REMOTE_ESTIMATE && !useOnlineOcr.value) {
          try {
            const estimate = await fetchFundEstimate(enhancedHoldings.value[index].code)
            if (estimate) {
              enhancedHoldings.value[index].netValue = parseFloat(estimate.dwjz) || parseFloat(estimate.gsz) || 1
            }
          } catch (err) {
            // 网络或 JSONP 超时时，保持默认 netValue（后续导入会使用默认或手动编辑）
            console.warn(`获取基金 ${enhancedHoldings.value[index].code} 信息失败（已跳过）:`, err)
            enhancedHoldings.value[index].netValue = enhancedHoldings.value[index].netValue || 1
          }
        } else {
          // 临时跳过远程请求，使用默认值或本地可用的数据
          enhancedHoldings.value[index].netValue = enhancedHoldings.value[index].netValue || 1
        }
      }
    } catch (error) {
      console.error(`获取基金 ${h.code} 信息失败:`, error)
    } finally {
      enhancedHoldings.value[index].loading = false
    }
  })
  
  await Promise.all(promises)
}

// ======== 名称相似度与最佳匹配选择器 ========
// [WHY] 手机端 OCR (tesseract) 识别质量差，名称常有错字/多字/漏字。
// 匹配策略：宁可不匹配（让用户手动输入），也不要错误匹配到其他基金。

// 从名称中提取纯中文字符串
function extractChinese(s: string): string {
  if (!s) return ''
  return (s.match(/[\u4e00-\u9fa5]/g) || []).join('')
}

// 计算两个字符串的中文字符重叠率
// 返回 { overlap: 两者共同拥有的中文字符数, ratio: 共同占较长一方的比例 }
function chineseOverlap(a: string, b: string): { overlap: number; ratio: number } {
  const ca = extractChinese(a)
  const cb = extractChinese(b)
  if (!ca || !cb) return { overlap: 0, ratio: 0 }
  // 计算共同字符（按出现次数计，不重复）
  const setA = new Set(ca)
  let overlap = 0
  for (const ch of cb) {
    if (setA.has(ch)) overlap++
  }
  const maxLen = Math.max(ca.length, cb.length)
  return { overlap, ratio: overlap / maxLen }
}

function normalizeNameForMatch(s: string | undefined) {
  if (!s) return ''
  return s
    .toLowerCase()
    .replace(/\s+/g, '')
    .replace(/[\u0000-\u0020\u2000-\u200B\ufffc\ufffd]/g, '')
    .replace(/[^\u4e00-\u9fa5a-z0-9]/g, '')
    .replace(/(发起式|a类|c类|基金|型)$/g, '')
}

function extractShareSuffix(s: string): string {
  if (!s) return ''
  const m = s.trim().match(/([A-Za-z]+)$/)
  return m ? m[1].toUpperCase() : ''
}

// [FIX] 新增：检查 OCR 名称是否包含候选名称里"完全没有"的中文词
// 若 OCR 名中存在一些较长的连续中文片段在候选名中完全找不到，
// 说明 OCR 识别出了噪声字符，候选名不适合作为匹配结果
function hasOCRNoiseBlock(ocrChinese: string, candidateChinese: string): boolean {
  if (!ocrChinese || !candidateChinese) return false
  // 把 OCR 名按候选名的字符切分，找出"完全找不到"的最长连续片段
  // 如果有 >= 3 个连续中文字符在候选名中完全不存在，判定为噪声块
  for (let len = Math.min(5, ocrChinese.length); len >= 3; len--) {
    for (let i = 0; i <= ocrChinese.length - len; i++) {
      const segment = ocrChinese.substring(i, i + len)
      if (!candidateChinese.includes(segment)) {
        // 检查这段是否是真的"不在候选中"，同时看看是否是典型的 OCR 噪声（如"持有期"这种在支付宝截图列名中的词）
        // 如果这段噪声在候选名中确实找不到，且长度 >= 3，则认为是噪声块
        if (len >= 3) return true
      }
    }
  }
  return false
}

function matchScore(a: string, b: string) {
  a = normalizeNameForMatch(a)
  b = normalizeNameForMatch(b)
  if (!a || !b) return 0
  if (a === b) return 100

  // 精确子串匹配：一个完全包含另一个
  if (a.includes(b) || b.includes(a)) return 90

  // [FIX] 先做中文字符重叠率检查
  const { overlap, ratio } = chineseOverlap(a, b)
  const ca = extractChinese(a)
  const cb = extractChinese(b)

  // 中文字符重叠率必须 >= 60%，且至少有 4 个共同中文字符
  if (ratio < 0.6 || overlap < 4) return 0

  // 2-gram 重叠度
  const makeGrams = (str: string) => {
    const grams: string[] = []
    for (let i = 0; i < str.length - 1; i++) grams.push(str.slice(i, i + 2))
    return grams
  }

  const ag = makeGrams(a)
  const bg = makeGrams(b)
  let common = 0
  const seen = new Set<string>()
  for (const g of ag) {
    if (bg.includes(g) && !seen.has(g)) { common++; seen.add(g) }
  }

  // 综合评分：中文字符重叠率 * 60 + 2-gram 重叠度 * 40
  const gramScore = Math.min(40, common * 5)
  return Math.min(95, Math.floor(ratio * 60) + gramScore)
}

function chooseBestMatch(candidates: any[], originalName: string) {
  if (!candidates || candidates.length === 0) return null
  const origSuffix = extractShareSuffix(originalName)
  const origChinese = extractChinese(originalName)

  let best: any = null
  let bestScore = -1
  for (const c of candidates) {
    const candidateName = c.name || c.p_name || ''
    const candChinese = extractChinese(candidateName)

    // [FIX] 硬规则1：OCR 名含 6+ 中文字符时，候选中文字符数差异不能太悬殊
    // 若 OCR 名有 10 个中文字符但候选只有 6 个，很可能是错配
    if (origChinese.length >= 8 && candChinese.length < origChinese.length * 0.6) continue
    if (candChinese.length >= 8 && origChinese.length < candChinese.length * 0.6) continue

    // [FIX] 硬规则2：检查是否存在 OCR 噪声块
    if (origChinese.length >= 6 && hasOCRNoiseBlock(origChinese, candChinese)) continue

    let score = matchScore(candidateName, originalName)

    // 份额后缀加权
    const candSuffix = extractShareSuffix(candidateName)
    if (origSuffix && candSuffix === origSuffix) {
      score += 5
    } else if (origSuffix && candSuffix && candSuffix !== origSuffix) {
      score -= 10 // 明确份额不一致，强烈减分
    }

    if (score > bestScore) { bestScore = score; best = c }
  }

  // [FIX] 提高阈值：从 35 提升到 50
  return bestScore >= 50 ? best : null
}

// [WHAT] 切换选中状态
function toggleSelect(index: number) {
  const holding = enhancedHoldings.value[index]
  if (!holding.code) {
    showToast('该项缺少基金代码')
    return
  }
  if (holdingStore.hasHolding(holding.code)) {
    showToast('该基金已在持仓中')
    return
  }
  holding.selected = !holding.selected
}

// [WHAT] 全选/取消全选
function toggleSelectAll() {
  const validHoldings = enhancedHoldings.value.filter(
    h => h.code && h.amount > 0 && !holdingStore.hasHolding(h.code)
  )
  const allSelected = validHoldings.every(h => h.selected)
  validHoldings.forEach(h => { h.selected = !allSelected })
}

// [WHAT] Wrapper functions for event handling (TypeScript type safety)
function handleCodeChange(index: number, event: Event) {
  const value = (event.target as HTMLInputElement).value
  updateCode(index, value)
}

function handleAmountInput(index: number, event: Event) {
  const value = (event.target as HTMLInputElement).value
  updateAmount(index, value)
}

function handleProfitInput(index: number, event: Event) {
  const value = (event.target as HTMLInputElement).value
  updateProfit(index, value)
}

// [WHAT] 修改金额
function updateAmount(index: number, value: string) {
  const amount = parseFloat(value)
  if (!isNaN(amount) && amount >= 0) {
    enhancedHoldings.value[index].amount = amount
  }
}

// [WHAT] 修改盈亏
function updateProfit(index: number, value: string) {
  const profit = parseFloat(value)
  if (!isNaN(profit)) {
    enhancedHoldings.value[index].profit = profit
  }
}

// [WHAT] 修改基金代码并重新获取基金信息
async function updateCode(index: number, value: string) {
  const newCode = value.trim()
  const holding = enhancedHoldings.value[index]
  if (!newCode || newCode === holding.code) return

  holding.code = newCode
  holding.loading = true
  holding.fundInfo = undefined
  holding.netValue = undefined

  try {
    const results = await searchFund(newCode, 1)
    if (results && results.length > 0) {
      holding.fundInfo = results[0]
      holding.name = results[0].name
      holding.code = results[0].code
      // 重新获取净值
      try {
        const accurateData = await fetchFundAccurateData(holding.code, holding.fundInfo?.type?.includes('QDII'))
        if (accurateData && (accurateData.nav || accurateData.currentValue)) {
          holding.netValue = accurateData.nav || accurateData.currentValue || 1
        } else {
          holding.netValue = 1
        }
      } catch {
        holding.netValue = 1
      }
      // 更新选中状态
      holding.selected = holding.amount > 0 && !holdingStore.hasHolding(holding.code)
    } else {
      showToast('未找到该基金代码')
      holding.netValue = 1
    }
  } catch (error) {
    console.error('搜索基金失败:', error)
    showToast('搜索基金失败')
    holding.netValue = 1
  } finally {
    holding.loading = false
  }
}

// 格式化显示的基金名称：去掉数字以避免 OCR 引入的序号或行号
function formatFundName(name: string | undefined) {
  if (!name) return '未知基金'
  return String(name).replace(/\d+/g, '').replace(/\s+/g, ' ').trim()
}

// [WHAT] 确认导入
async function confirmImport() {
  const toImport = enhancedHoldings.value.filter(h => h.selected && h.code && h.amount > 0)
  
  if (toImport.length === 0) {
    showToast('请选择要导入的持仓')
    return
  }
  
  step.value = 'importing'
  showLoadingToast({ message: '导入中...', forbidClick: true })
  
  try {
    let imported = 0
    let failed = 0
    
    for (const h of toImport) {
      try {
        let netValue = h.netValue || 1

        // [FIX] 使用 fetchFundAccurateData 获取最新净值
        let currentNav = h.netValue || 1
        let navDate = new Date().toLocaleDateString('en-CA') // 默认今天
        try {
          const accurateData = await fetchFundAccurateData(h.code, h.fundInfo?.type?.includes('QDII'))
          if (accurateData && accurateData.currentValue > 0) {
            currentNav = accurateData.currentValue
            // [FIX] 用净值日期作为买入日期，因为份额是用这天的净值算的
            navDate = accurateData.navDate || navDate
          }
        } catch (error) {
          console.error('获取净值失败，使用默认值:', error)
        }

        const shares = h.amount / currentNav
        const buyNetValue = h.profit !== 0 && shares > 0
          ? (h.amount - h.profit) / shares
          : currentNav

        const cost = h.amount - h.profit // 买入成本

        const record: HoldingRecord = {
          code: h.code,
          name: h.name || h.fundInfo?.name || h.code,
          buyNetValue: buyNetValue,
          shares: shares,
          buyDate: navDate, // [FIX] 用净值日期作为买入日期
          holdingDays: 0,
          createdAt: Date.now(),
          profit: h.profit
        }

        await holdingStore.addOrUpdateHolding(record)

        // [FIX] 创建交易记录，K线图上标记买入点
        addTrade({
          id: '',
          code: h.code,
          name: record.name,
          type: 'buy',
          date: navDate, // 标记在净值日期
          amount: cost,
          netValue: buyNetValue,
          shares: shares,
          fee: 0,
          estimated: false,
          createdAt: Date.now()
        })

        imported++
      } catch (error) {
        console.error(`导入基金 ${h.code} 失败:`, error)
        failed++
      }
    }
    
    closeToast()
    if (failed > 0) {
      showToast(`成功导入 ${imported} 只基金，${failed} 只失败`)
    } else {
      showToast(`成功导入 ${imported} 只基金`)
    }
    emit('imported', imported)
    closeDialog()
    
  } catch (error) {
    closeToast()
    console.error('导入失败:', error)
    showToast('导入失败，请重试')
    step.value = 'preview'
  }
}

// [WHAT] 关闭弹窗
function closeDialog() {
  emit('update:show', false)
  setTimeout(() => {
    step.value = 'upload'
    selectedImage.value = ''
    ocrProgress.value = 0
    ocrStatus.value = ''
    enhancedHoldings.value = []
  }, 300)
}

// [WHAT] 重新选择图片
function reselectImage() {
  step.value = 'upload'
  selectedImage.value = ''
}

// [WHAT] 格式化金额
function formatAmount(amount: number): string {
  return amount.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}
</script>

<template>
  <van-popup
    :show="props.show"
    position="bottom"
    round
    :style="{ height: '85%' }"
    @update:show="emit('update:show', $event)"
  >
    <div class="import-dialog">
      <!-- 标题栏 -->
      <div class="dialog-header">
        <span>截图导入持仓</span>
        <van-icon name="cross" @click="closeDialog" />
      </div>

      <!-- 配置步骤 -->
      <div v-if="step === 'config'" class="config-step">
        <div class="config-tip">
          <van-icon name="info-o" size="48" color="var(--color-primary)" />
          <p class="tip-title">配置百度 OCR</p>
          <p class="tip-desc">使用百度智能云 OCR API 进行文字识别</p>
          <p class="tip-desc">每天有 500 次免费额度</p>
        </div>
        
        <div class="config-form">
          <van-field
            v-model="apiKey"
            label="API Key"
            placeholder="请输入百度云 API Key"
            :rules="[{ required: true, message: '请填写 API Key' }]"
          />
          <van-field
            v-model="secretKey"
            label="Secret Key"
            placeholder="请输入百度云 Secret Key"
            :rules="[{ required: true, message: '请填写 Secret Key' }]"
          />
          
          <div class="config-help">
            <p class="help-title">如何获取密钥？</p>
            <ol>
              <li>登录 <a href="https://console.bce.baidu.com/ai/#/ai/ocr/overview/index" target="_blank">百度智能云</a></li>
              <li>创建 OCR 应用</li>
              <li>获取 API Key 和 Secret Key</li>
            </ol>
          </div>
          
          <van-button type="primary" block @click="saveConfig">保存配置</van-button>
        </div>
      </div>

      <!-- 上传步骤 -->
      <div v-if="step === 'upload'" class="upload-step">
        <div class="upload-tip">
          <van-icon name="photo-o" size="48" color="var(--color-primary)" />
          <p class="tip-title">选择持仓截图</p>
          <p class="tip-desc">支持支付宝、京东、腾讯理财通持仓截图</p>
          <p class="tip-desc">使用 PaddleOCR 本地识别，无需联网</p>
        </div>
        <div class="local-ocr-toggle" style="display:flex;align-items:center;gap:12px;margin:12px 16px;">
          <span style="flex:1">使用在线识别（需要配置百度 API Key）</span>
          <van-switch v-model="useOnlineOcr" size="24" />
        </div>
        
        <div class="upload-actions">
          <label class="upload-btn">
            <van-icon name="photo" />
            <span>相册</span>
            <input type="file" accept="image/*" @change="handleFileChange" />
          </label>
        </div>
        
        <div class="usage-tips">
          <p class="tips-title">使用提示</p>
          <ul>
            <li>请确保截图清晰，包含基金名称和金额</li>
            <li>首次使用需加载 OCR 模型（约5MB）</li>
            <li>识别后可手动修改基金代码、金额和盈亏</li>
          </ul>
        </div>
      </div>

      <!-- 识别中 -->
      <div v-if="step === 'recognizing'" class="recognizing-step">
        <div class="preview-image">
          <img :src="selectedImage" alt="截图预览" />
        </div>
        <div class="progress-section">
          <van-progress :percentage="ocrProgress" stroke-width="8" />
          <p class="progress-text">{{ ocrStatus }}</p>
        </div>
      </div>

      <!-- 预览确认 -->
      <div v-if="step === 'preview'" class="preview-step">
        <div class="preview-header">
          <span>识别到 {{ enhancedHoldings.length }} 条记录</span>
          <van-button size="small" plain @click="toggleSelectAll">
            {{ selectedCount === enhancedHoldings.filter(h => h.code && h.amount > 0 && !holdingStore.hasHolding(h.code)).length ? '取消全选' : '全选' }}
          </van-button>
        </div>
        
        <div class="holdings-list">
          <div 
            v-for="(holding, index) in enhancedHoldings" 
            :key="index"
            class="holding-item"
            :class="{ selected: holding.selected, disabled: !holding.code || holdingStore.hasHolding(holding.code) }"
            @click="toggleSelect(index)"
          >
            <div class="item-checkbox">
              <van-checkbox 
                :model-value="holding.selected" 
                :disabled="!holding.code || holdingStore.hasHolding(holding.code)"
                @click.stop
                @update:model-value="holding.selected = $event"
              />
            </div>
            <div class="item-content">
              <div class="item-name-block">
                <span class="fund-name">{{ formatFundName(holding.name || holding.fundInfo?.name || '未知基金') }}</span>
                <div class="code-row">
                  <input 
                    :value="holding.code"
                    class="code-input"
                    placeholder="输入代码"
                    @click.stop
                    @change="handleCodeChange(index, $event)"
                  />
                  <van-loading v-if="holding.loading" size="12" />
                </div>
              </div>
              <div class="item-info">
                <span v-if="holdingStore.hasHolding(holding.code)" class="tag-exists">已持有</span>
                <span v-else-if="holding.confidence && holding.confidence < 0.7" class="tag-warn">待确认</span>
              </div>
            </div>
            <div class="item-amounts">
              <div class="amount-row">
                <input 
                  type="number" 
                  :value="holding.amount"
                  class="amount-input"
                  placeholder="市值"
                  @click.stop
                  @input="handleAmountInput(index, $event)"
                />
              </div>
              <div class="amount-row">
                <input 
                  type="number" 
                  :value="holding.profit"
                  class="amount-input profit-input"
                  placeholder="盈亏"
                  @click.stop
                  @input="handleProfitInput(index, $event)"
                />
              </div>
            </div>
          </div>
        </div>
        
        <div class="preview-footer">
          <van-button plain @click="reselectImage">重新选择</van-button>
          <van-button type="primary" :disabled="selectedCount === 0" @click="confirmImport">
            导入 {{ selectedCount }} 只基金
          </van-button>
        </div>
      </div>

      <!-- 导入中 -->
      <div v-if="step === 'importing'" class="importing-step">
        <van-loading size="48" />
        <p>正在导入...</p>
      </div>
    </div>
  </van-popup>
</template>

<style scoped>
.import-dialog {
  height: 100%;
  display: flex;
  flex-direction: column;
  background: var(--bg-secondary);
}

.dialog-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px;
  font-size: 16px;
  font-weight: 600;
  border-bottom: 1px solid var(--border-color);
}

/* 配置步骤 */
.config-step {
  flex: 1;
  display: flex;
  flex-direction: column;
  padding: 24px 16px;
}

.config-tip {
  text-align: center;
  padding: 32px 0;
}

.config-form {
  padding: 16px;
}

.config-help {
  margin: 16px 0;
  padding: 12px;
  background: var(--bg-primary);
  border-radius: 8px;
}

.help-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
  margin-bottom: 8px;
}

.config-help ol {
  margin: 0;
  padding-left: 20px;
}

.config-help li {
  font-size: 13px;
  color: var(--text-secondary);
  line-height: 1.8;
}

.config-help a {
  color: var(--color-primary);
}

/* 上传步骤 */
.upload-step {
  flex: 1;
  display: flex;
  flex-direction: column;
  padding: 24px 16px;
}

.upload-tip {
  text-align: center;
  padding: 32px 0;
}

.tip-title {
  font-size: 18px;
  font-weight: 600;
  color: var(--text-primary);
  margin: 16px 0 8px;
}

.tip-desc {
  font-size: 14px;
  color: var(--text-secondary);
  margin: 4px 0;
}

.upload-actions {
  display: flex;
  gap: 16px;
  padding: 16px;
}

.upload-btn {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 24px;
  background: var(--bg-primary);
  border: 2px dashed var(--border-color);
  border-radius: 12px;
  cursor: pointer;
  transition: all 0.2s;
}

.upload-btn:active {
  border-color: var(--color-primary);
  background: var(--color-primary-bg);
}

.upload-btn input {
  display: none;
}

.upload-btn span {
  font-size: 14px;
  color: var(--text-primary);
}

.usage-tips {
  margin-top: auto;
  padding: 16px;
  background: var(--bg-primary);
  border-radius: 12px;
}

.tips-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
  margin-bottom: 8px;
}

.usage-tips ul {
  margin: 0;
  padding-left: 20px;
}

.usage-tips li {
  font-size: 13px;
  color: var(--text-secondary);
  line-height: 1.8;
}

/* 识别中 */
.recognizing-step {
  flex: 1;
  display: flex;
  flex-direction: column;
  padding: 16px;
}

.preview-image {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  border-radius: 12px;
  background: var(--bg-primary);
}

.preview-image img {
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;
}

.progress-section {
  padding: 24px 0;
}

.progress-text {
  text-align: center;
  font-size: 14px;
  color: var(--text-secondary);
  margin-top: 12px;
}

/* 预览步骤 */
.preview-step {
  flex: 1;
  display: flex;
  flex-direction: column;
}

.preview-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 16px;
  font-size: 14px;
  color: var(--text-secondary);
  border-bottom: 1px solid var(--border-color);
}

.holdings-list {
  flex: 1;
  overflow-y: auto;
  padding: 8px 16px;
}

.holding-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px;
  margin-bottom: 8px;
  background: var(--bg-primary);
  border-radius: 8px;
  border: 2px solid transparent;
  cursor: pointer;
  transition: all 0.2s;
}

.holding-item.selected {
  border-color: var(--color-primary);
}

.holding-item.disabled {
  opacity: 0.5;
}

.item-checkbox {
  flex-shrink: 0;
}

.item-content {
  flex: 1;
  min-width: 0;
}

/* 基金名称+代码纵向排列，确保名称显示完整 */
.item-name-block {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}

.code-row {
  display: flex;
  align-items: center;
  gap: 6px;
}

.fund-name {
  font-size: 14px;
  font-weight: 500;
  color: var(--text-primary);
  /* 允许名称折行，不再省略号截断，优先保证可读性 */
  overflow: hidden;
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  line-height: 1.3;
}

.fund-code {
  font-size: 12px;
  color: var(--text-secondary);
  flex-shrink: 0;
}

.code-input {
  width: 78px;
  font-size: 12px;
  color: var(--text-secondary);
  border: 1px solid var(--border-color);
  border-radius: 4px;
  padding: 2px 4px;
  background: var(--bg-primary);
  flex-shrink: 0;
  text-align: center;
}

.code-input:focus {
  outline: none;
  border-color: var(--color-primary);
  color: var(--color-primary);
}

.item-info {
  margin-top: 4px;
}

.tag-exists {
  font-size: 12px;
  color: var(--color-primary);
  background: var(--color-primary-bg);
  padding: 1px 6px;
  border-radius: 4px;
}

.tag-warn {
  font-size: 12px;
  color: #f59e0b;
  background: #fef3c7;
  padding: 1px 6px;
  border-radius: 4px;
}

.item-amounts {
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
  width: 90px;
}

.amount-row {
  display: flex;
  align-items: center;
}

.amount-label {
  font-size: 11px;
  color: var(--text-secondary);
  width: 22px;
  display: none; /* 已用placeholder代替标签，减少占位 */
}

.amount-input {
  width: 100%;
  padding: 3px 5px;
  border: 1px solid var(--border-color);
  border-radius: 4px;
  font-size: 12px;
  text-align: right;
  background: var(--bg-secondary);
  color: var(--text-primary);
  min-width: 0;
}

.profit-input {
  width: 100%;
  color: var(--color-up);
}

.preview-footer {
  display: flex;
  gap: 12px;
  padding: 12px 16px;
  border-top: 1px solid var(--border-color);
}

.preview-footer .van-button {
  flex: 1;
}

/* 导入中 */
.importing-step {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 16px;
}

.importing-step p {
  font-size: 14px;
  color: var(--text-secondary);
}
</style>
