import type { StockItem, LogItem, ForecastItem, MergedStock } from '../types'
import { isSupabaseConfigured } from './supabase'
import * as ds from '../services/dataService'

const STOCK_KEY = 'mock_stock_data'
const LOG_KEY = 'mock_log_data'
const FORECAST_KEY = 'mock_forecast_data'

// 动态判断是否真正在线（有 auth 会话），而不是静态检查配置
const isOnline = async () => {
  if (!isSupabaseConfigured()) return false
  return await ds.isReallyOnline()
}

export const getStockData = (): StockItem[] => {
  try {
    const data = localStorage.getItem(STOCK_KEY)
    return data ? JSON.parse(data) : []
  } catch {
    return []
  }
}

export const setStockData = (data: StockItem[]) => {
  localStorage.setItem(STOCK_KEY, JSON.stringify(data))
}

export const getLogData = (): LogItem[] => {
  try {
    const data = localStorage.getItem(LOG_KEY)
    return data ? JSON.parse(data) : []
  } catch {
    return []
  }
}

export const setLogData = (data: LogItem[]) => {
  localStorage.setItem(LOG_KEY, JSON.stringify(data))
}

export const generateId = () => {
  return Date.now().toString(36) + Math.random().toString(36).substr(2, 9)
}

export const mockStockIn = async (data: any) => {
  const { campus, year, term, grade, subject, difficulty, bookName, quantity, remark, scanOperate, role, userCampus } = data

  if (!role || (role !== 'super' && userCampus !== 'all' && userCampus !== campus)) {
    return { success: false, message: '无权操作其他校区库存' }
  }

  if (await isOnline()) {
    const stockList = await ds.fetchStock()
    const existing = stockList.find((item: StockItem) =>
      item.campus === campus &&
      item.year === year &&
      item.term === term &&
      item.grade === grade &&
      item.subject === subject &&
      item.difficulty === difficulty
    )
    const stockId = existing?._id || generateId()
    const newTotalIn = (existing?.totalIn || 0) + quantity
    const newRemaining = newTotalIn - (existing?.totalOut || 0)
    await ds.upsertStock({
      _id: stockId,
      campus, year, term, grade, subject, difficulty,
      bookName: bookName || existing?.bookName || '',
      bookCode: existing?.bookCode || '',
      totalQuantity: newRemaining,
      hongheQuantity: campus === 'honghe' ? newRemaining : (existing?.hongheQuantity || 0),
      longhuaQuantity: campus === 'longhua' ? newRemaining : (existing?.longhuaQuantity || 0),
      totalIn: newTotalIn,
      totalOut: existing?.totalOut || 0,
      remainingStock: newRemaining,
      createTime: existing?.createTime || Date.now(),
      updateTime: Date.now()
    })
    await ds.addLog({
      stockId,
      campus, year, term, grade, subject, difficulty,
      bookName: bookName || existing?.bookName || '',
      bookCode: existing?.bookCode || '',
      type: 'stock_in',
      operator: '测试管理员',
      operatorName: '测试管理员',
      action: '入库',
      detail: remark || (scanOperate ? '扫码入库' : '手动入库'),
      scanOperate: scanOperate || false,
      quantity,
      note: remark || (scanOperate ? '扫码入库' : '手动入库'),
      createTime: Date.now(),
      createdAt: Date.now()
    })
    return { success: true, message: '入库成功', data: { stockId } }
  }

  // 离线模式：走原有同步逻辑
  let stockList = getStockData()

  const existingIndex = stockList.findIndex((item: StockItem) =>
    item.campus === campus &&
    item.year === year &&
    item.term === term &&
    item.grade === grade &&
    item.subject === subject &&
    item.difficulty === difficulty
  )

  let stockId = null

  if (existingIndex >= 0) {
    const stock = stockList[existingIndex]
    stockId = stock._id
    stock.totalIn = (stock.totalIn || 0) + quantity
    stock.remainingStock = (stock.totalIn || 0) - (stock.totalOut || 0)
    stock.updateTime = Date.now()
    if (bookName) stock.bookName = bookName
    stockList[existingIndex] = stock
  } else {
    const newStock: StockItem = {
      _id: generateId(),
      campus, year, term, grade, subject, difficulty,
      bookName: bookName || '',
      bookCode: '',
      totalQuantity: quantity,
      hongheQuantity: campus === 'honghe' ? quantity : 0,
      longhuaQuantity: campus === 'longhua' ? quantity : 0,
      totalIn: quantity,
      totalOut: 0,
      remainingStock: quantity,
      createTime: Date.now(),
      updateTime: Date.now()
    }
    stockId = newStock._id
    stockList.push(newStock)
  }

  setStockData(stockList)

  const logData = getLogData()
  logData.push({
    _id: generateId(),
    stockId,
    campus, year, term, grade, subject, difficulty,
    bookName: bookName || '',
    bookCode: '',
    type: 'stock_in',
    operator: '测试管理员',
    operatorName: '测试管理员',
    action: '入库',
    detail: remark || (scanOperate ? '扫码入库' : '手动入库'),
    scanOperate: scanOperate || false,
    quantity,
    note: remark || (scanOperate ? '扫码入库' : '手动入库'),
    createTime: Date.now(),
    createdAt: Date.now()
  } as LogItem)
  setLogData(logData)

  return { success: true, message: '入库成功', data: { stockId } }
}

