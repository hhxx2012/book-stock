<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { useRouter } from 'vue-router'
import { setDefaultYear, setDefaultTerm, clearDefaultYearTerm, getUserInfo } from '../utils/storage'
import { clearAllData as clearAllDataService, updateDefaultYearTerm, fetchDefaultYearTerm } from '../services/dataService'

const router = useRouter()
const defaultYear = ref('')
const defaultTerm = ref('')
const showYearOptions = ref(false)
const showTermOptions = ref(false)
const loading = ref(false)

// 检查当前用户是否为超级管理员
const isSuperAdmin = computed(() => {
  const userInfo = getUserInfo()
  return userInfo?.role === 'super' || userInfo?.userName === 'admin'
})

const years = ['2020', '2021', '2022', '2023', '2024', '2025', '2026', '2027', '2028', '2029', '2030']
const terms = ['春期', '暑期', '秋期', '冬期']

onMounted(() => {
  loadSettings()
})

const goBack = () => {
  router.back()
}

const loadSettings = async () => {
  loading.value = true
  try {
    const { year, term } = await fetchDefaultYearTerm()
    defaultYear.value = year || '2026'
    defaultTerm.value = term || '暑期'
  } finally {
    loading.value = false
  }
}

const selectYear = () => {
  showYearOptions.value = !showYearOptions.value
  showTermOptions.value = false
}

const selectTerm = () => {
  showTermOptions.value = !showTermOptions.value
  showYearOptions.value = false
}

const confirmYear = async (year: string) => {
  defaultYear.value = year
  setDefaultYear(year)
  await updateDefaultYearTerm(year, defaultTerm.value || '暑期')
  showYearOptions.value = false
  alert('年度默认设置已保存')
}

const confirmTerm = async (term: string) => {
  defaultTerm.value = term
  setDefaultTerm(term)
  await updateDefaultYearTerm(defaultYear.value || '2026', term)
  showTermOptions.value = false
  alert('时期默认设置已保存')
}

const clearSettings = async () => {
  if (confirm('确定要清除年度和时期的默认设置吗？')) {
    clearDefaultYearTerm()
    defaultYear.value = ''
    defaultTerm.value = ''
    alert('已清除默认设置')
  }
}

const clearAllData = async () => {
  if (confirm('⚠️ 警告：此操作将删除所有书本、库存、预计、领取、日志等全部业务数据，不可恢复！\n\n用户账号和角色数据将保留。\n\n确定要继续吗？')) {
    if (confirm('再次确认：您真的要清空所有业务数据吗？')) {
      // 保存用户相关数据（清空前备份）
      const savedUserInfo = localStorage.getItem('user_info')
      const savedRole = localStorage.getItem('user_role')
      const savedCampus = localStorage.getItem('user_campus')
      const savedCampusName = localStorage.getItem('user_campus_name')
      const savedUserList = localStorage.getItem('user_list')
      const savedRoleList = localStorage.getItem('role_list')
      const savedRolePermissions = localStorage.getItem('role_permissions')
      const savedDefaultYear = localStorage.getItem('default_year')
      const savedDefaultTerm = localStorage.getItem('default_term')
      
      await clearAllDataService()
      
      // 恢复用户相关数据
      if (savedUserInfo) localStorage.setItem('user_info', savedUserInfo)
      if (savedRole) localStorage.setItem('user_role', savedRole)
      if (savedCampus) localStorage.setItem('user_campus', savedCampus)
      if (savedCampusName) localStorage.setItem('user_campus_name', savedCampusName)
      if (savedUserList) localStorage.setItem('user_list', savedUserList)
      if (savedRoleList) localStorage.setItem('role_list', savedRoleList)
      if (savedRolePermissions) localStorage.setItem('role_permissions', savedRolePermissions)
      if (savedDefaultYear) localStorage.setItem('default_year', savedDefaultYear)
      if (savedDefaultTerm) localStorage.setItem('default_term', savedDefaultTerm)
      
      // 标记 mock 数据已初始化，防止重新生成测试数据
      localStorage.setItem('mock_data_initialized_v1', 'true')
      
      alert('所有业务数据已清除，即将跳转到登录页')
      router.push('/')
    }
  }
}
</script>

