import { supabase, isSupabaseConfigured } from '../utils/supabase'
import {
  getDefaultYear, getDefaultTerm, setDefaultYear, setDefaultTerm,
  getUserList, setUserList, getRoleList,
  getSubjectList, getGradeList,
  getDifficultyList, getBookList, setBookList,
  getRolePermissions, setRolePermissions, clearAllLocalData
} from '../utils/storage'
import type { BookItem, StockItem, LogItem, ForecastItem } from '../types'

// ==================== 本地存储 key（与 mockData.ts 保持一致）====================
const STOCK_KEY = 'mock_stock_data'
const LOG_KEY = 'mock_log_data'
const FORECAST_KEY = 'mock_forecast_data'

const localGetStockData = (): StockItem[] => {
  try {
    const data = localStorage.getItem(STOCK_KEY)
    return data ? JSON.parse(data) : []
  } catch {
    return []
  }
}

const localSetStockData = (data: StockItem[]) => {
  localStorage.setItem(STOCK_KEY, JSON.stringify(data))
}

const localGetLogData = (): LogItem[] => {
  try {
    const data = localStorage.getItem(LOG_KEY)
    return data ? JSON.parse(data) : []
  } catch {
    return []
  }
}

const localSetLogData = (data: LogItem[]) => {
  localStorage.setItem(LOG_KEY, JSON.stringify(data))
}

const localGetForecastData = (): ForecastItem[] => {
  try {
    const data = localStorage.getItem(FORECAST_KEY)
    return data ? JSON.parse(data) : []
  } catch {
    return []
  }
}

const localSetForecastData = (data: ForecastItem[]) => {
  localStorage.setItem(FORECAST_KEY, JSON.stringify(data))
}

const localGenerateId = () => {
  return Date.now().toString(36) + Math.random().toString(36).substr(2, 9)
}

// ==================== 年级数据迁移 ====================
// 将旧年级名称映射到新年级名称（如"初一"→"7年级"）
const gradeMigrationMap: Record<string, string> = {
  '初一': '7年级',
  '初二': '8年级',
  '初三': '9年级',
  '一年级': '1年级',
  '二年级': '2年级',
  '三年级': '3年级',
  '四年级': '4年级',
  '五年级': '5年级',
  '六年级': '6年级',
}

const migrateGrade = (grade: string | null | undefined): string => {
  if (!grade) return grade || ''
  return gradeMigrationMap[grade] || grade
}

// 迁移对象中的年级字段及关联的书名/编号
const migrateGradeInRecord = (obj: any): any => {
  if (!obj || !obj.grade) return obj
  const oldGrade = obj.grade
  const newGrade = migrateGrade(oldGrade)
  if (oldGrade === newGrade) return obj
  const result = { ...obj, grade: newGrade }
  if (result.bookName) result.bookName = result.bookName.replace(oldGrade, newGrade)
  if (result.bookCode) result.bookCode = result.bookCode.replace(oldGrade, newGrade)
  return result
}

// ==================== 防重复操作锁 ====================
// 记录最近的操作，防止短时间内重复执行相同操作
let lastOperation: { key: string; time: number } | null = null
const DEDUP_WINDOW = 3000 // 3秒内的相同操作视为重复

const checkDuplicateOperation = (data: { campus: string; year: string; term: string; grade: string; subject: string; difficulty: string; quantity: number; type: string }): boolean => {
  const key = `${data.type}|${data.campus}|${data.year}|${data.term}|${data.grade}|${data.subject}|${data.difficulty || ''}|${data.quantity}`
  const now = Date.now()
  if (lastOperation && lastOperation.key === key && (now - lastOperation.time) < DEDUP_WINDOW) {
    console.warn('[防重复] 检测到重复操作，已拦截:', key)
    return true // 是重复操作
  }
  lastOperation = { key, time: now }
  return false
}

// ==================== 在线模式检测 ====================
// RLS 已禁用，数据访问不再依赖 Supabase auth session
// 真正的在线状态需要实际验证连通性，不能只看配置是否存在
let onlineStatus: 'unknown' | 'online' | 'offline' = 'unknown'
let lastCheckTime = 0
const CHECK_CACHE_MS = 30000 // 30秒内不重复检测

// 动态判断是否真正在线
// 需要实际验证 Supabase 是否可达，避免域名失效时所有操作都失败
export const isReallyOnline = async (): Promise<boolean> => {
  if (!isSupabaseConfigured()) return false

  const now = Date.now()
  // 如果最近检测过且结果为 offline，在缓存期内直接返回 false
  // 避免每次调用都等待超时
  if (onlineStatus === 'offline' && (now - lastCheckTime) < CHECK_CACHE_MS) {
    return false
  }
  if (onlineStatus === 'online' && (now - lastCheckTime) < CHECK_CACHE_MS) {
    return true
  }

  // 用 Promise.race 做超时检测（5秒）
  try {
    const result = await Promise.race([
      supabase.from('books').select('id').limit(1),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('timeout')), 5000)
      )
    ])
    if ((result as any).error) {
      // 有错误但不是网络错误（如表不存在），也视为在线（API可达）
      onlineStatus = 'online'
      lastCheckTime = now
      return true
    }
    onlineStatus = 'online'
    lastCheckTime = now
    return true
  } catch {
    onlineStatus = 'offline'
    lastCheckTime = now
    console.warn('[isReallyOnline] 云端不可达，切换到离线模式')
    return false
  }
}

// 手动设置离线状态（当某个 API 失败时调用，加速后续降级）
export const markOffline = () => {
  onlineStatus = 'offline'
  lastCheckTime = Date.now()
}

