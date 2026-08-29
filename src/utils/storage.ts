import type { Role, Subject, Grade, Difficulty, BookItem, LogItem } from '../types'

const USER_INFO_KEY = 'user_info'
const ROLE_KEY = 'user_role'
const CAMPUS_KEY = 'user_campus'
const CAMPUS_NAME_KEY = 'user_campus_name'
const DEFAULT_YEAR_KEY = 'default_year'
const DEFAULT_TERM_KEY = 'default_term'
const USER_LIST_KEY = 'user_list'
const SUBJECT_LIST_KEY = 'subject_list'
const GRADE_LIST_KEY = 'grade_list'
const DIFFICULTY_LIST_KEY = 'difficulty_list'
const ROLE_LIST_KEY = 'role_list'
const BOOK_LIST_KEY = 'book_list'
const LOG_LIST_KEY = 'log_list'
const STOCK_LIST_KEY = 'stock_list'
const ROLE_PERMISSIONS_KEY = 'role_permissions'

export const setUserInfo = (data: any) => {
  localStorage.setItem(USER_INFO_KEY, JSON.stringify(data))
}

export const getUserInfo = () => {
  try {
    const data = localStorage.getItem(USER_INFO_KEY)
    return data ? JSON.parse(data) : null
  } catch {
    return null
  }
}

export const setRole = (role: string) => {
  localStorage.setItem(ROLE_KEY, role)
}

export const getRole = () => {
  return localStorage.getItem(ROLE_KEY) || ''
}

export const getRoles = () => {
  const userInfo = getUserInfo()
  return userInfo && userInfo.roles ? userInfo.roles : []
}

export const hasRole = (role: string) => {
  return getRole() === role
}

export const setCampus = (campus: string) => {
  localStorage.setItem(CAMPUS_KEY, campus)
}

export const getCampus = () => {
  return localStorage.getItem(CAMPUS_KEY) || ''
}

export const setCampusName = (name: string) => {
  localStorage.setItem(CAMPUS_NAME_KEY, name)
}

export const getCampusName = () => {
  return localStorage.getItem(CAMPUS_NAME_KEY) || ''
}

export const setRoleList = (list: Role[]) => {
  localStorage.setItem(ROLE_LIST_KEY, JSON.stringify(list))
}

export const getRoleList = () => {
  try {
    const data = localStorage.getItem(ROLE_LIST_KEY)
    return data ? JSON.parse(data) : []
  } catch {
    return []
  }
}

// 清除所有本地数据
export const clearAllLocalData = () => {
  const keysToRemove = [
    USER_INFO_KEY, ROLE_KEY, CAMPUS_KEY, CAMPUS_NAME_KEY,
    DEFAULT_YEAR_KEY, DEFAULT_TERM_KEY, USER_LIST_KEY,
    SUBJECT_LIST_KEY, GRADE_LIST_KEY, DIFFICULTY_LIST_KEY,
    ROLE_LIST_KEY, BOOK_LIST_KEY, LOG_LIST_KEY, STOCK_LIST_KEY,
    ROLE_PERMISSIONS_KEY,
    'forecast_list', 'mock_data_initialized_v1',
    'mock_stock_data', 'mock_log_data', 'mock_forecast_data',
    'login_remember'
  ]
  keysToRemove.forEach(key => localStorage.removeItem(key))
}

export const getUserPermissions = () => {
  const currentRole = getRole()
  const permissions = new Set<string>()
  
  // 优先从角色权限配置中获取（由角色管理页面设置）
  const rolePermissions = getRolePermissions()
  if (rolePermissions[currentRole] && rolePermissions[currentRole].length > 0) {
    rolePermissions[currentRole].forEach((p: string) => permissions.add(p))
    return Array.from(permissions)
  }
  
  // 回退：从角色列表定义中获取
  const roleList = getRoleList()
  const role = roleList.find((r: Role) => r.role === currentRole)
  if (role && role.permissions) {
    role.permissions.forEach((p: string) => permissions.add(p))
  }
  
  return Array.from(permissions)
}

export const hasPermission = (permission: string) => {
  if (isSuperAdmin()) return true
  const permissions = getUserPermissions()
  return permissions.includes(permission)
}

export const isSuperAdmin = () => {
  return getRole() === 'super'
}

export const isAdminOnly = () => {
  return getRole() === 'admin'
}

export const isEducational = () => {
  return getRole() === 'educational'
}

