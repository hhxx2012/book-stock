<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { 
  getUserInfo, getRole, getCampus, logout, 
  setRole, setCampus, setCampusName, canManageUsers, canManageSystem, canManageRoles, canManageBooks, canViewStats, canGenerateQrcode
} from '../utils/storage'
import * as ds from '../services/dataService'
import { disconnectFromCloud, isSupabaseConfigured } from '../utils/supabase'

const router = useRouter()
const userInfo = ref<any>(null)
const userRoles = ref<any[]>([])
const userCampuses = ref<any[]>([])
const currentRole = ref('')
const currentCampus = ref('')

const CAMPUS_MAP: Record<string, { value: string; label: string }> = {
  honghe: { value: 'honghe', label: '洪河校区' },
  longhua: { value: 'longhua', label: '龙华校区' },
  all: { value: 'all', label: '全部校区' }
}

const ROLE_MAP: Record<string, { value: string; label: string }> = {
  super: { value: 'super', label: '超级管理员' },
  admin: { value: 'admin', label: '管理员' },
  educational: { value: 'educational', label: '教务' },
  teacher: { value: 'teacher', label: '教师' }
}

const canManageUsersVal = computed(() => canManageUsers())
const canManageSystemVal = computed(() => canManageSystem())
const canManageRolesVal = computed(() => canManageRoles())
const canManageBooksVal = computed(() => canManageBooks())
const canViewStatsVal = computed(() => canViewStats())
const canGenerateQrcodeVal = computed(() => canGenerateQrcode())

const showRoleSwitchModal = ref(false)
const switchRole = ref('')
const switchCampus = ref('')
const cloudStatus = ref<'checking' | 'success' | 'fail' | 'disabled'>('checking')

onMounted(async () => {
  loadUserInfo()
  // 在线模式判断：只要配置了 Supabase 就算在线（RLS 已禁用，不需要 auth session）
  if (isSupabaseConfigured()) {
    const online = await ds.isReallyOnline()
    cloudStatus.value = online ? 'success' : 'fail'
  } else {
    cloudStatus.value = 'disabled'
  }
})

const loadUserInfo = () => {
  userInfo.value = getUserInfo()
  currentRole.value = getRole()
  currentCampus.value = getCampus()
  
  const roles = userInfo.value?.roles || ['super']
  userRoles.value = roles.map((role: string) => ({
    value: role,
    label: ROLE_MAP[role]?.label || role
  }))
  
  const campuses = userInfo.value?.campuses || ['honghe']
  const isSuper = roles.includes('super')
  
  if (isSuper) {
    userCampuses.value = [
      { value: 'all', label: '全部校区' },
      { value: 'honghe', label: '洪河校区' },
      { value: 'longhua', label: '龙华校区' }
    ]
  } else {
    userCampuses.value = campuses.map((campus: string) => ({
      value: campus,
      label: CAMPUS_MAP[campus]?.label || campus
    }))
  }
}

const goTo = (path: string) => {
  router.push(path)
}

const doLogout = async () => {
  if (confirm('确定要退出登录吗？')) {
    // 断开 Supabase 云端连接
    await disconnectFromCloud()
    logout()
    router.push('/')
  }
}

const openRoleSwitchModal = () => {
  switchRole.value = currentRole.value
  switchCampus.value = currentCampus.value
  showRoleSwitchModal.value = true
}

const closeRoleSwitchModal = () => {
  showRoleSwitchModal.value = false
}

const confirmRoleSwitch = () => {
  if (!switchRole.value || !switchCampus.value) {
    alert('请选择角色和校区')
    return
  }
  
  setRole(switchRole.value)
  setCampus(switchCampus.value)
  setCampusName(CAMPUS_MAP[switchCampus.value]?.label || switchCampus.value)
  
  const updatedUserInfo = {
    ...userInfo.value,
    role: switchRole.value,
    campus: switchCampus.value,
    campusName: CAMPUS_MAP[switchCampus.value]?.label || switchCampus.value
  }
  
  localStorage.setItem('user_info', JSON.stringify(updatedUserInfo))
  
  alert('切换成功')
  closeRoleSwitchModal()
  loadUserInfo()
}

// 修改密码
const showChangePwdModal = ref(false)
const oldPwd = ref('')
const newPwd = ref('')
const confirmPwd = ref('')

const openChangePwdModal = () => {
  oldPwd.value = ''
  newPwd.value = ''
  confirmPwd.value = ''
  showChangePwdModal.value = true
}

const closeChangePwdModal = () => {
  showChangePwdModal.value = false
}

const doChangePassword = async () => {
  // 如果用户已设置过密码，则需要验证旧密码
  if (userInfo.value?.password) {
    if (!oldPwd.value) {
      alert('请输入当前密码')
      return
    }
    if (userInfo.value.password !== oldPwd.value) {
      alert('当前密码错误')
      return
    }
  }
  if (newPwd.value.length < 4) {
    alert('新密码至少4位')
    return
  }
  if (newPwd.value !== confirmPwd.value) {
    alert('两次密码不一致')
    return
  }
  await ds.updateUser(userInfo.value._id!, { password: newPwd.value })
  // 更新本地缓存
  userInfo.value.password = newPwd.value
  localStorage.setItem('user_info', JSON.stringify(userInfo.value))
  alert('密码修改成功')
  closeChangePwdModal()
}
</script>

