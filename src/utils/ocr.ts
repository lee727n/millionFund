// [WHY] OCR 识别服务 - 用于从截图中识别基金持仓信息
// [WHAT] 使用 Tesseract.js 进行本地文字识别，无需外部 API
// [DEPS] 依赖 tesseract.js 库

import Tesseract, { type Worker } from 'tesseract.js'
import { logger } from './logger'

let sharedWorker: Worker | null = null
let workerInitPromise: Promise<Worker> | null = null
const WORKER_LANG = 'chi_sim+eng'

async function getSharedWorker(): Promise<Worker> {
  if (sharedWorker) return sharedWorker
  if (workerInitPromise) return workerInitPromise

  workerInitPromise = (async () => {
    try {
      const worker = await Tesseract.createWorker(WORKER_LANG, 1, {
        logger: () => {}
      })
      sharedWorker = worker
      return worker
    } catch (err) {
      workerInitPromise = null
      throw err
    }
  })()

  return workerInitPromise
}

export async function terminateOcrWorker() {
  if (sharedWorker) {
    try {
      await sharedWorker.terminate()
    } catch (e) {
      // ignore
    }
    sharedWorker = null
    workerInitPromise = null
  }
}

/**
 * 检测当前环境是否支持 Tesseract.js 运行
 * [WHY] 某些 Android WebView 无法创建 WebWorker / 加载 WASM
 * [HOW] 尝试创建 Worker 来验证环境支持
 * @returns true 表示可用，false 表示不支持
 */
export async function isTesseractSupported(): Promise<boolean> {
  try {
    // [CHECK] 检查 Web Worker 支持
    if (typeof Worker === 'undefined') return false

    // [CHECK] 尝试创建一个 Tesseract worker 来验证
    // [NOTE] 不加载语言包，仅验证环境
    const worker = new Worker(
      new URL('tesseract.js/dist/worker.min.js', import.meta.url),
      { type: 'module' }
    )

    // [CLEANUP] 立即终止 worker，只做检测
    worker.terminate()

    return true
  } catch {
    return false
  }
}

/**
 * OCR 图像预处理管道
 * [WHY] 原始截图常有噪声、低对比度、彩色背景，直接 OCR 识别率低
 * [WHAT] 灰度化 → 自适应二值化 → 去噪，返回增强后的图像（Base64）
 * @param imageSource 原始图片（File 或 Base64 URL）
 * @returns 预处理后的图像（Base64 PNG）
 */
async function preprocessImageForOcr(imageSource: File | string): Promise<string> {
  // [WHAT] Step 1: 将输入统一为 HTMLImageElement
  const img = await loadImage(imageSource)

  // [WHAT] Step 2: 创建 Canvas 并绘制图像
  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')!
  canvas.width = img.width
  canvas.height = img.height
  ctx.drawImage(img, 0, 0)

  // [WHAT] Step 3: 读取像素数据
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
  const data = imageData.data

  // [WHAT] Step 4: 灰度化（加权平均法，符合人眼感知）
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i]!
    const g = data[i + 1]!
    const b = data[i + 2]!
    // 加权灰度：0.299*R + 0.587*G + 0.114*B
    const gray = Math.round(0.299 * r + 0.587 * g + 0.114 * b)
    data[i] = gray
    data[i + 1] = gray
    data[i + 2] = gray
    // Alpha 通道保持不变
  }

  // [WHAT] Step 5: 自适应二值化（局部阈值，处理光照不均）
  // 使用 5x5 窗口的局部平均值作为阈值
  const thresholdMap = adaptiveThreshold(data, canvas.width, canvas.height)
  for (let i = 0; i < data.length; i += 4) {
    const gray = data[i]!
    const threshold = thresholdMap[i / 4]!
    // 灰度 < 阈值 → 黑色（文字），否则白色（背景）
    const value = gray < threshold ? 0 : 255
    data[i] = value
    data[i + 1] = value
    data[i + 2] = value
  }

  // [WHAT] Step 6: 去噪（3x3 中值滤波，去除椒盐噪声）
  const denoised = medianFilter(data, canvas.width, canvas.height)
  imageData.data.set(denoised)
  
  // [WHAT] Step 7: 将处理后的图像写回 Canvas
  ctx.putImageData(imageData, 0, 0)

  // [WHAT] Step 8: 返回 Base64（PNG 格式，无损）
  return canvas.toDataURL('image/png')
}