export const isTeacher = () => {
  return getRole() === 'teacher'
}

export const isAdmin = () => {
  return isSuperAdmin() || isAdminOnly()
}

export const canManageUsers = () => {
  return isSuperAdmin() || hasPermission('manage_users')
}

export const canManageSystem = () => {
  return isSuperAdmin() || hasPermission('manage_system')
}

export const canManageRoles = () => {
  return isSuperAdmin() || hasPermission('manage_roles')
}

export const canManageBooks = () => {
  return isSuperAdmin() || hasPermission('manage_books')
}

export const canDeleteBook = () => {
  return isSuperAdmin() || hasPermission('delete_book')
}

export const canStockIn = () => {
  return isSuperAdmin() || hasPermission('stock_in')
}

export const canStockOut = () => {
  return isSuperAdmin() || hasPermission('stock_out')
}

export const canStockReturn = () => {
  return isSuperAdmin() || hasPermission('stock_return')
}

export const canStockInOut = () => {
  return canStockIn() || canStockOut()
}

export const canViewStock = () => {
  return isSuperAdmin() || hasPermission('view_stock') || hasPermission('stock_in') || hasPermission('stock_out') || hasPermission('forecast_manage') || hasPermission('receive_manage')
}

export const canRequestBooks = () => {
  return canViewStock()
}

// 预计管理权限
export const canForecastView = () => {
  return isSuperAdmin() || hasPermission('forecast_view')
}

export const canForecastSet = () => {
  return isSuperAdmin() || hasPermission('forecast_set')
}

export const canForecastApprove = () => {
  return isSuperAdmin() || hasPermission('forecast_approve')
}

export const canForecastModify = () => {
  return isSuperAdmin() || hasPermission('forecast_modify')
}

export const canForecastDelete = () => {
  return isSuperAdmin() || hasPermission('forecast_delete')
}

export const canForecastStats = () => {
  return isSuperAdmin() || hasPermission('forecast_stats')
}

export const canForecast = () => {
  return canForecastView() || canForecastSet() || canForecastApprove() || canForecastModify() || canForecastDelete() || canForecastStats()
}

// 领取管理权限
export const canReceiveView = () => {
  return isSuperAdmin() || hasPermission('receive_view')
}

export const canReceiveSet = () => {
  return isSuperAdmin() || hasPermission('receive_set')
}

export const canReceiveApprove = () => {
  return isSuperAdmin() || hasPermission('receive_approve')
}

export const canReceiveModify = () => {
  return isSuperAdmin() || hasPermission('receive_modify')
}

export const canReceiveDelete = () => {
  return isSuperAdmin() || hasPermission('receive_delete')
}

export const canReceive = () => {
  return canReceiveView() || canReceiveSet() || canReceiveApprove() || canReceiveModify() || canReceiveDelete()
}

export const canViewStats = () => {
  return isSuperAdmin() || hasPermission('view_stats')
}

export const canGenerateQrcode = () => {
  return isSuperAdmin() || hasPermission('qrcode_generate')
}

export const needCampusFilter = () => {
  return isEducational() && !isSuperAdmin()
}

export const needSelfFilter = () => {
  return isTeacher()
}

export const setDefaultYear = (year: string) => {
  localStorage.setItem(DEFAULT_YEAR_KEY, year)
}

export const getDefaultYear = () => {
  return localStorage.getItem(DEFAULT_YEAR_KEY) || ''
}

export const setDefaultTerm = (term: string) => {
  localStorage.setItem(DEFAULT_TERM_KEY, term)
}

export const getDefaultTerm = () => {
  return localStorage.getItem(DEFAULT_TERM_KEY) || ''
}

export const clearDefaultYearTerm = () => {
  localStorage.removeItem(DEFAULT_YEAR_KEY)
  localStorage.removeItem(DEFAULT_TERM_KEY)
}

export const setUserList = (list: any[]) => {
  localStorage.setItem(USER_LIST_KEY, JSON.stringify(list))
}

export const getUserList = () => {
  try {
    const data = localStorage.getItem(USER_LIST_KEY)
    return data ? JSON.parse(data) : []
  } catch {
    return []
  }
}

export const DEFAULT_SUBJECTS: Subject[] = [
  { id: '1', name: '语文', order: 1 },
  { id: '2', name: '数学', order: 2 },
  { id: '3', name: '英语', order: 3 },
  { id: '4', name: '物理', order: 4 },
  { id: '5', name: '化学', order: 5 },
  { id: '6', name: '生物', order: 6 },
  { id: '7', name: '历史', order: 7 },
  { id: '8', name: '地理', order: 8 },
  { id: '9', name: '政治', order: 9 }
]