// ==================== 本地数据同步到云端 ====================
// 首次连接云端时，将本地数据上传到 Supabase（仅在云端为空时）
// 同步策略：云端是唯一真相源
// - 云端有数据 → 拉取到本地（覆盖本地）
// - 云端无数据 && 本地有数据 → 上传本地到云端
// - 两边都没有 → 不操作
// 按表独立判断，不全有或全无
export const syncLocalToCloud = async (): Promise<{ success: boolean; message: string }> => {
  if (!(await isReallyOnline())) {
    return { success: false, message: '云端未连接' }
  }

  try {
    const results: string[] = []

    // ========== 1. 书本数据 ==========
    const { data: cloudBooks } = await supabase.from('books').select('id').limit(1)
    const hasCloudBooks = cloudBooks && cloudBooks.length > 0
    const localBooks = getBookList()

    if (hasCloudBooks) {
      // 云端有，拉取到本地
      const { data } = await supabase.from('books').select('*').order('created_at', { ascending: false })
      if (data) {
        const mapped = data.map((b: any) => ({
          _id: b.id,
          bookName: b.book_name,
          bookCode: b.book_code || '',
          year: b.year,
          term: b.term,
          grade: b.grade,
          subject: b.subject,
          difficulty: b.difficulty || '',
          totalQuantity: b.total_quantity || 0,
          hongheQuantity: b.honghe_quantity || 0,
          longhuaQuantity: b.longhua_quantity || 0,
          createTime: new Date(b.created_at).getTime()
        }))
        setBookList(mapped)
        results.push(`书本：从云端拉取 ${mapped.length} 条`)
      }
    } else if (localBooks.length > 0) {
      // 云端无，本地上传
      const bookRows = localBooks.map((b: any) => ({
        book_name: b.bookName,
        book_code: b.bookCode || '',
        year: b.year,
        term: b.term,
        grade: b.grade,
        subject: b.subject,
        difficulty: b.difficulty || null,
        total_quantity: b.totalQuantity || 0,
        honghe_quantity: b.hongheQuantity || 0,
        longhua_quantity: b.longhuaQuantity || 0
      }))
      const { error } = await supabase.from('books').insert(bookRows)
      if (!error) results.push(`书本：上传 ${localBooks.length} 条`)
    }

    // ========== 2. 库存数据 ==========
    const { data: cloudStock } = await supabase.from('stock').select('id').limit(1)
    const hasCloudStock = cloudStock && cloudStock.length > 0

    if (hasCloudStock) {
      const { data } = await supabase.from('stock').select('*').order('created_at', { ascending: false })
      if (data) {
        const mapped = data.map((s: any) => ({
          _id: s.id,
          campus: s.campus,
          campusName: s.campus_name,
          year: s.year,
          term: s.term,
          grade: s.grade,
          subject: s.subject,
          difficulty: s.difficulty || '',
          bookName: s.book_name,
          bookCode: s.book_code || '',
          totalQuantity: s.total_quantity || 0,
          hongheQuantity: s.honghe_quantity || 0,
          longhuaQuantity: s.longhua_quantity || 0,
          totalIn: s.total_in || 0,
          totalOut: s.total_out || 0,
          remainingStock: s.remaining_stock || 0,
          createTime: new Date(s.created_at).getTime(),
          updateTime: new Date(s.updated_at).getTime()
        }))
        localSetStockData(mapped)
        results.push(`库存：从云端拉取 ${mapped.length} 条`)
      }
    } else {
      // 云端无库存数据：清空本地旧数据，避免旧数据自动上传回云端
      // 库存记录只能通过用户实际的出入库操作创建，不应从本地恢复
      localSetStockData([])
      results.push('库存：云端为空，已清空本地旧数据')
    }

    // ========== 3. 预计/领取数据 ==========
    const { data: cloudForecasts } = await supabase.from('forecasts').select('id').limit(1)
    const hasCloudForecasts = cloudForecasts && cloudForecasts.length > 0

    if (hasCloudForecasts) {
      const { data } = await supabase.from('forecasts').select('*').order('created_at', { ascending: false })
      if (data) {
        const mapped = data.map((f: any) => ({
          _id: f.id,
          type: f.type,
          bookName: f.book_name || '',
          year: f.year || '',
          term: f.term || '',
          grade: f.grade || '',
          subject: f.subject || '',
          difficulty: f.difficulty || '',
          campus: f.campus || '',
          campusName: f.campus_name || '',
          quantity: f.quantity || 0,
          remark: f.remark || '',
          status: f.status || 'pending',
          operator: f.operator || '',
          operatorName: f.operator_name || '',
          createTime: new Date(f.created_at).getTime()
        }))
        localSetForecastData(mapped)
        results.push(`预计/领取：从云端拉取 ${mapped.length} 条`)
      }
    } else {
      // 云端无预计数据：清空本地旧数据，避免旧数据自动上传回云端
      localSetForecastData([])
      results.push('预计/领取：云端为空，已清空本地旧数据')
    }

    // ========== 4. 日志数据 ==========
    const { data: cloudLogs } = await supabase.from('logs').select('id').limit(1)
    const hasCloudLogs = cloudLogs && cloudLogs.length > 0

    if (hasCloudLogs) {
      const { data } = await supabase.from('logs').select('*').order('created_at', { ascending: false })
      if (data) {
        const mapped = data.map((l: any) => ({
          _id: l.id,
          stockId: l.stock_id || '',
          type: l.type,
          operator: l.operator || '',
          operatorName: l.operator_name || '',
          action: l.action || '',
          detail: l.detail || '',
          year: l.year || '',
          term: l.term || '',
          grade: l.grade || '',
          subject: l.subject || '',
          difficulty: l.difficulty || '',
          campus: l.campus || '',
          bookName: l.book_name || '',
          quantity: l.quantity || 0,
          note: l.note || '',
          createTime: new Date(l.created_at).getTime()
        }))
        localSetLogData(mapped)
        results.push(`日志：从云端拉取 ${mapped.length} 条`)
      }
    } else {
      // 云端无日志数据：清空本地旧数据，避免旧数据自动上传回云端
      // 日志只能通过用户实际的出入库操作创建，不应从本地恢复
      localSetLogData([])
      results.push('日志：云端为空，已清空本地旧数据')
    }

    // ========== 5. 用户数据 ==========
    const { data: cloudUsers } = await supabase.from('users').select('id').limit(1)
    const hasCloudUsers = cloudUsers && cloudUsers.length > 0
    const localUsers = getUserList()

    if (hasCloudUsers) {
      const { data } = await supabase.from('users').select('*').order('created_at')
      if (data) {
        const mapped = data.map((u: any) => ({
          _id: u.id,
          openid: u.openid,
          userName: u.user_name,
          nickName: u.nick_name,
          role: u.role,
          campus: u.campus,
          campusName: u.campus_name,
          roles: u.roles || [],
          campuses: u.campuses || [],
          password: u.password,
          createTime: new Date(u.created_at).getTime()
        }))
        setUserList(mapped)
        results.push(`用户：从云端拉取 ${mapped.length} 条`)
      }
    } else if (localUsers.length > 0) {
      const userRows = localUsers.map((u: any) => ({
        openid: u.openid || ('local-' + u._id),
        user_name: u.userName || u.nickName,
        nick_name: u.nickName,
        role: u.role || 'teacher',
        campus: u.campus || 'honghe',
        campus_name: u.campusName || '',
        roles: u.roles || ['teacher'],
        campuses: u.campuses || ['honghe'],
        password: u.password || ''
      }))
      const { error } = await supabase.from('users').insert(userRows)
      if (!error) results.push(`用户：上传 ${localUsers.length} 条`)
    }

    // ========== 6. 角色权限 ==========
    const { data: cloudRolePerms } = await supabase.from('role_permissions').select('role').limit(1)
    const hasCloudRolePerms = cloudRolePerms && cloudRolePerms.length > 0
    const localRolePerms = getRolePermissions()

    // 新增权限合并表：确保旧数据中缺少的新权限能自动补充
    const NEW_PERMS_BY_ROLE: Record<string, string[]> = {
      super: ['stock_return'],
      admin: ['stock_return'],
      educational: ['stock_return']
    }

    if (hasCloudRolePerms) {
      const { data } = await supabase.from('role_permissions').select('role, permissions')
      if (data) {
        const perms: Record<string, string[]> = {}
        let permsChanged = false
        data.forEach((r: any) => {
          const cloudPerms = r.permissions || []
          const newPerms = NEW_PERMS_BY_ROLE[r.role] || []
          const missing = newPerms.filter((p: string) => !cloudPerms.includes(p))
          if (missing.length > 0) {
            perms[r.role] = [...cloudPerms, ...missing]
            permsChanged = true
          } else {
            perms[r.role] = cloudPerms
          }
        })
        setRolePermissions(perms)
        results.push(`角色权限：从云端拉取${permsChanged ? '（已合并新权限）' : ''}`)

        // 如果有新增权限，同步更新到云端
        if (permsChanged) {
          for (const [role, rolePerms] of Object.entries(perms)) {
            await supabase.from('role_permissions')
              .upsert({ role, permissions: rolePerms }, { onConflict: 'role' })
          }
        }
      }
    } else if (Object.keys(localRolePerms).length > 0) {
      const permRows = Object.entries(localRolePerms).map(([role, permissions]) => ({
        role,
        permissions
      }))
      await supabase.from('role_permissions').insert(permRows)
      results.push(`角色权限：上传`)
    }

    return { success: true, message: results.join('；') || '无数据需要同步' }
  } catch (err: any) {
    console.error('同步失败:', err)
    return { success: false, message: err.message || '同步失败' }
  }
}