/**
 * 加载图片为 HTMLImageElement
 */
function loadImage(imageSource: File | string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('图片加载失败'))
    
    if (imageSource instanceof File) {
      const reader = new FileReader()
      reader.onload = () => { img.src = reader.result as string }
      reader.onerror = () => reject(new Error('文件读取失败'))
      reader.readAsDataURL(imageSource)
    } else {
      img.src = imageSource
    }
  })
}

/**
 * 自适应阈值计算
 * [WHY] 全局阈值对光照不均的截图效果差，自适应阈值能更好地处理
 * [HOW] 对每个像素，计算其周围 5x5 窗口的平均灰度，乘以系数 k 作为阈值
 */
function adaptiveThreshold(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  blockSize: number = 5,
  k: number = 0.85
): number[] {
  const grayData: number[] = []
  for (let i = 0; i < data.length; i += 4) {
    grayData.push(data[i]!)
  }

  const thresholdMap: number[] = new Array(grayData.length)
  const halfBlock = Math.floor(blockSize / 2)

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = y * width + x
      
      // 计算局部窗口的平均值
      let sum = 0
      let count = 0
      for (let dy = -halfBlock; dy <= halfBlock; dy++) {
        for (let dx = -halfBlock; dx <= halfBlock; dx++) {
          const nx = x + dx
          const ny = y + dy
          if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
            sum += grayData[ny * width + nx]!
            count++
          }
        }
      }
      
      const avg = sum / count
      thresholdMap[idx] = avg * k  // 乘以系数，调整阈值灵敏度
    }
  }

  return thresholdMap
}

/**
 * 3x3 中值滤波去噪
 * [WHY] 椒盐噪声会干扰 OCR 识别，中值滤波能有效去除
 */
function medianFilter(
  data: Uint8ClampedArray,
  width: number,
  height: number
): Uint8ClampedArray {
  const result = new Uint8ClampedArray(data.length)
  const halfKernel = 1  // 3x3 核

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4
      
      // 收集 3x3 窗口内的灰度值
      const values: number[] = []
      for (let dy = -halfKernel; dy <= halfKernel; dy++) {
        for (let dx = -halfKernel; dx <= halfKernel; dx++) {
          const nx = x + dx
          const ny = y + dy
          if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
            const nIdx = (ny * width + nx) * 4
            values.push(data[nIdx]!)
          }
        }
      }
      
      // 取中值
      values.sort((a, b) => a - b)
      const median = values[Math.floor(values.length / 2)]!
      
      result[idx] = median
      result[idx + 1] = median
      result[idx + 2] = median
      result[idx + 3] = data[idx + 3]!  // Alpha 不变
    }
  }

  return result
}

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
  /** 持有份额（可选） */
  shares?: number
  /** 识别到的买入日期（YYYY-MM-DD，可选） */
  buyDate?: string
  /** 识别置信度（0-1） */
  confidence: number
}

/**
 * OCR 识别进度回调
 */
export type OcrProgressCallback = (progress: number, status: string) => void

/**
 * 检测图片模糊度（拉普拉斯方差）
 * [WHY] 模糊的截图 OCR 识别率低，提前检测并提示用户
 * [RETURN] 方差值越小越模糊，一般 < 100 认为较模糊
 */
export function detectImageBlur(imageSource: File | string): Promise<number> {
  return new Promise(async (resolve, reject) => {
    try {
      const img = await loadImage(imageSource)
      const canvas = document.createElement('canvas')
      const ctx = canvas.getContext('2d')!
      
      const maxDim = 400
      const scale = Math.min(maxDim / img.width, maxDim / img.height, 1)
      canvas.width = Math.floor(img.width * scale)
      canvas.height = Math.floor(img.height * scale)
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
      
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
      const data = imageData.data
      const gray: number[] = []
      
      for (let i = 0; i < data.length; i += 4) {
        gray.push(0.299 * data[i]! + 0.587 * data[i + 1]! + 0.114 * data[i + 2]!)
      }
      
      const w = canvas.width
      const h = canvas.height
      let sum = 0
      let count = 0
      
      for (let y = 1; y < h - 1; y++) {
        for (let x = 1; x < w - 1; x++) {
          const idx = y * w + x
          const laplacian = (
            4 * gray[idx]! -
            gray[idx - 1]! -
            gray[idx + 1]! -
            gray[idx - w]! -
            gray[idx + w]!
          )
          sum += laplacian * laplacian
          count++
        }
      }
      
      const variance = count > 0 ? sum / count : 0
      resolve(variance)
    } catch (e) {
      reject(e)
    }
  })
}

