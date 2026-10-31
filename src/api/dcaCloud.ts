// [WHY] 定投的「计划 + 扣款」要跨设备（电脑/手机）去重，而原 gist.ts 只用于整库备份/恢复，
//       且按「description 含 '基金持仓'/'AI百万实盘'」或「文件名含 'fund'/'backup'/'持仓'」来定位备份 gist，
//       所以定投必须用「独立 gist」：文件名 dca-sync.json（不含 fund/backup/持仓）、
//       description '定投计划云端同步'（不含 基金持仓/AI百万实盘），避免和整库备份互相误覆盖/误读取。
// [WHAT] 本模块是定投云端状态（计划列表 + 按日期执行台账）的唯一读写出口：
//       - executions[date]：记录「今天谁、何时认领/完成、创建了哪些交易、扣了多少现金」，
//         供 executeDueDCAsCloud 做跨设备「只扣一次」去重（claimed 软锁 + 认领后二次校验归属）。
//       - plans：定投计划列表，作为配置真源（最后写入者胜），两端编辑互相同步。

import { getGitHubToken, hasGitHubToken } from '@/api/gist'

const GIST_API_URL = 'https://api.github.com/gists'
// [CRITICAL] 文件名/描述都不能命中整库备份的定位规则（文件名不含 fund/backup/持仓；描述不含 基金持仓/AI百万实盘）
export const DCA_GIST_FILE = 'dca-sync.json'
const DCA_GIST_DESC = '定投计划云端同步'

export interface DcaCloudExecution {
  status: 'claimed' | 'done'
  deviceId: string
  claimedAt: number
  doneAt?: number
  planIds: string[]
  /** 本机扣款时创建的 auto_invest 交易（带确定性 id），供其他设备幂等合并 */
  trades: any[]
  /** 各账户扣减的现金（负值），如 { ali: -1000 } */
  cashDelta: Record<string, number>
}

export interface DcaCloudState {
  version: number
  deviceId: string
  updatedAt: number
  /** 定投计划列表（配置 + 执行标记的真源） */
  plans: any[]
  /** 按日期 YYYY-MM-DD 的执行台账 */
  executions: Record<string, DcaCloudExecution>
}

const DEVICE_ID_KEY = 'dca_device_id'

