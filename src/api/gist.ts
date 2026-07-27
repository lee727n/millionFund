// [WHAT] GitHub Gist API 工具，用于云端备份和恢复数据

const GIST_API_URL = 'https://api.github.com/gists'
const GIST_FILE_NAME = 'fund-holdings-backup.json'

/**
 * 获取 GitHub Token
 */
export function getGitHubToken(): string {
  return localStorage.getItem('github_token') || ''
}

/**
 * 保存 GitHub Token
 */
export function saveGitHubToken(token: string): void {
  localStorage.setItem('github_token', token)
}

/**
 * 删除 GitHub Token
 */
export function removeGitHubToken(): void {
  localStorage.removeItem('github_token')
}

/**
 * 检查是否已配置 GitHub Token
 */
export function hasGitHubToken(): boolean {
  return !!getGitHubToken()
}

/**
 * 创建或更新 Gist 备份
 * @param content 备份内容（JSON字符串）
 * @param token GitHub Personal Access Token
 * @returns Promise<{ success: boolean; message: string; gistId?: string }>
 */
export async function saveToGist(content: string, token: string): Promise<{ success: boolean; message: string; gistId?: string }> {
  try {
    // 先尝试查找已存在的备份 gist
    const existingGist = await findBackupGist(token)
    
    if (existingGist) {
      // 更新现有 gist
      return updateGist(existingGist.id, content, token)
    } else {
      // 创建新 gist
      return createGist(content, token)
    }
  } catch (error: any) {
    console.error('[Gist] 保存失败:', error)
    return { 
      success: false, 
      message: error?.message || '保存失败，请检查网络和Token' 
    }
  }
}

/**
 * 创建新的 Gist
 */
async function createGist(content: string, token: string): Promise<{ success: boolean; message: string; gistId?: string }> {
  const response = await fetch(GIST_API_URL, {
    method: 'POST',
    headers: {
      'Authorization': `token ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      description: '基金持仓数据备份 - AI百万实盘',
      public: false,
      files: {
        [GIST_FILE_NAME]: {
          content
        }
      }
    })
  })
  
  const data = await response.json()
  
  if (response.ok) {
    return { 
      success: true, 
      message: '云端备份成功', 
      gistId: data.id 
    }
  } else {
    return { 
      success: false, 
      message: data.message || '创建备份失败' 
    }
  }
}

/**
 * 更新现有 Gist
 */
async function updateGist(gistId: string, content: string, token: string): Promise<{ success: boolean; message: string; gistId?: string }> {
  const response = await fetch(`${GIST_API_URL}/${gistId}`, {
    method: 'PATCH',
    headers: {
      'Authorization': `token ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      files: {
        [GIST_FILE_NAME]: {
          content
        }
      }
    })
  })
  
  const data = await response.json()
  
  if (response.ok) {
    return { 
      success: true, 
      message: '云端备份更新成功', 
      gistId: data.id 
    }
  } else {
    return { 
      success: false, 
      message: data.message || '更新备份失败' 
    }
  }
}

/**
 * 查找已存在的备份 Gist
 */
async function findBackupGist(token: string): Promise<{ id: string } | null> {
  const response = await fetch(`${GIST_API_URL}?per_page=20`, {
    headers: {
      'Authorization': `token ${token}`
    }
  })
  
  if (!response.ok) {
    return null
  }
  
  const gists: Array<{ id: string; description: string; files: Record<string, any> }> = await response.json()
  
  console.log('[Gist] 查找备份 - 获取到的 gist 列表:', gists.map(g => ({ id: g.id, description: g.description, files: Object.keys(g.files) })))
  
  // 查找包含备份文件的 gist
  return gists.find(gist => {
    const fileKeys = Object.keys(gist.files)
    // 检查文件名是否匹配（支持精确匹配和模糊匹配）
    const hasBackupFile = fileKeys.some(key => 
      key === GIST_FILE_NAME || 
      key.includes('fund') || 
      key.includes('backup') ||
      key.includes('持仓')
    )
    const hasMatchingDescription = gist.description?.includes('基金持仓') || gist.description?.includes('AI百万实盘')
    return hasBackupFile || hasMatchingDescription
  }) || null
}

/**
 * 从 Gist 恢复数据
 * @param token GitHub Personal Access Token
 * @returns Promise<{ success: boolean; message: string; content?: string }>
 */
export async function restoreFromGist(token: string): Promise<{ success: boolean; message: string; content?: string }> {
  try {
    const existingGist = await findBackupGist(token)
    
    if (!existingGist) {
      console.warn('[Gist] 未找到备份 gist，尝试获取所有 gist 详细信息')
      // 如果没有找到，尝试获取第一个 gist 的详细信息
      const allGistsResponse = await fetch(`${GIST_API_URL}?per_page=20`, {
        headers: {
          'Authorization': `token ${token}`
        }
      })
      
      if (allGistsResponse.ok) {
        const allGists: Array<{ id: string }> = await allGistsResponse.json()
        if (allGists.length > 0) {
          // 尝试获取第一个 gist 的详细信息
          const firstGistResponse = await fetch(`${GIST_API_URL}/${allGists[0].id}`, {
            headers: {
              'Authorization': `token ${token}`
            }
          })
          
          if (firstGistResponse.ok) {
            const firstGistData = await firstGistResponse.json()
            console.log('[Gist] 第一个 gist 详细信息:', firstGistData)
          }
        }
      }
      return { success: false, message: '未找到云端备份数据' }
    }
    
    console.log('[Gist] 找到备份 gist:', existingGist.id)
    
    const response = await fetch(`${GIST_API_URL}/${existingGist.id}`, {
      headers: {
        'Authorization': `token ${token}`
      }
    })
    
    if (!response.ok) {
      const errorData = await response.json()
      console.error('[Gist] 获取备份数据失败:', errorData)
      return { success: false, message: '获取备份数据失败' }
    }
    
    const data = await response.json()
    console.log('[Gist] 备份数据:', { files: Object.keys(data.files) })
    
    // 首先尝试精确匹配文件名
    let file = data.files[GIST_FILE_NAME]
    
    // 如果没有找到，尝试查找任何包含 JSON 内容的文件
    if (!file) {
      const fileKeys = Object.keys(data.files)
      const jsonFileKey = fileKeys.find(key => key.endsWith('.json'))
      if (jsonFileKey) {
        file = data.files[jsonFileKey]
        console.log('[Gist] 使用备用 JSON 文件:', jsonFileKey)
      }
    }
    
    // 如果还是没有找到，使用第一个文件
    if (!file) {
      const fileKeys = Object.keys(data.files)
      if (fileKeys.length > 0) {
        file = data.files[fileKeys[0]]
        console.log('[Gist] 使用第一个文件:', fileKeys[0])
      }
    }
    
    if (!file) {
      return { success: false, message: '备份文件不存在' }
    }
    
    return { 
      success: true, 
      message: '恢复成功', 
      content: file.content 
    }
  } catch (error: any) {
    console.error('[Gist] 恢复失败:', error)
    return { 
      success: false, 
      message: error?.message || '恢复失败，请检查网络和Token' 
    }
  }
}

/**
 * 验证 GitHub Token 是否有效
 * @param token GitHub Personal Access Token
 * @returns Promise<boolean>
 */
export async function validateGitHubToken(token: string): Promise<boolean> {
  try {
    const response = await fetch('https://api.github.com/user', {
      headers: {
        'Authorization': `token ${token}`
      }
    })
    return response.ok
  } catch {
    return false
  }
}