/**
 * 从图片中识别文字
 * [WHY] 使用 Tesseract.js 进行本地 OCR，支持中英文混合识别
 * [WHAT] 返回识别出的原始文字，支持 PSM 模式自动重试
 * @param imageSource 图片来源（File 对象、URL 或 Base64）
 * @param onProgress 进度回调
 */
export async function recognizeText(
  imageSource: File | string,
  onProgress?: OcrProgressCallback
): Promise<string> {
  if (onProgress) addProgressListener(onProgress)

  const makeLogger = () => (m: any) => {
    try {
      const progress = typeof m?.progress === 'number' ? Math.round(m.progress * 100) : 0
      const status = m?.status || ''
      for (const cb of progressListeners) {
        try { cb(progress, status) } catch (e) { /* ignore listener error */ }
      }
    } catch (e) {
      // ignore
    }
  }

  const psmModes = [6, 3, 4]

  try {
    const processedImage = await preprocessImageForOcr(imageSource)
    const worker = await getSharedWorker()

    let lastResult: string = ''
    let lastConfidence = 0

    for (let i = 0; i < psmModes.length; i++) {
      const psm = psmModes[i]!
      try {
        await worker.setParameters({
          tessedit_pageseg_mode: psm,
        })

        const timeoutPromise = new Promise((_, reject) =>
          setTimeout(() => reject(new Error('OCR 识别超时（30秒）')), 30000)
        )

        const recognizePromise = worker.recognize(processedImage)
        const result = await Promise.race([recognizePromise, timeoutPromise]) as any

        const text = result.data.text
        const confidence = result.data.confidence || 0

        if (confidence > lastConfidence) {
          lastConfidence = confidence
          lastResult = text
          ;(globalThis as any).__lastOcrData = result.data
        }

        if (confidence >= 70) {
          break
        }
      } catch (err: any) {
        if (i === psmModes.length - 1) throw err
        logger.warn(`OCR PSM ${psm} 失败，尝试下一个模式`, err)
      }
    }

    ;(globalThis as any).__lastOcrData = null
    return lastResult
  } catch (err: any) {
    logger.error('OCR 识别失败', err)
    
    let userMessage = 'OCR 识别失败'
    const errMsg = (err?.message || '').toLowerCase()
    
    if (errMsg.includes('timeout') || errMsg.includes('超时')) {
      userMessage = '识别超时，请确保图片清晰且不要过大'
    } else if (errMsg.includes('worker') || errMsg.includes('worker')) {
      userMessage = '设备不支持自动识别，请手动输入'
    } else if (errMsg.includes('load') || errMsg.includes('加载')) {
      userMessage = '识别引擎加载失败，请检查网络连接'
    }
    
    throw new Error(userMessage + '：' + (err?.message || '未知错误'))
  } finally {
    if (onProgress) removeProgressListener(onProgress)
  }
}

// ========== 共享 Worker 实现 ==========
const progressListeners: OcrProgressCallback[] = []

function addProgressListener(cb: OcrProgressCallback) {
  progressListeners.push(cb)
}

function removeProgressListener(cb: OcrProgressCallback) {
  const idx = progressListeners.indexOf(cb)
  if (idx !== -1) progressListeners.splice(idx, 1)
}

/**
 * 从识别文字中解析持仓信息
 * [WHY] 不同平台的截图格式不同，需要灵活解析
 * [WHAT] 尝试多种模式匹配，提取基金代码、名称、金额等信息
 */
