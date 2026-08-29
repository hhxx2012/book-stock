<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import {
  getDefaultYear, getDefaultTerm, getRole, getCampus, getUserInfo,
  canStockIn, canStockOut, canDeleteBook, canReceiveSet, canForecastSet, canStockReturn
} from '../utils/storage'
import { isCloudConnected, connectToCloud, isSupabaseConfigured } from '../utils/supabase'
import * as ds from '../services/dataService'
import type { MergedStock, LogItem } from '../types'

const router = useRouter()

const selectedYear = ref('')
const selectedTerm = ref('')
const selectedGrade = ref('')
const selectedSubject = ref('')
const showOptions = ref('')
const stockList = ref<MergedStock[]>([])
const loading = ref(false)

const years = ['2020', '2021', '2022', '2023', '2024', '2025', '2026', '2027', '2028', '2029', '2030']
const terms = ['春期', '暑期', '秋期', '冬期']
const grades = ['幼升小', '1年级', '2年级', '3年级', '4年级', '5年级', '6年级', '小升初', '7年级', '8年级', '9年级', '初升高', '高一', '高二']
const subjects = ['语文', '数学', '英语', '物理', '化学', '生物', '历史', '地理', '政治']

const canStockInVal = computed(() => canStockIn())
const canStockOutVal = computed(() => canStockOut())
const canDeleteBookVal = computed(() => canDeleteBook())
const canReceiveSetVal = computed(() => canReceiveSet())
const canForecastSetVal = computed(() => canForecastSet())
const canStockReturnVal = computed(() => canStockReturn())

// 操作弹窗相关
const showOperateModal = ref(false)
const currentBook = ref<MergedStock | null>(null)
const operateType = ref('')
const operateCampus = ref('honghe')
const operateQuantity = ref('')
const operateRemark = ref('')
const submitting = ref(false)
const returnMode = ref<'returnIn' | 'returnOut'>('returnIn') // 退回类型：退回入库/退回出库

// 日志展开相关
const expandedBookKey = ref<string | null>(null)
const bookLogs = ref<LogItem[]>([])
const logsLoading = ref(false)

// 实时同步订阅
let realtimeChannel: any = null
let refreshTimer: any = null

onMounted(async () => {
  selectedYear.value = getDefaultYear() || '2026'
  selectedTerm.value = getDefaultTerm() || '暑期'
  
  // 确保云端连接：如果配置了 Supabase 但 session 不存在，尝试重连
  if (isSupabaseConfigured()) {
    const connected = await isCloudConnected()
    if (!connected) {
      console.log('[Stock] 云端未连接，尝试重连...')
      await connectToCloud()
    }

    // 订阅实时变化，当其他设备修改数据时自动刷新
    realtimeChannel = ds.subscribeToStockChanges(() => {
      // 防抖：避免短时间内多次刷新
      if (refreshTimer) clearTimeout(refreshTimer)
      refreshTimer = setTimeout(() => {
        console.log('[Stock] 检测到数据变化，自动刷新...')
        loadStockList()
        // 如果有展开的日志，直接重新加载日志数据
        if (expandedBookKey.value && currentBook.value) {
          refreshCurrentLogs()
        }
      }, 500)
    })
  }
  
  await loadStockList()
})

onUnmounted(() => {
  // 离开页面时取消订阅
  if (realtimeChannel) {
    ds.unsubscribeFromStockChanges(realtimeChannel)
  }
  if (refreshTimer) {
    clearTimeout(refreshTimer)
  }
})

// 排序参考顺序（与系统配置一致）
const termOrder = ['春期', '暑期', '秋期', '冬期']
const gradeOrder = ['幼升小', '1年级', '2年级', '3年级', '4年级', '5年级', '6年级', '小升初', '7年级', '8年级', '9年级', '初升高', '高一', '高二']
const subjectOrder = ['语文', '数学', '英语', '物理', '化学', '生物', '历史', '地理', '政治']
const difficultyOrder = ['无', '基础', '培优', '尖子']

// 获取排序索引（找不到的排到最后）
const getSortIndex = (value: string, orderArr: string[]) => {
  const idx = orderArr.indexOf(value)
  return idx === -1 ? 999 : idx
}