export const mockStockOut = async (data: any) => {
  const { campus, year, term, grade, subject, difficulty, bookName, quantity, remark, scanOperate, role, userCampus } = data

  if (!role || (role !== 'super' && userCampus !== 'all' && userCampus !== campus)) {
    return { success: false, message: '无权操作其他校区库存' }
  }

  if (await isOnline()) {
    const stockList = await ds.fetchStock()
    const existing = stockList.find((item: StockItem) =>
      item.campus === campus &&
      item.year === year &&
      item.term === term &&
      item.grade === grade &&
      item.subject === subject &&
      item.difficulty === difficulty
    )
    if (!existing) {
      return { success: false, message: '未找到对应库存' }
    }
    const remaining = (existing.totalIn || 0) - (existing.totalOut || 0)
    if (quantity > remaining) {
      return { success: false, message: '出库数量超过剩余库存' }
    }
    const newTotalOut = (existing.totalOut || 0) + quantity
    const newRemaining = remaining - quantity
    await ds.upsertStock({
      ...existing,
      totalOut: newTotalOut,
      remainingStock: newRemaining,
      totalQuantity: newRemaining,
      hongheQuantity: campus === 'honghe' ? newRemaining : existing.hongheQuantity,
      longhuaQuantity: campus === 'longhua' ? newRemaining : existing.longhuaQuantity,
      updateTime: Date.now()
    })
    await ds.addLog({
      stockId: existing._id,
      campus, year, term, grade, subject, difficulty,
      bookName: existing.bookName || bookName || '',
      bookCode: existing.bookCode || '',
      type: 'stock_out',
      operator: '测试管理员',
      operatorName: '测试管理员',
      action: '出库',
      detail: remark || (scanOperate ? '扫码出库' : '手动出库'),
      scanOperate: scanOperate || false,
      quantity,
      note: remark || (scanOperate ? '扫码出库' : '手动出库'),
      createTime: Date.now(),
      createdAt: Date.now()
    })
    return { success: true, message: '出库成功', data: { remaining: newRemaining } }
  }

  // 离线模式
  let stockList = getStockData()

  const existingIndex = stockList.findIndex((item: StockItem) =>
    item.campus === campus &&
    item.year === year &&
    item.term === term &&
    item.grade === grade &&
    item.subject === subject &&
    item.difficulty === difficulty
  )

  if (existingIndex < 0) {
    return { success: false, message: '未找到对应库存' }
  }

  const stock = stockList[existingIndex]
  const remaining = (stock.totalIn || 0) - (stock.totalOut || 0)

  if (quantity > remaining) {
    return { success: false, message: '出库数量超过剩余库存' }
  }

  stock.totalOut = (stock.totalOut || 0) + quantity
  stock.remainingStock = remaining - quantity
  stock.updateTime = Date.now()
  stockList[existingIndex] = stock

  setStockData(stockList)

  const logData = getLogData()
  logData.push({
    _id: generateId(),
    stockId: stock._id,
    campus, year, term, grade, subject, difficulty,
    bookName: stock.bookName || bookName || '',
    bookCode: '',
    type: 'stock_out',
    operator: '测试管理员',
    operatorName: '测试管理员',
    action: '出库',
    detail: remark || (scanOperate ? '扫码出库' : '手动出库'),
    scanOperate: scanOperate || false,
    quantity,
    note: remark || (scanOperate ? '扫码出库' : '手动出库'),
    createTime: Date.now(),
    createdAt: Date.now()
  } as LogItem)
  setLogData(logData)

  return { success: true, message: '出库成功', data: { remaining: stock.remainingStock } }
}