export function parseHoldingText(text: string): RecognizedHolding[] {
  const holdings: RecognizedHolding[] = []
  // 预处理：OCR 常把中文字符间插入空格，先把相邻中文字符间的空格去掉
  const normalizedText = collapseChineseSpacing(text)
  const lines = normalizedText.split('\n').map(line => line.trim()).filter(Boolean)
  
  // [WHAT] 预处理：合并相邻行（有些平台名称和代码在不同行）
  let processedLines = preprocessLines(lines)
  // 优先合并末行为份额类型（单独的 C / A）和名称带括号包含代码的常见格式（如支付宝截图）
  processedLines = mergeTrailingClassLine(processedLines)
  processedLines = mergeNameWithParen(processedLines)
  // 额外尝试解析截图上的日期，作为买入日期候选
  const detectedDate = findDate(lines)
  
  // [WHAT] 解析每一行，尝试提取持仓信息
  for (const line of processedLines) {
    const holding = parseSingleLine(line)
    if (holding) {
      if (detectedDate) holding.buyDate = detectedDate
      holdings.push(holding)
    }
  }
  
  // [WHAT] 如果单行解析失败，尝试多行组合解析
  if (holdings.length === 0) {
    const multiLineHoldings = parseMultiLine(lines)
    // 如果能从多行解析出日期，附加到每条持仓
    const detectedDate2 = detectedDate || findDate(processedLines)
    holdings.push(...multiLineHoldings)
    if (detectedDate2) {
      for (const h of multiLineHoldings) h.buyDate = detectedDate2
    }
  }

  // 回退策略：若仍无结果，尝试基于 OCR 单词块做进一步提取（提高支付宝截图识别率）
  if (holdings.length === 0) {
    const fallback = extractFromOcrWords()
    if (fallback.length > 0) {
      const dt = detectedDate || findDate(processedLines)
      for (const h of fallback) {
        if (dt) h.buyDate = dt
        holdings.push(h)
      }
    }
  }

  // 最终宽松回退：尝试直接从原始文本中抓取裸数字（如没有小数点或货币符号的整数），并把前面的中文片段当作名称候选
  if (holdings.length === 0) {
    const relaxed = extractNumbersOnlyFallback(text)
    if (relaxed.length > 0) {
      const dt = detectedDate || findDate(processedLines)
      for (const h of relaxed) {
        if (dt) h.buyDate = dt
        holdings.push(h)
      }
    }
  }
  
  return holdings
}

/**
 * 宽松回退：从纯文本中提取可能的金额（整数或带小数），并尝试从前文找中文名称片段
 */
function extractNumbersOnlyFallback(text: string): RecognizedHolding[] {
  const results: RecognizedHolding[] = []
  if (!text) return results

  // 匹配金额：带或不带小数与千分位逗号
  const numRe = /[¥￥]?\s*(\d{1,3}(?:,?\d{3})*(?:\.\d+)?|\d+)(?!\d)/g
  let m: RegExpExecArray | null
  while ((m = numRe.exec(text)) !== null) {
    const raw = m[1]!
    const amt = parseAmount(raw)
    if (amt <= 0) continue
    // 忽略过小的数值（小于100元的很可能不是持仓金额）
    if (amt < 100) continue

    // 尝试取数字前面最多 30 字符作为名称候选，并从中抓取连续中文段
    const start = Math.max(0, m.index - 30)
    const context = text.slice(start, m.index)
    const nameMatch = context.match(/([\u4e00-\u9fa5·]{2,12})\s*$/)
    const name = nameMatch ? cleanFundName(nameMatch[1]!) : ''

    // 记录位置（用于后续与 code 匹配），稍后会删除这个临时字段
    ;(results as any).push({ code: '', name, amount: amt, confidence: 0.25, __pos: m.index })
  }

  // 如果文本中存在 6 位数字，尝试把它们与最近的金额配对，填充 code 字段
  associateCodesFromText(results as any as RecognizedHolding[], text)

  // 清理临时字段
  for (const r of results as any) delete (r as any).__pos

  return results
}

/**
 * 在原始 OCR 文本中寻找 6 位基金代码，并把它们分配给最近的金额条目
 */
