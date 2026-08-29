<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { 
  getDefaultYear, getDefaultTerm, getRole, getCampus, 
  canReceiveApprove, canReceiveModify, canReceiveDelete,
  isEducational, isTeacher, getUserInfo
} from '../utils/storage'
import * as ds from '../services/dataService'
import type { ForecastItem } from '../types'

const selectedYear = ref('')
const selectedTerm = ref('')
const showOptions = ref('')
const currentStatus = ref('pending')
const receiveList = ref<ForecastItem[]>([])
const loading = ref(false)

const years = ['2020', '2021', '2022', '2023', '2024', '2025', '2026', '2027', '2028', '2029', '2030']
const terms = ['春期', '暑期', '秋期', '冬期']

const canApprove = computed(() => canReceiveApprove())
const canModify = computed(() => canReceiveModify())
const canDelete = computed(() => canReceiveDelete())

const showEditMenu = ref(false)
const editItem = ref<ForecastItem | null>(null)

const showApproveModal = ref(false)
const approveRemark = ref('')
const submitting = ref(false)

onMounted(() => {
  selectedYear.value = getDefaultYear() || '2026'
  selectedTerm.value = getDefaultTerm() || '暑期'
  loadReceiveList()
})

const loadReceiveList = async () => {
  loading.value = true
  try {
    let list = await ds.fetchForecasts()
    list = list.filter((item: ForecastItem) => item.type === 'receive')
    
    if (selectedYear.value) {
      list = list.filter((item: ForecastItem) => item.year === selectedYear.value)
    }
    if (selectedTerm.value) {
      list = list.filter((item: ForecastItem) => item.term === selectedTerm.value)
    }
    
    const filterStatus = currentStatus.value || 'pending'
    list = list.filter((item: ForecastItem) => {
      const itemStatus = item.status || 'pending'
      return itemStatus === filterStatus
    })
    
    const currentCampus = getCampus()
    const currentRole = getRole()
    
    if (isEducational() && currentCampus !== 'all') {
      list = list.filter((item: ForecastItem) => item.campus === currentCampus)
    } else if (isTeacher()) {
      list = list.filter((item: ForecastItem) => item.operator === currentRole || item.operator === 'teacher')
    }
    
    list.sort((a, b) => b.createTime - a.createTime)
    receiveList.value = list
  } finally {
    loading.value = false
  }
}

const selectFilter = (field: string) => {
  if (showOptions.value === field) {
    showOptions.value = ''
  } else {
    showOptions.value = field
  }
}

const confirmFilter = (option: string) => {
  if (showOptions.value === 'year') {
    selectedYear.value = option
  } else if (showOptions.value === 'term') {
    selectedTerm.value = option
  }
  showOptions.value = ''
  loadReceiveList()
}

const resetFilter = () => {
  selectedYear.value = getDefaultYear() || '2026'
  selectedTerm.value = getDefaultTerm() || '暑期'
  showOptions.value = ''
  loadReceiveList()
}

const setCurrentStatus = (status: string) => {
  currentStatus.value = status
  loadReceiveList()
}

const formatTime = (timestamp: number) => {
  const date = new Date(timestamp)
  const month = date.getMonth() + 1
  const day = date.getDate()
  const hour = date.getHours().toString().padStart(2, '0')
  const minute = date.getMinutes().toString().padStart(2, '0')
  return `${month}月${day}日 ${hour}:${minute}`
}

const openEditMenu = (item: ForecastItem) => {
  editItem.value = item
  showEditMenu.value = true
}

const closeEditMenu = () => {
  showEditMenu.value = false
  editItem.value = null
}

const openApproveModal = () => {
  approveRemark.value = ''
  showEditMenu.value = false
  showApproveModal.value = true
}

const closeApproveModal = () => {
  showApproveModal.value = false
}