export const mockGetStock = async (data: any) => {
  const { year, term, grade, subject, difficulty, campus } = data

  let stockList: StockItem[]
  if (await isOnline()) {
    stockList = await ds.fetchStock()
  } else {
    stockList = getStockData()
  }

  if (year) stockList = stockList.filter((item: StockItem) => item.year === year)
  if (term) stockList = stockList.filter((item: StockItem) => item.term === term)
  if (grade) stockList = stockList.filter((item: StockItem) => item.grade === grade)
  if (subject) stockList = stockList.filter((item: StockItem) => item.subject === subject)
  if (difficulty) stockList = stockList.filter((item: StockItem) => item.difficulty === difficulty)
  if (campus && campus !== 'all') stockList = stockList.filter((item: StockItem) => item.campus === campus)

  const booksMap: Record<string, MergedStock> = {}
  stockList.forEach((item: StockItem) => {
    const key = `${item.year}-${item.term}-${item.grade}-${item.subject}-${item.difficulty}`
    if (!booksMap[key]) {
      booksMap[key] = {
        _id: generateId(),
        year: item.year,
        term: item.term,
        grade: item.grade,
        subject: item.subject,
        difficulty: item.difficulty,
        bookName: item.bookName || '',
        bookCode: '',
        totalQuantity: 0,
        hongheQuantity: 0,
        longhuaQuantity: 0,
        qrcodeUrl: item.qrcodeUrl || '',
        hongheStock: 0,
        hongheTotalIn: 0,
        hongheTotalOut: 0,
        longhuaStock: 0,
        longhuaTotalIn: 0,
        longhuaTotalOut: 0,
        createTime: Date.now()
      }
    }
    if (item.campus === 'honghe') {
      booksMap[key].hongheStock = item.remainingStock || 0
      booksMap[key].hongheTotalIn = item.totalIn || 0
      booksMap[key].hongheTotalOut = item.totalOut || 0
      booksMap[key].hongheQuantity = item.remainingStock || 0
    } else {
      booksMap[key].longhuaStock = item.remainingStock || 0
      booksMap[key].longhuaTotalIn = item.totalIn || 0
      booksMap[key].longhuaTotalOut = item.totalOut || 0
      booksMap[key].longhuaQuantity = item.remainingStock || 0
    }
    booksMap[key].totalQuantity = (booksMap[key].hongheStock || 0) + (booksMap[key].longhuaStock || 0)
  })

  let mergedList = Object.values(booksMap)

  const levelOrder: Record<string, number> = { '无': 0, '基础': 1, '培优': 2, '尖子': 3 }
  const gradeOrderList = ['幼升小', '1年级', '2年级', '3年级', '4年级', '5年级', '6年级', '小升初', '7年级', '8年级', '9年级', '初升高', '高一', '高二']

  mergedList.sort((a, b) => {
    const gradeCompare = gradeOrderList.indexOf(a.grade) - gradeOrderList.indexOf(b.grade)
    if (gradeCompare !== 0) return gradeCompare
    return (levelOrder[a.difficulty] || 0) - (levelOrder[b.difficulty] || 0)
  })

  return {
    success: true,
    data: {
      list: mergedList,
      total: mergedList.length,
      page: 0,
      size: 20
    }
  }
}

export const mockGetStockLog = async (data: any) => {
  const { campus, year, term, scanOperate } = data

  let logList: LogItem[]
  if (await isOnline()) {
    logList = await ds.fetchLogs()
  } else {
    logList = getLogData()
  }

  if (campus && campus !== 'all') logList = logList.filter((item: LogItem) => item.campus === campus)
  if (year) logList = logList.filter((item: LogItem) => item.year === year)
  if (term) logList = logList.filter((item: LogItem) => item.term === term)
  if (scanOperate !== undefined) logList = logList.filter((item: LogItem) => item.scanOperate === scanOperate)

  logList.sort((a, b) => b.createTime - a.createTime)

  return {
    success: true,
    data: {
      list: logList,
      total: logList.length
    }
  }
}

