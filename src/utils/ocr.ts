// [WHY] OCR 识别服务 - 使用百度 OCR API 识别基金持仓截图
// [WHAT] 基于百度智能云 OCR API 实现，支持中文识别
// [NOTE] 需要用户提供百度云 API Key 和 Secret Key，每天有 500 次免费额度

/**
 * 识别结果中的持仓项
 */
export interface RecognizedHolding {
  /** 基金代码（6位数字） */
  code: string
  /** 基金名称 */
  name: string
  /** 持仓金额（元） */
  amount: number
  /** 持仓盈亏（元） */
  profit: number
  /** 识别置信度（0-1） */
  confidence: number
}

/**
 * OCR 识别进度回调
 */
export type OcrProgressCallback = (progress: number, status: string) => void

/**
 * 百度 OCR API 配置
 */
export interface BaiduOcrConfig {
  apiKey: string
  secretKey: string
}

// 存储百度 OCR 配置
let baiduConfig: BaiduOcrConfig | null = null

// 本地 OCR 优选引擎（'auto' | 'paddle' | 'tesseract'）
export type LocalOcrEngine = 'auto' | 'paddle' | 'tesseract'
let preferredLocalEngine: LocalOcrEngine | null = null

export function setPreferredLocalOcr(engine: LocalOcrEngine) {
  preferredLocalEngine = engine
  try { localStorage.setItem('preferred_local_ocr', engine) } catch { }
}

export function getPreferredLocalOcr(): LocalOcrEngine {
  if (preferredLocalEngine) return preferredLocalEngine
  try {
    const v = localStorage.getItem('preferred_local_ocr')
    if (v) { preferredLocalEngine = v as LocalOcrEngine; return preferredLocalEngine }
  } catch { }
  preferredLocalEngine = 'auto'
  return preferredLocalEngine
}

/**
 * 设置百度 OCR 配置
 */
export function setBaiduOcrConfig(config: BaiduOcrConfig) {
  baiduConfig = config
  // 保存到 localStorage
  try { localStorage.setItem('baidu_ocr_config', JSON.stringify(config)) } catch { }
}

/**
 * 清除已保存的百度 OCR 配置（从内存与 localStorage 中移除）
 * 用于在用户撤销或旋转 key 后立即清除本地残留
 */
export function clearBaiduOcrConfig() {
  baiduConfig = null
  try { localStorage.removeItem('baidu_ocr_config') } catch { }
}

/**
 * 获取百度 OCR 配置
 */
export function getBaiduOcrConfig(): BaiduOcrConfig | null {
  if (baiduConfig) return baiduConfig

  const stored = localStorage.getItem('baidu_ocr_config')
  if (stored) {
    baiduConfig = JSON.parse(stored)
    return baiduConfig
  }

  return null
}

/**
 * 获取百度 OCR Access Token
 */
async function getBaiduAccessToken(apiKey: string, secretKey: string): Promise<string> {
  // 使用 Vite 代理避免 CORS 问题
  const url = `/baidu-ocr-api/oauth/2.0/token?grant_type=client_credentials&client_id=${apiKey}&client_secret=${secretKey}`

  const response = await fetch(url, { method: 'POST' })
  const data = await response.json()

  if (data.error) {
    throw new Error(`获取Access Token失败: ${data.error_description || data.error}`)
  }

  return data.access_token
}

/**
 * 从图片识别文字
 * [WHY] 使用百度 OCR API，中文识别精度高
 * @param imageSource 图片来源（File 对象或 Base64 字符串）
 * @param onProgress 进度回调
 */
export async function recognizeText(
  imageSource: File | string,
  onProgress?: OcrProgressCallback
): Promise<string> {
  const config = getBaiduOcrConfig()

  // 优先使用百度在线（若配置了 Key/Secret），否则或出错时回退到本地识别
  if (config && config.apiKey && config.secretKey) {
    try {
      if (onProgress) onProgress(0.1, '准备图片...')

      let base64Data: string

      if (imageSource instanceof File) {
        base64Data = await fileToBase64(imageSource)
      } else {
        base64Data = imageSource.includes('data:')
          ? imageSource.split(',')[1]
          : imageSource
      }

      if (onProgress) onProgress(0.2, '获取Access Token...')

      const accessToken = await getBaiduAccessToken(config.apiKey, config.secretKey)

      if (onProgress) onProgress(0.4, '上传到OCR服务...')

      // 调用通用文字识别 API（通过代理避免 CORS）
      const url = `/baidu-ocr-api/rest/2.0/ocr/v1/general_basic?access_token=${accessToken}`

      const formData = new FormData()
      formData.append('image', base64Data)
      formData.append('language_type', 'CHN_ENG') // 中英文混合
      formData.append('detect_direction', 'true') // 检测图像方向
      formData.append('detect_language', 'false')
      formData.append('probability', 'true') // 返回置信度

      const response = await fetch(url, {
        method: 'POST',
        body: formData
      })

      if (onProgress) onProgress(0.7, '解析结果...')

      const data = await response.json()

      if (data.error_code) {
        throw new Error(`OCR识别失败: ${data.error_msg || data.error_code}`)
      }

      if (!data.words_result || data.words_result.length === 0) {
        throw new Error('未识别到文字')
      }

      if (onProgress) onProgress(0.9, '识别完成')

      // 拼接所有识别到的文字
      const text = data.words_result.map((item: any) => item.words).join('\n')

      // [DEBUG] 打印原始识别文本到控制台
      console.log('【OCR原始识别文本】\n', text)

      return text
    } catch (err) {
      console.warn('百度 OCR 失败，尝试本地识别', err)
      // 回退到本地识别
      return recognizeTextLocal(imageSource, onProgress)
    }
  }

  // 如果没有百度配置，不自动回退到本地；让调用方决定是否使用本地识别（以便弹窗提示用户配置Key）
  // 调用方（UI）应捕获该错误并提示用户：配置 Key 或 手动选择“使用本地识别”
  throw new Error('NO_BAIDU_CONFIG: 未配置百度 OCR Key/Secret，请在设置中配置或选择使用本地识别')
}

/**
 * 将 File 对象转换为 Base64（不含前缀）
 */
function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = reader.result as string
      // 移除 data:image/...;base64, 前缀
      const base64 = result.split(',')[1] || result
      resolve(base64)
    }
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

/**
 * 浏览器内本地 OCR（tesseract.js）回退实现
 */