<template>
  <div class="mine-page">
    <div class="page-header">
      <div class="user-card">
        <div class="avatar">👤</div>
        <div class="user-info">
          <h2 class="user-name">{{ userInfo?.nickName || '用户' }}</h2>
          <p class="user-role">{{ ROLE_MAP[currentRole]?.label || currentRole }} · {{ CAMPUS_MAP[currentCampus]?.label || currentCampus }}</p>
        </div>
        <button v-if="userRoles.length > 1" class="switch-btn" @click="openRoleSwitchModal">切换角色</button>
      </div>
      <div class="cloud-indicator" v-if="cloudStatus !== 'disabled'">
        <span v-if="cloudStatus === 'success'" class="cloud-on">☁️ 云端同步中</span>
        <span v-else-if="cloudStatus === 'fail'" class="cloud-off">⚠️ 离线模式</span>
        <span v-else class="cloud-checking">☁️ 检查中...</span>
      </div>
    </div>
    
    <div class="menu-section">
      <div class="menu-group">
        <div 
          v-if="canManageSystemVal" 
          class="menu-item" 
          @click="goTo('/system-settings')"
        >
          <span class="menu-icon">⚙️</span>
          <span class="menu-text">系统管理</span>
          <span class="menu-arrow">→</span>
        </div>
        <div 
          v-if="canManageUsersVal" 
          class="menu-item" 
          @click="goTo('/user-management')"
        >
          <span class="menu-icon">👥</span>
          <span class="menu-text">用户管理</span>
          <span class="menu-arrow">→</span>
        </div>
        <div 
          v-if="canManageRolesVal" 
          class="menu-item" 
          @click="goTo('/role-management')"
        >
          <span class="menu-icon">🎭</span>
          <span class="menu-text">角色管理</span>
          <span class="menu-arrow">→</span>
        </div>
        <div 
          v-if="canManageBooksVal" 
          class="menu-item" 
          @click="goTo('/book-settings')"
        >
          <span class="menu-icon">📖</span>
          <span class="menu-text">书本设置</span>
          <span class="menu-arrow">→</span>
        </div>
        <div 
          v-if="canViewStatsVal" 
          class="menu-item" 
          @click="goTo('/log')"
        >
          <span class="menu-icon">📊</span>
          <span class="menu-text">数据统计</span>
          <span class="menu-arrow">→</span>
        </div>
        <div 
          v-if="canGenerateQrcodeVal" 
          class="menu-item" 
          @click="goTo('/qrcode')"
        >
          <span class="menu-icon">🆔</span>
          <span class="menu-text">二维码生成</span>
          <span class="menu-arrow">→</span>
        </div>
      </div>
      
      <div class="menu-group">
        <div class="menu-item" @click="goTo('/log')">
          <span class="menu-icon">📋</span>
          <span class="menu-text">操作日志</span>
          <span class="menu-arrow">→</span>
        </div>
        <div class="menu-item" @click="openChangePwdModal">
          <span class="menu-icon">🔑</span>
          <span class="menu-text">修改密码</span>
          <span class="menu-arrow">→</span>
        </div>
        <div class="menu-item">
          <span class="menu-icon">ℹ️</span>
          <span class="menu-text">关于系统</span>
          <span class="menu-arrow">→</span>
        </div>
      </div>
    </div>
    
    <div class="logout-section">
      <button class="logout-btn" @click="doLogout">退出登录</button>
    </div>
    
    <!-- 角色切换弹窗 -->
    <div v-if="showRoleSwitchModal" class="modal-overlay" @click="closeRoleSwitchModal">
      <div class="modal-content" @click.stop>
        <div class="modal-header">
          <span class="modal-title">切换角色</span>
          <span class="modal-close" @click="closeRoleSwitchModal">✕</span>
        </div>
        <div class="role-switch-form">
          <div class="form-group">
            <label>选择角色</label>
            <div class="role-options">
              <div 
                v-for="role in userRoles" 
                :key="role.value"
                class="role-option"
                :class="{ active: switchRole === role.value }"
                @click="switchRole = role.value"
              >
                {{ role.label }}
              </div>
            </div>
          </div>
          <div class="form-group">
            <label>选择校区</label>
            <div class="campus-options">
              <div 
                v-for="campus in userCampuses" 
                :key="campus.value"
                class="campus-option"
                :class="{ active: switchCampus === campus.value }"
                @click="switchCampus = campus.value"
              >
                {{ campus.label }}
              </div>
            </div>
          </div>
          <button class="btn-confirm" @click="confirmRoleSwitch">确认切换</button>
        </div>
      </div>
    </div>

    <!-- 修改密码弹窗 -->
    <div v-if="showChangePwdModal" class="modal-overlay" @click="closeChangePwdModal">
      <div class="modal-content" @click.stop>
        <div class="modal-header">
          <span class="modal-title">修改密码</span>
          <span class="modal-close" @click="closeChangePwdModal">✕</span>
        </div>
        <div class="role-switch-form">
          <div class="form-group">
            <label>当前密码</label>
            <input type="password" class="form-input" v-model="oldPwd" :placeholder="userInfo?.password ? '请输入当前密码' : '首次设置，可不填'" />
          </div>
          <div class="form-group">
            <label>新密码</label>
            <input type="password" class="form-input" v-model="newPwd" placeholder="请输入新密码（至少4位）" />
          </div>
          <div class="form-group">
            <label>确认新密码</label>
            <input type="password" class="form-input" v-model="confirmPwd" placeholder="请再次输入新密码" />
          </div>
          <button class="btn-confirm" @click="doChangePassword">确认修改</button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.mine-page {
  min-height: 100vh;
  background-color: #f5f5f5;
  padding-bottom: 80px;
}