const loadStockList = async () => {
  loading.value = true
  try {
    const list = await ds.fetchMergedStock({
      year: selectedYear.value,
      term: selectedTerm.value,
      grade: selectedGrade.value,
      subject: selectedSubject.value
    })
    // 按 年度 → 时期 → 年级 → 科目 → 难度 排序
    const sorted = (list as MergedStock[]).slice().sort((a, b) => {
      // 1. 年度（升序：2025 在前，2026 在后）
      const yearA = a.year || ''
      const yearB = b.year || ''
      if (yearA !== yearB) return yearA.localeCompare(yearB)
      // 2. 时期（春期 < 暑期 < 秋期 < 冬期）
      const termA = getSortIndex(a.term || '', termOrder)
      const termB = getSortIndex(b.term || '', termOrder)
      if (termA !== termB) return termA - termB
      // 3. 年级（按系统配置顺序）
      const gradeA = getSortIndex(a.grade || '', gradeOrder)
      const gradeB = getSortIndex(b.grade || '', gradeOrder)
      if (gradeA !== gradeB) return gradeA - gradeB
      // 4. 科目（按系统配置顺序）
      const subjectA = getSortIndex(a.subject || '', subjectOrder)
      const subjectB = getSortIndex(b.subject || '', subjectOrder)
      if (subjectA !== subjectB) return subjectA - subjectB
      // 5. 难度（无 < 基础 < 培优 < 尖子）
      const diffA = getSortIndex(a.difficulty || '', difficultyOrder)
      const diffB = getSortIndex(b.difficulty || '', difficultyOrder)
      return diffA - diffB
    })
    stockList.value = sorted
  } catch (err) {
    console.error('加载库存失败:', err)
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
  } else if (showOptions.value === 'grade') {
    selectedGrade.value = option
  } else if (showOptions.value === 'subject') {
    selectedSubject.value = option
  }
  showOptions.value = ''
  loadStockList()
}

const resetFilter = () => {
  selectedYear.value = getDefaultYear() || '2026'
  selectedTerm.value = getDefaultTerm() || '暑期'
  selectedGrade.value = ''
  selectedSubject.value = ''
  showOptions.value = ''
  loadStockList()
}

const openOperateModal = (book: MergedStock, type: string) => {
  currentBook.value = book
  operateType.value = type
  operateCampus.value = 'honghe'
  operateQuantity.value = ''
  operateRemark.value = ''
  returnMode.value = 'returnIn'
  showOperateModal.value = true
}

const closeOperateModal = () => {
  showOperateModal.value = false
  currentBook.value = null
}