export async function recognizeTextLocal(
  imageSource: File | string,
  onProgress?: OcrProgressCallback
): Promise<string> {
  // 先获取 base64
  let base64Data: string
  if (imageSource instanceof File) {
    base64Data = await fileToBase64(imageSource)
  } else {
    base64Data = imageSource.includes('data:') ? imageSource.split(',')[1] : imageSource
  }

  // 首先尝试在浏览器中使用 tesseract.js
  try {
    const tesseractMod: any = await import('tesseract.js')
    const createWorker = tesseractMod.createWorker || tesseractMod.default?.createWorker
    const recognizeFn = tesseractMod.recognize || tesseractMod.default?.recognize

    const img = 'data:image/png;base64,' + base64Data

    // 优先使用 createWorker() API（若可用且支持 load）
    if (createWorker) {
      // Use a wrapper worker script that filters noisy wasm warnings
      const worker = await createWorker('chi_sim+eng', 1, { workerPath: '/tesseract-worker-wrapper.js', workerBlobURL: true })
      // 如果 worker 提供 load 方法，走完整生命周期
      // Prefer not to call deprecated `load`/`loadLanguage` APIs.
      // Different builds of tesseract.js expose different worker shapes. Handle them safely.
      // 临时过滤 tesseract 内部可能打印的特定警告
      const origWarn = console.warn
      const origError = console.error
      const filterMessage = (args: any[]) => {
        try {
          const joined = args.map((a: any) => String(a)).join(' ')
          if (joined.includes('allow_blob_division')) return true
          if (joined.includes('Parameter not found')) return true
          if (joined.includes('language_model_ngram')) return true
          if (joined.includes('segsearch_max_char_wh_ratio')) return true
        } catch (_) { }
        return false
      }
      console.warn = (...a: any[]) => { if (!filterMessage(a)) origWarn.apply(console, a) }
      console.error = (...a: any[]) => { if (!filterMessage(a)) origError.apply(console, a) }

      try {
        // If worker provides reinitialize, use it to ensure languages are loaded
        if (typeof worker.reinitialize === 'function') {
          if (onProgress) onProgress(0.2, '加载 OCR 模型...')
          try {
            await worker.reinitialize('chi_sim+eng')
          } catch (e) {
            // fallback to english only
            try { await worker.reinitialize('eng') } catch (_) { }
          }

          if (onProgress) onProgress(0.5, '识别中...')
          const { data } = await worker.recognize(img)
          if (onProgress) onProgress(0.9, '解析结果...')
          if (typeof worker.terminate === 'function') await worker.terminate()
          if (!data || !data.text) throw new Error('未识别到文字（tesseract）')
          if (onProgress) onProgress(1, '完成')
          return data.text
        }

        // If worker has recognize directly, use it
        if (typeof worker.recognize === 'function') {
          if (onProgress) onProgress(0.5, '识别中...')
          const res = await worker.recognize(img)
          if (typeof worker.terminate === 'function') await worker.terminate()
          const text = res?.data?.text || res?.text || ''
          if (!text) throw new Error('未识别到文字（tesseract）')
          if (onProgress) onProgress(1, '完成')
          return text
        }
      } finally {
        console.warn = origWarn
        console.error = origError
      }

      // 有 createWorker 但返回的对象不含 load（兼容旧 API），尝试直接使用其 recognize
      if (typeof worker.recognize === 'function') {
        if (onProgress) onProgress(0.5, '识别中...')
        const res = await worker.recognize(img, 'chi_sim+eng')
        if (typeof worker.terminate === 'function') await worker.terminate()
        const text = res?.data?.text || res?.text || ''
        if (!text) throw new Error('未识别到文字（tesseract）')
        if (onProgress) onProgress(1, '完成')
        return text
      }
    }

    // 最后尝试模块级 recognize 函数（某些构建产物使用此 API）
    if (typeof recognizeFn === 'function') {
      if (onProgress) onProgress(0.5, '识别中...')
      const res = await recognizeFn(img, 'chi_sim+eng')
      const text = res?.data?.text || res?.text || ''
      if (!text) throw new Error('未识别到文字（tesseract）')
      if (onProgress) onProgress(1, '完成')
      return text
    }

    throw new Error('tesseract API 不可用')
  } catch (err) {
    console.warn('tesseract 本地识别失败:', err)
    // 作为补充：如果在 Node 环境中可用且用户偏好 paddle，可尝试使用 ppu-paddle-ocr CLI（仅在 Node/主机环境）
    // 这里不直接实现 CLI 调用以避免前端打包问题；如果需要可在后端/构建环境中调用 `npx ppu-paddle-ocr`。
    throw new Error('本地 OCR 失败: ' + (err as Error).message)
  }
}

/**
 * 从识别文字中解析持仓信息
 * [WHY] 不同平台的截图格式不同，需要灵活解析
 * [WHAT] 从 OCR 文本中提取基金代码、名称、持仓金额、持仓盈亏
 */
/**
 * 检测截图来源平台
 * [WHY] 不同平台截图格式不同，需要自动检测后应用对应解析策略
 */
function detectPlatform(text: string): 'alipay' | 'tencent' | 'unknown' {
  // 支付宝特征：有百分号(收益率) + "0.00" + 名称被拆分两行
  const hasPercent = /[-+]\d+\.\d+%/.test(text)
  const hasZeroLine = /0\.00/.test(text)
  if (hasPercent && hasZeroLine) return 'alipay'

  // 腾讯理财通特征：有"理财通"或"持仓收益"表头 + 三个数字一组
  if (/理财通|腾讯/.test(text)) return 'tencent'
  if (/持仓\s?收益|持有\s?金额/.test(text) && !hasPercent) return 'tencent'

  return 'unknown'
}

/**
 * 解析腾讯理财通截图格式
 * [WHY] 腾讯格式每个基金占7行：名称 + 3个表头 + 金额 + 盈亏 + 0.00
 *   名称行（含中文）
 *   持有金额（表头）
 *   持仓收益（表头）
 *   昨日收益（表头）
 *   74,870.07（金额）
 *   +21,297.00（盈亏）
 *   0.00（昨日收益）
 */
function parseTencentFormat(lines: string[], fundList: FundInfo[]): RecognizedHolding[] {
  const holdings: RecognizedHolding[] = []
  const headerPattern = /^持有金额$|^持仓收益$|^昨日收益$/
  const noisePattern = /资产明细|筛选|排序|腾讯|理财通|App|^\d{2}:\d{2}$|^100$|^ll令$|^\d+$|基金|我的|持有|市场|机会|自选|返回|更多|展开/i

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim()

    // 跳过表头和噪声行
    if (headerPattern.test(line) || noisePattern.test(line)) continue

    // 名称行：含2+中文字符，不是纯数字
    if (!/[\u4e00-\u9fa5]{2,}/.test(line) || /^[0-9,\.\+\-\s]+$/.test(line)) continue

    // 向下查找金额（跳过表头行）
    let amount = 0
    let profit = 0
    for (let j = i + 1; j <= Math.min(i + 8, lines.length - 1); j++) {
      const cand = lines[j].trim()
      if (headerPattern.test(cand)) continue

      const nums = cand.match(/[-+]?[0-9,]+(?:\.\d+)?/g)
      if (!nums || nums.length === 0) continue

      // 第一个有效金额是持仓金额
      if (amount === 0) {
        amount = parseAmount(nums[0])
      }

      // 找带符号的盈亏
      if (profit === 0 && /[+-]\s*[0-9,]+/.test(cand)) {
        profit = parseAmount(normalizeSignedNumber(cand.match(/[+-]\s*[0-9,]+(?:\.\d+)?/)?.[0] || '0'))
      }

      // 遇到0.00（昨日收益），停止
      if (amount > 0 && /^0\.00$/.test(cand)) break
      // 金额和盈亏都找到了，停止
      if (amount > 0 && profit > 0) break
    }

    if (amount >= 100) {
      // 在基金列表中匹配
      let code = ''
      let finalName = line
      const f = searchFundByName(line, fundList)
      if (f) { code = f.code; finalName = f.name }

      holdings.push({
        code,
        name: finalName,
        amount,
        profit: profit || 0,
        confidence: code ? 0.9 : 0.6
      })
    }
  }

  return holdings
}

/**
 * 解析支付宝截图格式
 * [WHY] 支付宝持仓截图是两行为一组：
 *   第1行（主信息行）：名称前半部分 + 持仓金额 + 持有盈亏（带+/-，2位小数）
 *   第2行（副信息行）：名称后半部分（如 C / 持有期混合A / ...） + 0.00（昨日收益） + 收益率（带+/-和%）
 *   注意：基金名很长时，会被支付宝拆成两半分别放在这两行的第一列
 * [NOTE] 也兼容旧格式（名称/金额/盈亏各占独立一行）以及手机 OCR 行错位的情况
 */