// ==================== 用户相关 ====================
export const getCurrentUser = async () => {
  if (await isReallyOnline()) {
    const { data } = await supabase.auth.getUser()
    return data.user
  }
  return null
}

// ==================== 系统设置 ====================
export const fetchDefaultYearTerm = async () => {
  if (await isReallyOnline()) {
    const { data } = await supabase.from('system_settings').select('key, value')
    if (data && data.length > 0) {
      const year = data.find(d => d.key === 'default_year')?.value || '2026'
      const term = data.find(d => d.key === 'default_term')?.value || '暑期'
      return { year, term }
    }
    // Supabase 返回空，回退到 localStorage
  }
  return { year: getDefaultYear() || '2026', term: getDefaultTerm() || '暑期' }
}

export const updateDefaultYearTerm = async (year: string, term: string) => {
  // 始终写入 localStorage，保证离线可用
  setDefaultYear(year)
  setDefaultTerm(term)
  // 如果真正在线，同时写入 Supabase
  if (await isReallyOnline()) {
    await supabase.from('system_settings').upsert([
      { key: 'default_year', value: year },
      { key: 'default_term', value: term }
    ], { onConflict: 'key' })
  }
}

// ==================== 年级/科目/难度 ====================
export const fetchGrades = async () => {
  // 年级选项固定为默认值，不从云端读取
  // 避免云端旧数据导致年级显示不一致
  return getGradeList()
}

export const fetchSubjects = async () => {
  // 科目选项固定为默认值，不从云端读取
  return getSubjectList()
}

export const fetchDifficulties = async () => {
  // 难度选项固定为：无、基础、培优、尖子，不从云端读取
  // 避免云端旧数据导致难度选项错误
  return getDifficultyList()
}

// ==================== 书本管理 ====================
export const fetchBooks = async () => {
  const online = await isReallyOnline()
  if (online) {
    try {
      const { data, error } = await supabase.from('books').select('*').order('created_at', { ascending: false })
      if (error) {
        console.error('[fetchBooks] 读取云端失败:', error.message, error)
        markOffline()
        // 云端失败，回退到本地数据
        return getBookList()
      }
      const result = data?.map(b => migrateGradeInRecord({
        _id: b.id,
        bookName: b.book_name,
        bookCode: b.book_code || '',
        year: b.year,
        term: b.term,
        grade: b.grade,
        subject: b.subject,
        difficulty: b.difficulty || '',
        totalQuantity: b.total_quantity || 0,
        hongheQuantity: b.honghe_quantity || 0,
        longhuaQuantity: b.longhua_quantity || 0,
        createTime: new Date(b.created_at).getTime()
      })) || []
      // 同步到本地
      setBookList(result)
      return result
    } catch (e) {
      console.error('[fetchBooks] 云端请求异常:', e)
      markOffline()
      // 云端异常，回退到本地数据
      return getBookList()
    }
  }
  return getBookList()
}

export const addBook = async (book: any) => {
  // 始终写入 localStorage，保证离线可用
  const list = getBookList()
  list.push(book)
  setBookList(list)
  // 如果真正在线，同时写入 Supabase
  if (await isReallyOnline()) {
    const { error } = await supabase.from('books').insert({
      book_name: book.bookName,
      book_code: book.bookCode,
      year: book.year,
      term: book.term,
      grade: book.grade,
      subject: book.subject,
      difficulty: book.difficulty || null,
      total_quantity: book.totalQuantity || 0,
      honghe_quantity: book.hongheQuantity || 0,
      longhua_quantity: book.longhuaQuantity || 0
    })
    if (error) {
      console.error('[addBook] 云端同步失败:', error.message)
      markOffline()
    }
    return { success: !error, error: error?.message }
  }
  return { success: true }
}

export const updateBook = async (id: string, updates: any) => {
  // 始终写入 localStorage，保证离线可用
  const list = getBookList()
  const idx = list.findIndex((b: BookItem) => b._id === id)
  if (idx >= 0) {
    list[idx] = { ...list[idx], ...updates }
    setBookList(list)
  }
  // 如果真正在线，同时写入 Supabase
  if (await isReallyOnline()) {
    const { error } = await supabase.from('books').update({
      book_name: updates.bookName,
      book_code: updates.bookCode,
      year: updates.year,
      term: updates.term,
      grade: updates.grade,
      subject: updates.subject,
      difficulty: updates.difficulty || null
    }).eq('id', id)
    return { success: !error, error: error?.message }
  }
  return { success: true }
}

export const deleteBook = async (year: string, term: string, grade: string, subject: string, difficulty: string) => {
  const matchFields: Record<string, string> = { year, term, grade, subject }
  const diffVal = difficulty || null

  // 构建 Supabase 删除查询（同时处理 difficulty 为 null 和空字符串的情况）
  // 旧数据中 difficulty 可能是 NULL 也可能是空字符串 ''，两种都要删除
  const deleteMatch = async (table: string) => {
    if (diffVal) {
      // 有难度值：精确匹配
      const { error } = await supabase.from(table).delete().match(matchFields).eq('difficulty', diffVal)
      if (error) console.error(`[deleteBook] 删除 ${table} (difficulty=${diffVal}) 失败:`, error.message)
    } else {
      // 无难度值：同时删除 difficulty 为 NULL 和空字符串的记录
      const { error: err1 } = await supabase.from(table).delete().match(matchFields).is('difficulty', null)
      if (err1) console.error(`[deleteBook] 删除 ${table} (difficulty IS NULL) 失败:`, err1.message)
      const { error: err2 } = await supabase.from(table).delete().match(matchFields).eq('difficulty', '')
      if (err2) console.error(`[deleteBook] 删除 ${table} (difficulty='') 失败:`, err2.message)
    }
  }

  // 始终删除 localStorage，保证离线可用
  const bookList = getBookList()
  const newList = bookList.filter((b: BookItem) =>
    !((b as any).year === year && (b as any).term === term && b.grade === grade && b.subject === subject && b.difficulty === difficulty)
  )
  setBookList(newList)

  const stockList = localGetStockData()
  const newStock = stockList.filter((s: StockItem) =>
    !(s.year === year && s.term === term && s.grade === grade && s.subject === subject && s.difficulty === difficulty)
  )
  localSetStockData(newStock)

  const logList = localGetLogData()
  const newLogs = logList.filter((l: LogItem) =>
    !(l.year === year && l.term === term && l.grade === grade && l.subject === subject && l.difficulty === difficulty)
  )
  localSetLogData(newLogs)

  const forecastList = localGetForecastData()
  const newForecasts = forecastList.filter((f: ForecastItem) =>
    !(f.year === year && f.term === term && f.grade === grade && f.subject === subject && f.difficulty === difficulty)
  )
  localSetForecastData(newForecasts)

  // 如果真正在线，同时删除 Supabase
  if (await isReallyOnline()) {
    await Promise.all([
      deleteMatch('books'),
      deleteMatch('stock'),
      deleteMatch('logs'),
      deleteMatch('forecasts')
    ])
  }

  return { success: true }
}

