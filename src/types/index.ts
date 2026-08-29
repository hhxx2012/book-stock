export interface UserInfo {
  _id?: string
  openid: string
  userName?: string
  nickName: string
  avatarUrl?: string
  role: string
  campus: string
  campusName: string
  roles: string[]
  campuses: string[]
  password?: string
}

export interface Role {
  id: string
  role: string
  name: string
  label: string
  permissions: string[]
}

export interface BookItem {
  _id: string
  bookName: string
  bookCode: string
  grade: string
  subject: string
  difficulty: string
  totalQuantity: number
  hongheQuantity: number
  longhuaQuantity: number
  createTime: number
}

export interface StockItem extends BookItem {
  campus?: string
  campusName?: string
  year?: string
  term?: string
  totalIn?: number
  totalOut?: number
  remainingStock?: number
  updateTime?: number
  qrcodeUrl?: string
  quantity?: number
}

export interface MergedStock extends StockItem {
  hongheStock?: number
  longhuaStock?: number
  hongheTotalIn?: number
  hongheTotalOut?: number
  longhuaTotalIn?: number
  longhuaTotalOut?: number
}

export interface ForecastItem {
  _id: string
  type: 'forecast' | 'receive'
  bookName: string
  grade: string
  subject: string
  difficulty: string
  campus: string
  campusName?: string
  quantity: number
  remark: string
  year: string
  term: string
  status: 'pending' | 'processed'
  operator: string
  operatorName?: string
  studentName?: string
  createTime: number
  updateTime?: number
}

export interface StatsItem {
  key: string
  subject: string
  grade: string
  difficulty: string
  hongheQuantity: number
  longhuaQuantity: number
  totalQuantity: number
  hongheIds: string[]
  longhuaIds: string[]
  bookName: string
}

export interface LogItem {
  _id: string
  type: string
  operator: string
  operatorName?: string
  action: string
  detail: string
  year: string
  term: string
  createTime: number
  createdAt?: number
  stockId?: string
  grade?: string
  subject?: string
  difficulty?: string
  campus?: string
  scanOperate?: string
  bookCode?: string
  bookName?: string
  quantity?: number
  note?: string
  studentName?: string
  userId?: string
}

export interface Subject {
  id: string
  name: string
  order: number
}

export interface Grade {
  id: string
  name: string
  order: number
}

export interface Difficulty {
  id: string
  name: string
  order: number
}

export interface SystemSettings {
  defaultYear: string
  defaultTerm: string
}