function parseAlipayFormat(lines: string[], fundList: FundInfo[]): RecognizedHolding[] {
  const holdings: RecognizedHolding[] = []
  // UI 噪声行：表头、广告、页面元素等
  const uiNoisePattern = /支付宝|基金|我的持有|市场|机会|自选|返回|更多|京东|自选榜|预计|更新|交易|笔|买入|合计|元|No\.|重磅|稳健|圈|芯片|半导体|近期|排序|全部|股票型|债券型|混合型|一周|体验金|金额排序|偏股|偏债|指数|黄金|全球|名称|金额|昨日|收益|率|持有收益|持仓|收益明细|交易记录|定投|清仓|体验金|^[0-9:]+\s*$|^ll令|^四$|^因$|^◆$|^\d+$|去看看|和平协议|反弹|自选/i

  // 归一化金额字符串：处理OCR把逗号识别成点的情况（22.000.00 → 22,000.00）
  const normalizeAmountStr = (str: string): string => {
    const sign = str.startsWith('-') ? '-' : (str.startsWith('+') ? '+' : '')
    let num = str.replace(/^[-+]/, '')
    const dots = (num.match(/\./g) || []).length
    if (dots > 1) {
      const lastDotIdx = num.lastIndexOf('.')
      num = num.substring(0, lastDotIdx).replace(/\./g, ',') + num.substring(lastDotIdx)
    }
    return sign + num
  }

  // 从行内提取"中文/字母连续片段"作为名称部分
  const extractNamePiece = (line: string): string => {
    const pieces: string[] = line.match(/[\u4e00-\u9fa5A-Za-z·]+/g) || []
    return pieces.filter(p => !uiNoisePattern.test(p) && p.length >= 1).join('')
  }

  // 从一行中提取所有金额（含符号或不含符号，2位小数，>=100的优先）
  const extractAmounts = (line: string): { raw: string; value: number; signed: boolean }[] => {
    const results: { raw: string; value: number; signed: boolean }[] = []
    const matches = line.match(/([+-]?\s*[0-9][0-9,.]*\.\d{2})/g) || []
    for (const m of matches) {
      const signed = /^[+-]/.test(m.trim())
      const v = parseAmount(normalizeSignedNumber(normalizeAmountStr(m)))
      if (isFinite(v)) results.push({ raw: m, value: v, signed })
    }
    return results
  }

  // 从行中提取收益率百分比（用于判断是否是"副信息行"，不做实际解析，仅用于停止名称后半的扫描）
  const hasPercent = (line: string): boolean => /[-+]?\s*\d[\d.]*\s*%/.test(line)

  // 已使用的行索引，避免重复配对
  const usedIdx = new Set<number>()

  // ========= 策略1：主/副两行配对（新支付宝格式） =========
  for (let i = 0; i < lines.length - 1; i++) {
    if (usedIdx.has(i)) continue
    const line1 = lines[i].trim()
    const line2 = lines[i + 1].trim()

    // 提取 line1 的金额：必须至少有两个金额（金额 + 盈亏），或一个金额且 line2 有 0.00
    const amounts1 = extractAmounts(line1)
    // 金额要足够大才是持仓金额
    const posIdx = amounts1.findIndex(a => a.value >= 100)
    if (posIdx < 0) continue

    // line1 的第一个大额就是持仓金额
    const holdAmt = amounts1[posIdx].value

    // 找盈亏：line1 中剩余的带符号且有 2 位小数的；如果 line1 没有，看 line2
    let profit = 0
    for (let k = posIdx + 1; k < amounts1.length; k++) {
      if (amounts1[k].signed) { profit = amounts1[k].value; break }
    }
    if (profit === 0) {
      const amounts2 = extractAmounts(line2)
      for (const a of amounts2) {
        if (a.signed && Math.abs(a.value) < holdAmt) { profit = a.value; break }
      }
    }

    // 提取名称：line1 第一列（名称前半） + line2 第一列（名称后半）
    let name1 = extractNamePiece(line1)
    let name2 = extractNamePiece(line2)

    // 过滤：名称后半如果匹配到 uiNoisePattern，就不要（如第二行第一列恰好是"昨日"之类残留噪声）
    if (uiNoisePattern.test(name2) && name2.length < 4) name2 = ''
    if (uiNoisePattern.test(name1) && name1.length < 4) name1 = ''

    // 更严格过滤：如果 name1 看起来就是表头或噪声，跳过这一行
    if (!name1 || name1.length < 3) continue

    // line2 必须是副信息行：包含 0.00（昨日收益）或收益率百分比
    // 或者：line2 至少有一个数字（金额/收益率），才算"两行为一组"
    const line2LooksLikeSubRow = /0\.00/.test(line2) || hasPercent(line2) || extractAmounts(line2).length > 0

    let namePiece1 = name1
    let namePiece2 = ''

    if (line2LooksLikeSubRow) {
      namePiece2 = name2
      usedIdx.add(i + 1) // 副行已使用
    } else {
      // 若 line2 不像副信息，则尝试把 line1 当作单行名称+金额
      // （也就是名称不跨行，line2 是下一只的开始）
      namePiece2 = ''
    }

    usedIdx.add(i)

    let fullName = (namePiece1 + namePiece2).trim()
    if (!fullName || fullName.length < 3) continue
    if (uiNoisePattern.test(fullName) && fullName.length < 8) continue

    // 保底：如果 name1+name2 不合理（如重复），尝试回退只取 name1
    //（有时手机 OCR 会把名称后半识别到别处）
    if (fullName.length > 30) fullName = namePiece1

    // 在基金列表中匹配
    let code = ''
    let finalName = fullName
    const f = searchFundByName(fullName, fundList)
    if (f) { code = f.code; finalName = f.name }

    holdings.push({
      code,
      name: finalName,
      amount: holdAmt,
      profit: profit || 0,
      confidence: code ? 0.9 : 0.6
    })
  }

  // ========= 策略2：兼容旧格式（金额独立行，名称在上一行） =========
  // 如果策略1识别出的条目明显偏少（<3条），再扫一遍整行纯金额的旧格式
  if (holdings.length < 3) {
    for (let i = 0; i < lines.length; i++) {
      if (usedIdx.has(i)) continue
      const line = lines[i].trim()
      const amountMatch = line.match(/^([0-9,.]+\.\d{2})$/)
      if (!amountMatch) continue
      const amount = parseAmount(normalizeAmountStr(amountMatch[1]))
      if (amount < 100) continue

      let namePart1 = ''
      if (i > 0 && !usedIdx.has(i - 1)) {
        const prevLine = lines[i - 1].trim()
        if (/[\u4e00-\u9fa5]{2,}/.test(prevLine) && !uiNoisePattern.test(prevLine)) {
          namePart1 = extractNamePiece(prevLine)
        }
      }
      if (!namePart1 || namePart1.length < 3) continue

      let profit = 0
      if (i + 1 < lines.length) {
        const profitLine = lines[i + 1].trim()
        const profitMatch = profitLine.match(/^([-+]?[0-9,.]+\.\d{2})$/)
        if (profitMatch) profit = parseAmount(normalizeSignedNumber(normalizeAmountStr(profitMatch[1])))
      }

      const f = searchFundByName(namePart1, fundList)
      const code = f ? f.code : ''
      holdings.push({
        code,
        name: f ? f.name : namePart1,
        amount,
        profit: profit || 0,
        confidence: code ? 0.9 : 0.6
      })
    }
  }

  return holdings
}