// ==================== 库存管理 ====================
export const fetchStock = async () => {
  const online = await isReallyOnline()
  if (online) {
    try {
      const { data, error } = await supabase.from('stock').select('*').order('created_at', { ascending: false })
      if (error) {
        console.error('[fetchStock] 读取云端失败:', error.message, error)
        markOffline()
        // 云端失败，回退到本地数据
        return localGetStockData()
      }
      const result = data?.map(s => migrateGradeInRecord({
        _id: s.id,
        campus: s.campus,
        campusName: s.campus_name,
        year: s.year,
        term: s.term,
        grade: s.grade,
        subject: s.subject,
        difficulty: s.difficulty || '',
        bookName: s.book_name,
        bookCode: s.book_code || '',
        totalQuantity: s.total_quantity || 0,
        hongheQuantity: s.honghe_quantity || 0,
        longhuaQuantity: s.longhua_quantity || 0,
        totalIn: s.total_in || 0,
        totalOut: s.total_out || 0,
        remainingStock: s.remaining_stock || 0,
        createTime: new Date(s.created_at).getTime(),
        updateTime: new Date(s.updated_at).getTime()
      })) || []
      // 同步到本地
      localSetStockData(result)
      return result
    } catch (e) {
      console.error('[fetchStock] 云端请求异常:', e)
      markOffline()
      // 云端异常，回退到本地数据
      return localGetStockData()
    }
  }
  return localGetStockData()
}

export const upsertStock = async (stock: Partial<StockItem>) => {
  // 始终写入 localStorage，保证离线可用
  const list = localGetStockData()
  const idx = list.findIndex((s: StockItem) =>
    s.campus === stock.campus && s.year === stock.year && s.term === stock.term &&
    s.grade === stock.grade && s.subject === stock.subject && s.difficulty === stock.difficulty
  )
  if (idx >= 0) {
    list[idx] = { ...list[idx], ...stock } as StockItem
  } else {
    list.push(stock as StockItem)
  }
  localSetStockData(list)
  // 如果真正在线，同时写入 Supabase
  if (await isReallyOnline()) {
    const diffVal = stock.difficulty || null
    const baseFilter = (q: any) => q.eq('campus', stock.campus || '')
      .eq('year', stock.year || '').eq('term', stock.term || '')
      .eq('grade', stock.grade || '').eq('subject', stock.subject || '')

    const stockRow = {
      campus: stock.campus,
      campus_name: stock.campusName,
      year: stock.year,
      term: stock.term,
      grade: stock.grade,
      subject: stock.subject,
      difficulty: stock.difficulty || null,
      book_name: stock.bookName,
      book_code: stock.bookCode,
      total_quantity: stock.totalQuantity,
      honghe_quantity: stock.hongheQuantity,
      longhua_quantity: stock.longhuaQuantity,
      total_in: stock.totalIn,
      total_out: stock.totalOut,
      remaining_stock: stock.remainingStock
    }

    // 先查询是否已有记录
    let existing: any = null
    if (diffVal) {
      const { data } = await baseFilter(
        supabase.from('stock').select('id')
      ).eq('difficulty', diffVal).limit(1)
      existing = data?.[0] || null
    } else {
      const { data: data1 } = await baseFilter(
        supabase.from('stock').select('id')
      ).is('difficulty', null).limit(1)
      const { data: data2 } = await baseFilter(
        supabase.from('stock').select('id')
      ).eq('difficulty', '').limit(1)
      existing = data1?.[0] || data2?.[0] || null
    }

    let error = null
    if (existing) {
      const result = await supabase.from('stock').update(stockRow).eq('id', existing.id)
      error = result.error
    } else {
      const result = await supabase.from('stock').insert(stockRow)
      error = result.error
    }
    if (error) {
      console.error('[upsertStock] 云端同步失败:', error.message)
      markOffline()
    }
    return { success: !error, error: error?.message }
  }
  return { success: true }
}

// ==================== 库存操作（合并视图+入库/出库/日志）====================

// 清理孤立库存记录：删除没有对应书本的库存数据
// 同时清理重复记录（同一书本+校区存在多条记录，difficulty 为 NULL 和 '' 的情况）
export const cleanupOrphanedStock = async () => {
  if (!(await isReallyOnline())) return

  try {
    const [stockList, books] = await Promise.all([fetchStock(), fetchBooks()])
    const bookKeys = new Set(books.map((b: any) => `${b.year}-${b.term}-${b.grade}-${b.subject}-${b.difficulty || ''}`))

    // 找出孤立库存记录（没有对应书本的）
    const orphanedIds: string[] = []
    const seenKeys = new Map<string, string>() // key -> first record id

    for (const s of stockList) {
      const key = `${s.year}-${s.term}-${s.grade}-${s.subject}-${s.difficulty || ''}`
      if (!bookKeys.has(key)) {
        // 没有对应书本，标记为孤立
        orphanedIds.push(s._id || '')
      } else {
        // 有对应书本，检查是否有重复
        const uniqueKey = `${key}-${s.campus}`
        if (seenKeys.has(uniqueKey)) {
          // 重复记录，也标记为需要清理
          orphanedIds.push(s._id || '')
        } else {
          seenKeys.set(uniqueKey, s._id || '')
        }
      }
    }

    if (orphanedIds.length > 0) {
      console.log(`[cleanupOrphanedStock] 发现 ${orphanedIds.length} 条孤立/重复库存记录，正在清理...`)
      // 批量删除孤立记录
      const { error } = await supabase.from('stock').delete().in('id', orphanedIds)
      if (error) {
        console.error('[cleanupOrphanedStock] 清理失败:', error.message)
      } else {
        // 同时清理本地 localStorage
        const localStock = localGetStockData()
        const cleaned = localStock.filter((s: StockItem) => !orphanedIds.includes(s._id || ''))
        localSetStockData(cleaned)
        console.log(`[cleanupOrphanedStock] 清理完成，删除 ${orphanedIds.length} 条`)
      }
    }
  } catch (err) {
    console.error('[cleanupOrphanedStock] 清理异常:', err)
  }
}

// 系统标准年级和难度列表（用于检测并清理旧数据）
const VALID_GRADES = ['幼升小', '1年级', '2年级', '3年级', '4年级', '5年级', '6年级', '小升初', '7年级', '8年级', '9年级', '初升高', '高一', '高二']
const VALID_DIFFICULTIES = ['无', '基础', '培优', '尖子']

// 清理无效日志记录：只清理使用了旧年级名/难度名的日志
// 注意：不再清理"孤立"日志（引用了已删除书本的日志），因为：
// 1. 删除书本时 deleteBook 已会清理关联日志
// 2. 自动清理可能导致刚导入的日志因时间差被误删
export const cleanupOrphanedLogs = async () => {
  if (!(await isReallyOnline())) return

  try {
    const logList = await fetchLogs()

    const orphanedIds: string[] = []

    for (const l of logList) {
      // 只清理使用了旧年级名或旧难度名的无效数据
      const hasInvalidGrade = !VALID_GRADES.includes(l.grade || '')
      const hasInvalidDifficulty = l.difficulty && l.difficulty !== '' && !VALID_DIFFICULTIES.includes(l.difficulty)

      if (hasInvalidGrade || hasInvalidDifficulty) {
        orphanedIds.push(l._id || '')
      }
    }

    if (orphanedIds.length > 0) {
      console.log(`[cleanupOrphanedLogs] 发现 ${orphanedIds.length} 条孤立/无效日志记录，正在清理...`)
      const { error } = await supabase.from('logs').delete().in('id', orphanedIds)
      if (error) {
        console.error('[cleanupOrphanedLogs] 清理失败:', error.message)
      } else {
        const localLogs = localGetLogData()
        const cleaned = localLogs.filter((l: LogItem) => !orphanedIds.includes(l._id || ''))
        localSetLogData(cleaned)
        console.log(`[cleanupOrphanedLogs] 清理完成，删除 ${orphanedIds.length} 条`)
      }
    }
  } catch (err) {
    console.error('[cleanupOrphanedLogs] 清理异常:', err)
  }
}