const approveReceive = async (confirm: boolean) => {
  if (!editItem.value) return
  
  // 防重复提交
  if (submitting.value) return
  submitting.value = true
  
  const item = editItem.value
  const userInfo = getUserInfo()
  
  // 如果确认发放，先扣除库存
  if (confirm) {
    const stockOutResult = await ds.stockOut({
      campus: item.campus || 'honghe',
      year: item.year || '',
      term: item.term || '',
      grade: item.grade || '',
      subject: item.subject || '',
      difficulty: item.difficulty || '',
      bookName: item.bookName || item.subject || '',
      quantity: item.quantity || 0,
      remark: approveRemark.value || '领取扣除库存',
      operator: userInfo?.userName || userInfo?.nickName || '',
      operatorName: userInfo?.userName || userInfo?.nickName || ''
    })
    
    if (!stockOutResult.success) {
      alert('库存扣除失败：' + (stockOutResult.message || '库存不足'))
      submitting.value = false
      return
    }
  }
  
  const updates: Partial<ForecastItem> = {
    status: 'processed',
    operator: userInfo?.nickName || getRole(),
    operatorName: userInfo?.nickName || ''
  }
  if (!confirm && approveRemark.value) {
    updates.remark = approveRemark.value
  }
  
  const result = await ds.updateForecast(item._id, updates)
  if (result.success) {
    alert(confirm ? '已扣除库存发放' : '已备注，发送到已处理')
    closeApproveModal()
    loadReceiveList()
  } else {
    alert('操作失败：' + (result.error || '未知错误'))
  }
  
  submitting.value = false
}

const modifyReceive = async () => {
  if (!editItem.value) return
  
  const result = await ds.updateForecast(editItem.value._id, { status: 'pending' })
  if (result.success) {
    alert('已返回未处理')
    closeEditMenu()
    loadReceiveList()
  } else {
    alert('操作失败：' + (result.error || '未知错误'))
  }
}

const deleteReceive = async () => {
  if (!editItem.value) return
  
  if (confirm('确定要删除这条领取记录吗？')) {
    const result = await ds.deleteForecasts([editItem.value._id])
    if (result.success) {
      alert('已删除')
      closeEditMenu()
      loadReceiveList()
    } else {
      alert('删除失败：' + (result.error || '未知错误'))
    }
  }
}
</script>