const confirmOperate = async () => {
  if (!currentBook.value) return
  // 防重复提交：正在提交时忽略后续点击
  if (submitting.value) return
  submitting.value = true
  
  // ===== 立即把所有输入值保存到本地变量，然后关闭弹窗 =====
  // 这样第二次调用时 currentBook 为 null，直接被拦截
  const book = currentBook.value
  const userInfo = getUserInfo()
  const role = getRole()
  const userCampus = getCampus()
  const type = operateType.value
  const campus = operateCampus.value
  const qty = parseInt(operateQuantity.value)
  const remark = operateRemark.value
  
  // 关闭弹窗（第二次调用会被 !currentBook.value 拦截）
  closeOperateModal()
  
  // 权限检查
  if (type === 'stockIn' && !canStockIn()) {
    alert('无权进行入库操作')
    return
  }
  if (type === 'stockOut' && !canStockOut()) {
    alert('无权进行出库操作')
    return
  }
  if (type === 'return' && !canStockReturn()) {
    alert('无权进行退回操作')
    return
  }
  if (type === 'delete' && !canDeleteBook()) {
    alert('无权删除书本')
    return
  }
  
  // 跨校区操作权限检查
  if ((type === 'stockIn' || type === 'stockOut' || type === 'return' || type === 'forecast' || type === 'receive') &&
      role !== 'super' && userCampus !== 'all' && userCampus !== campus) {
    alert('无权操作其他校区库存')
    return
  }
  
  if (type === 'delete') {
    if (!confirm('确定要删除该书本吗？删除后数据不可恢复。')) return
    await ds.deleteBook(book.year || '', book.term || '', book.grade || '', book.subject || '', book.difficulty || '')
    alert('删除成功')
    loadStockList()
    return
  }
  
  if (!qty || qty <= 0) {
    alert('请输入有效数量')
    return
  }
  
  try {
    if (type === 'stockIn') {
      const result = await ds.stockIn({
        campus,
        year: book.year || '',
        term: book.term || '',
        grade: book.grade || '',
        subject: book.subject || '',
        difficulty: book.difficulty || '',
        bookName: book.bookName || '',
        quantity: qty,
        remark,
        operator: userInfo?.userName || userInfo?.nickName || '',
        operatorName: userInfo?.userName || userInfo?.nickName || ''
      })
      alert(result.message)
      if (result.success) {
        loadStockList()
      }
    } else if (type === 'stockOut') {
      const result = await ds.stockOut({
        campus,
        year: book.year || '',
        term: book.term || '',
        grade: book.grade || '',
        subject: book.subject || '',
        difficulty: book.difficulty || '',
        bookName: book.bookName || '',
        quantity: qty,
        remark,
        operator: userInfo?.userName || userInfo?.nickName || '',
        operatorName: userInfo?.userName || userInfo?.nickName || ''
      })
      alert(result.message)
      if (result.success) {
        loadStockList()
      }
    } else if (type === 'return') {
      // 退回操作：根据退回类型调用不同的底层操作
      if (returnMode.value === 'returnIn') {
        // 退回入库：多录入了书本，需要减少库存（调用出库逻辑）
        const result = await ds.stockOut({
          campus,
          year: book.year || '',
          term: book.term || '',
          grade: book.grade || '',
          subject: book.subject || '',
          difficulty: book.difficulty || '',
          bookName: book.bookName || '',
          quantity: qty,
          remark: remark || '退回入库',
          operator: userInfo?.userName || userInfo?.nickName || '',
          operatorName: userInfo?.userName || userInfo?.nickName || '',
          logType: 'stock_return',
          logAction: '退回入库'
        })
        alert(result.message)
        if (result.success) {
          loadStockList()
        }
      } else {
        // 退回出库：多领取了书本，需要增加库存（调用入库逻辑）
        const result = await ds.stockIn({
          campus,
          year: book.year || '',
          term: book.term || '',
          grade: book.grade || '',
          subject: book.subject || '',
          difficulty: book.difficulty || '',
          bookName: book.bookName || '',
          quantity: qty,
          remark: remark || '退回出库',
          operator: userInfo?.userName || userInfo?.nickName || '',
          operatorName: userInfo?.userName || userInfo?.nickName || '',
          logType: 'stock_return',
          logAction: '退回出库'
        })
        alert(result.message)
        if (result.success) {
          loadStockList()
        }
      }
    } else if (type === 'forecast') {
      const result = await ds.addForecast({
        type: 'forecast',
        year: book.year || '',
        term: book.term || '',
        grade: book.grade || '',
        subject: book.subject || '',
        difficulty: book.difficulty || '',
        bookName: book.bookName || '',
        campus,
        campusName: campus === 'honghe' ? '洪河校区' : '龙华校区',
        quantity: qty,
        remark,
        operator: userInfo?.userName || userInfo?.nickName || '',
        operatorName: userInfo?.userName || userInfo?.nickName || '',
        status: 'pending'
      })
      alert(result.success ? '预计设置成功' : (result.error || '操作失败'))
    } else if (type === 'receive') {
      const result = await ds.addForecast({
        type: 'receive',
        year: book.year || '',
        term: book.term || '',
        grade: book.grade || '',
        subject: book.subject || '',
        difficulty: book.difficulty || '',
        bookName: book.bookName || '',
        campus,
        campusName: campus === 'honghe' ? '洪河校区' : '龙华校区',
        quantity: qty,
        remark,
        operator: userInfo?.userName || userInfo?.nickName || '',
        operatorName: userInfo?.userName || userInfo?.nickName || '',
        status: 'pending'
      })
      alert(result.success ? '领取设置成功' : (result.error || '操作失败'))
    }
  } catch (err) {
    console.error('[confirmOperate] 操作失败:', err)
  } finally {
    submitting.value = false
  }
}

const goToQrcode = (book: MergedStock) => {
  const id = `${book.year}-${book.term}-${book.grade}-${book.subject}-${book.difficulty}`
  router.push(`/qrcode/${encodeURIComponent(id)}`)
}

const formatStock = (qty: number) => {
  return qty >= 0 ? qty : 0
}

// 获取书本的唯一标识 key
const getBookKey = (book: MergedStock) => {
  return `${book.year}-${book.term}-${book.grade}-${book.subject}-${book.difficulty}`
}