// 清理无效预计/领取记录：只清理使用了旧年级名/难度名的记录
// 注意：不再清理"孤立"记录，原因同 cleanupOrphanedLogs
export const cleanupOrphanedForecasts = async () => {
  if (!(await isReallyOnline())) return

  try {
    const forecastList = await fetchForecasts()

    const orphanedIds: string[] = []

    for (const f of forecastList) {
      // 只清理使用了旧年级名或旧难度名的无效数据
      const hasInvalidGrade = !VALID_GRADES.includes(f.grade || '')
      const hasInvalidDifficulty = f.difficulty && f.difficulty !== '' && !VALID_DIFFICULTIES.includes(f.difficulty)

      if (hasInvalidGrade || hasInvalidDifficulty) {
        orphanedIds.push(f._id || '')
      }
    }

    if (orphanedIds.length > 0) {
      console.log(`[cleanupOrphanedForecasts] 发现 ${orphanedIds.length} 条孤立/无效预计记录，正在清理...`)
      const { error } = await supabase.from('forecasts').delete().in('id', orphanedIds)
      if (error) {
        console.error('[cleanupOrphanedForecasts] 清理失败:', error.message)
      } else {
        const localForecasts = localGetForecastData()
        const cleaned = localForecasts.filter((f: ForecastItem) => !orphanedIds.includes(f._id || ''))
        localSetForecastData(cleaned)
        console.log(`[cleanupOrphanedForecasts] 清理完成，删除 ${orphanedIds.length} 条`)
      }
    }
  } catch (err) {
    console.error('[cleanupOrphanedForecasts] 清理异常:', err)
  }
}