export async function parseHoldingTextOnline(text: string): Promise<RecognizedHolding[]> {
  const holdings: RecognizedHolding[] = []

  // 切分并清理行，保留有用换行
  const rawLines = text.split('\n').map(l => l.trim()).filter(Boolean)
  const lines = rawLines.map(l => l.replace(/[\t\r]+/g, ' ').replace(/\s+/g, ' ')).filter(Boolean)

  // 加载基金列表（用于通过名称查找 code）
  const fundList = await loadFundList()

  // 在线 OCR 常见表头/噪声行（百度等）
  const headerPattern = /持\s?有\s?金额|持仓\s?收益|昨日\s?收益|资产\s?明细|排序|筛选|持有金额/i
  const uiNoisePattern = /腾讯|理财通|资产明细|筛选|排序|按\s?持仓\s?收益|App|网页|返回|更多|展开|我的持仓/i

  // 自动检测平台并应用对应解析策略
  const platform = detectPlatform(text)
  if (platform === 'tencent') {
    const tencentHoldings = parseTencentFormat(lines, fundList)
    if (tencentHoldings.length > 0) {
      return tencentHoldings
    }
  }
  if (platform === 'alipay') {
    const alipayHoldings = parseAlipayFormat(lines, fundList)
    if (alipayHoldings.length > 0) {
      return alipayHoldings
    }
  }

  // 使用 preprocessLines 优先把名称与后续金额配对（在线 OCR 输出行较完整）
  const processedLines = preprocessLines(lines)

  for (let i = 0; i < processedLines.length; i++) {
    let line = processedLines[i]

    // 去除纯表头行
    if (headerPattern.test(line)) continue

    // [FIX] 跳过纯盈亏行（只有带符号数字的行，如 "+21,297.00"），避免重复识别
    // 盈亏会在金额行的后续行查找中被捕获
    if (/^\s*[+-][0-9,]+(?:\.\d+)?\s*$/.test(line)) continue

    // 先尝试完整行解析（含 code/name/amount）
    const single = parseSingleLine(line)
    if (single) {
      // 若缺 code，尝试名称匹配
      if (!single.code && single.name) {
        const f = searchFundByName(single.name, fundList)
        if (f) { single.code = f.code; single.name = f.name; single.confidence = 0.95 }
      }
      ; (single as any).ocrName = single.name || line
      holdings.push(single)
      continue
    }

    // 查找行内金额（可能为市值/持仓金额），并向上寻找最近的名称或代码
    const amountMatches = line.match(/[-+]?[0-9,]+(?:\.\d+)?/g)
    if (amountMatches && amountMatches.length > 0) {
      let amount = parseAmount(amountMatches[0])
      let profit = amountMatches.length >= 2 ? parseAmount(normalizeSignedNumber(amountMatches[1])) : 0

      // 向上查找 1-3 行，尝试找到名称或代码
      let nameCandidate = ''
      let codeCandidate = ''
      for (let j = i - 1; j >= Math.max(0, i - 3); j--) {
        const cand = processedLines[j]
        if (!cand || headerPattern.test(cand)) continue
        // 直接包含六位代码优先
        const codeMatch = cand.match(/(\d{6})/)
        if (codeMatch && isValidFundCode(codeMatch[1])) { codeCandidate = codeMatch[1]; nameCandidate = cand.replace(codeMatch[0], '').trim(); break }
        if (/[\u4e00-\u9fa5]{2,}/.test(cand) && cand.length > 2) {
          nameCandidate = cand
          break
        }
      }

      // 过滤 UI 噪声
      if (nameCandidate && uiNoisePattern.test(nameCandidate)) continue

      // 如果没有 code，但名称存在，尝试本地模糊匹配（searchFundByName 已更严格）
      let code = codeCandidate
      let finalName = nameCandidate
      if (!code && finalName) {
        const f = searchFundByName(finalName, fundList)
        if (f) { code = f.code; finalName = f.name }
      }

      // 若未在同一 processed 行中获得 profit，尝试检查后续原始行或 processedLines 的下一行（常见于在线 OCR 分行）
      if (!profit || profit === 0) {
        // 检查后续 1-2 行是否包含以 + 或 - 开头的数字
        for (let k = i + 1; k <= Math.min(i + 2, processedLines.length - 1); k++) {
          const nxt = processedLines[k]
          if (!nxt) continue
          const signMatch = nxt.match(/[+-]\s*[0-9,]+(?:\.\d+)*/)
          if (signMatch) {
            profit = parseAmount(normalizeSignedNumber(signMatch[0]))
            break
          }
          // 或者行内若仅有一个数字且看起来是盈亏（小于金额且带符号），也取之
          const nums = nxt.match(/[-+]?[0-9,]+(?:\.\d+)?/g)
          if (nums && nums.length === 1 && /^[-+]/.test(nxt.trim())) {
            profit = parseAmount(normalizeSignedNumber(nums[0]))
            break
          }
        }
      }

      // 最后再尝试在原始 rawLines 中寻找（有时 processedLines 被预处理过而丢失了 + 号）
      if (!finalName && !nameCandidate) {
        // 从当前 processed line 提取可能的名称（去掉数字）
        const guessed = line.replace(/[-+]?[0-9,]+(?:\.\d+)?/g, '').replace(/持有金额|持仓收益|昨日收益/gi, '').trim()
        if (guessed && guessed.length > 1) nameCandidate = guessed
      }

      if ((!profit || profit === 0) && (finalName || nameCandidate)) {
        const rawIdx = rawLines.findIndex(r => (finalName && r.includes(finalName)) || (nameCandidate && r.includes(nameCandidate)) || r.includes(line.split(' ')[0]))
        if (rawIdx >= 0) {
          for (let k = rawIdx + 1; k <= Math.min(rawIdx + 6, rawLines.length - 1); k++) {
            const nxtRaw = rawLines[k]
            if (!nxtRaw) continue
            const signMatchRaw = nxtRaw.match(/[+-]\s*[0-9,]+(?:\.\d+)*/)
            if (signMatchRaw) { profit = parseAmount(normalizeSignedNumber(signMatchRaw[0])); break }
            const numsRaw = nxtRaw.match(/[-+]?[0-9,]+(?:\.\d+)?/g)
            if (numsRaw && numsRaw.length === 1 && /^[-+]/.test(nxtRaw.trim())) { profit = parseAmount(normalizeSignedNumber(numsRaw[0])); break }
          }
        }
      }

      // 要求金额门槛，避免误判（页面序号或 UI 小数字）
      if (amount >= 100 && (code || finalName)) {
        const obj: any = { code: code || '', name: finalName || '', amount, profit, confidence: code ? 0.95 : 0.7 }
        obj.ocrName = nameCandidate || finalName || line.split(' ')[0]
        holdings.push(obj)
      }
      continue
    }

    // 若行看起来像基金名称（长中文串），尝试缓存并让下一行金额配对
    if (/[\u4e00-\u9fa5]{3,}/.test(line) && line.length > 4 && !uiNoisePattern.test(line)) {
      // 保留为可能的名称候选（preprocessLines 已做部分合并）
      // 直接交由后续金额解析逻辑配对
      continue
    }
  }

  // 最后补充：若部分条目缺少 code，尝试用本地基金列表做一次补充匹配
  for (const h of holdings) {
    if (!h.code && h.name) {
      const f = searchFundByName(h.name, fundList)
      if (f) { h.code = f.code; h.name = f.name; h.confidence = Math.max(h.confidence || 0, 0.85) }
    }
  }

  // 补充：若某些条目的 profit 仍为 0，尝试在原始 rawLines 中根据名称向下搜索带符号的数字并填充
  for (const h of holdings) {
    if ((!h.profit || h.profit === 0) && h.name) {
      // 优先精确查找；失败则尝试部分名称匹配
      let rawIdx = rawLines.findIndex(r => r.includes(h.name))
      if (rawIdx < 0) {
        const compact = h.name.replace(/\s+/g, '')
        rawIdx = rawLines.findIndex(r => r.replace(/\s+/g, '').includes(compact))
      }
      if (rawIdx < 0) {
        const firstChars = h.name.replace(/\s+/g, '').slice(0, 6)
        rawIdx = rawLines.findIndex(r => r.includes(firstChars))
      }
      if (rawIdx >= 0) {
        for (let k = rawIdx + 1; k <= Math.min(rawIdx + 6, rawLines.length - 1); k++) {
          const nxtRaw = rawLines[k]
          if (!nxtRaw) continue
          const signMatchRaw = nxtRaw.match(/[+-]\s*[0-9,]+(?:\.\d+)*/)
          if (signMatchRaw) { h.profit = parseAmount(normalizeSignedNumber(signMatchRaw[0])); break }
          const numsRaw = nxtRaw.match(/[-+]?[0-9,]+(?:\.\d+)?/g)
          if (numsRaw && numsRaw.length === 1 && /^[-+]/.test(nxtRaw.trim())) { h.profit = parseAmount(normalizeSignedNumber(numsRaw[0])); break }
        }
      }
      // 如果仍未找到 profit，尝试根据持仓金额在原始行中定位金额行，并向下找第一个比 amount 小的数字作为 profit
      if ((!h.profit || h.profit === 0) && h.amount) {
        // 更稳健地定位金额行：在所有 rawLines 中找出包含等于 h.amount 的数字的位置
        let amtIdx = -1
        for (let r = 0; r < rawLines.length; r++) {
          const rn = rawLines[r]
          const nums = rn.match(/[-+]?[0-9,]+(?:\.\d+)?/g)
          if (!nums) continue
          for (const n of nums) {
            const v = parseAmount(normalizeSignedNumber(n))
            if (Math.abs(v - (h.amount || 0)) < 0.001) { amtIdx = r; break }
          }
          if (amtIdx >= 0) break
        }
        if (amtIdx >= 0) {
          for (let k = amtIdx + 1; k <= Math.min(amtIdx + 6, rawLines.length - 1); k++) {
            const nxt = rawLines[k]
            if (!nxt) continue
            const nums = nxt.match(/[-+]?[0-9,]+(?:\.\d+)?/g)
            if (!nums) continue
            for (const n of nums) {
              const v = parseAmount(normalizeSignedNumber(n))
              if (v > 0 && v < h.amount) { h.profit = v; break }
            }
            if (h.profit && h.profit > 0) break
          }
        }
      }
    }
  }

  // 去重合并
  const dedupMap = new Map<string, RecognizedHolding>()
  const normalizeKey = (h: RecognizedHolding) => h.code ? `c:${h.code}` : `n:${(h.name || '').toLowerCase().replace(/\s+/g, '').replace(/[()（）]/g, '')}`
  for (const h of holdings) {
    const key = normalizeKey(h)
    const existing = dedupMap.get(key)
    if (!existing) dedupMap.set(key, { ...h })
    else {
      existing.amount = Math.max(existing.amount || 0, h.amount || 0)
      existing.profit = (existing.profit || 0) + (h.profit || 0)
      existing.confidence = Math.max(existing.confidence || 0, h.confidence || 0)
      if (!existing.code && h.code) existing.code = h.code
      if (!existing.name && h.name) existing.name = h.name
    }
  }

  return Array.from(dedupMap.values())
}

