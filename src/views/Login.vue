<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { useRouter } from 'vue-router'
import { setUserInfo, setRole, setCampus, setCampusName, getUserList, setUserList, setRoleList, setRolePermissions, getRolePermissions, getRoleList } from '../utils/storage'
import { connectToCloud, isSupabaseConfigured } from '../utils/supabase'
import { syncLocalToCloud, fetchUsers, isReallyOnline } from '../services/dataService'

const router = useRouter()
const loading = ref(false)
const cloudSyncing = ref(false) // 正在连接云端
const cloudStatus = ref<'idle' | 'success' | 'fail' | 'disabled'>('idle') // 云端状态
const userName = ref('')
const password = ref('')
const isInitMode = ref(false) // 首次使用模式：设置管理员账号
const initPassword = ref('')
const initConfirmPassword = ref('')
const showUserList = ref(false) // 显示已有用户名列表
const existingUserNames = ref<string[]>([])
const rememberPwd = ref(false) // 记住密码

// 记住密码的 localStorage key
const REMEMBER_KEY = 'login_remember'

// 简单编码（防止明文存储）
const encodePwd = (pwd: string) => btoa(pwd)
const decodePwd = (encoded: string) => {
  try { return atob(encoded) } catch { return '' }
}

// 保存记住的密码
const saveRemember = () => {
  if (rememberPwd.value && userName.value && password.value) {
    localStorage.setItem(REMEMBER_KEY, JSON.stringify({
      userName: userName.value,
      password: encodePwd(password.value),
      remember: true
    }))
  } else {
    localStorage.removeItem(REMEMBER_KEY)
  }
}

// 加载记住的密码
const loadRemember = () => {
  try {
    const data = localStorage.getItem(REMEMBER_KEY)
    if (data) {
      const parsed = JSON.parse(data)
      if (parsed.remember) {
        userName.value = parsed.userName || ''
        password.value = decodePwd(parsed.password || '')
        rememberPwd.value = true
      }
    }
  } catch {
    // ignore
  }
}

const DEFAULT_ROLES = [
  { id: 'super', role: 'super', name: '超级管理员', label: '超级管理员', permissions: ['manage_system', 'manage_users', 'manage_roles', 'manage_subjects', 'manage_books', 'stock_in', 'stock_out', 'stock_return', 'view_stock', 'forecast_view', 'forecast_set', 'forecast_approve', 'forecast_modify', 'forecast_delete', 'forecast_stats', 'receive_view', 'receive_set', 'receive_approve', 'receive_modify', 'receive_delete', 'delete_book', 'view_stats', 'qrcode_generate'] },
  { id: 'admin', role: 'admin', name: '管理员', label: '管理员', permissions: ['manage_users', 'manage_subjects', 'stock_in', 'stock_out', 'stock_return', 'view_stock', 'forecast_view', 'forecast_set', 'forecast_approve', 'forecast_modify', 'forecast_delete', 'forecast_stats', 'receive_view', 'receive_set', 'receive_approve', 'receive_modify', 'receive_delete', 'delete_book', 'view_stats', 'qrcode_generate'] },
  { id: 'educational', role: 'educational', name: '教务', label: '教务', permissions: ['stock_in', 'stock_out', 'stock_return', 'view_stock', 'forecast_view', 'forecast_set', 'forecast_approve', 'forecast_modify', 'forecast_stats', 'receive_view', 'receive_set', 'receive_approve', 'receive_modify'] },
  { id: 'teacher', role: 'teacher', name: '教师', label: '教师', permissions: ['view_stock', 'forecast_view', 'forecast_set', 'receive_view', 'receive_set'] }
]