export const mockCreateBookQrcode = (data: any) => {
  const { year, term, grade, subject, difficulty } = data
  const qrData = {
    y: year,
    t: term,
    g: grade,
    s: subject,
    d: difficulty || '无'
  }
  const scene = JSON.stringify(qrData)
  const qrcodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(scene)}&ecc=L`

  let stockList = getStockData()
  stockList.forEach((item: StockItem) => {
    if (item.year === year && item.term === term && item.grade === grade &&
        item.subject === subject && item.difficulty === difficulty) {
      item.qrcodeUrl = qrcodeUrl
    }
  })
  setStockData(stockList)

  return {
    success: true,
    data: {
      qrcodeUrl: qrcodeUrl
    }
  }
}

export const mockBatchCreateBookQrcode = () => {
  let stockList = getStockData()
  let successCount = 0

  stockList.forEach((item: StockItem) => {
    if (!item.qrcodeUrl) {
      const qrData = {
        y: item.year,
        t: item.term,
        g: item.grade,
        s: item.subject,
        d: item.difficulty || '无'
      }
      const scene = JSON.stringify(qrData)
      item.qrcodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(scene)}&ecc=L`
      successCount++
    }
  })

  setStockData(stockList)

  return {
    success: true,
    data: {
      successCount: successCount,
      totalCount: stockList.length
    }
  }
}

export const mockDeleteBook = async (data: any) => {
  const { year, term, grade, subject, difficulty } = data

  if (await isOnline()) {
    await ds.deleteBook(year, term, grade, subject, difficulty)
    return { success: true, message: '删除成功' }
  }

  let stockList = getStockData()
  const key = `${year}-${term}-${grade}-${subject}-${difficulty}`
  stockList = stockList.filter((item: StockItem) => {
    const itemKey = `${item.year}-${item.term}-${item.grade}-${item.subject}-${item.difficulty}`
    return itemKey !== key
  })
  setStockData(stockList)

  let logList = getLogData()
  logList = logList.filter((item: LogItem) => {
    const itemKey = `${item.year}-${item.term}-${item.grade}-${item.subject}-${item.difficulty}`
    return itemKey !== key
  })
  setLogData(logList)

  let forecastList = getForecastData()
  forecastList = forecastList.filter((item: ForecastItem) => {
    const itemKey = `${item.year}-${item.term}-${item.grade}-${item.subject}-${item.difficulty}`
    return itemKey !== key
  })
  setForecastData(forecastList)

  return { success: true, message: '删除成功' }
}

export const mockSaveForecast = async (data: any) => {
  const { year, term, grade, subject, difficulty, bookName, type, campus, quantity, remark, operator } = data

  if (await isOnline()) {
    await ds.addForecast({
      year, term, grade, subject, difficulty,
      bookName: bookName || '',
      type: type as 'forecast' | 'receive',
      campus: campus || '',
      campusName: campus === 'honghe' ? '洪河校区' : campus === 'longhua' ? '龙华校区' : '',
      status: 'pending',
      quantity,
      remark,
      operator,
      operatorName: operator,
      createTime: Date.now()
    })
    return { success: true, message: type === 'forecast' ? '预计成功' : '领取成功' }
  }

  const forecastList = getForecastData()
  forecastList.push({
    _id: generateId(),
    year, term, grade, subject, difficulty,
    bookName: bookName || '',
    type: type as 'forecast' | 'receive',
    campus: campus || '',
    campusName: campus === 'honghe' ? '洪河校区' : campus === 'longhua' ? '龙华校区' : '',
    status: 'pending',
    quantity,
    remark,
    operator,
    operatorName: operator,
    createTime: Date.now()
  })
  setForecastData(forecastList)

  return { success: true, message: type === 'forecast' ? '预计成功' : '领取成功' }
}

export const getForecastData = (): ForecastItem[] => {
  try {
    const data = localStorage.getItem(FORECAST_KEY)
    return data ? JSON.parse(data) : []
  } catch {
    return []
  }
}

export const setForecastData = (data: ForecastItem[]) => {
  localStorage.setItem(FORECAST_KEY, JSON.stringify(data))
}