.page-header {
  background: linear-gradient(135deg, #1890ff 0%, #096dd9 100%);
  padding: 30px 20px;
}

.user-card {
  display: flex;
  align-items: center;
  gap: 15px;
}

.avatar {
  width: 60px;
  height: 60px;
  background: rgba(255, 255, 255, 0.2);
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 28px;
}

.user-info {
  flex: 1;
}

.user-name {
  font-size: 20px;
  font-weight: bold;
  color: #fff;
  margin-bottom: 4px;
}

.user-role {
  font-size: 14px;
  color: rgba(255, 255, 255, 0.8);
}

.switch-btn {
  padding: 8px 16px;
  background: rgba(255, 255, 255, 0.2);
  color: #fff;
  border: 1px solid rgba(255, 255, 255, 0.3);
  border-radius: 20px;
  font-size: 12px;
  cursor: pointer;
}

.cloud-indicator {
  margin-top: 12px;
  text-align: center;
}

.cloud-on {
  display: inline-block;
  padding: 4px 12px;
  background: rgba(82, 196, 26, 0.2);
  color: #b7eb8f;
  border-radius: 12px;
  font-size: 12px;
}

.cloud-off {
  display: inline-block;
  padding: 4px 12px;
  background: rgba(250, 173, 20, 0.2);
  color: #ffd591;
  border-radius: 12px;
  font-size: 12px;
}

.cloud-checking {
  display: inline-block;
  padding: 4px 12px;
  background: rgba(255, 255, 255, 0.15);
  color: rgba(255, 255, 255, 0.8);
  border-radius: 12px;
  font-size: 12px;
}

.menu-section {
  padding: 15px;
}

.menu-group {
  background: #fff;
  border-radius: 12px;
  margin-bottom: 15px;
  overflow: hidden;
}

.menu-item {
  display: flex;
  align-items: center;
  padding: 16px;
  border-bottom: 1px solid #f5f5f5;
  cursor: pointer;
}

.menu-item:last-child {
  border-bottom: none;
}

.menu-item:active {
  background: #f5f5f5;
}

.menu-icon {
  font-size: 20px;
  margin-right: 12px;
}

.menu-text {
  flex: 1;
  font-size: 16px;
  color: #333;
}

.menu-arrow {
  font-size: 16px;
  color: #999;
}

.logout-section {
  padding: 15px;
}

.logout-btn {
  width: 100%;
  padding: 14px;
  background: #fff;
  color: #ff4d4f;
  border: none;
  border-radius: 8px;
  font-size: 16px;
  cursor: pointer;
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

.modal-content {
  background: #fff;
  border-radius: 16px;
  width: 100%;
  max-width: 320px;
  overflow: hidden;
}

.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 15px 20px;
  border-bottom: 1px solid #f0f0f0;
}

.modal-title {
  font-size: 16px;
  font-weight: bold;
  color: #333;
}

.modal-close {
  font-size: 24px;
  color: #999;
  cursor: pointer;
}

.role-switch-form {
  padding: 20px;
}

.form-group {
  margin-bottom: 20px;
}

.form-group label {
  display: block;
  font-size: 14px;
  font-weight: bold;
  color: #333;
  margin-bottom: 10px;
}

.role-options, .campus-options {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}

.role-option, .campus-option {
  padding: 10px 16px;
  background: #f5f5f5;
  border-radius: 8px;
  font-size: 14px;
  cursor: pointer;
  border: 2px solid transparent;
}

.role-option.active, .campus-option.active {
  background: #e6f7ff;
  border-color: #1890ff;
  color: #1890ff;
}

.btn-confirm {
  width: 100%;
  padding: 14px;
  background: #1890ff;
  color: #fff;
  border: none;
  border-radius: 8px;
  font-size: 16px;
  font-weight: bold;
  cursor: pointer;
}

.form-input {
  width: 100%;
  padding: 12px;
  border: 1px solid #ddd;
  border-radius: 8px;
  font-size: 14px;
  box-sizing: border-box;
}
</style>