const initRoles = () => {
  const existing = getRoleList()
  if (existing.length === 0) {
    setRoleList(DEFAULT_ROLES)
    const initRolePermissions: Record<string, string[]> = {}
    DEFAULT_ROLES.forEach((r: any) => {
      initRolePermissions[r.role] = [...r.permissions]
    })
    setRolePermissions(initRolePermissions)
    return
  }

  // 已有角色：检查是否有新增权限需要合并（如 stock_return）
  const existingPerms = getRolePermissions()
  let permsChanged = false
  DEFAULT_ROLES.forEach((defaultRole: any) => {
    const saved = existingPerms[defaultRole.role]
    if (saved) {
      // 找出默认配置中有但已保存配置中没有的权限
      const missing = defaultRole.permissions.filter((p: string) => !saved.includes(p))
      if (missing.length > 0) {
        existingPerms[defaultRole.role] = [...saved, ...missing]
        permsChanged = true
      }
    } else {
      // 该角色在已保存配置中不存在，使用默认值
      existingPerms[defaultRole.role] = [...defaultRole.permissions]
      permsChanged = true
    }
  })
  if (permsChanged) {
    setRolePermissions(existingPerms)
  }
}

const canSubmitInit = computed(() => {
  return userName.value.trim().length > 0 &&
    initPassword.value.length >= 4 &&
    initPassword.value === initConfirmPassword.value
})

// 确保永久超级管理员账号始终存在
const ensurePermanentAdmin = () => {
  const userList = getUserList()
  const exists = userList.find((u: any) => u.userName === 'admin' || u.nickName === 'admin')
  if (!exists) {
    userList.push({
      _id: 'permanent-admin-' + Date.now(),
      openid: 'permanent-admin',
      userName: 'admin',
      nickName: 'admin',
      role: 'super',
      campus: 'all',
      campusName: '全部校区',
      roles: ['super'],
      campuses: ['honghe', 'longhua'],
      password: '1234',
      createTime: Date.now()
    })
    setUserList(userList)
  }
}

// ==================== 通用：Promise 超时保护 ====================
const withTimeout = <T,>(promise: Promise<T>, ms: number, fallback: T | null = null, desc = 'operation'): Promise<T | null> => {
  return Promise.race([
    promise,
    new Promise<T | null>((resolve) => {
      setTimeout(() => {
        console.warn(`[超时] ${desc} 超过 ${ms}ms，跳过继续`)
        resolve(fallback)
      }, ms)
    })
  ])
}

onMounted(async () => {
  initRoles()
  loadRemember()
  
  // 确保永久超级管理员账号始终存在（即使清除数据后也会重新创建）
  ensurePermanentAdmin()
  
  // 先检查本地用户
  let hasUsers = getUserList().length > 0
  
  // 本地没有用户，尝试连接云端检查（只要配置了 Supabase，就算在线，不需要 auth session）
  if (!hasUsers && isSupabaseConfigured()) {
    // 尝试连接共享账号（仅用于后台认证，不影响在线模式判断，加超时保护）
    await withTimeout((async () => { try { await connectToCloud() } catch {} })(), 5000, null, 'connectToCloud(onMounted)')
    try {
      const cloudUsers = await withTimeout(fetchUsers(), 8000, [], 'fetchUsers(onMounted)') as any[]
      if (cloudUsers && cloudUsers.length > 0) {
        hasUsers = true
        // 缓存到本地，下次登录更快
        setUserList(cloudUsers)
      }
    } catch {
      // 云端查询失败，忽略
    }
  }
  
  if (!hasUsers) {
    isInitMode.value = true
  }
  
  // 在线模式判断：只要配置了 Supabase 就算在线（RLS 已禁用，不需要 auth session）
  if (isSupabaseConfigured()) {
    const online = await isReallyOnline()
    cloudStatus.value = online ? 'success' : 'idle'
  } else {
    cloudStatus.value = 'disabled'
  }
})