// 本地 OCR（tesseract.js）专用解析器：针对本地识别文本的特点调整噪声过滤与匹配策略
export async function parseHoldingTextLocal(text: string): Promise<RecognizedHolding[]> {
  const holdings: RecognizedHolding[] = []

  // 规范化：保留换行符，去除非打印控制字符与方括号噪声
  let cleanText = text.replace(/[\u0000-\u0008\u000B-\u000C\u000E-\u001F\u007F-\u009F]/g, ' ')
  cleanText = cleanText.replace(/\[[^\]]*\]/g, ' ')
  // 多次合并中文间被分隔的空格（OCR 常把每个字分开）
  // [WHY] 只合并同一行内的空格（用 [ \t] 而非 \s），避免跨行合并导致两条记录粘在一起
  while (/([\u4e00-\u9fa5])[ \t]+([\u4e00-\u9fa5])/.test(cleanText)) {
    cleanText = cleanText.replace(/([\u4e00-\u9fa5])[ \t]+([\u4e00-\u9fa5])/g, '$1$2')
  }
  // 保留换行符，避免把多条记录合并为一行
  cleanText = cleanText.replace(/[^\u4e00-\u9fa5\d,\.\+\-\s\n\(\)／\w]+/g, ' ')

  const rawLines = cleanText.split('\n').map(l => l.trim()).filter(Boolean)
  const lines = rawLines.map(l => l.replace(/[\t\r]+/g, ' ').replace(/\s+/g, ' ')).filter(Boolean)

  const fundList = await loadFundList()
  // 自动检测平台并应用对应解析策略
  const platform = detectPlatform(text)
  if (platform === 'tencent') {
    const tencentHoldings = parseTencentFormat(lines, fundList)
    if (tencentHoldings.length > 0) {
      return tencentHoldings
    }
  }
  if (platform === 'alipay') {
    const alipayHoldings = parseAlipayFormat(lines, fundList)
    if (alipayHoldings.length > 0) {
      return alipayHoldings
    }
  }

  const headerPatternLocal = /持\s?有\s?金额|持仓\s?收益|昨日\s?收益|资产\s?明细/i
  const uiNoisePatternLocal = /腾讯|理财通|资产明细|筛选|排序|按\s?持仓\s?收益|返回|更多|展开/i

  // 对每个可能的名称行，向下在接下来的几行内查找金额
  for (let i = 0; i < lines.length; i++) {
    let line = lines[i]

    // 去除行中的表头/噪声子串，但保留行中可能存在的基金名称
    if (headerPatternLocal.test(line) || uiNoisePatternLocal.test(line)) {
      while (headerPatternLocal.test(line)) line = line.replace(headerPatternLocal, '').trim()
      while (uiNoisePatternLocal.test(line)) line = line.replace(uiNoisePatternLocal, '').trim()
    }
    if (!line) continue

    // 名称行判定：包含两个及以上中文字符
    if (/[\u4e00-\u9fa5]{2,}/.test(line) && line.length > 2) {
      const nameLine = line

      // 在当前行及向下最多三行内查找金额信息
      let foundAmount = 0
      let foundProfit = 0
      let foundCode = ''
      for (let j = i; j <= Math.min(i + 3, lines.length - 1); j++) {
        const candidate = lines[j]
        // 如果当前候选行为名称行且包含基金类型关键词，跳过该行中的数字
        const skipInlineNums = (j === i) && /ETF|指数|QD|QDII|QDIDA|发起式/i.test(candidate)
        const nums = skipInlineNums ? null : candidate.match(/[+\-]?[0-9,]+(?:\.\d+)?/g)
        const codeMatch = candidate.match(/(\d{6})/)
        if (codeMatch && isValidFundCode(codeMatch[1])) foundCode = codeMatch[1]
        if (nums && nums.length > 0) {
          if (nums.length >= 2) {
            foundAmount = parseAmount(nums[0])
            foundProfit = parseAmount(normalizeSignedNumber(nums[1]))
          } else {
            if (foundAmount === 0) foundAmount = parseAmount(nums[0])
            else if (foundProfit === 0) foundProfit = parseAmount(normalizeSignedNumber(nums[0]))
          }
        }
        if (foundAmount > 0) break
      }

      // 若名称行内含数字（且名称看起来不是基金类型），也取其为持仓金额
      if (foundAmount === 0) {
        if (!/ETF|指数|QD|QDII|QDIDA|发起式/i.test(nameLine)) {
          const inline = nameLine.match(/[+\-]?[0-9,]+(?:\.\d+)?/g)
          if (inline && inline.length > 0) {
            foundAmount = parseAmount(inline[0])
            if (inline.length >= 2) foundProfit = parseAmount(normalizeSignedNumber(inline[1]))
          }
        }
      }

      // 名称标准化并尝试在本地基金列表匹配
      let finalName = nameLine
      let finalCode = foundCode
      if (!finalCode) {
        const f = searchFundByName(finalName, fundList)
        if (f) { finalCode = f.code; finalName = f.name }
      }

      // 要求金额有一定规模以避免把 UI 页头的序号或页面元素误判为持仓
      if (foundAmount >= 100 && !uiNoisePatternLocal.test(finalName)) {
        holdings.push({ code: finalCode || '', name: finalName || '', amount: foundAmount, profit: foundProfit || 0, confidence: finalCode ? 0.9 : 0.6 })
      }
    }
  }

  // 去重合并
  const dedupMap = new Map<string, RecognizedHolding>()
  const normalizeKey = (h: RecognizedHolding) => {
    if (h.code) return `c:${h.code}`
    return `n:${(h.name || '').toLowerCase().replace(/\s+/g, '').replace(/[()（）]/g, '')}`
  }

  for (const h of holdings) {
    const key = normalizeKey(h)
    const existing = dedupMap.get(key)
    if (!existing) dedupMap.set(key, { ...h })
    else {
      existing.amount = Math.max(existing.amount || 0, h.amount || 0)
      existing.profit = (existing.profit || 0) + (h.profit || 0)
      existing.confidence = Math.max(existing.confidence || 0, h.confidence || 0)
      if (!existing.code && h.code) existing.code = h.code
      if (!existing.name && h.name) existing.name = h.name
      dedupMap.set(key, existing)
    }
  }

  return Array.from(dedupMap.values())
}