/** 每台设备一个稳定 ID（存在 localStorage），写进执行台账用于归属判定 */
export function getDeviceId(): string {
  try {
    let id = localStorage.getItem(DEVICE_ID_KEY)
    if (!id) {
      const uuid = (crypto as any)?.randomUUID?.()
      id = uuid || ('dev_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10))
      localStorage.setItem(DEVICE_ID_KEY, id)
    }
    return id
  } catch {
    return 'dev_unknown'
  }
}

// [WHAT] 轻量缓存：避免每次 60s 刷新都打 GitHub（仅当天有过期未执行时才会真正读；其余走缓存/短路）
let cache: { state: DcaCloudState | null; at: number } | null = null
function cacheFresh(ttl: number): boolean {
  return cache !== null && Date.now() - cache.at < ttl
}

// [WHAT] 三态：{id}=找到；'notfound'=确实不存在；'error'=读取失败（网络/鉴权）。
//        [WHY] 必须区分「不存在」与「读取失败」：引导创建时只有确认「不存在」才新建，
//              读取失败不应误建重复 gist，也不应覆盖已有台账。
type DcaGistFind = { id: string } | 'notfound' | 'error'

async function findDcaGist(token: string): Promise<DcaGistFind> {
  try {
    const res = await fetch(`${GIST_API_URL}?per_page=100`, {
      headers: { Authorization: `token ${token}` }
    })
    if (!res.ok) return 'error'
    const list: Array<{ id: string; description?: string; files: Record<string, any> }> = await res.json()
    const hit = list.find(g =>
      Object.keys(g.files || {}).includes(DCA_GIST_FILE) ||
      g.description === DCA_GIST_DESC
    )
    return hit ? { id: hit.id } : 'notfound'
  } catch {
    return 'error'
  }
}

/**
 * 读取云端定投状态。
 * @param ttl 缓存有效期（ms），传 0 强制实时读取（认领后校验归属时用）。
 */
export async function readDcaCloudState(ttl = 30000): Promise<DcaCloudState | null> {
  if (!hasGitHubToken()) return null
  if (ttl > 0 && cacheFresh(ttl)) return cache?.state ?? null
  const token = getGitHubToken()
  try {
    const gist = await findDcaGist(token)
    // [FIX] 区分「不存在」与「读取失败」：两者都视为「无云端状态」，但失败不写缓存（下次重试）
    if (gist === 'error' || gist === 'notfound' || !gist) {
      cache = { state: null, at: Date.now() }
      return null
    }
    const res = await fetch(`${GIST_API_URL}/${gist.id}`, {
      headers: { Authorization: `token ${token}` }
    })
    if (!res.ok) return null
    const data = await res.json()
    const file = data.files?.[DCA_GIST_FILE]
    if (!file || !file.content) {
      cache = { state: null, at: Date.now() }
      return null
    }
    const state = JSON.parse(file.content) as DcaCloudState
    cache = { state, at: Date.now() }
    return state
  } catch {
    return null
  }
}

/** 写入云端定投状态（存在则 PATCH，不存在则新建）。返回是否成功。 */
/**
 * [WHAT] readDcaCloudState 的增强版：区分「确实不存在(notfound)」与「读取失败(error)」。
 * [WHY] 核心执行逻辑需要区分两者：notfound 才走引导创建；error（网络抖 / GitHub 429 限流 / 鉴权瞬时失败）
 *       应视为「云端暂时不可达」，不能误判为「本地模式」——否则一次 GitHub 429 就会让徽标永久变「本地」。
 */
export async function readDcaCloudStateEx(ttl = 30000): Promise<{ state: DcaCloudState | null; notfound: boolean; error: boolean }> {
  if (!hasGitHubToken()) return { state: null, notfound: false, error: false }
  if (ttl > 0 && cacheFresh(ttl)) return { state: cache?.state ?? null, notfound: false, error: false }
  const token = getGitHubToken()
  try {
    const gist = await findDcaGist(token)
    if (gist === 'error') return { state: null, notfound: false, error: true }
    if (gist === 'notfound' || !gist) return { state: null, notfound: true, error: false }
    const res = await fetch(`${GIST_API_URL}/${gist.id}`, {
      headers: { Authorization: `token ${token}` }
    })
    if (!res.ok) return { state: null, notfound: false, error: true }
    const data = await res.json()
    const file = data.files?.[DCA_GIST_FILE]
    if (!file || !file.content) {
      // 文件存在但内容为空：视为空状态（不是错误、也不是不存在）
      cache = { state: null, at: Date.now() }
      return { state: null, notfound: true, error: false }
    }
    const state = JSON.parse(file.content) as DcaCloudState
    cache = { state, at: Date.now() }
    return { state, notfound: false, error: false }
  } catch {
    return { state: null, notfound: false, error: true }
  }
}

export async function writeDcaCloudState(state: DcaCloudState): Promise<boolean> {
  if (!hasGitHubToken()) return false
  const token = getGitHubToken()
  const content = JSON.stringify(state, null, 2)
  try {
    const gist = await findDcaGist(token)
    if (gist === 'error') return false
    if (gist && gist !== 'notfound') {
      const res = await fetch(`${GIST_API_URL}/${gist.id}`, {
        method: 'PATCH',
        headers: { Authorization: `token ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ files: { [DCA_GIST_FILE]: { content } } })
      })
      if (!res.ok) return false
    } else {
      const res = await fetch(GIST_API_URL, {
        method: 'POST',
        headers: { Authorization: `token ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          description: DCA_GIST_DESC,
          public: false,
          files: { [DCA_GIST_FILE]: { content } }
        })
      })
      if (!res.ok) return false
    }
    cache = { state, at: Date.now() }
    return true
  } catch {
    return false
  }
}

/**
 * [WHAT] 引导创建云端定投状态 gist（仅在确认「不存在」时）。
 * [WHY] executeDueDCAsCloud 在「有 Token 但云端状态为空」时原本会卡在「本地」模式（dca.ts 的 !cloud 分支直接走本地执行，
 *       而 writeDcaCloudState 只在 cloud 非空的分支被调用）→ 新 Token / 首次使用的设备永远进不了云端协调，跨设备「只扣一次」去重永不生效。
 * [GUARD] 只有 findDcaGist 明确返回 'notfound' 才创建；'error'（网络/鉴权）或已存在一律不重复创建，避免误建重复 gist / 覆盖已有台账。
 */
export async function bootstrapDcaCloudState(plans: any[]): Promise<boolean> {
  if (!hasGitHubToken()) return false
  const gist = await findDcaGist(getGitHubToken())
  if (gist === 'error' || (gist && gist !== 'notfound')) return false
  const state: DcaCloudState = {
    version: 1,
    deviceId: getDeviceId(),
    updatedAt: Date.now(),
    plans,
    executions: {}
  }
  return writeDcaCloudState(state)
}