const doInit = async () => {
  if (!userName.value.trim()) {
    alert('请输入管理员姓名')
    return
  }
  if (initPassword.value.length < 4) {
    alert('密码至少4位')
    return
  }
  if (initPassword.value !== initConfirmPassword.value) {
    alert('两次密码不一致')
    return
  }
  loading.value = true
  cloudSyncing.value = true
  try {
    const userData = {
      _id: Date.now().toString(),
      userName: userName.value.trim(),
      nickName: userName.value.trim(),
      role: 'super',
      campus: 'all',
      campusName: '全部校区',
      roles: ['super'],
      campuses: ['honghe', 'longhua'],
      password: initPassword.value,
      createTime: Date.now()
    }
    const userList = getUserList()
    userList.push(userData)
    setUserList(userList)

    setRole('super')
    setCampus('all')
    setCampusName('全部校区')
    setUserInfo({ ...userData, role: 'super', campus: 'all', campusName: '全部校区' })

    // 只要配置了 Supabase 就算在线（不需要 auth session），尝试同步数据（均加超时）
    const online = await isReallyOnline()
    if (online) {
      await withTimeout((async () => { try { await connectToCloud() } catch {} })(), 5000, null, 'connectToCloud(doInit)')
      cloudStatus.value = 'success'
      const syncResult = await withTimeout(syncLocalToCloud(), 15000, { success: false, message: '同步超时跳过' }, 'syncLocalToCloud(doInit)') as any
      console.log('初始化数据同步:', syncResult?.message)
    }

    router.push('/stock')
  } catch (err) {
    console.error('初始化失败:', err)
    alert('初始化失败，请重试')
  } finally {
    loading.value = false
    cloudSyncing.value = false
  }
}

const doLogin = async () => {
  if (!userName.value.trim()) {
    alert('请输入您的姓名')
    return
  }
  if (!password.value) {
    alert('请输入密码')
    return
  }
  loading.value = true
  cloudSyncing.value = true
  try {
    // 在线模式判断：只要配置了 Supabase 就算在线（不需要 auth session）
    const online = await isReallyOnline()
    if (online) {
      // 尝试连接共享账号（仅后台认证，超时/失败均不阻塞登录，5秒强制跳过）
      await withTimeout((async () => { try { await connectToCloud() } catch {} })(), 5000, null, 'connectToCloud(doLogin)')
      cloudStatus.value = 'success'
    }

    // 先从本地查找用户
    let userList = getUserList()
    let userData = userList.find((u: any) => u.nickName === userName.value.trim())

    // 本地没找到，尝试从云端查找（只要在线就尝试，8秒超时跳过）
    if (!userData && online) {
      try {
        const cloudUsers = (await withTimeout(fetchUsers(), 8000, [], 'fetchUsers(doLogin)')) as any[]
        userData = cloudUsers.find((u: any) => u.nickName === userName.value.trim())
        if (userData) {
          // 缓存到本地，下次登录更快
          userList.push(userData)
          setUserList(userList)
        }
      } catch {
        // 云端查询失败，忽略
      }
    }

    if (!userData) {
      alert('该用户不存在，请联系管理员添加账号')
      loading.value = false
      cloudSyncing.value = false
      return
    }

    // 验证密码（如果用户没有设置过密码，则跳过验证）
    if (userData.password && userData.password !== password.value) {
      alert('密码错误')
      loading.value = false
      cloudSyncing.value = false
      return
    }

    const userRole = (userData.roles && userData.roles[0]) || 'teacher'
    const userCampus = userData.campus || 'all'
    const userCampusName = userData.campusName || (userCampus === 'all' ? '全部校区' : userCampus === 'honghe' ? '洪河校区' : '龙华校区')

    setRole(userRole)
    setCampus(userCampus)
    setCampusName(userCampusName)
    setUserInfo({
      ...userData,
      role: userRole,
      campus: userCampus,
      campusName: userCampusName
    })

    // 在线模式下同步本地数据到云端（仅在云端为空时，15秒超时跳过）
    if (online) {
      const syncResult = (await withTimeout(syncLocalToCloud(), 15000, { success: false, message: '数据同步超时跳过' }, 'syncLocalToCloud(doLogin)')) as any
      console.log('数据同步:', syncResult?.message)
    }

    saveRemember()
    router.push('/stock')
  } catch (err) {
    console.error('登录失败:', err)
    alert('登录失败，请重试')
  } finally {
    loading.value = false
    cloudSyncing.value = false
  }
}

// 显示已有用户列表
const showExistingUsers = () => {
  const userList = getUserList()
  existingUserNames.value = userList.map((u: any) => u.nickName).filter(Boolean)
  showUserList.value = true
}

const selectExistingUser = (name: string) => {
  userName.value = name
  showUserList.value = false
}
</script>