<template>
  <div class="system-settings-page">
    <div class="page-header">
      <span class="back-btn" @click="goBack">‹</span>
      <h1 class="page-title">⚙️ 系统设置</h1>
    </div>
    
    <div class="settings-section">
      <div class="setting-card">
        <div class="setting-title">默认年度设置</div>
        <div class="setting-item">
          <span class="setting-label">年度</span>
          <div class="setting-value" @click="selectYear">
            {{ defaultYear || '请选择' }}
            <span class="arrow">▼</span>
          </div>
        </div>
        <div v-if="showYearOptions" class="options-panel">
          <div 
            v-for="year in years" 
            :key="year"
            class="option-item"
            :class="{ active: defaultYear === year }"
            @click="confirmYear(year)"
          >
            {{ year }}年
          </div>
        </div>
      </div>
      
      <div class="setting-card">
        <div class="setting-title">默认时期设置</div>
        <div class="setting-item">
          <span class="setting-label">时期</span>
          <div class="setting-value" @click="selectTerm">
            {{ defaultTerm || '请选择' }}
            <span class="arrow">▼</span>
          </div>
        </div>
        <div v-if="showTermOptions" class="options-panel">
          <div 
            v-for="term in terms" 
            :key="term"
            class="option-item"
            :class="{ active: defaultTerm === term }"
            @click="confirmTerm(term)"
          >
            {{ term }}
          </div>
        </div>
      </div>
      
      <div class="setting-card">
        <button class="clear-btn" @click="clearSettings">清除默认设置</button>
      </div>

      <div v-if="isSuperAdmin" class="setting-card danger-card">
        <div class="setting-title">⚠️ 危险操作区</div>
        <p class="danger-desc">以下操作会删除所有书本、库存、预计、领取、日志等业务数据（用户账号和角色保留），请谨慎使用。</p>
        <button class="danger-btn" @click="clearAllData">🗑️ 清除所有业务数据</button>
      </div>

      <div class="setting-card">
        <div class="setting-info">
          <h3>说明</h3>
          <p>1. 设置默认年度和时期后，所有页面打开时会默认显示该设置的值</p>
          <p>2. 用户可以在各自界面修改显示其他年度/时期</p>
          <p>3. 重置后会恢复为超级管理员设置的默认值</p>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.system-settings-page {
  min-height: 100vh;
  background-color: #f5f5f5;
  padding-bottom: 80px;
}

.page-header {
  background: linear-gradient(135deg, #1890ff 0%, #096dd9 100%);
  padding: 20px;
  text-align: center;
  position: relative;
}

.back-btn {
  position: absolute;
  left: 12px;
  top: 50%;
  transform: translateY(-50%);
  color: #fff;
  font-size: 32px;
  cursor: pointer;
  padding: 0 8px;
  line-height: 1;
  z-index: 1;
}

.page-title {
  font-size: 20px;
  font-weight: bold;
  color: #fff;
}

.settings-section {
  padding: 15px;
}

.setting-card {
  background: #fff;
  border-radius: 12px;
  padding: 15px;
  margin-bottom: 15px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);
}

.setting-title {
  font-size: 16px;
  font-weight: bold;
  color: #333;
  margin-bottom: 15px;
}

.setting-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.setting-label {
  font-size: 14px;
  color: #666;
}

.setting-value {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 16px;
  background: #f5f5f5;
  border-radius: 8px;
  font-size: 14px;
  font-weight: bold;
  color: #333;
  cursor: pointer;
}

.arrow {
  font-size: 12px;
  color: #999;
}

.options-panel {
  margin-top: 10px;
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}

.option-item {
  padding: 10px 16px;
  background: #f5f5f5;
  border-radius: 8px;
  font-size: 14px;
  cursor: pointer;
}

.option-item.active {
  background: #1890ff;
  color: #fff;
}

.clear-btn {
  width: 100%;
  padding: 14px;
  background: #fff7e6;
  color: #fa8c16;
  border: none;
  border-radius: 8px;
  font-size: 16px;
  cursor: pointer;
}

.danger-card {
  border: 1px solid #ffccc7;
  background: #fff2f0;
}

.danger-desc {
  font-size: 13px;
  color: #ff4d4f;
  margin-bottom: 12px;
}

.danger-btn {
  width: 100%;
  padding: 14px;
  background: #ff4d4f;
  color: #fff;
  border: none;
  border-radius: 8px;
  font-size: 16px;
  font-weight: bold;
  cursor: pointer;
}

.setting-info {
  font-size: 14px;
  color: #666;
}

.setting-info h3 {
  font-size: 14px;
  font-weight: bold;
  color: #333;
  margin-bottom: 10px;
}

.setting-info p {
  margin-bottom: 8px;
  line-height: 1.5;
}
</style>
