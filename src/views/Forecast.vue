<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { 
  getDefaultYear, getDefaultTerm, getRole, getCampus, getUserInfo,
  canForecastApprove, canForecastModify, canForecastDelete, canForecastStats,
  isEducational, isTeacher
} from '../utils/storage'
import * as ds from '../services/dataService'
import { getForecastData, setForecastData, getStockData, setStockData, getLogData, setLogData, generateId } from '../utils/mockData'
import type { ForecastItem, StatsItem, StockItem, LogItem } from '../types'

const selectedYear = ref('')
const selectedTerm = ref('')
const showOptions = ref('')
const currentStatus = ref('pending')
const forecastList = ref<ForecastItem[]>([])

const years = ['2020', '2021', '2022', '2023', '2024', '2025', '2026', '2027', '2028', '2029', '2030']
const terms = ['春期', '暑期', '秋期', '冬期']

const canApprove = computed(() => canForecastApprove())
const canModify = computed(() => canForecastModify())
const canDelete = computed(() => canForecastDelete())
const canViewStats = computed(() => canForecastStats())

// 编辑菜单
const showEditMenu = ref(false)
const editItem = ref<ForecastItem | null>(null)
const submitting = ref(false)

// 修改弹窗
const showModifyModal = ref(false)
const modifyItem = ref<ForecastItem | null>(null)
const modifyCampus = ref('')
const modifyQuantity = ref('')
const modifyRemark = ref('')

// 审批调整弹窗（库存不足时弹出）
const showApproveAdjustModal = ref(false)
const approveAdjustItem = ref<ForecastItem | null>(null)
const approveAdjustQuantity = ref('')
const approveAdjustStock = ref(0)

// 统计弹窗
const showStatsModal = ref(false)
const statsList = ref<StatsItem[]>([])
const statsSubjects = ref<string[]>([])
const selectedStatsSubject = ref('')
const filteredStatsList = ref<StatsItem[]>([])

// 统计操作弹窗
const showStatsActionModal = ref(false)
const currentStatsItem = ref<StatsItem | null>(null)
const statsEditHongheQty = ref('')
const statsEditLonghuaQty = ref('')
const statsEditHongheRemark = ref('')
const statsEditLonghuaRemark = ref('')
const showStatsEditModal = ref(false)
const showStatsStockInModal = ref(false)
const statsStockInHongheQty = ref('')
const statsStockInLonghuaQty = ref('')
const statsSubmitting = ref(false)

onMounted(() => {
  selectedYear.value = getDefaultYear() || '2026'
  selectedTerm.value = getDefaultTerm() || '暑期'
  loadForecastList()
})

const loadForecastList = async () => {
  let list = await ds.fetchForecasts()
  list = list.filter((item: ForecastItem) => item.type === 'forecast')
  
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
  forecastList.value = list
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
  loadForecastList()
}

const resetFilter = () => {
  selectedYear.value = getDefaultYear() || '2026'
  selectedTerm.value = getDefaultTerm() || '暑期'
  showOptions.value = ''
  loadForecastList()
}