// 获取合并后的库存列表（按书本合并两个校区的数据）
export const fetchMergedStock = async (filters?: {
  year?: string
  term?: string
  grade?: string
  subject?: string
  difficulty?: string
  campus?: string
}) => {
  const stockList = await fetchStock()
  // 同时获取书本列表，库存只显示已设置的书本
  const books = await fetchBooks()
  const bookKeys = new Set(books.map((b: any) => `${b.year}-${b.term}-${b.grade}-${b.subject}-${b.difficulty || ''}`))

  let filtered = stockList.filter(s => {
    const key = `${s.year}-${s.term}-${s.grade}-${s.subject}-${s.difficulty || ''}`
    return bookKeys.has(key)
  })

  // 后台清理孤立记录（不阻塞当前查询）：库存、日志、预计
  cleanupOrphanedStock()
  cleanupOrphanedLogs()
  cleanupOrphanedForecasts()

  if (filters?.year) filtered = filtered.filter(s => s.year === filters.year)
  if (filters?.term) filtered = filtered.filter(s => s.term === filters.term)
  if (filters?.grade) filtered = filtered.filter(s => s.grade === filters.grade)
  if (filters?.subject) filtered = filtered.filter(s => s.subject === filters.subject)
  if (filters?.difficulty) filtered = filtered.filter(s => s.difficulty === filters.difficulty)
  if (filters?.campus && filters.campus !== 'all') filtered = filtered.filter(s => s.campus === filters.campus)

  const booksMap: Record<string, any> = {}
  filtered.forEach((item: StockItem) => {
    const key = `${item.year}-${item.term}-${item.grade}-${item.subject}-${item.difficulty}`
    if (!booksMap[key]) {
      booksMap[key] = {
        _id: key,
        year: item.year,
        term: item.term,
        grade: item.grade,
        subject: item.subject,
        difficulty: item.difficulty || '',
        bookName: item.bookName || '',
        bookCode: item.bookCode || '',
        totalQuantity: 0,
        hongheQuantity: 0,
        longhuaQuantity: 0,
        qrcodeUrl: (item as any).qrcodeUrl || '',
        hongheStock: 0,
        hongheTotalIn: 0,
        hongheTotalOut: 0,
        longhuaStock: 0,
        longhuaTotalIn: 0,
        longhuaTotalOut: 0,
        createTime: item.createTime || Date.now()
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

  return mergedList
}

// 入库操作
export const stockIn = async (data: {
  campus: string
  year: string
  term: string
  grade: string
  subject: string
  difficulty: string
  bookName?: string
  quantity: number
  remark?: string
  operator?: string
  operatorName?: string
  scanOperate?: boolean
  logType?: string
  logAction?: string
}) => {
  const { campus, year, term, grade, subject, difficulty, bookName, quantity, remark, operator, operatorName, scanOperate, logType, logAction } = data
  const finalLogType = logType || 'stock_in'
  const finalLogAction = logAction || '入库'

  // 网络断线时拦截操作，不写入本地，避免数据冲突
  const online = await isReallyOnline()
  if (!online) {
    return { success: false, message: '网络连接失败，数据未上传。\n请网络恢复后重试，或换一个网络正常的设备操作。' }
  }

  // 防重复操作：3秒内相同的入库操作直接拦截
  if (checkDuplicateOperation({ type: finalLogType, campus, year, term, grade, subject, difficulty, quantity })) {
    return { success: true, message: finalLogAction + '成功' }
  }

  const stockList = await fetchStock()
  const existing = stockList.find((s: StockItem) =>
    s.campus === campus && s.year === year && s.term === term &&
    s.grade === grade && s.subject === subject && s.difficulty === difficulty
  )

  const newTotalIn = (existing?.totalIn || 0) + quantity
  const newRemaining = newTotalIn - (existing?.totalOut || 0)

  const stockData: Partial<StockItem> = {
    campus,
    campusName: campus === 'honghe' ? '洪河校区' : '龙华校区',
    year,
    term,
    grade,
    subject,
    difficulty: difficulty || '',
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
  }

  const upsertResult = await upsertStock(stockData)
  if (!upsertResult.success) {
    return { success: false, message: upsertResult.error || finalLogAction + '失败' }
  }

  // 添加日志
  await addLog({
    stockId: existing?._id || '',
    type: finalLogType,
    operator: operator || '',
    operatorName: operatorName || '',
    action: finalLogAction,
    detail: remark || (scanOperate ? '扫码' + finalLogAction : '手动' + finalLogAction),
    year,
    term,
    grade,
    subject,
    difficulty: difficulty || '',
    campus,
    bookName: bookName || existing?.bookName || '',
    quantity,
    note: remark || (scanOperate ? '扫码' + finalLogAction : '手动' + finalLogAction),
    createTime: Date.now()
  })

  return { success: true, message: finalLogAction + '成功' }
}

// 出库操作
export const stockOut = async (data: {
  campus: string
  year: string
  term: string
  grade: string
  subject: string
  difficulty: string
  bookName?: string
  quantity: number
  remark?: string
  operator?: string
  operatorName?: string
  scanOperate?: boolean
  logType?: string
  logAction?: string
}) => {
  const { campus, year, term, grade, subject, difficulty, bookName, quantity, remark, operator, operatorName, scanOperate, logType, logAction } = data
  const finalLogType = logType || 'stock_out'
  const finalLogAction = logAction || '出库'

  // 网络断线时拦截操作，不写入本地，避免数据冲突
  const online = await isReallyOnline()
  if (!online) {
    return { success: false, message: '网络连接失败，数据未上传。\n请网络恢复后重试，或换一个网络正常的设备操作。' }
  }

  // 防重复操作：3秒内相同的出库操作直接拦截
  if (checkDuplicateOperation({ type: finalLogType, campus, year, term, grade, subject, difficulty, quantity })) {
    return { success: true, message: finalLogAction + '成功' }
  }

  const stockList = await fetchStock()
  const existing = stockList.find((s: StockItem) =>
    s.campus === campus && s.year === year && s.term === term &&
    s.grade === grade && s.subject === subject && s.difficulty === difficulty
  )

  if (!existing || (existing.remainingStock || 0) < quantity) {
    return { success: false, message: '库存不足' }
  }

  const newTotalOut = (existing.totalOut || 0) + quantity
  const newRemaining = (existing.totalIn || 0) - newTotalOut

  const stockData: Partial<StockItem> = {
    campus,
    campusName: campus === 'honghe' ? '洪河校区' : '龙华校区',
    year,
    term,
    grade,
    subject,
    difficulty: difficulty || '',
    bookName: bookName || existing.bookName || '',
    bookCode: existing.bookCode || '',
    totalQuantity: newRemaining,
    hongheQuantity: campus === 'honghe' ? newRemaining : (existing.hongheQuantity || 0),
    longhuaQuantity: campus === 'longhua' ? newRemaining : (existing.longhuaQuantity || 0),
    totalIn: existing.totalIn || 0,
    totalOut: newTotalOut,
    remainingStock: newRemaining,
    createTime: existing.createTime || Date.now(),
    updateTime: Date.now()
  }

  const upsertResult = await upsertStock(stockData)
  if (!upsertResult.success) {
    return { success: false, message: upsertResult.error || finalLogAction + '失败' }
  }

  // 添加日志
  await addLog({
    stockId: existing._id || '',
    type: finalLogType,
    operator: operator || '',
    operatorName: operatorName || '',
    action: finalLogAction,
    detail: remark || (scanOperate ? '扫码' + finalLogAction : '手动' + finalLogAction),
    year,
    term,
    grade,
    subject,
    difficulty: difficulty || '',
    campus,
    bookName: bookName || existing.bookName || '',
    quantity,
    note: remark || (scanOperate ? '扫码' + finalLogAction : '手动' + finalLogAction),
    createTime: Date.now()
  })

  return { success: true, message: '出库成功' }
}

// 获取库存日志
export const fetchStockLogs = async (filters?: {
  campus?: string
  year?: string
  term?: string
  grade?: string
  subject?: string
  difficulty?: string
  scanOperate?: boolean
}) => {
  const logList = await fetchLogs()
  let filtered = logList

  if (filters?.campus && filters.campus !== 'all') filtered = filtered.filter(l => l.campus === filters.campus)
  if (filters?.year) filtered = filtered.filter(l => l.year === filters.year)
  if (filters?.term) filtered = filtered.filter(l => l.term === filters.term)
  if (filters?.grade) filtered = filtered.filter(l => l.grade === filters.grade)
  if (filters?.subject) filtered = filtered.filter(l => l.subject === filters.subject)
  if (filters?.difficulty) filtered = filtered.filter(l => l.difficulty === filters.difficulty)
  if (filters?.scanOperate !== undefined) filtered = filtered.filter((l: any) => l.scanOperate === filters.scanOperate)

  filtered.sort((a, b) => b.createTime - a.createTime)
  return filtered
}

// ==================== 预计/领取 ====================
export const fetchForecasts = async () => {
  const online = await isReallyOnline()
  if (online) {
    try {
      const { data, error } = await supabase.from('forecasts').select('*').order('created_at', { ascending: false })
      if (error) {
        console.error('[fetchForecasts] 读取云端失败:', error.message, error)
        markOffline()
        return localGetForecastData()
      }
      const result = data?.map(f => migrateGradeInRecord({
        _id: f.id,
        type: f.type,
        bookName: f.book_name || '',
        year: f.year || '',
        term: f.term || '',
        grade: f.grade || '',
        subject: f.subject || '',
        difficulty: f.difficulty || '',
        campus: f.campus || '',
        campusName: f.campus_name || '',
        quantity: f.quantity || 0,
        remark: f.remark || '',
        status: f.status || 'pending',
        operator: f.operator || '',
        operatorName: f.operator_name || '',
        createTime: new Date(f.created_at).getTime()
      })) || []
      localSetForecastData(result)
      return result
    } catch (e) {
      console.error('[fetchForecasts] 云端请求异常:', e)
      markOffline()
      return localGetForecastData()
    }
  }
  return localGetForecastData()
}

export const addForecast = async (item: Partial<ForecastItem>) => {
  // 始终写入 localStorage，保证离线可用
  const list = localGetForecastData()
  list.push(item as ForecastItem)
  localSetForecastData(list)
  // 如果真正在线，同时写入 Supabase
  const online = await isReallyOnline()
  if (online) {
    const { error } = await supabase.from('forecasts').insert({
      type: item.type,
      book_name: item.bookName,
      year: item.year,
      term: item.term,
      grade: item.grade,
      subject: item.subject,
      difficulty: item.difficulty || null,
      campus: item.campus,
      campus_name: item.campusName,
      quantity: item.quantity,
      remark: item.remark,
      status: item.status,
      operator: item.operator,
      operator_name: item.operatorName
    })
    if (error) {
      console.error('[addForecast] 写入云端失败:', error.message, error)
    }
    return { success: !error, error: error?.message }
  }
  console.warn('[addForecast] 未连接云端，仅写入本地')
  return { success: true }
}

export const deleteForecasts = async (ids: string[]) => {
  // 始终删除 localStorage，保证离线可用
  const list = localGetForecastData()
  const newList = list.filter((f: ForecastItem) => !ids.includes(f._id))
  localSetForecastData(newList)
  // 如果真正在线，同时删除 Supabase
  if (await isReallyOnline()) {
    const { error } = await supabase.from('forecasts').delete().in('id', ids)
    if (error) {
      return { success: false, error: error.message }
    }
  }
  return { success: true }
}

export const updateForecast = async (id: string, updates: Partial<ForecastItem>) => {
  // 始终写入 localStorage，保证离线可用
  const list = localGetForecastData()
  const idx = list.findIndex((f: ForecastItem) => f._id === id)
  if (idx >= 0) {
    list[idx] = { ...list[idx], ...updates }
    localSetForecastData(list)
  }
  // 如果真正在线，同时写入 Supabase（只更新有值的字段，避免覆盖为null）
  if (await isReallyOnline()) {
    const updateData: any = {}
    if (updates.quantity !== undefined) updateData.quantity = updates.quantity
    if (updates.remark !== undefined) updateData.remark = updates.remark
    if (updates.status !== undefined) updateData.status = updates.status
    const { error } = await supabase.from('forecasts').update(updateData).eq('id', id)
    return { success: !error, error: error?.message }
  }
  return { success: true }
}

// ==================== 日志 ====================
export const fetchLogs = async () => {
  const online = await isReallyOnline()
  // 用业务字段+时间桶构建去重 key
  // 时间桶 = 3秒精度，与 checkDuplicateOperation 的 DEDUP_WINDOW 一致
  // 同一3秒窗口内的相同操作视为重复（防止双击），不同时间的相同操作各自保留
  const buildLogKey = (l: any) => {
    const time = l.createTime || l.createdAt || 0
    const timeBucket = Math.floor(time / 3000) // 3秒时间桶
    return `${l.type}|${l.year}|${l.term}|${l.grade}|${l.subject}|${l.difficulty || ''}|${l.campus}|${l.quantity}|${l.action || ''}|${timeBucket}`
  }

  // 通用去重函数：保留第一条（已按时间倒序，所以保留最新）
  const deduplicate = (logs: any[]) => {
    const seen = new Set<string>()
    return logs.filter(l => {
      const key = buildLogKey(l)
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
  }

  if (online) {
    try {
      const { data, error } = await supabase.from('logs').select('*').order('created_at', { ascending: false })
      if (error) {
        console.error('[fetchLogs] 读取云端失败:', error.message, error)
        markOffline()
        // 云端读取失败，回退到本地日志
        const localLogs = localGetLogData()
        localLogs.sort((a, b) => b.createTime - a.createTime)
        return deduplicate(localLogs)
      }
      const cloudLogs = data?.map(l => migrateGradeInRecord({
        _id: l.id,
        stockId: l.stock_id,
        type: l.type,
        operator: l.operator,
        operatorName: l.operator_name,
        action: l.action,
        detail: l.detail,
        year: l.year,
        term: l.term,
        grade: l.grade,
        subject: l.subject,
        difficulty: l.difficulty || '',
        campus: l.campus,
        bookName: l.book_name,
        quantity: l.quantity,
        note: l.note,
        createTime: new Date(l.created_at).getTime(),
        createdAt: new Date(l.created_at).getTime()
      })) || []

      // 云端日志内部去重
      const dedupedCloudLogs = deduplicate(cloudLogs)

      // 在线模式下，以云端为唯一数据源
      dedupedCloudLogs.sort((a, b) => b.createTime - a.createTime)
      // 同步到本地
      localSetLogData(dedupedCloudLogs)
      return dedupedCloudLogs
    } catch (e) {
      console.error('[fetchLogs] 云端请求异常:', e)
      markOffline()
      // 云端异常，回退到本地日志
      const localLogs = localGetLogData()
      localLogs.sort((a, b) => b.createTime - a.createTime)
      return deduplicate(localLogs)
    }
  }

  // 离线模式：本地日志也做内部去重
  const localLogs = localGetLogData()
  localLogs.sort((a, b) => b.createTime - a.createTime)
  return deduplicate(localLogs)
}

export const addLog = async (log: Partial<LogItem>) => {
  console.log('[addLog] 写入日志:', { type: log.type, year: log.year, term: log.term, grade: log.grade, subject: log.subject, difficulty: log.difficulty, campus: log.campus, quantity: log.quantity })

  // 始终写入 localStorage，保证离线可用
  const list = localGetLogData()
  list.push(log as LogItem)
  localSetLogData(list)
  // 如果真正在线，同时写入 Supabase
  const online = await isReallyOnline()
  if (online) {
    const { error } = await supabase.from('logs').insert({
      stock_id: log.stockId,
      type: log.type,
      operator: log.operator,
      operator_name: log.operatorName,
      action: log.action,
      detail: log.detail,
      year: log.year,
      term: log.term,
      grade: log.grade,
      subject: log.subject,
      difficulty: log.difficulty || null,
      campus: log.campus,
      book_name: log.bookName,
      quantity: log.quantity,
      note: log.note
    })
    if (error) {
      console.error('[addLog] 写入云端失败:', error.message, error)
    } else {
      console.log('[addLog] 写入云端成功')
    }
    return { success: !error, error: error?.message }
  }
  console.warn('[addLog] 未连接云端，仅写入本地')
  return { success: true }
}

// ==================== 角色权限 ====================
export const fetchRolePermissions = async () => {
  if (await isReallyOnline()) {
    const { data } = await supabase.from('role_permissions').select('*')
    const result: Record<string, string[]> = {}
    data?.forEach(r => { result[r.role] = r.permissions || [] })
    return result
  }
  return getRolePermissions()
}

export const updateRolePermissions = async (role: string, permissions: string[]) => {
  // 始终写入 localStorage，保证离线可用
  const all = getRolePermissions()
  all[role] = permissions
  setRolePermissions(all)
  // 如果真正在线，同时写入 Supabase
  if (await isReallyOnline()) {
    await supabase.from('role_permissions').upsert({ role, permissions }, { onConflict: 'role' })
  }
}

// ==================== 用户管理 ====================
export const fetchUsers = async () => {
  if (await isReallyOnline()) {
    const { data } = await supabase.from('users').select('*')
    const result = data?.map(u => ({
      _id: u.id,
      openid: u.openid,
      userName: u.user_name,
      nickName: u.nick_name,
      role: u.role,
      campus: u.campus,
      campusName: u.campus_name,
      roles: u.roles || [],
      campuses: u.campuses || [],
      password: u.password,
      createTime: new Date(u.created_at).getTime()
    })) || []
    return result
  }
  return getUserList()
}

export const addUser = async (user: any) => {
  // 始终写入 localStorage
  const list = getUserList()
  list.push(user)
  setUserList(list)
  // 如果真正在线，同时写入 Supabase
  if (await isReallyOnline()) {
    const { data, error } = await supabase.from('users').insert({
      user_name: user.userName,
      nick_name: user.nickName,
      role: user.role,
      campus: user.campus,
      campus_name: user.campusName,
      roles: user.roles,
      campuses: user.campuses,
      password: user.password
    }).select('id').single()
    
    if (error) {
      console.error('[addUser] Supabase写入失败:', error.message)
      return { success: false, error: error.message }
    }
    
    // 将 Supabase 生成的 UUID 同步回 localStorage，确保 _id 一致
    if (data?.id) {
      const updatedList = getUserList()
      const idx = updatedList.findIndex((u: any) => u._id === user._id)
      if (idx >= 0) {
        updatedList[idx]._id = data.id
        setUserList(updatedList)
      }
    }
    return { success: true }
  }
  return { success: true }
}

export const updateUser = async (id: string, updates: any) => {
  // 始终写入 localStorage
  const list = getUserList()
  const idx = list.findIndex((u: any) => u._id === id)
  if (idx >= 0) {
    list[idx] = { ...list[idx], ...updates }
    setUserList(list)
  }
  // 如果真正在线，同时写入 Supabase
  if (await isReallyOnline()) {
    const updateData: any = {}
    if (updates.nickName !== undefined) updateData.nick_name = updates.nickName
    if (updates.role !== undefined) updateData.role = updates.role
    if (updates.campus !== undefined) updateData.campus = updates.campus
    if (updates.campusName !== undefined) updateData.campus_name = updates.campusName
    if (updates.roles !== undefined) updateData.roles = updates.roles
    if (updates.campuses !== undefined) updateData.campuses = updates.campuses
    if (updates.password !== undefined) updateData.password = updates.password
    
    const { error } = await supabase.from('users').update(updateData).eq('id', id)
    return { success: !error, error: error?.message }
  }
  return { success: true }
}

export const deleteUser = async (id: string) => {
  // 始终删除 localStorage
  const list = getUserList()
  const newList = list.filter((u: any) => u._id !== id)
  setUserList(newList)
  // 如果真正在线，同时删除 Supabase
  if (await isReallyOnline()) {
    await supabase.from('users').delete().eq('id', id)
  }
  return { success: true }
}

// ==================== 角色列表 ====================
export const fetchRoles = async () => {
  if (await isReallyOnline()) {
    const { data } = await supabase.from('roles').select('*')
    const result = data?.map(r => ({
      role: r.role,
      label: r.label,
      permissions: r.permissions || []
    })) || []
    return result
  }
  return getRoleList()
}

// ==================== 清空数据 ====================
export const clearAllData = async () => {
  // 始终清空 localStorage
  clearAllLocalData()
  // 如果真正在线，同时清空 Supabase（保留用户表）
  if (await isReallyOnline()) {
    const { error: err1 } = await supabase.from('books').delete().neq('id', '00000000-0000-0000-0000-000000000000')
    if (err1) console.error('[clearAllData] 清空 books 失败:', err1.message)
    const { error: err2 } = await supabase.from('stock').delete().neq('id', '00000000-0000-0000-0000-000000000000')
    if (err2) console.error('[clearAllData] 清空 stock 失败:', err2.message)
    const { error: err3 } = await supabase.from('forecasts').delete().neq('id', '00000000-0000-0000-0000-000000000000')
    if (err3) console.error('[clearAllData] 清空 forecasts 失败:', err3.message)
    const { error: err4 } = await supabase.from('logs').delete().neq('id', '00000000-0000-0000-0000-000000000000')
    if (err4) console.error('[clearAllData] 清空 logs 失败:', err4.message)
    // 不再删除 users 表数据，用户账号保留
  }
}

// ==================== 导出本地存储工具（供 mockData.ts 使用）====================
export { localGetStockData, localSetStockData, localGetLogData, localSetLogData, localGetForecastData, localSetForecastData, localGenerateId }

// ==================== 【本地专用导入加速】纯 localStorage 同步版写函数 ====================
// 用途：批量导入时不做任何 await isReallyOnline()/Supabase 调用，先毫秒级写本地保证秒级弹窗反馈，
//      最后统一调 syncLocalToCloud() 异步兜底云同步（不阻塞 UI）。
//      每一个函数都对应异步版本（addBook/deleteBook/upsertStock/addLog）的「本地写入那半段」逻辑。

/** 同步本地：新增一本书（仅写 localStorage），返回处理后的 book */
export const localOnlyAddBook = (book: any): any => {
  const list = getBookList()
  list.push(book)
  setBookList(list)
  return book
}

/** 同步本地：按 year/term/grade/subject/difficulty 删除书本+库存+日志+预测（仅写 localStorage） */
export const localOnlyDeleteBook = (year: string, term: string, grade: string, subject: string, difficulty: string) => {
  const diffVal = difficulty || null
  const normalizedDiff = (d: any) => (d === '' || d === undefined || d === null) ? null : d

  const bookList = getBookList()
  const newList = bookList.filter((b: BookItem) =>
    !((b as any).year === year && (b as any).term === term && b.grade === grade && b.subject === subject && normalizedDiff(b.difficulty) === diffVal)
  )
  setBookList(newList)

  const stockList = localGetStockData()
  const newStock = stockList.filter((s: StockItem) =>
    !(s.year === year && s.term === term && s.grade === grade && s.subject === subject && normalizedDiff(s.difficulty) === diffVal)
  )
  localSetStockData(newStock)

  const logList = localGetLogData()
  const newLogs = logList.filter((l: LogItem) =>
    !(l.year === year && l.term === term && l.grade === grade && l.subject === subject && normalizedDiff(l.difficulty) === diffVal)
  )
  localSetLogData(newLogs)

  const forecastList = localGetForecastData()
  const newForecasts = forecastList.filter((f: ForecastItem) =>
    !(f.year === year && f.term === term && f.grade === grade && f.subject === subject && normalizedDiff(f.difficulty) === diffVal)
  )
  localSetForecastData(newForecasts)
}

/** 同步本地：新增或更新一条库存（仅写 localStorage），mode='merge'累加 / 'overwrite'覆盖 */
export const localOnlyUpsertStock = (
  stock: Partial<StockItem> & { campus: string; year: string; term: string; grade: string; subject: string; totalIn?: number; totalOut?: number; totalQuantity?: number; remainingStock?: number; createTime?: number; updateTime?: number },
  mode: 'merge' | 'overwrite' = 'merge'
): StockItem => {
  const list = localGetStockData()
  const idx = list.findIndex((s: StockItem) =>
    s.campus === stock.campus && s.year === stock.year && s.term === stock.term &&
    s.grade === stock.grade && s.subject === stock.subject && s.difficulty === stock.difficulty
  )
  let saved: StockItem
  if (idx >= 0) {
    const existing = list[idx]
    if (mode === 'overwrite') {
      saved = {
        ...existing,
        totalIn: stock.totalIn ?? stock.totalQuantity ?? existing.totalIn ?? 0,
        totalOut: existing.totalOut ?? 0,
        totalQuantity: stock.totalQuantity ?? existing.totalQuantity ?? 0,
        hongheQuantity: stock.hongheQuantity ?? existing.hongheQuantity ?? 0,
        longhuaQuantity: stock.longhuaQuantity ?? existing.longhuaQuantity ?? 0,
        remainingStock: stock.remainingStock ?? Math.max(0, (stock.totalIn ?? stock.totalQuantity ?? existing.totalIn ?? 0) - (existing.totalOut ?? 0)),
        updateTime: stock.updateTime ?? existing.updateTime ?? Date.now()
      } as StockItem
    } else {
      const qtyDelta = stock.totalIn ?? stock.totalQuantity ?? 0
      const newTotalIn = (existing.totalIn ?? 0) + qtyDelta
      saved = {
        ...existing,
        totalIn: newTotalIn,
        totalQuantity: (existing.totalQuantity ?? 0) + qtyDelta,
        hongheQuantity: (existing.hongheQuantity ?? 0) + (stock.hongheQuantity ?? 0),
        longhuaQuantity: (existing.longhuaQuantity ?? 0) + (stock.longhuaQuantity ?? 0),
        remainingStock: newTotalIn - (existing.totalOut ?? 0),
        updateTime: stock.updateTime ?? Date.now()
      } as StockItem
    }
    list[idx] = saved
  } else {
    const qty = stock.totalIn ?? stock.totalQuantity ?? 0
    saved = {
      _id: stock._id || localGenerateId(),
      campus: stock.campus,
      campusName: stock.campusName || '',
      year: stock.year,
      term: stock.term,
      grade: stock.grade,
      subject: stock.subject,
      difficulty: stock.difficulty || '',
      bookName: stock.bookName || '',
      bookCode: stock.bookCode || '',
      totalQuantity: stock.totalQuantity ?? qty,
      hongheQuantity: stock.hongheQuantity ?? (stock.campus === 'honghe' ? qty : 0),
      longhuaQuantity: stock.longhuaQuantity ?? (stock.campus === 'longhua' ? qty : 0),
      totalIn: stock.totalIn ?? qty,
      totalOut: stock.totalOut ?? 0,
      remainingStock: stock.remainingStock ?? qty,
      createTime: stock.createTime ?? Date.now(),
      updateTime: stock.updateTime ?? Date.now()
    } as StockItem
    list.push(saved)
  }
  localSetStockData(list)
  return saved
}

/** 同步本地：写入一条入库日志（仅写 localStorage）*/
export const localOnlyAddLog = (log: Partial<LogItem>): LogItem => {
  const list = localGetLogData()
  const saved = {
    _id: localGenerateId(),
    ...log,
    createTime: log.createTime ?? Date.now()
  } as LogItem
  list.push(saved)
  localSetLogData(list)
  return saved
}

// ==================== 实时同步（Supabase Realtime）====================
// 订阅库存变化，当其他设备修改库存时自动刷新
export const subscribeToStockChanges = (callback: () => void) => {
  const channel = supabase
    .channel('stock-changes')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'stock' }, (payload) => {
      console.log('[Realtime] 库存变化:', payload.eventType)
      callback()
    })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'books' }, (payload) => {
      console.log('[Realtime] 书本变化:', payload.eventType)
      callback()
    })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'logs' }, (payload) => {
      console.log('[Realtime] 日志变化:', payload.eventType)
      callback()
    })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'forecasts' }, (payload) => {
      console.log('[Realtime] 预计/领取变化:', payload.eventType)
      callback()
    })
    .subscribe()

  return channel
}

// 取消订阅
export const unsubscribeFromStockChanges = (channel: any) => {
  if (channel) {
    supabase.removeChannel(channel)
  }
}