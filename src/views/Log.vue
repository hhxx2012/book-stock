<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { getUserInfo } from '../utils/storage'
import * as ds from '../services/dataService'
import type { LogItem, BookItem } from '../types'

const logList = ref<LogItem[]>([])
const bookList = ref<BookItem[]>([])
const filterType = ref('')
const loading = ref(false)

const userInfo = getUserInfo()

const typeOptions = [
  { value: '', label: '全部' },
  { value: 'stock_in', label: '入库' },
  { value: 'stock_out', label: '出库' },
  { value: 'stock_return', label: '退回' },
  { value: 'forecast', label: '预计' },
  { value: 'receive', label: '领取' }
]

onMounted(() => {
  loadLogs()
})

const loadLogs = async () => {
  loading.value = true
  try {
    // 并行加载日志和书本列表
    const [logs, books] = await Promise.all([
      ds.fetchLogs(),
      ds.fetchBooks()
    ])
    bookList.value = books as BookItem[]
    
    let filteredLogs = logs as LogItem[]
    
    if (userInfo.role === 'educational' && userInfo.campus !== 'all') {
      filteredLogs = filteredLogs.filter((log: LogItem) => log.campus === userInfo.campus)
    }
    
    if (userInfo.role === 'teacher') {
      filteredLogs = filteredLogs.filter((log: LogItem) => log.userId === userInfo._id)
    }
    
    logList.value = filteredLogs.sort((a: LogItem, b: LogItem) => 
      (b.createTime || b.createdAt || 0) - (a.createTime || a.createdAt || 0)
    )
  } finally {
    loading.value = false
  }
}

const filteredLogs = computed(() => {
  if (!filterType.value) return logList.value
  return logList.value.filter((log: LogItem) => log.type === filterType.value)
})

const getBookName = (bookCode: string): string => {
  const book = bookList.value.find((b: BookItem) => b.bookCode === bookCode)
  return book ? book.bookName : bookCode
}

const getTypeName = (type: string, action?: string): string => {
  if (type === 'stock_return' && action) return action
  const option = typeOptions.find(o => o.value === type)
  return option ? option.label : type
}

const getCampusName = (campus: string): string => {
  return campus === 'honghe' ? '洪河校区' : campus === 'longhua' ? '龙华校区' : campus
}

const formatLogTime = (log: LogItem) => {
  const time = log.createdAt || log.createTime || 0
  if (!time) return '-'
  return new Date(time).toLocaleString()
}
</script>

<template>
  <div class="log-page">
    <div class="page-header">
      <h1 class="page-title">📋 操作日志</h1>
    </div>
    
    <div class="filter-bar">
      <select class="filter-select" v-model="filterType">
        <option v-for="option in typeOptions" :key="option.value" :value="option.value">
          {{ option.label }}
        </option>
      </select>
    </div>
    
    <div class="log-list">
      <div v-if="filteredLogs.length === 0" class="empty-state">
        <span class="empty-icon">📋</span>
        <span>暂无日志数据</span>
      </div>
      <div v-for="log in filteredLogs" :key="log._id" class="log-card">
        <div class="log-header">
          <span class="log-type" :class="log.type">{{ getTypeName(log.type || '', log.action) }}</span>
          <span class="log-time">{{ formatLogTime(log) }}</span>
        </div>
        <div class="log-content">
          <div class="log-item">
            <span class="label">书本：</span>
            <span>{{ log.bookName || getBookName(log.bookCode || '') }}</span>
          </div>
          <div class="log-item">
            <span class="label">校区：</span>
            <span>{{ getCampusName(log.campus || '') }}</span>
          </div>
          <div class="log-item" v-if="log.quantity">
            <span class="label">数量：</span>
            <span>{{ log.quantity }}本</span>
          </div>
          <div class="log-item" v-if="log.note">
            <span class="label">备注：</span>
            <span>{{ log.note }}</span>
          </div>
          <div class="log-item" v-if="log.studentName">
            <span class="label">领取人：</span>
            <span>{{ log.studentName }}</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.log-page {
  min-height: 100vh;
  background-color: #f5f5f5;
  padding-bottom: 120px;
}

.page-header {
  background: linear-gradient(135deg, #1890ff 0%, #096dd9 100%);
  padding: 20px;
  text-align: center;
}

.page-title {
  font-size: 20px;
  font-weight: bold;
  color: #fff;
}

.filter-bar {
  padding: 15px;
  background: #fff;
}

.filter-select {
  width: 100%;
  padding: 12px;
  border: 1px solid #ddd;
  border-radius: 8px;
  font-size: 14px;
}

.log-list {
  padding: 15px;
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

.log-card {
  background: #fff;
  border-radius: 12px;
  padding: 15px;
  margin-bottom: 12px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);
}

.log-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 10px;
}

.log-type {
  padding: 4px 12px;
  border-radius: 16px;
  font-size: 12px;
  font-weight: bold;
}

.log-type.stock_in {
  background: #f6ffed;
  color: #52c41a;
}

.log-type.stock_out {
  background: #fff7e6;
  color: #fa8c16;
}

.log-type.forecast {
  background: #e6f7ff;
  color: #1890ff;
}

.log-type.receive {
  background: #f9f0ff;
  color: #722ed1;
}

.log-type.stock_return {
  background: #fff0f6;
  color: #eb2f96;
}

.log-time {
  font-size: 12px;
  color: #999;
}

.log-content {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.log-item {
  font-size: 14px;
  color: #333;
}

.label {
  color: #999;
}
</style>