function associateCodesFromText(results: RecognizedHolding[], text: string) {
  if (!text) return
  const codeRe = /\b(\d{6})\b/g
  const codes: {code: string, idx: number}[] = []
  let m: RegExpExecArray | null
  while ((m = codeRe.exec(text)) !== null) {
    const c = m[1]!
    const idx = m.index
    if (isValidFundCode(c)) codes.push({ code: c, idx })
  }

  if (codes.length === 0 || results.length === 0) return

  // 为每个 code 找到最近的金额条目
  for (const { code, idx } of codes) {
    let best: RecognizedHolding | null = null
    let bestDist = Infinity
    for (const r of results as any) {
      const pos = (r as any).__pos || 0
      const dist = Math.abs(pos - idx)
      if (dist < bestDist) { bestDist = dist; best = r }
    }
    if (best && best.code === '') {
      best.code = code
      // 如果 name 为空，尝试从 code 左侧提取中文短串作为名称
      if (!best.name) {
        const leftStart = Math.max(0, idx - 30)
        const leftContext = text.slice(leftStart, idx)
        const nameMatch = leftContext.match(/([\u4e00-\u9fa5·]{2,12})\s*$/)
        if (nameMatch) best.name = cleanFundName(nameMatch[1]!)
      }
    }
  }
}

/**
 * 在文本行中查找日期，返回 YYYY-MM-DD 格式
 */
function findDate(lines: string[]): string | null {
  for (const line of lines) {
    // 支持 2024-01-02、2024/01/02、2024年01月02日
    const m1 = line.match(/(\d{4})[\-/年](\d{1,2})[\-/月](\d{1,2})/)
    if (m1) {
      const y = m1[1]!
      const mo = String(m1[2]!).padStart(2, '0')
      const d = String(m1[3]!).padStart(2, '0')
      return `${y}-${mo}-${d}`
    }
    // 支持 01-02 形式（无年），使用当前年份
    const m2 = line.match(/^(?:\D*)(\d{1,2})[\-/](\d{1,2})(?:\D*)$/)
    if (m2) {
      const now = new Date()
      const y = String(now.getFullYear())
      const mo = String(m2[1]!).padStart(2, '0')
      const d = String(m2[2]!).padStart(2, '0')
      return `${y}-${mo}-${d}`
    }
  }
  return null
}

/**
 * 预处理文本行
 * [WHY] 有些 OCR 结果会把基金名称和代码分到不同行
 */
function preprocessLines(lines: string[]): string[] {
  const result: string[] = []
  let buffer = ''
  
  for (const line of lines) {
    // [WHAT] 如果当前行只有基金代码，与前一行合并
    if (/^\d{6}$/.test(line) && buffer) {
      result.push(`${buffer} ${line}`)
      buffer = ''
    } else if (/^[A-Za-z\u4e00-\u9fa5]+[A-Za-z0-9\u4e00-\u9fa5]*$/.test(line) && !containsNumber(line)) {
      // [WHAT] 纯文字行可能是基金名称，暂存
      buffer = line
    } else {
      if (buffer) {
        result.push(`${buffer} ${line}`)
        buffer = ''
      } else {
        result.push(line)
      }
    }
  }
  
  if (buffer) {
    result.push(buffer)
  }
  
  return result
}

// 尝试合并诸如 名称(000001) 或 名称（000001） 这类行（支付宝常见）
function mergeNameWithParen(lines: string[]): string[] {
  return lines.map(line => {
    const m = line.match(/([\u4e00-\u9fa5A-Za-z0-9·\s]+)[（(](\d{6})[)）]/)
    if (m) return `${m[1]!.trim()} ${m[2]!}`
    return line
  })
}

// 合并单独一行的份额类型（如单独的 "C" 或 "C类"）到上一行，支付宝截图常见
function mergeTrailingClassLine(lines: string[]): string[] {
  const res: string[] = []
  for (const line of lines) {
    const trimmed = line.trim()
    if (res.length > 0 && (/^[AC]$/.test(trimmed) || /^[AC]类$/.test(trimmed))) {
      res[res.length - 1] = `${res[res.length - 1]} ${trimmed}`
    } else {
      res.push(line)
    }
  }
  return res
}

/**
 * 检查字符串是否包含数字
 */
function containsNumber(str: string): boolean {
  return /\d/.test(str)
}

/**
 * 解析单行文本
 * [WHY] 单行可能包含完整的持仓信息
 */