<template>
  <div class="receive-page">
    <div class="page-header">
      <h1 class="page-title">🎁 领取</h1>
    </div>
    
    <div class="filter-section">
      <div class="filter-row">
        <div class="filter-item" @click="selectFilter('year')">
          <span class="filter-label">年度</span>
          <span class="filter-value">{{ selectedYear || '请选择' }}</span>
        </div>
        <div class="filter-item" @click="selectFilter('term')">
          <span class="filter-label">时期</span>
          <span class="filter-value">{{ selectedTerm || '请选择' }}</span>
        </div>
      </div>
      <div class="filter-actions">
        <button class="btn-filter" @click="loadReceiveList">查询</button>
        <button class="btn-reset" @click="resetFilter">重置</button>
      </div>
    </div>
    
    <div v-if="showOptions" class="options-overlay" @click="showOptions = ''">
      <div class="options-panel">
        <div 
          v-for="option in (showOptions === 'year' ? years : terms)" 
          :key="option"
          class="option-item"
          :class="{ active: (showOptions === 'year' ? selectedYear : selectedTerm) === option }"
          @click.stop="confirmFilter(option)"
        >
          {{ option }}
        </div>
      </div>
    </div>
    
    <div class="status-tabs">
      <div 
        class="status-tab" 
        :class="{ active: currentStatus === 'pending' }"
        @click="setCurrentStatus('pending')"
      >未处理</div>
      <div 
        class="status-tab" 
        :class="{ active: currentStatus === 'processed' }"
        @click="setCurrentStatus('processed')"
      >已处理</div>
    </div>
    
    <div class="receive-list">
      <div v-if="receiveList.length === 0" class="empty-state">
        <span class="empty-icon">🎁</span>
        <span>{{ currentStatus === 'pending' ? '暂无未处理记录' : '暂无已处理记录' }}</span>
      </div>
      <div v-for="item in receiveList" :key="item._id" class="receive-item">
        <div class="receive-header">
          <span class="receive-type">领取</span>
          <div class="receive-right">
            <span class="receive-time">{{ formatTime(item.createTime) }}</span>
            <button 
              v-if="canApprove || canModify || canDelete" 
              class="edit-btn" 
              @click="openEditMenu(item)"
            >编辑</button>
          </div>
        </div>
        <div class="receive-info">
          <span class="receive-book">{{ item.bookName || item.subject }}</span>
          <span class="receive-detail">{{ item.year }}年{{ item.term }} · {{ item.campus === 'honghe' ? '洪河校区' : '龙华校区' }} · {{ item.grade }} · {{ item.subject }}</span>
        </div>
        <div class="receive-meta">
          <div class="receive-quantity">
            <span>数量：</span>
            <span class="quantity-value">{{ item.quantity }}</span>
          </div>
          <div class="receive-remark">
            <span>备注：</span>
            <span>{{ item.remark || '-' }}</span>
          </div>
        </div>
      </div>
    </div>
    
    <!-- 编辑菜单 -->
    <div v-if="showEditMenu" class="edit-menu-overlay" @click="closeEditMenu">
      <div class="edit-menu-content" @click.stop>
        <div class="edit-menu-header">
          <span class="edit-menu-title">操作</span>
          <span class="edit-menu-close" @click="closeEditMenu">✕</span>
        </div>
        <div class="edit-menu-list">
          <div v-if="canApprove" class="edit-menu-item approve" @click="openApproveModal">
            <span>✓</span>
            <span>审批</span>
          </div>
          <div v-if="canModify" class="edit-menu-item modify" @click="modifyReceive">
            <span>✏️</span>
            <span>修改</span>
          </div>
          <div v-if="canDelete" class="edit-menu-item delete" @click="deleteReceive">
            <span>🗑️</span>
            <span>删除</span>
          </div>
        </div>
      </div>
    </div>
    
    <!-- 审批弹窗 -->
    <div v-if="showApproveModal" class="approve-modal" @click="closeApproveModal">
      <div class="approve-content" @click.stop>
        <div class="approve-header">
          <span class="approve-title">审批领取</span>
          <span class="approve-close" @click="closeApproveModal">✕</span>
        </div>
        <div class="approve-form">
          <div class="approve-info">
            <span>书本：{{ editItem?.bookName || editItem?.subject }}</span>
            <span>数量：{{ editItem?.quantity }}本</span>
          </div>
          <div class="approve-options">
            <button class="approve-btn confirm" @click="approveReceive(true)">是，扣除库存发放</button>
            <button class="approve-btn reject" @click="approveReceive(false)">否，添加备注</button>
            <button class="approve-btn cancel" @click="closeApproveModal">取消</button>
          </div>
          <div v-if="!approveRemark" class="remark-tip">点击"否"需填写备注</div>
          <input 
            v-if="!approveRemark" 
            type="text" 
            class="remark-input" 
            v-model="approveRemark" 
            placeholder="请输入备注"
          />
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.receive-page {
  min-height: 100vh;
  background-color: #f5f5f5;
  padding-bottom: 80px;
}

.page-header {
  background: linear-gradient(135deg, #52c41a 0%, #389e0d 100%);
  padding: 20px;
  text-align: center;
}

.page-title {
  font-size: 20px;
  font-weight: bold;
  color: #fff;
}

.filter-section {
  background: #fff;
  margin: 15px;
  border-radius: 12px;
  padding: 15px;
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.05);
}

.filter-row {
  display: flex;
  gap: 12px;
  margin-bottom: 15px;
}

.filter-item {
  flex: 1;
  padding: 12px;
  background: #f5f5f5;
  border-radius: 8px;
  cursor: pointer;
}

.filter-label {
  display: block;
  font-size: 12px;
  color: #999;
  margin-bottom: 4px;
}

.filter-value {
  font-size: 14px;
  font-weight: bold;
  color: #333;
}

.filter-actions {
  display: flex;
  gap: 10px;
}

.btn-filter {
  flex: 1;
  padding: 12px;
  background: #52c41a;
  color: #fff;
  border: none;
  border-radius: 8px;
  font-size: 14px;
  cursor: pointer;
}

.btn-reset {
  flex: 1;
  padding: 12px;
  background: #f0f0f0;
  color: #666;
  border: none;
  border-radius: 8px;
  font-size: 14px;
  cursor: pointer;
}

.options-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  z-index: 1000;
  display: flex;
  align-items: flex-start;
  justify-content: center;
  padding-top: 100px;
}

.options-panel {
  background: #fff;
  border-radius: 12px;
  padding: 20px;
  max-width: 90%;
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
  background: #52c41a;
  color: #fff;
}