// 切换日志展开/折叠
const toggleLogs = async (book: MergedStock) => {
  const key = getBookKey(book)
  if (expandedBookKey.value === key) {
    expandedBookKey.value = null
    bookLogs.value = []
    return
  }
  expandedBookKey.value = key
  bookLogs.value = []
  logsLoading.value = true
  try {
    const filters = {
      year: book.year || '',
      term: book.term || '',
      grade: book.grade || '',
      subject: book.subject || '',
      difficulty: book.difficulty || ''
    }
    console.log('[toggleLogs] 查询日志，筛选条件:', filters)
    const logs = await ds.fetchStockLogs(filters)
    console.log('[toggleLogs] 查到日志数量:', logs.length, logs)
    bookLogs.value = logs as LogItem[]
  } catch (err) {
    console.error('[toggleLogs] 加载日志失败:', err)
  } finally {
    logsLoading.value = false
  }
}

// 实时刷新当前展开的日志（不折叠/展开，直接更新数据）
const refreshCurrentLogs = async () => {
  if (!currentBook.value) return
  const book = currentBook.value
  try {
    const logs = await ds.fetchStockLogs({
      year: book.year || '',
      term: book.term || '',
      grade: book.grade || '',
      subject: book.subject || '',
      difficulty: book.difficulty || ''
    })
    console.log('[refreshCurrentLogs] 刷新日志数量:', logs.length)
    bookLogs.value = logs as LogItem[]
  } catch (err) {
    console.error('[refreshCurrentLogs] 刷新日志失败:', err)
  }
}