const setCurrentStatus = (status: string) => {
  currentStatus.value = status
  loadForecastList()
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

const approveForecast = async () => {
  if (!editItem.value) return
  
  // 防重复提交
  if (submitting.value) return
  submitting.value = true
  
  const item = editItem.value
  const userInfo = getUserInfo()
  const campus = item.campus || 'honghe'
  const forecastQty = item.quantity || 0
  
  // 先查询该书本在当前校区的库存
  const stockList = await ds.fetchStock()
  const stockRecord = stockList.find((s: any) =>
    s.campus === campus &&
    s.year === item.year &&
    s.term === item.term &&
    s.grade === item.grade &&
    s.subject === item.subject &&
    s.difficulty === (item.difficulty || '')
  )
  const availableStock = stockRecord?.remainingStock || 0
  
  // 库存 >= 预计数量：库存充足，直接扣除预计数量，无需调整
  if (availableStock >= forecastQty) {
    await doApproveStockOut(item, forecastQty, 0, userInfo)
    closeEditMenu()
    await loadForecastList()
    submitting.value = false
    return
  }
  
  // 库存 < 预计数量：库存不足，弹出调整弹窗
  // 调整数量默认 = 预计数量 - 库存数量（缺口）
  submitting.value = false
  approveAdjustItem.value = item
  approveAdjustStock.value = availableStock
  approveAdjustQuantity.value = (forecastQty - availableStock).toString()
  closeEditMenu()
  showApproveAdjustModal.value = true
}

// 执行实际审批出库
// 参数：item = 预计记录，stockOutQty = 从库存扣除的数量，statisticsQty = 加入统计的数量，userInfo = 当前用户
const doApproveStockOut = async (item: ForecastItem, stockOutQty: number, statisticsQty: number, userInfo: any) => {
  // 如果有库存可扣，执行出库
  if (stockOutQty > 0) {
    const stockOutResult = await ds.stockOut({
      campus: item.campus || 'honghe',
      year: item.year || '',
      term: item.term || '',
      grade: item.grade || '',
      subject: item.subject || '',
      difficulty: item.difficulty || '',
      bookName: item.bookName || item.subject || '',
      quantity: stockOutQty,
      remark: '预计审批扣除库存',
      operator: userInfo?.userName || userInfo?.nickName || '',
      operatorName: userInfo?.userName || userInfo?.nickName || ''
    })

    if (!stockOutResult.success) {
      alert('库存扣除失败：' + (stockOutResult.message || '库存不足'))
      return false
    }
  }

  // 更新预计记录：数量改为统计数量，状态改为已处理
  const updates: any = { status: 'processed', quantity: statisticsQty }

  const result = await ds.updateForecast(item._id, updates)
  if (result.success) {
    if (stockOutQty > 0 && statisticsQty > 0) {
      alert(`已同意：扣除库存 ${stockOutQty} 本，统计 ${statisticsQty} 本（待入库）`)
    } else if (stockOutQty > 0) {
      alert(`已同意：扣除库存 ${stockOutQty} 本，库存充足无缺口`)
    } else {
      alert(`已同意：库存为0，统计 ${statisticsQty} 本（待入库）`)
    }
    return true
  } else {
    alert('操作失败：' + (result.error || '未知错误'))
    return false
  }
}

// 关闭调整弹窗
const closeApproveAdjustModal = () => {
  showApproveAdjustModal.value = false
  approveAdjustItem.value = null
}

// 确认调整后的数量并审批
// 库存不足时：扣除全部库存，调整数量（缺口）加入统计
const confirmApproveAdjust = async () => {
  if (!approveAdjustItem.value) return
  
  if (submitting.value) return
  submitting.value = true
  
  const qty = parseInt(approveAdjustQuantity.value) || 0
  if (qty < 0) {
    alert('调整数量不能为负数')
    submitting.value = false
    return
  }
  
  const item = approveAdjustItem.value
  const userInfo = getUserInfo()
  
  // 扣除全部库存，调整数量加入统计
  const success = await doApproveStockOut(item, approveAdjustStock.value, qty, userInfo)
  if (success) {
    closeApproveAdjustModal()
    await loadForecastList()
  }
  submitting.value = false
}

const modifyForecast = () => {
  if (!editItem.value) return
  modifyItem.value = editItem.value
  modifyCampus.value = editItem.value.campus || 'honghe'
  modifyQuantity.value = editItem.value.quantity.toString()
  modifyRemark.value = editItem.value.remark || ''
  showEditMenu.value = false
  showModifyModal.value = true
}

const closeModifyModal = () => {
  showModifyModal.value = false
  modifyItem.value = null
}

const confirmModify = async () => {
  if (!modifyItem.value) return
  
  const qty = parseInt(modifyQuantity.value)
  if (!qty || qty <= 0) {
    alert('请输入有效数量')
    return
  }
  
  await ds.updateForecast(modifyItem.value._id, {
    quantity: qty,
    remark: modifyRemark.value,
    status: 'pending'
  })
  alert('修改成功，已返回未处理')
  closeModifyModal()
  await loadForecastList()
}

const deleteForecast = async () => {
  if (!editItem.value) return
  
  if (confirm('确定要删除这条预计记录吗？')) {
    await ds.deleteForecasts([editItem.value._id])
    alert('已删除')
    closeEditMenu()
    await loadForecastList()
  }
}

const openStatsModal = async () => {
  const forecastListData = await ds.fetchForecasts()
  const processedList = forecastListData.filter((item: ForecastItem) => item.type === 'forecast' && item.status === 'processed')
  
  const subjects = [...new Set(processedList.map((item: ForecastItem) => item.subject))]
  const firstSubject = subjects.length > 0 ? subjects[0] : ''
  
  const statsMap: Record<string, StatsItem> = {}
  processedList.forEach((item: ForecastItem) => {
    const key = `${item.subject}-${item.grade}-${item.difficulty}`
    if (!statsMap[key]) {
      statsMap[key] = {
        key: key,
        subject: item.subject,
        grade: item.grade,
        difficulty: item.difficulty,
        hongheQuantity: 0,
        longhuaQuantity: 0,
        totalQuantity: 0,
        hongheIds: [],
        longhuaIds: [],
        bookName: item.bookName || ''
      }
    }
    const qty = item.quantity || 0
    if (item.campus === 'honghe') {
      statsMap[key].hongheQuantity += qty
      statsMap[key].hongheIds.push(item._id)
    } else if (item.campus === 'longhua') {
      statsMap[key].longhuaQuantity += qty
      statsMap[key].longhuaIds.push(item._id)
    }
    statsMap[key].totalQuantity += qty
  })
  
  const statsListData = Object.values(statsMap)
  
  statsList.value = statsListData
  statsSubjects.value = subjects
  selectedStatsSubject.value = firstSubject
  filteredStatsList.value = firstSubject ? statsListData.filter(item => item.subject === firstSubject) : statsListData
  showStatsModal.value = true
}

const selectStatsSubject = (subject: string) => {
  selectedStatsSubject.value = subject
  filteredStatsList.value = statsList.value.filter(item => item.subject === subject)
}

const closeStatsModal = () => {
  showStatsModal.value = false
}

const openStatsActionModal = (item: StatsItem) => {
  currentStatsItem.value = item
  showStatsActionModal.value = true
}

const closeStatsActionModal = () => {
  showStatsActionModal.value = false
}

const openStatsEditModal = () => {
  if (!currentStatsItem.value) return
  statsEditHongheQty.value = currentStatsItem.value.hongheQuantity.toString()
  statsEditLonghuaQty.value = currentStatsItem.value.longhuaQuantity.toString()
  statsEditHongheRemark.value = ''
  statsEditLonghuaRemark.value = ''
  showStatsActionModal.value = false
  showStatsEditModal.value = true
}

const closeStatsEditModal = () => {
  showStatsEditModal.value = false
}

const handleStatsModify = async () => {
  if (!currentStatsItem.value) return
  
  if (statsSubmitting.value) return
  statsSubmitting.value = true

  const hongheQty = parseInt(statsEditHongheQty.value) || 0
  const longhuaQty = parseInt(statsEditLonghuaQty.value) || 0

  if (hongheQty < 0 || longhuaQty < 0) {
    alert('数量不能为负数')
    statsSubmitting.value = false
    return
  }

  if (hongheQty === 0 && longhuaQty === 0) {
    alert('至少保留一个校区的数量')
    statsSubmitting.value = false
    return
  }

  const item = currentStatsItem.value

  if (await ds.isReallyOnline()) {
    // 在线模式
    // 处理洪河校区
    if (hongheQty > 0) {
      if (item.hongheIds.length > 0) {
        const [firstId, ...restIds] = item.hongheIds
        const updates: Partial<ForecastItem> = { quantity: hongheQty }
        if (statsEditHongheRemark.value) updates.remark = statsEditHongheRemark.value
        await ds.updateForecast(firstId, updates)
        if (restIds.length > 0) {
          await ds.deleteForecasts(restIds)
        }
      } else {
        await ds.addForecast({
          type: 'forecast',
          bookName: `${item.grade}${item.subject}${item.difficulty || ''}`,
          year: selectedYear.value,
          term: selectedTerm.value,
          grade: item.grade,
          subject: item.subject,
          difficulty: item.difficulty,
          campus: 'honghe',
          campusName: '洪河校区',
          quantity: hongheQty,
          remark: statsEditHongheRemark.value || '',
          status: 'processed',
          operator: 'admin',
          operatorName: '管理员',
          createTime: Date.now()
        })
      }
    } else {
      if (item.hongheIds.length > 0) {
        await ds.deleteForecasts(item.hongheIds)
      }
    }

    // 处理龙华校区
    if (longhuaQty > 0) {
      if (item.longhuaIds.length > 0) {
        const [firstId, ...restIds] = item.longhuaIds
        const updates: Partial<ForecastItem> = { quantity: longhuaQty }
        if (statsEditLonghuaRemark.value) updates.remark = statsEditLonghuaRemark.value
        await ds.updateForecast(firstId, updates)
        if (restIds.length > 0) {
          await ds.deleteForecasts(restIds)
        }
      } else {
        await ds.addForecast({
          type: 'forecast',
          bookName: `${item.grade}${item.subject}${item.difficulty || ''}`,
          year: selectedYear.value,
          term: selectedTerm.value,
          grade: item.grade,
          subject: item.subject,
          difficulty: item.difficulty,
          campus: 'longhua',
          campusName: '龙华校区',
          quantity: longhuaQty,
          remark: statsEditLonghuaRemark.value || '',
          status: 'processed',
          operator: 'admin',
          operatorName: '管理员',
          createTime: Date.now()
        })
      }
    } else {
      if (item.longhuaIds.length > 0) {
        await ds.deleteForecasts(item.longhuaIds)
      }
    }
  } else {
    // 离线模式 - 保留原有逻辑
    const forecastListData = getForecastData()

    // 处理洪河校区
    if (hongheQty > 0) {
      if (item.hongheIds.length > 0) {
        const [firstId, ...restIds] = item.hongheIds
        const idx = forecastListData.findIndex((f: ForecastItem) => f._id === firstId)
        if (idx >= 0) {
          forecastListData[idx].quantity = hongheQty
          if (statsEditHongheRemark.value) forecastListData[idx].remark = statsEditHongheRemark.value
        }
        restIds.forEach(id => {
          const i = forecastListData.findIndex((f: ForecastItem) => f._id === id)
          if (i >= 0) forecastListData.splice(i, 1)
        })
      } else {
        const newItem: ForecastItem = {
          _id: 'stats-new-hh-' + Date.now(),
          type: 'forecast',
          bookName: `${item.grade}${item.subject}${item.difficulty || ''}`,
          year: selectedYear.value,
          term: selectedTerm.value,
          grade: item.grade,
          subject: item.subject,
          difficulty: item.difficulty,
          campus: 'honghe',
          campusName: '洪河校区',
          quantity: hongheQty,
          remark: statsEditHongheRemark.value || '',
          status: 'processed',
          operator: 'admin',
          operatorName: '管理员',
          createTime: Date.now()
        }
        forecastListData.push(newItem)
      }
    } else {
      item.hongheIds.forEach(id => {
        const idx = forecastListData.findIndex((f: ForecastItem) => f._id === id)
        if (idx >= 0) forecastListData.splice(idx, 1)
      })
    }

    // 处理龙华校区
    if (longhuaQty > 0) {
      if (item.longhuaIds.length > 0) {
        const [firstId, ...restIds] = item.longhuaIds
        const idx = forecastListData.findIndex((f: ForecastItem) => f._id === firstId)
        if (idx >= 0) {
          forecastListData[idx].quantity = longhuaQty
          if (statsEditLonghuaRemark.value) forecastListData[idx].remark = statsEditLonghuaRemark.value
        }
        restIds.forEach(id => {
          const i = forecastListData.findIndex((f: ForecastItem) => f._id === id)
          if (i >= 0) forecastListData.splice(i, 1)
        })
      } else {
        const newItem: ForecastItem = {
          _id: 'stats-new-lh-' + Date.now(),
          type: 'forecast',
          bookName: `${item.grade}${item.subject}${item.difficulty || ''}`,
          year: selectedYear.value,
          term: selectedTerm.value,
          grade: item.grade,
          subject: item.subject,
          difficulty: item.difficulty,
          campus: 'longhua',
          campusName: '龙华校区',
          quantity: longhuaQty,
          remark: statsEditLonghuaRemark.value || '',
          status: 'processed',
          operator: 'admin',
          operatorName: '管理员',
          createTime: Date.now()
        }
        forecastListData.push(newItem)
      }
    } else {
      item.longhuaIds.forEach(id => {
        const idx = forecastListData.findIndex((f: ForecastItem) => f._id === id)
        if (idx >= 0) forecastListData.splice(idx, 1)
      })
    }

    setForecastData(forecastListData)
  }

  alert('修改成功')
  closeStatsEditModal()
  await openStatsModal()
  statsSubmitting.value = false
}

const openStatsStockInModal = () => {
  if (!currentStatsItem.value) return
  // 默认显示统计中各校区的书本数量
  statsStockInHongheQty.value = (currentStatsItem.value.hongheQuantity || 0).toString()
  statsStockInLonghuaQty.value = (currentStatsItem.value.longhuaQuantity || 0).toString()
  showStatsActionModal.value = false
  showStatsStockInModal.value = true
}

const closeStatsStockInModal = () => {
  showStatsStockInModal.value = false
}

const handleStatsStockIn = async () => {
  if (!currentStatsItem.value) return
  
  if (statsSubmitting.value) return
  statsSubmitting.value = true

  const hongheQty = parseInt(statsStockInHongheQty.value) || 0
  const longhuaQty = parseInt(statsStockInLonghuaQty.value) || 0

  if (hongheQty <= 0 && longhuaQty <= 0) {
    alert('请输入有效数量')
    statsSubmitting.value = false
    return
  }

  const item = currentStatsItem.value
  const userInfo = getUserInfo()
  const operatorName = userInfo?.userName || userInfo?.nickName || 'admin'
  const now = Date.now()

  if (await ds.isReallyOnline()) {
    // 在线模式
    const stockList = await ds.fetchStock()

    // 处理洪河校区入库
    if (hongheQty > 0) {
      const existing = stockList.find((s: StockItem) =>
        s.campus === 'honghe' &&
        s.year === selectedYear.value &&
        s.term === selectedTerm.value &&
        s.grade === item.grade &&
        s.subject === item.subject &&
        s.difficulty === item.difficulty
      )

      if (existing) {
        const newTotalIn = (existing.totalIn || 0) + hongheQty
        const newTotalQuantity = (existing.totalQuantity || 0) + hongheQty
        const newHongheQuantity = (existing.hongheQuantity || 0) + hongheQty
        await ds.upsertStock({
          ...existing,
          totalIn: newTotalIn,
          totalQuantity: newTotalQuantity,
          hongheQuantity: newHongheQuantity,
          remainingStock: newTotalIn - (existing.totalOut || 0),
          updateTime: now
        })
      } else {
        await ds.upsertStock({
          campus: 'honghe',
          campusName: '洪河校区',
          year: selectedYear.value,
          term: selectedTerm.value,
          grade: item.grade,
          subject: item.subject,
          difficulty: item.difficulty,
          bookName: `${item.grade}${item.subject}${item.difficulty || ''}`,
          bookCode: '',
          totalQuantity: hongheQty,
          hongheQuantity: hongheQty,
          longhuaQuantity: 0,
          totalIn: hongheQty,
          totalOut: 0,
          remainingStock: hongheQty,
          createTime: now,
          updateTime: now
        })
      }

      await ds.addLog({
        type: 'stock_in',
        operator: operatorName,
        operatorName: operatorName,
        action: '入库',
        detail: '预计入库',
        year: selectedYear.value,
        term: selectedTerm.value,
        grade: item.grade,
        subject: item.subject,
        difficulty: item.difficulty,
        campus: 'honghe',
        bookName: `${item.grade}${item.subject}${item.difficulty || ''}`,
        quantity: hongheQty,
        note: '预计入库',
        createTime: now,
        createdAt: now
      })
    }

    // 处理龙华校区入库
    if (longhuaQty > 0) {
      const existing = stockList.find((s: StockItem) =>
        s.campus === 'longhua' &&
        s.year === selectedYear.value &&
        s.term === selectedTerm.value &&
        s.grade === item.grade &&
        s.subject === item.subject &&
        s.difficulty === item.difficulty
      )

      if (existing) {
        const newTotalIn = (existing.totalIn || 0) + longhuaQty
        const newTotalQuantity = (existing.totalQuantity || 0) + longhuaQty
        const newLonghuaQuantity = (existing.longhuaQuantity || 0) + longhuaQty
        await ds.upsertStock({
          ...existing,
          totalIn: newTotalIn,
          totalQuantity: newTotalQuantity,
          longhuaQuantity: newLonghuaQuantity,
          remainingStock: newTotalIn - (existing.totalOut || 0),
          updateTime: now
        })
      } else {
        await ds.upsertStock({
          campus: 'longhua',
          campusName: '龙华校区',
          year: selectedYear.value,
          term: selectedTerm.value,
          grade: item.grade,
          subject: item.subject,
          difficulty: item.difficulty,
          bookName: `${item.grade}${item.subject}${item.difficulty || ''}`,
          bookCode: '',
          totalQuantity: longhuaQty,
          hongheQuantity: 0,
          longhuaQuantity: longhuaQty,
          totalIn: longhuaQty,
          totalOut: 0,
          remainingStock: longhuaQty,
          createTime: now,
          updateTime: now
        })
      }

      await ds.addLog({
        type: 'stock_in',
        operator: operatorName,
        operatorName: operatorName,
        action: '入库',
        detail: '预计入库',
        year: selectedYear.value,
        term: selectedTerm.value,
        grade: item.grade,
        subject: item.subject,
        difficulty: item.difficulty,
        campus: 'longhua',
        bookName: `${item.grade}${item.subject}${item.difficulty || ''}`,
        quantity: longhuaQty,
        note: '预计入库',
        createTime: now,
        createdAt: now
      })
    }

    // 删除预计记录
    const allIds = [...item.hongheIds, ...item.longhuaIds]
    if (allIds.length > 0) {
      await ds.deleteForecasts(allIds)
    }
  } else {
    // 离线模式 - 保留原有逻辑
    let stockList = getStockData()
    let logList = getLogData()
    const forecastListData = getForecastData()

    // 处理洪河校区入库
    if (hongheQty > 0) {
      const existingIndex = stockList.findIndex((s: StockItem) =>
        s.campus === 'honghe' &&
        s.year === selectedYear.value &&
        s.term === selectedTerm.value &&
        s.grade === item.grade &&
        s.subject === item.subject &&
        s.difficulty === item.difficulty
      )

      if (existingIndex >= 0) {
        stockList[existingIndex].totalIn = (stockList[existingIndex].totalIn || 0) + hongheQty
        stockList[existingIndex].totalQuantity = (stockList[existingIndex].totalQuantity || 0) + hongheQty
        stockList[existingIndex].hongheQuantity = (stockList[existingIndex].hongheQuantity || 0) + hongheQty
        stockList[existingIndex].remainingStock = (stockList[existingIndex].totalIn || 0) - (stockList[existingIndex].totalOut || 0)
        stockList[existingIndex].updateTime = now
      } else {
        stockList.push({
          _id: generateId(),
          campus: 'honghe', campusName: '洪河校区',
          year: selectedYear.value, term: selectedTerm.value,
          grade: item.grade, subject: item.subject, difficulty: item.difficulty,
          bookName: `${item.grade}${item.subject}${item.difficulty || ''}`,
          bookCode: '',
          totalQuantity: hongheQty,
          hongheQuantity: hongheQty, longhuaQuantity: 0,
          totalIn: hongheQty, totalOut: 0, remainingStock: hongheQty,
          createTime: now, updateTime: now
        })
      }

      logList.push({
        _id: generateId(),
        type: 'stock_in', operator: operatorName, operatorName: operatorName,
        action: '入库', detail: '预计入库',
        year: selectedYear.value, term: selectedTerm.value,
        grade: item.grade, subject: item.subject,
        difficulty: item.difficulty, campus: 'honghe',
        bookName: `${item.grade}${item.subject}${item.difficulty || ''}`,
        quantity: hongheQty, note: '预计入库',
        createTime: now, createdAt: now
      } as LogItem)
    }

    // 处理龙华校区入库
    if (longhuaQty > 0) {
      const existingIndex = stockList.findIndex((s: StockItem) =>
        s.campus === 'longhua' &&
        s.year === selectedYear.value &&
        s.term === selectedTerm.value &&
        s.grade === item.grade &&
        s.subject === item.subject &&
        s.difficulty === item.difficulty
      )

      if (existingIndex >= 0) {
        stockList[existingIndex].totalIn = (stockList[existingIndex].totalIn || 0) + longhuaQty
        stockList[existingIndex].totalQuantity = (stockList[existingIndex].totalQuantity || 0) + longhuaQty
        stockList[existingIndex].longhuaQuantity = (stockList[existingIndex].longhuaQuantity || 0) + longhuaQty
        stockList[existingIndex].remainingStock = (stockList[existingIndex].totalIn || 0) - (stockList[existingIndex].totalOut || 0)
        stockList[existingIndex].updateTime = now
      } else {
        stockList.push({
          _id: generateId(),
          campus: 'longhua', campusName: '龙华校区',
          year: selectedYear.value, term: selectedTerm.value,
          grade: item.grade, subject: item.subject, difficulty: item.difficulty,
          bookName: `${item.grade}${item.subject}${item.difficulty || ''}`,
          bookCode: '',
          totalQuantity: longhuaQty,
          hongheQuantity: 0, longhuaQuantity: longhuaQty,
          totalIn: longhuaQty, totalOut: 0, remainingStock: longhuaQty,
          createTime: now, updateTime: now
        })
      }

      logList.push({
        _id: generateId(),
        type: 'stock_in', operator: operatorName, operatorName: operatorName,
        action: '入库', detail: '预计入库',
        year: selectedYear.value, term: selectedTerm.value,
        grade: item.grade, subject: item.subject,
        difficulty: item.difficulty, campus: 'longhua',
        bookName: `${item.grade}${item.subject}${item.difficulty || ''}`,
        quantity: longhuaQty, note: '预计入库',
        createTime: now, createdAt: now
      } as LogItem)
    }

    // 保存数据
    setStockData(stockList)
    setLogData(logList)

    // 删除预计记录
    const allIds = [...item.hongheIds, ...item.longhuaIds]
    const newForecastList = forecastListData.filter((f: ForecastItem) => !allIds.includes(f._id))
    setForecastData(newForecastList)
  }

  alert('入库成功，已添加到库存统计')
  closeStatsStockInModal()
  await openStatsModal()
  statsSubmitting.value = false
}
</script>

<template>
  <div class="forecast-page">
    <div class="page-header">
      <h1 class="page-title">📝 预计</h1>
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
        <button class="btn-filter" @click="loadForecastList">查询</button>
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
      <div 
        v-if="canViewStats" 
        class="status-tab" 
        @click="openStatsModal"
      >统计</div>
    </div>
    
    <div class="forecast-list">
      <div v-if="forecastList.length === 0" class="empty-state">
        <span class="empty-icon">📝</span>
        <span>{{ currentStatus === 'pending' ? '暂无未处理记录' : '暂无已处理记录' }}</span>
      </div>
      <div v-for="item in forecastList" :key="item._id" class="forecast-item">
        <div class="forecast-header">
          <span class="forecast-type">预计</span>
          <div class="forecast-right">
            <span class="forecast-time">{{ formatTime(item.createTime) }}</span>
            <button 
              v-if="canApprove || canModify || canDelete" 
              class="edit-btn" 
              @click="openEditMenu(item)"
            >编辑</button>
          </div>
        </div>
        <div class="forecast-info">
          <span class="forecast-book">{{ item.bookName || item.subject }}</span>
          <span class="forecast-detail">{{ item.year }}年{{ item.term }} · {{ item.campus === 'honghe' ? '洪河校区' : '龙华校区' }} · {{ item.grade }} · {{ item.subject }}</span>
        </div>
        <div class="forecast-meta">
          <div class="forecast-quantity">
            <span>数量：</span>
            <span class="quantity-value">{{ item.quantity }}</span>
          </div>
          <div class="forecast-remark">
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
          <div 
            v-if="canApprove && currentStatus === 'pending'" 
            class="edit-menu-item approve" 
            @click="approveForecast"
          >
            <span>✓</span>
            <span>同意</span>
          </div>
          <div v-if="canModify" class="edit-menu-item modify" @click="modifyForecast">
            <span>✏️</span>
            <span>修改</span>
          </div>
          <div v-if="canDelete" class="edit-menu-item delete" @click="deleteForecast">
            <span>🗑️</span>
            <span>删除</span>
          </div>
        </div>
      </div>
    </div>
    
    <!-- 修改弹窗 -->
    <div v-if="showModifyModal" class="modify-modal" @click="closeModifyModal">
      <div class="modify-content" @click.stop>
        <div class="modify-header">
          <span class="modify-title">✏️ 修改预计领取</span>
          <span class="modify-close" @click="closeModifyModal">✕</span>
        </div>
        <div class="modify-form">
          <div class="form-item">
            <span class="form-label">书本名称</span>
            <span class="form-value">{{ modifyItem?.bookName || modifyItem?.subject }}</span>
          </div>
          <div class="form-item">
            <span class="form-label">校区</span>
            <span class="form-value">{{ modifyCampus === 'honghe' ? '🏫 洪河校区' : '🏢 龙华校区' }}</span>
          </div>
          <div class="form-item">
            <span class="form-label">数量</span>
            <input type="number" class="form-input" v-model="modifyQuantity" placeholder="请输入数量" />
          </div>
          <div class="form-item">
            <span class="form-label">备注</span>
            <input type="text" class="form-input" v-model="modifyRemark" placeholder="请输入备注" />
          </div>
          <button class="confirm-btn" @click="confirmModify">确认修改</button>
        </div>
      </div>
    </div>
    
    <!-- 审批调整弹窗（库存不足时弹出） -->
    <div v-if="showApproveAdjustModal" class="modify-modal" @click="closeApproveAdjustModal">
      <div class="modify-content" @click.stop>
        <div class="modify-header">
          <span class="modify-title">⚠️ 库存不足，调整数量</span>
          <span class="modify-close" @click="closeApproveAdjustModal">✕</span>
        </div>
        <div class="modify-form">
          <div class="form-item">
            <span class="form-label">书本名称</span>
            <span class="form-value">{{ approveAdjustItem?.bookName || approveAdjustItem?.subject }}</span>
          </div>
          <div class="form-item">
            <span class="form-label">校区</span>
            <span class="form-value">{{ (approveAdjustItem?.campus || 'honghe') === 'honghe' ? '🏫 洪河校区' : '🏢 龙华校区' }}</span>
          </div>
          <div class="form-item">
            <span class="form-label">当前库存</span>
            <span class="form-value" style="color: #ff4d4f; font-weight: bold;">{{ approveAdjustStock }} 本</span>
          </div>
          <div class="form-item">
            <span class="form-label">预计数量</span>
            <span class="form-value" style="color: #fa8c16;">{{ approveAdjustItem?.quantity || 0 }} 本</span>
          </div>
          <div class="form-item">
            <span class="form-label">缺口数量</span>
            <span class="form-value" style="color: #ff4d4f;">{{ (approveAdjustItem?.quantity || 0) - approveAdjustStock }} 本（预计 - 库存）</span>
          </div>
          <div class="form-item">
            <span class="form-label">调整数量</span>
            <input type="number" class="form-input" v-model="approveAdjustQuantity" min="0" placeholder="默认为缺口数量，可增可减" />
          </div>
          <div class="tip-text" style="color: #1890ff; font-size: 12px; margin-bottom: 10px;">
            默认为缺口数量（预计 - 库存），管理员可增加或减少。确认后：扣除全部库存 {{ approveAdjustStock }} 本，调整数量加入统计。
          </div>
          <button class="confirm-btn" @click="confirmApproveAdjust" :disabled="submitting">{{ submitting ? '提交中...' : '确认调整并审批' }}</button>
        </div>
      </div>
    </div>
    
    <!-- 统计弹窗 -->
    <div v-if="showStatsModal" class="stats-modal" @click="closeStatsModal">
      <div class="stats-content" @click.stop>
        <div class="stats-header">
          <span class="stats-title">📊 统计信息</span>
          <span class="stats-close" @click="closeStatsModal">✕</span>
        </div>
        <div class="stats-subject-tabs">
          <div 
            v-for="subject in statsSubjects" 
            :key="subject"
            class="subject-tab"
            :class="{ active: selectedStatsSubject === subject }"
            @click="selectStatsSubject(subject)"
          >
            {{ subject }}
          </div>
        </div>
        <div class="stats-table">
          <div class="stats-table-header">
            <span class="stats-col">书本信息</span>
            <span class="stats-col">洪河</span>
            <span class="stats-col">龙华</span>
            <span class="stats-col">合计</span>
            <span class="stats-col">操作</span>
          </div>
          <div class="stats-table-body">
            <div v-if="filteredStatsList.length === 0" class="empty-stats">暂无统计数据</div>
            <div v-for="item in filteredStatsList" :key="item.key" class="stats-table-row">
              <div class="stats-col book-info-col">
                <span class="book-short-name">{{ item.grade }}{{ item.subject }}<span v-if="item.difficulty">{{ item.difficulty }}</span></span>
              </div>
              <div class="stats-col">{{ item.hongheQuantity || 0 }}</div>
              <div class="stats-col">{{ item.longhuaQuantity || 0 }}</div>
              <div class="stats-col">{{ item.totalQuantity }}</div>
              <div class="stats-col">
                <button class="stats-edit-btn" @click="openStatsActionModal(item)">编辑</button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
    
    <!-- 统计操作弹窗 -->
    <div v-if="showStatsActionModal" class="modal-overlay" @click="closeStatsActionModal">
      <div class="modal-content" @click.stop>
        <div class="modal-header">
          <span class="modal-title">操作选择</span>
          <span class="modal-close" @click="closeStatsActionModal">✕</span>
        </div>
        <div class="operate-menu">
          <button class="menu-item" @click="openStatsEditModal">✏️ 修改</button>
          <button class="menu-item primary" @click="openStatsStockInModal">📥 入库</button>
        </div>
      </div>
    </div>
    
    <!-- 统计修改弹窗 -->
    <div v-if="showStatsEditModal" class="modal-overlay" @click="closeStatsEditModal">
      <div class="modal-content" @click.stop>
        <div class="modal-header">
          <span class="modal-title">✏️ 修改预计数量</span>
          <span class="modal-close" @click="closeStatsEditModal">✕</span>
        </div>
        <div class="operate-form">
          <div class="form-group">
            <label>🏫 洪河校区</label>
            <input type="number" class="form-input" v-model="statsEditHongheQty" placeholder="数量" />
            <input type="text" class="form-input" v-model="statsEditHongheRemark" placeholder="备注" />
          </div>
          <div class="form-group">
            <label>🏢 龙华校区</label>
            <input type="number" class="form-input" v-model="statsEditLonghuaQty" placeholder="数量" />
            <input type="text" class="form-input" v-model="statsEditLonghuaRemark" placeholder="备注" />
          </div>
          <button class="btn-confirm" @click="handleStatsModify" :disabled="statsSubmitting">{{ statsSubmitting ? '提交中...' : '确认修改' }}</button>
        </div>
      </div>
    </div>
    
    <!-- 统计入库弹窗 -->
    <div v-if="showStatsStockInModal" class="modal-overlay" @click="closeStatsStockInModal">
      <div class="modal-content" @click.stop>
        <div class="modal-header">
          <span class="modal-title">📥 预计转入库</span>
          <span class="modal-close" @click="closeStatsStockInModal">✕</span>
        </div>
        <div class="operate-form">
          <div class="form-group">
            <label>书本名称</label>
            <span class="form-value">{{ currentStatsItem?.grade }}{{ currentStatsItem?.subject }}{{ currentStatsItem?.difficulty }}</span>
          </div>
          <div class="form-group">
            <label>🏫 洪河校区入库数量</label>
            <input type="number" class="form-input" v-model="statsStockInHongheQty" placeholder="请输入洪河入库数量" />
          </div>
          <div class="form-group">
            <label>🏢 龙华校区入库数量</label>
            <input type="number" class="form-input" v-model="statsStockInLonghuaQty" placeholder="请输入龙华入库数量" />
          </div>
          <div class="form-group">
            <label>预计入库合计</label>
            <span class="form-value total-value">{{ (parseInt(statsStockInHongheQty) || 0) + (parseInt(statsStockInLonghuaQty) || 0) }} 本</span>
          </div>
          <button class="btn-confirm" @click="handleStatsStockIn" :disabled="statsSubmitting">{{ statsSubmitting ? '提交中...' : '确认入库' }}</button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.forecast-page {
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
}

.option-item.active {
  background: #1890ff;
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
  background: #1890ff;
  color: #fff;
}

.forecast-list {
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

.forecast-item {
  background: #fff;
  border-radius: 12px;
  padding: 15px;
  margin-bottom: 12px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);
}

.forecast-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 10px;
}