// ==================== 测试数据初始化 ====================
const MOCK_INIT_KEY = 'mock_data_initialized_v1'

export const initMockData = () => {
  if (localStorage.getItem(MOCK_INIT_KEY)) return

  const now = Date.now()
  const year = '2026'
  const terms = ['暑期', '秋期']
  const grades = ['幼升小', '1年级', '2年级', '3年级', '4年级', '5年级', '6年级', '小升初', '7年级', '8年级', '9年级', '初升高', '高一', '高二']
  const subjects = ['语文', '数学', '英语', '物理', '化学']
  const difficulties = ['无', '基础', '培优', '尖子']

  const stockData: StockItem[] = []
  const logData: LogItem[] = []
  const forecastData: ForecastItem[] = []

  // 生成库存数据和日志
  grades.forEach((grade) => {
    subjects.forEach((subject) => {
      // 每个年级科目组合随机选1-3个难度
      const diffCount = 1 + Math.floor(Math.random() * 3)
      const shuffled = [...difficulties].sort(() => Math.random() - 0.5)
      shuffled.slice(0, diffCount).forEach((difficulty) => {
        terms.forEach((term) => {
          // 洪河校区
          const hongheIn = 20 + Math.floor(Math.random() * 80)
          const hongheOut = Math.floor(Math.random() * (hongheIn * 0.6))
          const hongheStock = hongheIn - hongheOut

          const hStock: StockItem = {
            _id: generateId(),
            campus: 'honghe',
            campusName: '洪河校区',
            year,
            term,
            grade,
            subject,
            difficulty,
            bookName: `${year}年${term}${grade}${subject}${difficulty}`,
            bookCode: '',
            totalQuantity: hongheStock,
            hongheQuantity: hongheStock,
            longhuaQuantity: 0,
            totalIn: hongheIn,
            totalOut: hongheOut,
            remainingStock: hongheStock,
            createTime: now - Math.floor(Math.random() * 30 * 24 * 60 * 60 * 1000),
            updateTime: now - Math.floor(Math.random() * 7 * 24 * 60 * 60 * 1000),
          }
          stockData.push(hStock)

          // 龙华校区
          const longhuaIn = 15 + Math.floor(Math.random() * 70)
          const longhuaOut = Math.floor(Math.random() * (longhuaIn * 0.5))
          const longhuaStock = longhuaIn - longhuaOut

          const lStock: StockItem = {
            _id: generateId(),
            campus: 'longhua',
            campusName: '龙华校区',
            year,
            term,
            grade,
            subject,
            difficulty,
            bookName: `${year}年${term}${grade}${subject}${difficulty}`,
            bookCode: '',
            totalQuantity: longhuaStock,
            hongheQuantity: 0,
            longhuaQuantity: longhuaStock,
            totalIn: longhuaIn,
            totalOut: longhuaOut,
            remainingStock: longhuaStock,
            createTime: now - Math.floor(Math.random() * 30 * 24 * 60 * 60 * 1000),
            updateTime: now - Math.floor(Math.random() * 7 * 24 * 60 * 60 * 1000),
          }
          stockData.push(lStock)

          // 生成入库日志
          const inTime = hStock.createTime
          logData.push({
            _id: generateId(),
            stockId: hStock._id,
            type: 'stock_in',
            operator: 'admin',
            operatorName: '管理员',
            action: '入库',
            detail: '初始入库',
            year,
            term,
            grade,
            subject,
            difficulty,
            campus: 'honghe',
            bookName: hStock.bookName,
            quantity: hongheIn,
            note: '初始入库',
            createTime: inTime,
            createdAt: inTime,
          })

          if (hongheOut > 0) {
            logData.push({
              _id: generateId(),
              stockId: hStock._id,
              type: 'stock_out',
              operator: 'educational',
              operatorName: '教务员',
              action: '出库',
              detail: '教学领用',
              year,
              term,
              grade,
              subject,
              difficulty,
              campus: 'honghe',
              bookName: hStock.bookName,
              quantity: hongheOut,
              note: '教学领用',
              createTime: inTime + Math.floor(Math.random() * 5 * 24 * 60 * 60 * 1000),
              createdAt: inTime + Math.floor(Math.random() * 5 * 24 * 60 * 60 * 1000),
            })
          }

          logData.push({
            _id: generateId(),
            stockId: lStock._id,
            type: 'stock_in',
            operator: 'admin',
            operatorName: '管理员',
            action: '入库',
            detail: '初始入库',
            year,
            term,
            grade,
            subject,
            difficulty,
            campus: 'longhua',
            bookName: lStock.bookName,
            quantity: longhuaIn,
            note: '初始入库',
            createTime: inTime + 1000,
            createdAt: inTime + 1000,
          })

          if (longhuaOut > 0) {
            logData.push({
              _id: generateId(),
              stockId: lStock._id,
              type: 'stock_out',
              operator: 'educational',
              operatorName: '教务员',
              action: '出库',
              detail: '教学领用',
              year,
              term,
              grade,
              subject,
              difficulty,
              campus: 'longhua',
              bookName: lStock.bookName,
              quantity: longhuaOut,
              note: '教学领用',
              createTime: inTime + Math.floor(Math.random() * 5 * 24 * 60 * 60 * 1000) + 2000,
              createdAt: inTime + Math.floor(Math.random() * 5 * 24 * 60 * 60 * 1000) + 2000,
            })
          }

          // 随机生成预计记录
          if (Math.random() > 0.6) {
            forecastData.push({
              _id: generateId(),
              type: 'forecast',
              bookName: hStock.bookName,
              year,
              term,
              grade,
              subject,
              difficulty,
              campus: Math.random() > 0.5 ? 'honghe' : 'longhua',
              campusName: Math.random() > 0.5 ? '洪河校区' : '龙华校区',
              quantity: 5 + Math.floor(Math.random() * 20),
              remark: '下学期教学需要',
              status: 'pending',
              operator: 'teacher',
              operatorName: '教师',
              createTime: now - Math.floor(Math.random() * 14 * 24 * 60 * 60 * 1000),
            })
          }

          // 随机生成领取记录
          if (Math.random() > 0.7) {
            forecastData.push({
              _id: generateId(),
              type: 'receive',
              bookName: hStock.bookName,
              year,
              term,
              grade,
              subject,
              difficulty,
              campus: Math.random() > 0.5 ? 'honghe' : 'longhua',
              campusName: Math.random() > 0.5 ? '洪河校区' : '龙华校区',
              quantity: 3 + Math.floor(Math.random() * 10),
              remark: '班级发放',
              status: 'pending',
              operator: 'teacher',
              operatorName: '教师',
              createTime: now - Math.floor(Math.random() * 10 * 24 * 60 * 60 * 1000),
            })
          }
        })
      })
    })
  })

  // 2025年遗留库存（少量）
  const legacySubjects = ['语文', '数学']
  const legacyGrades = ['6年级', '小升初']
  legacyGrades.forEach((grade) => {
    legacySubjects.forEach((subject) => {
      const hIn = 10 + Math.floor(Math.random() * 20)
      const hOut = Math.floor(Math.random() * hIn * 0.4)
      stockData.push({
        _id: generateId(),
        campus: 'honghe',
        campusName: '洪河校区',
        year: '2025',
        term: '秋期',
        grade,
        subject,
        difficulty: '基础',
        bookName: `2025年秋期${grade}${subject}基础`,
        bookCode: '',
        totalQuantity: hIn - hOut,
        hongheQuantity: hIn - hOut,
        longhuaQuantity: 0,
        totalIn: hIn,
        totalOut: hOut,
        remainingStock: hIn - hOut,
        createTime: now - 200 * 24 * 60 * 60 * 1000,
        updateTime: now - 30 * 24 * 60 * 60 * 1000,
      })
    })
  })

  // 保存到 localStorage
  setStockData(stockData)
  setLogData(logData)
  setForecastData(forecastData)

  // 设置默认年度和时期
  localStorage.setItem('default_year', '2026')
  localStorage.setItem('default_term', '暑期')

  // 标记已初始化
  localStorage.setItem(MOCK_INIT_KEY, 'true')
}

export const clearMockData = () => {
  localStorage.removeItem(STOCK_KEY)
  localStorage.removeItem(LOG_KEY)
  localStorage.removeItem(FORECAST_KEY)
  localStorage.removeItem(MOCK_INIT_KEY)
}