<template>
  <div class="login-page">
    <div class="login-header">
      <div class="logo">📚</div>
      <h1 class="title">教材库存管理</h1>
      <p class="subtitle">内部员工工具</p>
    </div>
    
    <div class="login-content">
      <!-- 首次初始化模式 -->
      <div v-if="isInitMode" class="login-card">
        <div class="card-icon">🔐</div>
        <h2 class="card-title">初始化管理员账号</h2>
        <p class="card-desc">首次使用，请设置管理员信息</p>
        
        <div class="form-group">
          <input 
            class="input-field" 
            v-model="userName" 
            placeholder="请输入管理员姓名" 
          />
        </div>

        <div class="form-group">
          <input 
            class="input-field" 
            type="password"
            v-model="initPassword" 
            placeholder="请设置登录密码（至少4位）" 
          />
        </div>

        <div class="form-group">
          <input 
            class="input-field" 
            type="password"
            v-model="initConfirmPassword" 
            placeholder="请再次确认密码"
            @keyup.enter="doInit"
          />
        </div>
        
        <button 
          class="login-btn" 
          :class="{ loading: loading, disabled: !canSubmitInit }"
          @click="doInit"
          :disabled="loading || !canSubmitInit"
        >
          <span v-if="loading" class="btn-loading">⏳</span>
          <span>{{ loading ? '初始化中...' : '创建管理员账号' }}</span>
        </button>
        
        <p class="login-tip">首位用户自动成为超级管理员</p>
      </div>

      <!-- 正常登录模式 -->
      <div v-else class="login-card">
        <div class="card-icon">🔐</div>
        <h2 class="card-title">欢迎登录</h2>
        <p class="card-desc">请输入姓名和密码</p>
        
        <div class="form-group">
          <input 
            class="input-field" 
            v-model="userName" 
            placeholder="请输入您的姓名" 
          />
        </div>

        <div class="form-group">
          <input 
            class="input-field" 
            type="password"
            v-model="password" 
            placeholder="请输入密码"
            @keyup.enter="doLogin"
          />
        </div>

        <div class="remember-row">
          <label class="remember-label">
            <input type="checkbox" v-model="rememberPwd" />
            <span>记住密码</span>
          </label>
        </div>
        
        <button 
          class="login-btn" 
          :class="{ loading: loading }"
          @click="doLogin"
          :disabled="loading"
        >
          <span v-if="loading" class="btn-loading">⏳</span>
          <span>{{ loading ? '登录中...' : '登 录' }}</span>
        </button>
        
        <p class="login-tip">账号由管理员分配，如需账号请联系管理员</p>
        <p class="forgot-link" @click="showExistingUsers">忘记用户名？</p>
      </div>

      <!-- 已有用户列表弹窗 -->
      <div v-if="showUserList" class="modal-overlay" @click="showUserList = false">
        <div class="user-list-modal" @click.stop>
          <div class="user-list-header">
            <span class="user-list-title">已有账号</span>
            <span class="user-list-close" @click="showUserList = false">✕</span>
          </div>
          <div class="user-list-body">
            <div v-if="existingUserNames.length === 0" class="no-users">暂无账号</div>
            <div 
              v-for="name in existingUserNames" 
              :key="name"
              class="user-list-item"
              @click="selectExistingUser(name)"
            >
              {{ name }}
            </div>
          </div>
        </div>
      </div>
    </div>
    
    <div class="login-footer">
      <div class="cloud-status" v-if="cloudStatus !== 'disabled'">
        <span v-if="cloudSyncing" class="cloud-syncing">☁️ 正在连接云端...</span>
        <span v-else-if="cloudStatus === 'success'" class="cloud-success">☁️ 云端同步已开启</span>
        <span v-else-if="cloudStatus === 'fail'" class="cloud-fail">⚠️ 云端未连接（离线模式）</span>
        <span v-else class="cloud-idle">☁️ 登录后连接云端</span>
      </div>
      <p>© 2026 教材库存管理系统</p>
    </div>
  </div>
</template>

<style scoped>
.login-page {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, #1890ff 0%, #096dd9 100%);
  padding: 20px;
}

.login-header {
  text-align: center;
  margin-bottom: 40px;
}