.forecast-type {
  padding: 4px 10px;
  background: #fff7e6;
  color: #fa8c16;
  border-radius: 4px;
  font-size: 12px;
  font-weight: bold;
}

.forecast-right {
  display: flex;
  align-items: center;
  gap: 10px;
}

.forecast-time {
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

.forecast-info {
  margin-bottom: 10px;
}

.forecast-book {
  font-size: 16px;
  font-weight: bold;
  color: #333;
  display: block;
  margin-bottom: 4px;
}

.forecast-detail {
  font-size: 13px;
  color: #999;
}

.forecast-meta {
  display: flex;
  justify-content: space-between;
  padding-top: 10px;
  border-top: 1px solid #f5f5f5;
}

.forecast-quantity, .forecast-remark {
  font-size: 13px;
  color: #666;
}

.quantity-value {
  font-weight: bold;
  color: #1890ff;
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

.modify-modal {
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

.modify-content {
  background: #fff;
  border-radius: 16px;
  width: 100%;
  max-width: 320px;
  padding: 20px;
}

.modify-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
}

.modify-title {
  font-size: 18px;
  font-weight: bold;
  color: #333;
}

.modify-close {
  font-size: 24px;
  color: #999;
  cursor: pointer;
}

.modify-form {
  display: flex;
  flex-direction: column;
  gap: 15px;
}

.form-item {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.form-label {
  font-size: 14px;
  font-weight: bold;
  color: #333;
}

.form-value {
  font-size: 14px;
  color: #666;
  padding: 10px;
  background: #f5f5f5;
  border-radius: 8px;
}

.form-input {
  padding: 12px;
  border: 1px solid #ddd;
  border-radius: 8px;
  font-size: 14px;
}

.confirm-btn {
  margin-top: 10px;
  padding: 14px;
  background: #1890ff;
  color: #fff;
  border: none;
  border-radius: 8px;
  font-size: 16px;
  font-weight: bold;
  cursor: pointer;
}

.stats-modal {
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

.stats-content {
  background: #fff;
  border-radius: 16px;
  width: 100%;
  max-width: 400px;
  max-height: 80vh;
  overflow-y: auto;
  padding: 20px;
}

.stats-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 15px;
}

.stats-title {
  font-size: 18px;
  font-weight: bold;
  color: #333;
}

.stats-close {
  font-size: 20px;
  color: #999;
  cursor: pointer;
}

.stats-subject-tabs {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 15px;
}

.subject-tab {
  padding: 6px 12px;
  background: #f5f5f5;
  border-radius: 20px;
  font-size: 12px;
  color: #666;
  cursor: pointer;
}

.subject-tab.active {
  background: #1890ff;
  color: #fff;
}

.stats-table {
  background: #fff;
  border-radius: 8px;
  overflow: hidden;
}

.stats-table-header {
  display: flex;
  background: #f5f5f5;
  padding: 10px 0;
}

.stats-col {
  flex: 1;
  text-align: center;
  font-size: 12px;
  color: #666;
}

.stats-table-body {
  padding: 0;
}

.stats-table-row {
  display: flex;
  align-items: center;
  padding: 10px 0;
  border-bottom: 1px solid #f5f5f5;
}

.empty-stats {
  text-align: center;
  padding: 30px;
  color: #999;
}

.stats-edit-btn {
  padding: 4px 8px;
  background: #fff7e6;
  color: #fa8c16;
  border: none;
  border-radius: 4px;
  font-size: 12px;
  cursor: pointer;
}

.book-info-col {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0 4px;
}

.book-short-name {
  font-size: 13px;
  font-weight: bold;
  color: #333;
  line-height: 1.4;
  word-break: break-all;
}

.total-value {
  text-align: center;
  font-size: 18px;
  font-weight: bold;
  color: #1890ff !important;
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
</style>