/**
 * 预处理文本行
 * [WHY] OCR 识别结果可能将本应在一起的内容分到不同行
 */
function preprocessLines(lines: string[]): string[] {
  const result: string[] = []

  // [FIX] 腾讯理财通格式：名称行后跟"持有金额/持仓收益/昨日收益"表头，再跟金额/盈亏/0.00
  // 检测到这种格式时，直接按"名称 + 金额 + 盈亏"提取，避免表头行干扰配对
  const tencentHeaderCount = lines.filter(l => /^持有金额$|^持仓收益$|^昨日收益$/.test(l.trim())).length
  if (tencentHeaderCount >= 2) {
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim()
      // 跳过表头和 UI 噪声
      if (/^持有金额$|^持仓收益$|^昨日收益$|^资产明细|^筛选|^排序|^腾讯|^理财通|^App$|^\d{2}:\d{2}$|^100$|^ll令$/.test(line)) continue
      // 找到名称行（含中文，不是纯数字）
      if (/[\u4e00-\u9fa5]{2,}/.test(line) && !/^[0-9,\.\+\-\s]+$/.test(line)) {
        // 向下查找金额（跳过表头行）
        let amount = 0
        let profit = 0
        for (let j = i + 1; j <= Math.min(i + 6, lines.length - 1); j++) {
          const cand = lines[j].trim()
          if (/^持有金额$|^持仓收益$|^昨日收益$/.test(cand)) continue
          const nums = cand.match(/[-+]?[0-9,]+(?:\.\d+)?/g)
          if (!nums || nums.length === 0) continue
          // 第一个有效金额是持仓金额
          if (amount === 0) {
            amount = parseAmount(nums[0])
            if (nums.length >= 2) profit = parseAmount(normalizeSignedNumber(nums[1]))
          }
          // 找带符号的盈亏
          if (profit === 0 && /[+-]\s*[0-9,]+/.test(cand)) {
            profit = parseAmount(normalizeSignedNumber(cand.match(/[+-]\s*[0-9,]+(?:\.\d+)?/)?.[0] || '0'))
          }
          if (amount > 0 && profit > 0) break
          if (amount > 0 && /^0\.00$/.test(cand)) break // 遇到昨日收益0.00，停止
        }
        if (amount >= 100) {
          result.push(`${line} ${amount} ${profit > 0 ? profit : ''}`.trim())
        }
      }
    }
    if (result.length > 0) return result
  }

  // 策略：找出所有包含基金名称的行，找出所有包含金额的行，然后配对
  const nameLines: { text: string; idx: number }[] = []
  const amountLines: { amount: number; idx: number }[] = []

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]

    // 找基金名称（包含中文的较长行），但排除常见表头/UI 噪声
    const chineseMatch = line.match(/[\u4e00-\u9fa5]{3,}/)
    const headerLike = /持\s?有\s?金额|持仓\s?收益|昨日\s?收益|资产\s?明细|筛选|排序|App|网页|返回|更多|展开|我的持仓/i
    if (chineseMatch && line.length > 4 && !headerLike.test(line) && !/^[0-9,\.\+\-]+$/.test(line)) {
      nameLines.push({ text: line, idx: i })
    }

    // 找金额（带逗号的数字，支持可选小数部分）
    // [FIX] 跳过纯盈亏行（如 "+21,297.00"），避免被当成金额重复配对
    if (/^\s*[+-][0-9,]+(?:\.\d+)?\s*$/.test(line)) continue
    const amountMatches = line.match(/[0-9,]+(?:\.\d+)?/g)
    if (amountMatches) {
      for (const m of amountMatches) {
        const amount = parseAmount(m)
        if (amount >= 100) {
          amountLines.push({ amount, idx: i })
        }
      }
    }
  }

  // 配对名称和金额
  // Track which amount lines are used so we can try extra pairing later
  const usedAmountIdx = new Set<number>()
  for (const nameItem of nameLines) {
    // 跳过明显不是基金名称的行
    if (nameItem.text.includes('App') || nameItem.text.includes('理财通') ||
      nameItem.text.includes('筛选') || nameItem.text.includes('排序') ||
      nameItem.text.includes('持有金额') || nameItem.text.includes('持仓收益') ||
      nameItem.text.includes('昨日收益') || nameItem.text.includes('17:') ||
      nameItem.text.includes('100')) {
      continue
    }

    // 找最近的金额（持仓金额）和盈亏
    let bestAmount = 0
    let bestProfit = 0
    let bestDist = Infinity
    let bestAmtIdx = -1

    for (const amtItem of amountLines) {
      const dist = amtItem.idx - nameItem.idx
      // 金额应该在名称后面的 0-6 行内（增加容错，处理表头占用多行的情况）
      if (dist > 0 && dist <= 6) {
        if (dist < bestDist) {
          bestDist = dist
          bestAmount = amtItem.amount
          bestAmtIdx = amtItem.idx
        }
      }
      // 盈亏在持仓金额后面一行
      if (dist > bestDist && dist <= bestDist + 3) {
        bestProfit = amtItem.amount
      }
    }

    // 额外扫描：如果在 amountLines 中没有找到 profit，尝试在名称后几行中搜索带符号的数字作为盈亏
    if (bestAmount > 0) {
      if (!bestProfit) {
        for (let k = nameItem.idx + 1; k <= Math.min(nameItem.idx + 6, lines.length - 1); k++) {
          const l = lines[k]
          if (!l) continue
          const signMatch = l.match(/[+-]\s*[0-9,]+(?:\.\d+)*/)
          if (signMatch) {
            try {
              bestProfit = parseAmount(normalizeSignedNumber(signMatch[0]))
              break
            } catch (_) { }
          }
          // 有时 OCR 会把带符号数字拆成两段（如 '+18.093' '89'），尝试合并紧邻数字
          const nums = l.match(/[-+]?[0-9,]+(?:\.\d+)?/g)
          if (nums && nums.length === 1 && /^[-+]/.test(l.trim())) {
            bestProfit = parseAmount(normalizeSignedNumber(nums[0]))
            break
          }
        }
      }

      // 格式：名称 持仓金额 盈亏
      result.push(`${nameItem.text} ${bestAmount} ${bestProfit > 0 ? bestProfit : ''}`.trim())
      // mark the amount line as used (by idx)
      if (bestAmtIdx >= 0) usedAmountIdx.add(bestAmtIdx)
    }
  }

  // 额外尝试：如果仍有未被配对的 amountLines，尝试向上寻找最近的中文名称并配对（处理最后一条或被表头分隔的情况）
  for (const amtItem of amountLines) {
    if (usedAmountIdx.has(amtItem.idx)) continue
    const amtIdx = amtItem.idx
    // 向上最多 6 行寻找名称行
    let foundName = ''
    for (let k = Math.max(0, amtIdx - 6); k < amtIdx; k++) {
      const cand = lines[k]
      if (!cand) continue
      if (/App|理财通|筛选|排序|持有金额|持仓收益|昨日收益|17:|100/.test(cand)) continue
      if (/[\u4e00-\u9fa5]{2,}/.test(cand)) { foundName = cand; break }
    }
    if (foundName) {
      // 查找紧随其后的可能盈亏行
      let foundProfit = 0
      for (let k = amtIdx + 1; k <= Math.min(amtIdx + 6, lines.length - 1); k++) {
        const l = lines[k]
        if (!l) continue
        const signMatch = l.match(/[+-]\s*[0-9,]+(?:\.\d+)*/)
        if (signMatch) { foundProfit = parseAmount(normalizeSignedNumber(signMatch[0])); break }
      }
      result.push(`${foundName} ${amtItem.amount} ${foundProfit > 0 ? foundProfit : ''}`.trim())
      usedAmountIdx.add(amtIdx)
    }
  }

  // 如果没有匹配成功，返回原始行
  if (result.length === 0) {
    return lines.filter(l => l.length > 2)
  }

  return result
}