.status-tabs {
  display: flex;
  padding: 0 15px;
  margin-bottom: 15px;
  gap: 10px;
}

.status-tab {
  flex: 1;
  text-align: center;
  padding: 12px;
  background: #fff;
  border-radius: 8px;
  font-size: 14px;
  color: #666;
  cursor: pointer;
}

.status-tab.active {
  background: #52c41a;
  color: #fff;
}

.receive-list {
  padding: 0 15px;
}

.empty-state {
  text-align: center;
  padding: 60px 20px;
  color: #999;
}

.empty-icon {
  font-size: 48px;
  display: block;
  margin-bottom: 15px;
}

.receive-item {
  background: #fff;
  border-radius: 12px;
  padding: 15px;
  margin-bottom: 12px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);
}

.receive-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 10px;
}

.receive-type {
  padding: 4px 10px;
  background: #f6ffed;
  color: #52c41a;
  border-radius: 4px;
  font-size: 12px;
  font-weight: bold;
}

.receive-right {
  display: flex;
  align-items: center;
  gap: 10px;
}

.receive-time {
  font-size: 12px;
  color: #999;
}

.edit-btn {
  padding: 4px 10px;
  background: #fff7e6;
  color: #fa8c16;
  border: none;
  border-radius: 4px;
  font-size: 12px;
  cursor: pointer;
}

.receive-info {
  margin-bottom: 10px;
}

.receive-book {
  font-size: 16px;
  font-weight: bold;
  color: #333;
  display: block;
  margin-bottom: 4px;
}

.receive-detail {
  font-size: 13px;
  color: #999;
}

.receive-meta {
  display: flex;
  justify-content: space-between;
  padding-top: 10px;
  border-top: 1px solid #f5f5f5;
}

.receive-quantity, .receive-remark {
  font-size: 13px;
  color: #666;
}

.quantity-value {
  font-weight: bold;
  color: #52c41a;
}

.edit-menu-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  z-index: 1000;
  display: flex;
  align-items: flex-end;
}

.edit-menu-content {
  width: 100%;
  background: #fff;
  border-radius: 16px 16px 0 0;
  padding: 20px;
}

.edit-menu-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
}

.edit-menu-title {
  font-size: 18px;
  font-weight: bold;
  color: #333;
}

.edit-menu-close {
  font-size: 24px;
  color: #999;
  cursor: pointer;
}

.edit-menu-list {
  display: flex;
  flex-direction: column;
}

.edit-menu-item {
  display: flex;
  align-items: center;
  padding: 16px 0;
  border-bottom: 1px solid #f5f5f5;
  gap: 15px;
  font-size: 16px;
  color: #333;
  cursor: pointer;
}

.edit-menu-item.approve {
  color: #52c41a;
}

.edit-menu-item.modify {
  color: #1890ff;
}

.edit-menu-item.delete {
  color: #ff4d4f;
}

.approve-modal {
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

.approve-content {
  background: #fff;
  border-radius: 16px;
  width: 100%;
  max-width: 320px;
  padding: 20px;
}

.approve-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
}

.approve-title {
  font-size: 18px;
  font-weight: bold;
  color: #333;
}

.approve-close {
  font-size: 24px;
  color: #999;
  cursor: pointer;
}

.approve-form {
  display: flex;
  flex-direction: column;
  gap: 15px;
}

.approve-info {
  background: #f5f5f5;
  padding: 15px;
  border-radius: 8px;
}

.approve-info span {
  display: block;
  font-size: 14px;
  color: #333;
}

.approve-options {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.approve-btn {
  padding: 14px;
  border: none;
  border-radius: 8px;
  font-size: 16px;
  cursor: pointer;
}

.approve-btn.confirm {
  background: #52c41a;
  color: #fff;
}

.approve-btn.reject {
  background: #fff7e6;
  color: #fa8c16;
}

.approve-btn.cancel {
  background: #f0f0f0;
  color: #666;
}

.remark-tip {
  font-size: 12px;
  color: #999;
  text-align: center;
}

.remark-input {
  padding: 12px;
  border: 1px solid #ddd;
  border-radius: 8px;
  font-size: 14px;
}
</style>