// 格式化时间
const formatTime = (timestamp: number) => {
  const date = new Date(timestamp)
  return `${date.getMonth() + 1}月${date.getDate()}日 ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
}

// 日志类型标签
const getLogTypeLabel = (type: string, action?: string) => {
  switch (type) {
    case 'stock_in': return { text: '入库', color: '#52c41a' }
    case 'stock_out': return { text: '出库', color: '#ff4d4f' }
    case 'stock_return': return { text: action || '退回', color: '#722ed1' }
    default: return { text: type, color: '#666' }
  }
}
</script>

<template>
  <div class="stock-page">
    <div class="page-header">
      <h1 class="page-title">📦 库存查询</h1>
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
      <div class="filter-row">
        <div class="filter-item" @click="selectFilter('grade')">
          <span class="filter-label">年级</span>
          <span class="filter-value">{{ selectedGrade || '请选择' }}</span>
        </div>
        <div class="filter-item" @click="selectFilter('subject')">
          <span class="filter-label">科目</span>
          <span class="filter-value">{{ selectedSubject || '请选择' }}</span>
        </div>
      </div>
      <div class="filter-actions">
        <button class="btn-filter" @click="loadStockList">查询</button>
        <button class="btn-reset" @click="resetFilter">重置</button>
      </div>
    </div>
    
    <div v-if="showOptions" class="options-overlay" @click="showOptions = ''">
      <div class="options-panel">
        <div 
          v-for="option in (showOptions === 'year' ? years : showOptions === 'term' ? terms : showOptions === 'grade' ? grades : subjects)" 
          :key="option"
          class="option-item"
          :class="{ active: (showOptions === 'year' ? selectedYear : showOptions === 'term' ? selectedTerm : showOptions === 'grade' ? selectedGrade : selectedSubject) === option }"
          @click.stop="confirmFilter(option)"
        >
          {{ option }}
        </div>
      </div>
    </div>
    
    <div class="stock-list">
      <div v-if="loading" class="loading-state">
        <span class="loading-icon">⏳</span>
        <span>加载中...</span>
      </div>
      <div v-else-if="stockList.length === 0" class="empty-state">
        <span class="empty-icon">📚</span>
        <span>暂无库存数据</span>
      </div>
      <div v-for="book in stockList" :key="`${book.year}-${book.term}-${book.grade}-${book.subject}-${book.difficulty}`" class="stock-card">
        <div class="card-header">
          <div class="book-title">{{ book.bookName || `${book.subject}` }}</div>
          <button class="edit-btn" @click="openOperateModal(book, '')">编辑</button>
        </div>
        <div class="card-info">
          <span class="info-tag">{{ book.year }}年{{ book.term }}</span>
          <span class="info-tag">{{ book.grade }}</span>
          <span class="info-tag">{{ book.difficulty }}</span>
        </div>
        <div class="card-stock compact">
          <div class="stock-col">
            <span class="stock-campus">洪河</span>
            <span class="stock-num" :class="{ warning: (book.hongheStock || 0) < 10 }">{{ formatStock(book.hongheStock || 0) }}</span>
            <span class="stock-io">入{{ book.hongheTotalIn || 0 }}/出{{ book.hongheTotalOut || 0 }}</span>
          </div>
          <div class="stock-col">
            <span class="stock-campus">龙华</span>
            <span class="stock-num" :class="{ warning: (book.longhuaStock || 0) < 10 }">{{ formatStock(book.longhuaStock || 0) }}</span>
            <span class="stock-io">入{{ book.longhuaTotalIn || 0 }}/出{{ book.longhuaTotalOut || 0 }}</span>
          </div>
          <div class="stock-col total">
            <span class="stock-campus">合计</span>
            <span class="stock-num">{{ formatStock(book.hongheStock || 0) + formatStock(book.longhuaStock || 0) }}</span>
            <span class="stock-io">入{{ (book.hongheTotalIn || 0) + (book.longhuaTotalIn || 0) }}/出{{ (book.hongheTotalOut || 0) + (book.longhuaTotalOut || 0) }}</span>
          </div>
        </div>
        <div class="card-footer">
          <button class="log-toggle-btn" @click="toggleLogs(book)">
            {{ expandedBookKey === getBookKey(book) ? '🔼 收起日志' : '📋 查看日志' }}
          </button>
          <button class="qrcode-btn" @click="goToQrcode(book)">📱 二维码</button>
        </div>
        <!-- 出入库日志区域 -->
        <div v-if="expandedBookKey === getBookKey(book)" class="log-section">
          <div v-if="logsLoading" class="log-loading">⏳ 加载日志...</div>
          <div v-else-if="bookLogs.length === 0" class="log-empty">暂无出入库记录</div>
          <div v-else class="log-list">
            <div v-for="log in bookLogs" :key="log._id" class="log-item">
              <div class="log-main">
                <span class="log-type" :style="{ color: getLogTypeLabel(log.type, log.action).color }">{{ getLogTypeLabel(log.type, log.action).text }}</span>
                <span class="log-campus">{{ log.campus === 'honghe' ? '洪河' : log.campus === 'longhua' ? '龙华' : log.campus }}</span>
                <span class="log-qty" :class="log.type === 'stock_in' ? 'in' : (log.type === 'stock_out' ? 'out' : 'return')">{{ log.type === 'stock_in' ? '+' : (log.type === 'stock_out' ? '-' : '~') }}{{ log.quantity }}</span>
              </div>
              <div class="log-detail">
                <span class="log-operator">{{ log.operatorName || log.operator }}</span>
                <span class="log-note" v-if="log.note">· {{ log.note }}</span>
                <span class="log-time">{{ formatTime(log.createTime) }}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
    
    <!-- 操作弹窗 -->
    <div v-if="showOperateModal" class="modal-overlay" @click="closeOperateModal">
      <div class="modal-content" @click.stop>
        <div class="modal-header">
          <h3 class="modal-title">书本操作</h3>
          <span class="modal-close" @click="closeOperateModal">✕</span>
        </div>
        <div v-if="!operateType" class="operate-menu">
          <button 
            v-if="canStockInVal" 
            class="menu-item primary" 
            @click="operateType = 'stockIn'"
          >📥 入库</button>
          <button 
            v-if="canStockOutVal" 
            class="menu-item warning" 
            @click="operateType = 'stockOut'"
          >📤 出库</button>
          <button 
            v-if="canStockReturnVal" 
            class="menu-item return" 
            @click="operateType = 'return'"
          >↩️ 退回</button>
          <button 
            v-if="canForecastSetVal" 
            class="menu-item" 
            @click="operateType = 'forecast'"
          >📝 预计</button>
          <button 
            v-if="canReceiveSetVal" 
            class="menu-item" 
            @click="operateType = 'receive'"
          >🎁 领取</button>
          <button 
            v-if="canDeleteBookVal" 
            class="menu-item danger" 
            @click="operateType = 'delete'"
          >🗑️ 删除</button>
        </div>
        <div v-else class="operate-form">
          <div v-if="operateType === 'delete'" class="delete-warning">
            <div class="warning-icon">⚠️</div>
            <div class="warning-text">
              <p>确定要删除 <strong>{{ currentBook?.bookName }}</strong> 吗？</p>
              <p class="warning-sub">此操作将删除该书的所有库存、日志、预计和领取记录，不可恢复。</p>
            </div>
          </div>
          <div v-else>
            <!-- 退回类型选择器 -->
            <div v-if="operateType === 'return'" class="form-group">
              <label>退回类型</label>
              <div class="campus-options">
                <button 
                  class="campus-option" 
                  :class="{ active: returnMode === 'returnIn' }"
                  @click="returnMode = 'returnIn'"
                >📥 退回入库</button>
                <button 
                  class="campus-option" 
                  :class="{ active: returnMode === 'returnOut' }"
                  @click="returnMode = 'returnOut'"
                >📤 退回出库</button>
              </div>
              <p class="return-tip">{{ returnMode === 'returnIn' ? '多录入了书本，从库存中退回' : '多领取了书本，退回到库存中' }}</p>
            </div>
            <div class="form-group">
              <label>校区</label>
              <div class="campus-options">
                <button 
                  class="campus-option" 
                  :class="{ active: operateCampus === 'honghe' }"
                  @click="operateCampus = 'honghe'"
                >🏫 洪河校区</button>
                <button 
                  class="campus-option" 
                  :class="{ active: operateCampus === 'longhua' }"
                  @click="operateCampus = 'longhua'"
                >🏢 龙华校区</button>
              </div>
            </div>
            <div class="form-group">
              <label>数量</label>
              <input 
                type="number" 
                class="form-input" 
                v-model="operateQuantity" 
                placeholder="请输入数量"
              />
            </div>
            <div class="form-group">
              <label>备注</label>
              <input 
                type="text" 
                class="form-input" 
                v-model="operateRemark" 
                placeholder="请输入备注"
              />
            </div>
          </div>
          <button class="btn-confirm" @click="confirmOperate" :disabled="submitting" :class="{ 'btn-danger': operateType === 'delete' }">{{ submitting ? '提交中...' : '确认' + (operateType === 'stockIn' ? '入库' : operateType === 'stockOut' ? '出库' : operateType === 'return' ? (returnMode === 'returnIn' ? '退回入库' : '退回出库') : operateType === 'forecast' ? '预计' : operateType === 'receive' ? '领取' : '删除') }}</button>
          <button class="btn-cancel" @click="operateType = ''">返回</button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.stock-page {
  min-height: 100vh;
  background-color: #f5f5f5;
  padding-bottom: 80px;
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
  margin-bottom: 12px;
}

.filter-item {
  flex: 1;
  padding: 12px;
  background: #f5f5f5;
  border-radius: 8px;
  cursor: pointer;
}

.filter-item:active {
  transform: scale(0.98);
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
  background: #1890ff;
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
  border: 2px solid transparent;
}

.option-item.active {
  background: #1890ff;
  color: #fff;
}

.stock-list {
  padding: 0 15px;
}

.loading-state, .empty-state {
  text-align: center;
  padding: 60px 20px;
  color: #999;
}

.loading-icon, .empty-icon {
  font-size: 48px;
  display: block;
  margin-bottom: 15px;
}

.stock-card {
  background: #fff;
  border-radius: 12px;
  padding: 15px;
  margin-bottom: 12px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 10px;
}

.book-title {
  font-size: 16px;
  font-weight: bold;
  color: #333;
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

.card-info {
  display: flex;
  gap: 8px;
  margin-bottom: 12px;
}

.info-tag {
  padding: 2px 8px;
  background: #f5f5f5;
  border-radius: 4px;
  font-size: 12px;
  color: #666;
}

.card-stock {
  display: flex;
  justify-content: space-between;
  padding: 10px 0;
  border-top: 1px solid #f5f5f5;
  border-bottom: 1px solid #f5f5f5;
}

.stock-item {
  text-align: center;
}

.stock-item.total {
  border-left: 1px solid #f5f5f5;
  padding-left: 15px;
}

.stock-label {
  display: block;
  font-size: 12px;
  color: #999;
  margin-bottom: 4px;
}

.stock-value {
  font-size: 18px;
  font-weight: bold;
  color: #333;
}

.stock-value.warning {
  color: #faad14;
}

/* 紧凑版库存展示 */
.card-stock.compact {
  display: flex;
  justify-content: space-around;
  padding: 10px 0;
  border-top: 1px solid #f5f5f5;
  border-bottom: 1px solid #f5f5f5;
}

.stock-col {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
}

.stock-col.total {
  border-left: 1px solid #f0f0f0;
  padding-left: 15px;
}

.stock-campus {
  font-size: 12px;
  color: #999;
}

.stock-num {
  font-size: 20px;
  font-weight: bold;
  color: #333;
}

.stock-num.warning {
  color: #faad14;
}

.stock-io {
  font-size: 11px;
  color: #999;
}

.card-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-top: 10px;
}

.log-toggle-btn {
  padding: 6px 12px;
  background: #f6ffed;
  color: #52c41a;
  border: none;
  border-radius: 4px;
  font-size: 12px;
  cursor: pointer;
}

.qrcode-btn {
  padding: 6px 12px;
  background: #e6f7ff;
  color: #1890ff;
  border: none;
  border-radius: 4px;
  font-size: 12px;
  cursor: pointer;
}

/* 日志区域样式 */
.log-section {
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px dashed #e8e8e8;
}

.log-loading, .log-empty {
  text-align: center;
  padding: 12px;
  font-size: 13px;
  color: #999;
}

.log-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.log-item {
  background: #fafafa;
  border-radius: 8px;
  padding: 10px 12px;
}

.log-main {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 4px;
}

.log-type {
  font-size: 13px;
  font-weight: bold;
  padding: 2px 8px;
  background: #fff;
  border-radius: 4px;
}

.log-campus {
  font-size: 12px;
  color: #666;
}

.log-qty {
  font-size: 14px;
  font-weight: bold;
  margin-left: auto;
}

.log-qty.in {
  color: #52c41a;
}

.log-qty.out {
  color: #ff4d4f;
}

.log-qty.return {
  color: #722ed1;
}

.return-tip {
  font-size: 12px;
  color: #999;
  margin-top: 6px;
  padding: 6px 10px;
  background: #f9f0ff;
  border-radius: 6px;
}

.log-detail {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  color: #999;
  flex-wrap: wrap;
}

.log-operator {
  color: #666;
}

.log-note {
  color: #999;
  max-width: 150px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.log-time {
  margin-left: auto;
  font-size: 11px;
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

.operate-menu {
  padding: 20px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.menu-item {
  padding: 15px;
  background: #f5f5f5;
  border: none;
  border-radius: 8px;
  font-size: 16px;
  cursor: pointer;
}

.menu-item.primary {
  background: #e6f7ff;
  color: #1890ff;
}

.menu-item.warning {
  background: #fff7e6;
  color: #fa8c16;
}

.menu-item.danger {
  background: #fff2f0;
  color: #ff4d4f;
}

.menu-item.return {
  background: #f9f0ff;
  color: #722ed1;
}

.operate-form {
  padding: 20px;
}

.form-group {
  margin-bottom: 15px;
}

.form-group label {
  display: block;
  font-size: 14px;
  font-weight: bold;
  color: #333;
  margin-bottom: 8px;
}

.campus-options {
  display: flex;
  gap: 10px;
}

.campus-option {
  flex: 1;
  padding: 10px;
  background: #f5f5f5;
  border: 2px solid transparent;
  border-radius: 8px;
  font-size: 14px;
  cursor: pointer;
}

.campus-option.active {
  background: #e6f7ff;
  border-color: #1890ff;
  color: #1890ff;
}

.form-input {
  width: 100%;
  padding: 12px;
  border: 1px solid #ddd;
  border-radius: 8px;
  font-size: 14px;
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
  margin-bottom: 10px;
}

.btn-cancel {
  width: 100%;
  padding: 14px;
  background: #f0f0f0;
  color: #666;
  border: none;
  border-radius: 8px;
  font-size: 16px;
  cursor: pointer;
}

.btn-danger {
  background: #ff4d4f !important;
}

.delete-warning {
  text-align: center;
  padding: 20px 10px;
  margin-bottom: 15px;
}

.warning-icon {
  font-size: 48px;
  margin-bottom: 15px;
}

.warning-text {
  font-size: 14px;
  color: #333;
  line-height: 1.6;
}

.warning-text strong {
  color: #ff4d4f;
}

.warning-sub {
  font-size: 12px;
  color: #999;
  margin-top: 8px;
}
</style>