// [WHAT] 基金列表缓存
let fundListCache: FundInfo[] | null = null

/**
 * 加载基金列表
 */
async function loadFundList(): Promise<FundInfo[]> {
  if (fundListCache) return fundListCache

  try {
    const response = await fetch('/fund-list.json')
    fundListCache = await response.json()
    return fundListCache || []
  } catch {
    return []
  }
}

interface FundInfo {
  code: string
  name: string
  type?: string
  pinyin?: string
}

/**
 * 在基金列表中搜索基金
 * [WHY] OCR识别的名称可能有差异，使用模糊匹配
 */
function searchFundByName(ocrName: string, fundList: FundInfo[]): FundInfo | null {
  if (!ocrName || ocrName.length < 2) return null

  const ocrChinese = (ocrName.match(/[\u4e00-\u9fa5]/g) || []).join('')
  const cleanOcrName = ocrName.replace(/[()\s]/g, '').toLowerCase()

  let bestMatch: FundInfo | null = null
  let bestScore = 0

  for (const fund of fundList) {
    const cleanFundName = fund.name.replace(/[()\s]/g, '').toLowerCase()
    const fundChinese = (fund.name.match(/[\u4e00-\u9fa5]/g) || []).join('')

    // 1. 精确匹配
    if (cleanFundName === cleanOcrName) return fund

    // [FIX] 新增：计算中文字符重叠率，过滤掉重叠率太低的候选
    const setOcr = new Set(ocrChinese)
    let common = 0
    for (const ch of fundChinese) { if (setOcr.has(ch)) common++ }
    const maxLen = Math.max(ocrChinese.length, fundChinese.length)
    const charRatio = maxLen > 0 ? common / maxLen : 0

    // 2. 中文子串匹配
    if (fundChinese.length >= 3 && ocrChinese.includes(fundChinese)) {
      // [FIX] 子串匹配时，额外检查：OCR 名中是否存在 >=3 个连续中文字符
      // 在候选名中找不到（即 OCR 噪声块）
      if (ocrChinese.length > fundChinese.length + 2) {
        // OCR 名比候选名多出 3+ 个中文字符，需要检查多出的是不是噪声
        // （比如 OCR "中信建投品质优选一年持有期混合A" vs 候选 "中信建投品质优选一年持有A"
        // 多出的 "期混合" 就是噪声块）
        let hasNoiseBlock = false
        for (let len = 3; len <= Math.min(5, ocrChinese.length - fundChinese.length + 2); len++) {
          for (let i = 0; i <= ocrChinese.length - len; i++) {
            const seg = ocrChinese.substring(i, i + len)
            if (!fundChinese.includes(seg)) {
              // 只有当这段噪声在 OCR 名中是连续的、且长度 >=3、
              // 并且整个候选名完全不含这段时，才判定为噪声块
              // 但同时也要求 fundChinese 被 OCR 完全包含，这已经是我们的前提
              hasNoiseBlock = true
              break
            }
          }
          if (hasNoiseBlock) break
        }
        if (hasNoiseBlock) {
          // 仍然接受这个匹配，但降低置信度评分
          const score = 0.5 + 0.2 * (fundChinese.length / Math.max(ocrChinese.length, 1))
          if (score > bestScore) { bestScore = score; bestMatch = fund }
          continue
        }
      }

      // 正常接受
      const score = 0.7 + 0.3 * (fundChinese.length / Math.max(ocrChinese.length, 1))
      if (score > bestScore) { bestScore = score; bestMatch = fund }
      continue
    }

    if (ocrChinese.length >= 3 && fundChinese.includes(ocrChinese)) {
      const score = 0.7 + 0.3 * (ocrChinese.length / Math.max(fundChinese.length, 1))
      if (score > bestScore) { bestScore = score; bestMatch = fund }
      continue
    }

    // 3. LCS 匹配
    if (fundChinese.length >= 3 && ocrChinese.length >= 3) {
      const lcsLen = longestCommonSubsequence(ocrChinese, fundChinese)
      const coverage = lcsLen / fundChinese.length
      // [FIX] 提高阈值到 0.85，并要求至少有 5 个共同字符
      if (coverage >= 0.85 && lcsLen >= 5 && coverage > bestScore) {
        // 额外检查：字符重叠率不能太低
        if (charRatio >= 0.6) {
          bestScore = coverage
          bestMatch = fund
        }
      }
    }
  }
  return bestMatch
}

function longestCommonSubsequence(str1: string, str2: string): number {
  const m = str1.length
  const n = str2.length
  if (m === 0 || n === 0) return 0
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0))
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (str1[i - 1] === str2[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1])
      }
    }
  }
  return dp[m][n]
}

/**
 * 计算两个字符串的相似度（简单实现）
 */
function calculateSimilarity(str1: string, str2: string): number {
  // 如果一个包含另一个
  if (str1.includes(str2) || str2.includes(str1)) {
    return 0.95
  }

  // 计算公共字符数量
  const set1 = new Set(str1)
  const set2 = new Set(str2)
  let common = 0
  for (const char of set1) {
    if (set2.has(char)) common++
  }

  const union = set1.size + set2.size - common
  return union > 0 ? common / union : 0
}

/**
 * 解析单行文本（完整信息）
 */
function parseSingleLine(line: string): RecognizedHolding | null {
  // 模式1：基金代码 + 名称 + 金额 + 盈亏
  // 例如：006751 浦银安盛全球智能科技A 74,870.07 21,297.00
  const p1 = /(\d{6})\s*([\u4e00-\u9fa5A-Za-z0-9·()（）]+)\s+([\d,]+\.?\d*)\s+([-+]?[\d,]+\.?\d*)/
  const m1 = line.match(p1)
  if (m1) {
    return {
      code: m1[1],
      name: cleanFundName(m1[2]),
      amount: parseAmount(m1[3]),
      profit: parseAmount(normalizeSignedNumber(m1[4])),
      confidence: 0.9
    }
  }

  // 模式2：名称 + 代码 + 金额 + 盈亏
  const p2 = /([\u4e00-\u9fa5A-Za-z0-9·()（）]{2,})\s*(\d{6})\s+([\d,]+\.?\d*)\s+([-+]?[\d,]+\.?\d*)/
  const m2 = line.match(p2)
  if (m2) {
    return {
      code: m2[2],
      name: cleanFundName(m2[1]),
      amount: parseAmount(m2[3]),
      profit: parseAmount(normalizeSignedNumber(m2[4])),
      confidence: 0.9
    }
  }

  // 模式3：代码 + 名称 + 金额（无盈亏）
  const p3 = /(\d{6})\s*([\u4e00-\u9fa5A-Za-z0-9·()（）]+)\s+([\d,]+\.?\d*)/
  const m3 = line.match(p3)
  if (m3 && parseAmount(m3[3]) >= 100) {
    return {
      code: m3[1],
      name: cleanFundName(m3[2]),
      amount: parseAmount(m3[3]),
      profit: 0,
      confidence: 0.8
    }
  }

  // 模式4：名称 + 代码 + 金额（无盈亏）
  const p4 = /([\u4e00-\u9fa5A-Za-z0-9·()（）]{2,})\s*(\d{6})\s+([\d,]+\.?\d*)/
  const m4 = line.match(p4)
  if (m4 && parseAmount(m4[3]) >= 100) {
    return {
      code: m4[2],
      name: cleanFundName(m4[1]),
      amount: parseAmount(m4[3]),
      profit: 0,
      confidence: 0.8
    }
  }

  // 模式5：只有代码和金额
  const p5 = /(\d{6})\s+([0-9,]+(?:\.\d+)?)/
  const m5 = line.match(p5)
  if (m5 && parseAmount(m5[2]) >= 100) {
    return {
      code: m5[1],
      name: '',
      amount: parseAmount(m5[2]),
      profit: 0,
      confidence: 0.6
    }
  }

  return null
}

