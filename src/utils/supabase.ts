import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || ''
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY || ''

export const supabase = createClient(supabaseUrl, supabaseKey)

export const isSupabaseConfigured = () => {
  return supabaseUrl.length > 0 && supabaseKey.length > 0
}

// ==================== 共享云端认证 ====================
// 使用共享账号连接 Supabase，实现跨浏览器数据同步
// 本地用户管理系统负责各自的权限和角色，Supabase 负责数据存储
const SHARED_AUTH_EMAIL = 'app@book.app'
const SHARED_AUTH_PASSWORD = 'BookSync2026!'

// 连接 Supabase 云端（登录或注册共享账号）
export const connectToCloud = async (): Promise<{ success: boolean; error?: string }> => {
  if (!isSupabaseConfigured()) {
    return { success: false, error: 'Supabase 未配置' }
  }

  try {
    // 先尝试登录（共享账号可能已存在）
    const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
      email: SHARED_AUTH_EMAIL,
      password: SHARED_AUTH_PASSWORD
    })

    if (!signInError && signInData.user) {
      return { success: true }
    }

    // 登录失败，尝试注册（首次使用）
    if (signInError) {
      const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
        email: SHARED_AUTH_EMAIL,
        password: SHARED_AUTH_PASSWORD
      })

      if (signUpError) {
        // 注册也失败，可能是邮箱验证已开启
        console.warn('Supabase 共享账号注册失败:', signUpError.message)
        return { success: false, error: signUpError.message }
      }

      // 注册成功
      if (signUpData.user) {
        return { success: true }
      }
    }

    return { success: false, error: '连接云端失败' }
  } catch (err: any) {
    console.error('连接 Supabase 云端异常:', err)
    return { success: false, error: err.message || '连接异常' }
  }
}

// 断开 Supabase 云端连接
export const disconnectFromCloud = async () => {
  if (!isSupabaseConfigured()) return
  try {
    await supabase.auth.signOut()
  } catch {
    // ignore
  }
}

// 检查是否已连接云端
export const isCloudConnected = async (): Promise<boolean> => {
  if (!isSupabaseConfigured()) return false
  try {
    const { data } = await supabase.auth.getSession()
    return !!data.session
  } catch {
    return false
  }
}