export const setSubjectList = (list: Subject[]) => {
  localStorage.setItem(SUBJECT_LIST_KEY, JSON.stringify(list))
}

export const getSubjectList = () => {
  // 科目选项固定为默认值，不从 localStorage 读取
  return DEFAULT_SUBJECTS
}

export const getSubjectNames = () => {
  return getSubjectList().map((item: Subject) => item.name)
}

export const DEFAULT_GRADES: Grade[] = [
  { id: '1', name: '幼升小', order: 1 },
  { id: '2', name: '1年级', order: 2 },
  { id: '3', name: '2年级', order: 3 },
  { id: '4', name: '3年级', order: 4 },
  { id: '5', name: '4年级', order: 5 },
  { id: '6', name: '5年级', order: 6 },
  { id: '7', name: '6年级', order: 7 },
  { id: '8', name: '小升初', order: 8 },
  { id: '9', name: '7年级', order: 9 },
  { id: '10', name: '8年级', order: 10 },
  { id: '11', name: '9年级', order: 11 },
  { id: '12', name: '初升高', order: 12 },
  { id: '13', name: '高一', order: 13 },
  { id: '14', name: '高二', order: 14 }
]

export const setGradeList = (list: Grade[]) => {
  localStorage.setItem(GRADE_LIST_KEY, JSON.stringify(list))
}

export const getGradeList = () => {
  // 年级选项固定为默认值，不从 localStorage 读取
  // 避免旧数据导致书本设置和库存查询显示不一致
  return DEFAULT_GRADES
}

export const getGradeNames = () => {
  return getGradeList().map((item: Grade) => item.name)
}

export const DEFAULT_DIFFICULTIES: Difficulty[] = [
  { id: '0', name: '无', order: 0 },
  { id: '1', name: '基础', order: 1 },
  { id: '2', name: '培优', order: 2 },
  { id: '3', name: '尖子', order: 3 }
]

export const setDifficultyList = (list: Difficulty[]) => {
  localStorage.setItem(DIFFICULTY_LIST_KEY, JSON.stringify(list))
}

export const getDifficultyList = () => {
  // 难度选项固定为：无、基础、培优、尖子
  // 忽略 localStorage 中的旧数据，避免显示错误的难度选项
  return DEFAULT_DIFFICULTIES
}

export const getDifficultyNames = () => {
  return getDifficultyList().map((item: Difficulty) => item.name)
}

export const setBookList = (list: BookItem[]) => {
  localStorage.setItem(BOOK_LIST_KEY, JSON.stringify(list))
}

export const getBookList = () => {
  try {
    const data = localStorage.getItem(BOOK_LIST_KEY)
    return data ? JSON.parse(data) : []
  } catch {
    return []
  }
}

export const setLogList = (list: LogItem[]) => {
  localStorage.setItem(LOG_LIST_KEY, JSON.stringify(list))
}

export const getLogList = () => {
  try {
    const data = localStorage.getItem(LOG_LIST_KEY)
    return data ? JSON.parse(data) : []
  } catch {
    return []
  }
}

export const setStockList = (list: any[]) => {
  localStorage.setItem(STOCK_LIST_KEY, JSON.stringify(list))
}

export const getStockList = () => {
  try {
    const data = localStorage.getItem(STOCK_LIST_KEY)
    return data ? JSON.parse(data) : []
  } catch {
    return []
  }
}

export const updateStockList = (list: any[]) => {
  setStockList(list)
}

export const getRolePermissions = () => {
  try {
    const data = localStorage.getItem(ROLE_PERMISSIONS_KEY)
    return data ? JSON.parse(data) : {}
  } catch {
    return {}
  }
}

export const setRolePermissions = (permissions: Record<string, string[]>) => {
  localStorage.setItem(ROLE_PERMISSIONS_KEY, JSON.stringify(permissions))
}

export const logout = () => {
  localStorage.removeItem(USER_INFO_KEY)
  localStorage.removeItem(ROLE_KEY)
  localStorage.removeItem(CAMPUS_KEY)
  localStorage.removeItem(CAMPUS_NAME_KEY)
  localStorage.removeItem('has_init_default_user')
}