/**
 * 解析名称+金额行（无代码）
    const p2 = /([\u4e00-\u9fa5A-Za-z0-9·()（）]{3,})\s+([0-9,]+(?:\.\d+)?)/
 */
function parseNameAmountLine(line: string): RecognizedHolding | null {
  // 模式1：名称 + 金额 + 盈亏（支持整数或小数）
  const p1 = /([\u4e00-\u9fa5A-Za-z0-9·()（）]{3,})\s+([0-9,]+(?:\.\d+)?)\s+([-+]?[0-9,]+(?:\.\d+)?)/
  const m1 = line.match(p1)
  if (m1) {
    const amount = parseAmount(m1[2])
    if (amount >= 100) {
      return {
        code: '',
        name: cleanFundName(m1[1]),
        amount: amount,
        profit: parseAmount(normalizeSignedNumber(m1[3])),
        confidence: 0.7
      }
    }
  }

  // 模式2：名称 + 金额（无盈亏）
  const p2 = /([\u4e00-\u9fa5A-Za-z0-9·()（）]{3,})\s+([0-9,]+(?:\.\d+)?)/
  const m2 = line.match(p2)
  if (m2) {
    const amount = parseAmount(m2[2])
    if (amount >= 100) {
      return {
        code: '',
        name: cleanFundName(m2[1]),
        amount: amount,
        profit: 0,
        confidence: 0.6
      }
    }
  }

  return null
}

/**
 * 多行组合解析
 */
function parseMultiLine(lines: string[]): RecognizedHolding[] {
  const holdings: RecognizedHolding[] = []
  const codes: { code: string; idx: number }[] = []
  const amounts: { amount: number; idx: number }[] = []

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    // 提取基金代码
    const codeMatches = line.match(/\d{6}/g)
    if (codeMatches) {
      for (const c of codeMatches) {
        if (isValidFundCode(c)) codes.push({ code: c, idx: i })
      }
    }
    // 提取金额（大于100的数字，支持可选小数部分）
    const amountMatches = line.match(/[0-9,]+(?:\.\d+)?/g)
    if (amountMatches) {
      for (const m of amountMatches) {
        const amt = parseAmount(m)
        if (amt >= 100) amounts.push({ amount: amt, idx: i })
      }
    }
  }

  // 配对代码和金额
  if (codes.length > 0 && amounts.length > 0) {
    for (const { code, idx } of codes) {
      // 找最近的金额
      let bestAmt = 0
      let bestDist = Infinity
      for (const a of amounts) {
        const dist = Math.abs(a.idx - idx)
        if (dist < bestDist) {
          bestDist = dist
          bestAmt = a.amount
        }
      }

      // 尝试从代码行附近提取名称
      let name = ''
      for (let i = Math.max(0, idx - 2); i <= idx; i++) {
        const nameMatch = lines[i].match(/([\u4e00-\u9fa5A-Za-z0-9·()（）]{2,})/)
        if (nameMatch) {
          name = cleanFundName(nameMatch[1])
          break
        }
      }

      holdings.push({
        code,
        name,
        amount: bestAmt,
        profit: 0,
        confidence: 0.5
      })
    }
  }

  return holdings
}

/**
 * 验证基金代码是否合法
 */
function isValidFundCode(code: string): boolean {
  // 排除明显不是基金代码的时间格式
  if (/^20[0-9]{4}$/.test(code)) return false
  if (/^[0-2]\d{5}$/.test(code)) {
    const hh = parseInt(code.slice(0, 2))
    const mm = parseInt(code.slice(2, 4))
    const ss = parseInt(code.slice(4, 6))
    if (hh <= 23 && mm <= 59 && ss <= 59) return false
  }
  return true
}

/**
 * 清理基金名称
 */
function cleanFundName(name: string): string {
  return name
    .replace(/持有|金额|收益|份额|净值|估值|市值|盈亏|成本|持仓/g, '')
    .replace(/[¥￥%]/g, '')
    .trim()
}

/**
 * 解析金额字符串
 */
function parseAmount(amountStr: string): number {
  let cleaned = amountStr.replace(/[,¥￥\s+]/g, '')
  // 处理多个小数点
  const parts = cleaned.split('.')
  if (parts.length > 2) {
    const frac = parts.pop()
    cleaned = parts.join('') + '.' + frac
  }
  const amount = parseFloat(cleaned)
  return isNaN(amount) ? 0 : amount
}

/**
 * 规范化带符号的数字字符串（处理 OCR 常见错误）
 * 例如：+18.093.89 -> +18093.89, ++18,093.89 -> +18093.89
 */
function normalizeSignedNumber(s: string): string {
  if (!s) return ''
  let str = String(s).trim()
  // 提取首个符号
  let sign = ''
  const mSign = str.match(/^([+-]+)/)
  if (mSign) {
    sign = mSign[1].slice(-1) // take last sign if multiple
    str = str.slice(mSign[0].length)
  }
  // 移除所有非数字和小数点字符（保留 .）
  str = str.replace(/[^0-9.]/g, '')
  // 如果有多个小数点，保留最后一个作为小数点，其余作为千位连接符
  const parts = str.split('.')
  if (parts.length > 1) {
    const frac = parts.pop() || ''
    const intPart = parts.join('') || '0'
    str = intPart + (frac ? '.' + frac : '')
  }
  // 去掉前导零（但保留 0.x）
  str = str.replace(/^0+(\d)/, '$1')
  return (sign || '') + str
}

/**
 * 从图片识别并解析持仓信息
 * [WHY] 一站式接口，图片 → 持仓列表
 */
export async function recognizeHoldings(
  imageSource: File | string,
  onProgress?: OcrProgressCallback
): Promise<RecognizedHolding[]> {
  const text = await recognizeText(imageSource, onProgress)
  const holdings = await parseHoldingText(text)
  return holdings
}

/**
 * 通用解析入口，根据上下文选择在线或本地解析器
 * - 如果用户配置了百度 OCR（即 prefer 在线），优先使用在线解析器
 * - 若在线解析失败或没有百度配置，回退到本地解析器
 */
export async function parseHoldingText(text: string): Promise<RecognizedHolding[]> {
  const config = getBaiduOcrConfig()
  try {
    if (config && config.apiKey && config.secretKey) {
      // 在线优先
      const online = await parseHoldingTextOnline(text)
      if (online && online.length > 0) return online
      // 若在线解析无结果，尝试本地
    }
  } catch (e) {
    console.warn('在线解析出错，尝试本地解析', e)
  }

  try {
    const local = await parseHoldingTextLocal(text)
    return local
  } catch (e) {
    console.warn('本地解析也失败', e)
    return []
  }
}