function parseSingleLine(line: string): RecognizedHolding | null {
  // [WHAT] 模式1：基金代码（6位数字）+ 基金名称 + 金额
  // 例如：000001 华夏成长 10,000.00
  const pattern1 = /(\d{6})\s*([A-Za-z\u4e00-\u9fa5][A-Za-z0-9\u4e00-\u9fa5]*)\s+([\d,]+\.?\d*)/
  const match1 = line.match(pattern1)
  if (match1) {
    return {
      code: match1[1]!,
      name: cleanFundName(match1[2]!),
      amount: parseAmount(match1[3]!),
      confidence: 0.9
    }
  }
  
  // [WHAT] 模式2：基金名称 + 基金代码 + 金额
  // 例如：华夏成长 000001 10,000.00
  const pattern2 = /([A-Za-z\u4e00-\u9fa5][A-Za-z0-9\u4e00-\u9fa5]*)\s*(\d{6})\s+([\d,]+\.?\d*)/
  const match2 = line.match(pattern2)
  if (match2) {
    return {
      code: match2[2]!,
      name: cleanFundName(match2[1]!),
      amount: parseAmount(match2[3]!),
      confidence: 0.9
    }
  }
  
  // [WHAT] 模式3：只有基金代码和金额
  // 例如：000001 10,000.00
  const pattern3 = /(\d{6})\s+([\d,]+\.?\d*)/
  const match3 = line.match(pattern3)
  if (match3) {
    return {
      code: match3[1]!,
      name: '', // 名称后续通过 API 获取
      amount: parseAmount(match3[2]!),
      confidence: 0.7
    }
  }
  
  // [WHAT] 模式4：支付宝/天天基金格式 - 名称在前，金额较大
  // 例如：华夏成长混合A 持有金额 ¥10,000.00
  const pattern4 = /([A-Za-z\u4e00-\u9fa5][A-Za-z0-9\u4e00-\u9fa5]{2,})\s*.*?[¥￥]?\s*([\d,]+\.?\d{2})/
  const match4 = line.match(pattern4)
  if (match4 && parseAmount(match4[2]!) >= 100) { // 金额至少100元
    // [WHAT] 尝试从名称中提取基金代码
    const codeMatch = line.match(/\d{6}/)
    return {
      code: codeMatch ? codeMatch[0] : '',
      name: cleanFundName(match4[1]!),
      amount: parseAmount(match4[2]!),
      confidence: 0.6
    }
  }
  
  return null
}

/**
 * 多行组合解析
 * [WHY] 有些截图格式中，基金信息分散在多行
 */
function parseMultiLine(lines: string[]): RecognizedHolding[] {
  const holdings: RecognizedHolding[] = []
  
  // [WHAT] 查找所有基金代码
  const codePattern = /\d{6}/g
  const amountPattern = /[\d,]+\.\d{2}/g
  
  const codes: string[] = []
  const amounts: number[] = []
  
  for (const line of lines) {
    // [WHAT] 提取基金代码
    const codeMatches = line.match(codePattern)
    if (codeMatches) {
      codes.push(...codeMatches.filter(c => isValidFundCode(c)))
    }
    
    // [WHAT] 提取金额（大于100的数字）
    const amountMatches = line.match(amountPattern)
    if (amountMatches) {
      for (const m of amountMatches) {
        const amount = parseAmount(m)
        if (amount >= 100) {
          amounts.push(amount)
        }
      }
    }
  }
  
  // [WHAT] 如果代码和金额数量匹配，尝试配对
  if (codes.length > 0 && codes.length === amounts.length) {
    for (let i = 0; i < codes.length; i++) {
      holdings.push({
        code: codes[i]!,
        name: '',
        amount: amounts[i]!,
        confidence: 0.5
      })
    }
  } else if (codes.length > 0) {
    // [WHAT] 只有代码没有金额，也返回（用户可以手动填写金额）
    for (const code of codes) {
      holdings.push({
        code,
        name: '',
        amount: 0,
        confidence: 0.3
      })
    }
  }
  
  return holdings
}

/**
 * 基于 Tesseract 返回的单词块（words）进行回退提取
 * 该方法会在全局变量 __lastOcrData 中查找单词信息，匹配 6 位基金代码和金额，
 * 并将相邻文本作为名称候选（对支付宝截图效果较好）。
 */