.logo {
  font-size: 64px;
  margin-bottom: 20px;
  animation: bounce 2s infinite;
}

@keyframes bounce {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-10px); }
}

.title {
  font-size: 28px;
  font-weight: bold;
  color: #fff;
  margin-bottom: 8px;
}

.subtitle {
  font-size: 14px;
  color: rgba(255, 255, 255, 0.8);
}

.login-content {
  width: 100%;
  max-width: 340px;
}

.login-card {
  background: #fff;
  border-radius: 16px;
  padding: 40px 30px;
  box-shadow: 0 10px 40px rgba(0, 0, 0, 0.2);
  text-align: center;
}

.card-icon {
  font-size: 40px;
  margin-bottom: 16px;
}

.card-title {
  font-size: 20px;
  font-weight: bold;
  color: #333;
  margin-bottom: 8px;
}

.card-desc {
  font-size: 14px;
  color: #999;
  margin-bottom: 24px;
}

.form-group {
  margin-bottom: 20px;
  text-align: left;
}

.label {
  font-size: 14px;
  color: #333;
  margin-bottom: 10px;
  font-weight: bold;
}

.input-field {
  width: 100%;
  padding: 14px 16px;
  border: 2px solid #e8e8e8;
  border-radius: 10px;
  font-size: 16px;
  outline: none;
  transition: border-color 0.3s;
  box-sizing: border-box;
}

.input-field:focus {
  border-color: #1890ff;
}

.login-btn {
  width: 100%;
  padding: 14px;
  background: linear-gradient(135deg, #1890ff 0%, #096dd9 100%);
  color: #fff;
  border: none;
  border-radius: 10px;
  font-size: 16px;
  font-weight: bold;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  transition: all 0.3s ease;
  margin-top: 8px;
}

.login-btn:active {
  transform: scale(0.98);
}

.login-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.btn-loading {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

.remember-row {
  margin-bottom: 20px;
}

.remember-label {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
  color: #666;
  cursor: pointer;
}

.remember-label input[type="checkbox"] {
  width: 18px;
  height: 18px;
  accent-color: #1890ff;
  cursor: pointer;
}

.login-tip {
  font-size: 12px;
  color: #999;
  margin-top: 16px;
}

.forgot-link {
  font-size: 12px;
  color: #1890ff;
  margin-top: 8px;
  cursor: pointer;
  text-decoration: underline;
}

.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  z-index: 1000;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
}

.user-list-modal {
  background: #fff;
  border-radius: 16px;
  width: 100%;
  max-width: 300px;
  overflow: hidden;
}

.user-list-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 15px 20px;
  border-bottom: 1px solid #f0f0f0;
}

.user-list-title {
  font-size: 16px;
  font-weight: bold;
  color: #333;
}

.user-list-close {
  font-size: 24px;
  color: #999;
  cursor: pointer;
}

.user-list-body {
  padding: 10px 20px 20px;
}

.no-users {
  text-align: center;
  padding: 20px;
  color: #999;
  font-size: 14px;
}

.user-list-item {
  padding: 12px 16px;
  margin-top: 8px;
  background: #f5f5f5;
  border-radius: 8px;
  font-size: 15px;
  color: #333;
  cursor: pointer;
  text-align: center;
  transition: background 0.2s;
}

.user-list-item:active {
  background: #e6f7ff;
  color: #1890ff;
}

.login-footer {
  position: absolute;
  bottom: 30px;
  text-align: center;
}

.cloud-status {
  margin-bottom: 10px;
  font-size: 13px;
  text-align: center;
}

.cloud-syncing {
  color: rgba(255, 255, 255, 0.9);
  animation: pulse 1.5s infinite;
}

.cloud-success {
  color: #52c41a;
  background: rgba(255, 255, 255, 0.95);
  padding: 4px 12px;
  border-radius: 12px;
  font-size: 12px;
}

.cloud-fail {
  color: #faad14;
  background: rgba(255, 255, 255, 0.95);
  padding: 4px 12px;
  border-radius: 12px;
  font-size: 12px;
}

.cloud-idle {
  color: rgba(255, 255, 255, 0.7);
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}

.login-footer p {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.6);
}
</style>