function extractFromOcrWords(): RecognizedHolding[] {
  const data = (globalThis as any).__lastOcrData
  if (!data || !data.words || !Array.isArray(data.words)) return []

  const words: any[] = data.words
  const codeIdxs: number[] = []
  const amountIdxs: number[] = []

  // 标记包含 6 位数字和金额的单词索引
  for (let i = 0; i < words.length; i++) {
    const w = words[i].text.trim()
    if (/^\d{6}$/.test(w) && isValidFundCode(w)) codeIdxs.push(i)
    if (/^[¥￥]?\d{1,3}(,?\d{3})*(\.\d{2})$/.test(w) || /^[¥￥]?\d+\.?\d*$/.test(w)) {
      // 认为可能是金额（保守判断）
      amountIdxs.push(i)
    }
  }

  const results: RecognizedHolding[] = []
  // 尝试将每个 code 与最近的 amount 配对
  for (const ci of codeIdxs) {
    // 找最近的 amount 索引（按绝对距离）
    let nearest: number | null = null
    let bestDist = Infinity
    for (const ai of amountIdxs) {
      const dist = Math.abs(ai - ci)
      if (dist < bestDist) { bestDist = dist; nearest = ai }
    }
    const code = words[ci].text.trim()
    let amount = 0
    if (nearest !== null) {
      amount = parseAmount(words[nearest].text)
    }

    // 构造名称：取 code 左侧最多 3 个词拼接作为名称候选
    const nameParts: string[] = []
    for (let k = Math.max(0, ci - 3); k < ci; k++) {
      const t = words[k]?.text?.trim()
      if (t && !/^\d+$/.test(t)) nameParts.push(t)
    }
    const name = cleanFundName(nameParts.join(' '))

    results.push({ code, name, amount, confidence: 0.5 })
  }

  return results
}

/**
 * 验证基金代码是否合法
 * [WHY] 过滤掉明显不是基金代码的6位数字（如日期、时间等）
 */
function isValidFundCode(code: string): boolean {
  // [EDGE] 排除常见的非基金代码模式
  // 日期格式：202401、202312等
  if (/^20[0-9]{4}$/.test(code)) return false
  // 时间格式：开头为1-2的6位数可能是时间
  if (/^[0-2]\d{5}$/.test(code) && parseInt(code.slice(0, 2)) <= 24) {
    // 进一步检查是否像时间 HHMMSS
    const hh = parseInt(code.slice(0, 2))
    const mm = parseInt(code.slice(2, 4))
    const ss = parseInt(code.slice(4, 6))
    if (hh <= 23 && mm <= 59 && ss <= 59) return false
  }
  return true
}

/**
 * 清理基金名称
 * [WHY] 去除名称中的噪音字符
 */
function cleanFundName(name: string): string {
  return name
    .replace(/持有|金额|收益|份额|净值|估值/g, '')
    .replace(/[¥￥%]/g, '')
    .trim()
}

/**
 * 解析金额字符串
 * [WHY] 处理各种金额格式（带逗号、带货币符号等）
 */
function parseAmount(amountStr: string): number {
  let cleaned = amountStr.replace(/[,¥￥\s]/g, '')
  // 处理 OCR 可能产生的多个小数点（如 5.593.25），保留最后一个作为小数点
  const parts = cleaned.split('.')
  if (parts.length > 2) {
    const frac = parts.pop()
    cleaned = parts.join('') + '.' + frac
  }
  const amount = parseFloat(cleaned)
  return isNaN(amount) ? 0 : amount
}

/**
 * Collapse spurious spaces between consecutive Chinese characters introduced by OCR.
 */
function collapseChineseSpacing(text: string): string {
  if (!text) return text
  // 去掉中文字符之间的空格，可能需要多次应用以处理连续空格
  let prev = text
  let next = prev.replace(/([\u4e00-\u9fa5])\s+([\u4e00-\u9fa5])/g, '$1$2')
  while (next !== prev) {
    prev = next
    next = prev.replace(/([\u4e00-\u9fa5])\s+([\u4e00-\u9fa5])/g, '$1$2')
  }
  return next
}

/**
 * 从图片识别并解析持仓信息
 * [WHY] 一站式接口，图片 -> 持仓列表
 */
export async function recognizeHoldings(
  imageSource: File | string,
  onProgress?: OcrProgressCallback
): Promise<RecognizedHolding[]> {
  // [WHAT] 第一步：OCR 识别文字
  const text = await recognizeText(imageSource, onProgress)
  
  // [WHAT] 第二步：解析持仓信息
  const holdings = parseHoldingText(text)
  
  return holdings
}
