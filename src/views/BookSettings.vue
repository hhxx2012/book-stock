<script setup lang="ts">
import { ref, onMounted, onUnmounted, computed } from 'vue'
import { useRouter } from 'vue-router'
import QRCode from 'qrcode'
import { getDefaultYear, getDefaultTerm, getUserInfo } from '../utils/storage'
import { isCloudConnected, connectToCloud, isSupabaseConfigured } from '../utils/supabase'
import { generateId } from '../utils/mockData'
import * as ds from '../services/dataService'
import {
  localOnlyAddBook, localOnlyDeleteBook, localOnlyUpsertStock, localOnlyAddLog,
  localGetStockData as localOnlyGetStockData
} from '../services/dataService'
import { getBookList as localOnlyGetBookList } from '../utils/storage'
import type { BookItem, StockItem } from '../types'

const router = useRouter()
const bookList = ref<BookItem[]>([])
const gradeList = ref<any[]>([])
const subjectList = ref<any[]>([])
const difficultyList = ref<any[]>([])
const showAddModal = ref(false)
const showEditModal = ref(false)
const editingBook = ref<BookItem | null>(null)
const selectedBooks = ref<string[]>([])

// 筛选条件
const selectedYear = ref('')
const selectedTerm = ref('')
const showOptions = ref('')

// 实时同步订阅
let realtimeChannel: any = null
let refreshTimer: any = null

const years = ['2020', '2021', '2022', '2023', '2024', '2025', '2026', '2027', '2028', '2029', '2030']
const terms = ['春期', '暑期', '秋期', '冬期']
const grades = computed(() => gradeList.value)
const subjects = computed(() => subjectList.value)
const difficulties = computed(() => difficultyList.value)

const getGradeLabel = (value: string) => {
  const grade = grades.value.find((g: any) => g.id === value || g.name === value)
  return grade?.name || value
}

const getSubjectLabel = (value: string) => {
  const subject = subjects.value.find((s: any) => s.id === value || s.name === value)
  return subject?.name || value
}

const getDifficultyLabel = (value: string) => {
  const diff = difficulties.value.find((d: any) => d.id === value || d.name === value)
  return diff?.name || value
}

// 添加表单数据
const newBook = ref({
  year: getDefaultYear() || '2026',
  term: getDefaultTerm() || '暑期',
  grade: '',
  subject: '',
  difficulty: '',
  bookCode: ''
})

// 自动生成书本名称
const generatedBookName = computed(() => {
  const { year, term, grade, subject, difficulty } = newBook.value
  const parts: string[] = []
  if (year) parts.push(year + '年')
  if (term) parts.push(term)
  if (grade) parts.push(grade)
  if (subject) parts.push(subject)
  if (difficulty) parts.push(difficulty)
  return parts.join('') || '请完善上方信息'
})

// 编辑表单数据
const editBookData = ref({
  year: '',
  term: '',
  grade: '',
  subject: '',
  difficulty: '',
  bookCode: ''
})

// 编辑时自动生成名称
const generatedEditBookName = computed(() => {
  const { year, term, grade, subject, difficulty } = editBookData.value
  const parts: string[] = []
  if (year) parts.push(year + '年')
  if (term) parts.push(term)
  if (grade) parts.push(grade)
  if (subject) parts.push(subject)
  if (difficulty) parts.push(difficulty)
  return parts.join('') || '请完善上方信息'
})

// 筛选后的书本列表
const filteredBooks = computed(() => {
  let list = bookList.value
  if (selectedYear.value) list = list.filter((b: any) => b.year === selectedYear.value)
  if (selectedTerm.value) list = list.filter((b: any) => b.term === selectedTerm.value)
  return list
})

const goBack = () => {
  router.back()
}

const selectFilter = (field: string) => {
  showOptions.value = showOptions.value === field ? '' : field
}

const confirmFilter = (option: string) => {
  if (showOptions.value === 'year') {
    selectedYear.value = selectedYear.value === option ? '' : option
  } else if (showOptions.value === 'term') {
    selectedTerm.value = selectedTerm.value === option ? '' : option
  }
  showOptions.value = ''
}

const resetFilter = () => {
  selectedYear.value = getDefaultYear() || '2026'
  selectedTerm.value = getDefaultTerm() || '暑期'
  showOptions.value = ''
}

// 通用超时保护
const withTimeout = async <T,>(promise: Promise<T>, ms: number, fallback: T | null = null, desc = 'operation'): Promise<T | null> => {
  return Promise.race([
    promise,
    new Promise<T | null>((resolve) => {
      setTimeout(() => {
        console.warn(`[超时] BookSettings ${desc} 超过 ${ms}ms，跳过继续`)
        resolve(fallback)
      }, ms)
    })
  ])
}

onMounted(async () => {
  // 确保云端连接：如果配置了 Supabase 但 session 不存在，尝试重连
  // 注意：此步骤只影响 Supabase Auth（共享账号），成功与否不影响数据读写（RLS 已关闭）
  // 一定要 try/catch + 超时，否则会阻塞后续页面/数据初始化
  if (isSupabaseConfigured()) {
    try {
      const connected = await withTimeout(isCloudConnected(), 5000, false, 'isCloudConnected')
      if (!connected) {
        console.log('[BookSettings] 云端未连接，尝试重连...（超时5秒，不影响继续使用）')
        await withTimeout(
          (async () => { try { await connectToCloud() } catch {} })(),
          5000,
          null,
          'connectToCloud'
        )
      }
    } catch (e) {
      console.warn('[BookSettings] 云端连接失败，继续离线/直连模式：', e)
    }

    try {
      // 订阅实时变化，当其他设备修改数据时自动刷新
      realtimeChannel = ds.subscribeToStockChanges(() => {
        if (refreshTimer) clearTimeout(refreshTimer)
        refreshTimer = setTimeout(() => {
          console.log('[BookSettings] 检测到数据变化，自动刷新...')
          loadBooks()
        }, 500)
      })
    } catch (e) {
      console.warn('[BookSettings] 实时订阅失败，不影响主功能：', e)
    }
  }

  // 设置默认筛选：当前年度和时期
  selectedYear.value = getDefaultYear() || '2026'
  selectedTerm.value = getDefaultTerm() || '暑期'

  // 数据初始化（无论前面云端连接成功与否，这里都必须执行）
  try {
    await Promise.all([
      loadBooks(),
      loadGrades(),
      loadSubjects(),
      loadDifficulties()
    ])
  } catch (e) {
    console.error('[BookSettings] 数据初始化失败：', e)
    alert('⚠️  基础数据加载失败，请刷新页面重试\n\n详情: ' + (e as Error).message)
  }
})

onUnmounted(() => {
  if (realtimeChannel) {
    ds.unsubscribeFromStockChanges(realtimeChannel)
  }
  if (refreshTimer) {
    clearTimeout(refreshTimer)
  }
})

const loadBooks = async () => {
  bookList.value = await ds.fetchBooks()
}

const loadGrades = async () => {
  gradeList.value = await ds.fetchGrades()
}

const loadSubjects = async () => {
  subjectList.value = await ds.fetchSubjects()
}

const loadDifficulties = async () => {
  difficultyList.value = await ds.fetchDifficulties()
}

const openAddModal = () => {
  newBook.value = {
    year: getDefaultYear() || '2026',
    term: getDefaultTerm() || '暑期',
    grade: '',
    subject: '',
    difficulty: '',
    bookCode: ''
  }
  showAddModal.value = true
}

const closeAddModal = () => {
  showAddModal.value = false
}

const addBook = async () => {
  const name = generatedBookName.value
  if (!newBook.value.year || !newBook.value.term || !newBook.value.grade || !newBook.value.subject) {
    alert('请选择年度、时期、年级和科目')
    return
  }
  
  const bookCode = newBook.value.bookCode || `${newBook.value.year}-${newBook.value.term}-${newBook.value.grade}-${newBook.value.subject}-${newBook.value.difficulty || '无'}`
  
  const bookListData = await ds.fetchBooks()
  // 检查同名书本是否已存在
  const exists = bookListData.find((b: BookItem) => 
    (b as any).year === newBook.value.year && 
    (b as any).term === newBook.value.term &&
    b.grade === newBook.value.grade &&
    b.subject === newBook.value.subject &&
    b.difficulty === newBook.value.difficulty
  )
  if (exists) {
    alert('该组合的书本已存在')
    return
  }
  
  const now = Date.now()
  const newBookItem: any = {
    _id: now.toString(),
    bookName: name,
    bookCode: bookCode,
    year: newBook.value.year,
    term: newBook.value.term,
    grade: newBook.value.grade,
    subject: newBook.value.subject,
    difficulty: newBook.value.difficulty || '',
    totalQuantity: 0,
    hongheQuantity: 0,
    longhuaQuantity: 0,
    createTime: now
  }
  
  const bookResult = await ds.addBook(newBookItem)
  if (!bookResult.success) {
    alert('添加书本失败：' + (bookResult.error || '未知错误'))
    return
  }

  // 自动创建两个校区的库存记录（数量为0），使书本立即接入库存统计
  const difficulty = newBook.value.difficulty || ''
  const hongheStock: any = {
    _id: generateId(),
    campus: 'honghe',
    campusName: '洪河校区',
    year: newBook.value.year,
    term: newBook.value.term,
    grade: newBook.value.grade,
    subject: newBook.value.subject,
    difficulty,
    bookName: name,
    bookCode: bookCode,
    totalQuantity: 0,
    hongheQuantity: 0,
    longhuaQuantity: 0,
    totalIn: 0,
    totalOut: 0,
    remainingStock: 0,
    createTime: now,
    updateTime: now
  }
  const longhuaStock: any = {
    _id: generateId(),
    campus: 'longhua',
    campusName: '龙华校区',
    year: newBook.value.year,
    term: newBook.value.term,
    grade: newBook.value.grade,
    subject: newBook.value.subject,
    difficulty,
    bookName: name,
    bookCode: bookCode,
    totalQuantity: 0,
    hongheQuantity: 0,
    longhuaQuantity: 0,
    totalIn: 0,
    totalOut: 0,
    remainingStock: 0,
    createTime: now,
    updateTime: now
  }
  const hongheResult = await ds.upsertStock(hongheStock)
  const longhuaResult = await ds.upsertStock(longhuaStock)
  
  if (!hongheResult.success || !longhuaResult.success) {
    const errors = []
    if (!hongheResult.success) errors.push('洪河校区：' + (hongheResult.error || '失败'))
    if (!longhuaResult.success) errors.push('龙华校区：' + (longhuaResult.error || '失败'))
    alert('书本已添加，但库存记录创建失败：\n' + errors.join('\n') + '\n\n书本信息已保存，但库存统计可能不完整。')
  } else {
    alert('添加成功，已自动接入库存统计')
  }
  closeAddModal()
  await loadBooks()
}

const openEditModal = (book: BookItem) => {
  editingBook.value = book
  editBookData.value = {
    year: (book as any).year || '',
    term: (book as any).term || '',
    grade: book.grade || '',
    subject: book.subject || '',
    difficulty: book.difficulty || '',
    bookCode: book.bookCode || ''
  }
  showEditModal.value = true
}

const closeEditModal = () => {
  showEditModal.value = false
  editingBook.value = null
}

const saveEdit = async () => {
  if (!editingBook.value) return
  
  const name = generatedEditBookName.value
  const code = editBookData.value.bookCode || `${editBookData.value.year}-${editBookData.value.term}-${editBookData.value.grade}-${editBookData.value.subject}-${editBookData.value.difficulty || '无'}`
  
  const updates = {
    bookName: name,
    bookCode: code,
    year: editBookData.value.year,
    term: editBookData.value.term,
    grade: editBookData.value.grade,
    subject: editBookData.value.subject,
    difficulty: editBookData.value.difficulty
  }
  
  await ds.updateBook(editingBook.value._id!, updates)
  alert('修改成功')
  closeEditModal()
  await loadBooks()
}

const deleteBook = async (bookId: string) => {
  if (confirm('确定要删除该书本吗？')) {
    const book = bookList.value.find((b: BookItem) => b._id === bookId)
    if (!book) return
    const year = (book as any).year || ''
    const term = (book as any).term || ''
    const grade = book.grade || ''
    const subject = book.subject || ''
    const difficulty = book.difficulty || ''
    await ds.deleteBook(year, term, grade, subject, difficulty)
    alert('删除成功')
    await loadBooks()
  }
}

const toggleSelect = (bookId: string) => {
  const index = selectedBooks.value.indexOf(bookId)
  if (index >= 0) {
    selectedBooks.value.splice(index, 1)
  } else {
    selectedBooks.value.push(bookId)
  }
}

const selectAllBooks = () => {
  // 全选只针对筛选后显示的数据
  if (selectedBooks.value.length === filteredBooks.value.length && filteredBooks.value.length > 0) {
    selectedBooks.value = []
  } else {
    selectedBooks.value = filteredBooks.value.map(b => b._id || '')
  }
}

const batchDeleteBooks = async () => {
  if (selectedBooks.value.length === 0) {
    alert('请先选择要删除的书本')
    return
  }
  if (!confirm(`确定要删除选中的 ${selectedBooks.value.length} 本书本吗？\n删除后将同时清除关联的库存、日志、预计和领取记录，不可恢复！`)) {
    return
  }
  
  const booksToDelete = bookList.value.filter(b => selectedBooks.value.includes(b._id || ''))
  let successCount = 0
  let failCount = 0
  
  for (const book of booksToDelete) {
    try {
      const year = (book as any).year || ''
      const term = (book as any).term || ''
      const grade = book.grade || ''
      const subject = book.subject || ''
      const difficulty = book.difficulty || ''
      await ds.deleteBook(year, term, grade, subject, difficulty)
      successCount++
    } catch {
      failCount++
    }
  }
  
  selectedBooks.value = []
  alert(`批量删除完成：成功 ${successCount} 本${failCount > 0 ? '，失败 ' + failCount + ' 本' : ''}`)
  await loadBooks()
}

const generateSingleQrcode = async (book: BookItem) => {
  try {
    const canvas = document.createElement('canvas')
    await QRCode.toCanvas(canvas, book.bookCode, {
      width: 200,
      margin: 2
    })
    
    const link = document.createElement('a')
    link.download = `${book.bookCode}_${book.bookName}.png`
    link.href = canvas.toDataURL('image/png')
    link.click()
  } catch (err) {
    alert('生成二维码失败')
    console.error(err)
  }
}

const batchDownloadQrcode = async () => {
  if (selectedBooks.value.length === 0) {
    alert('请先选择要下载二维码的书本')
    return
  }
  
  const selectedBookItems = bookList.value.filter(b => selectedBooks.value.includes(b._id || ''))
  
  try {
    const printWindow = window.open('', '_blank')
    if (!printWindow) {
      alert('无法打开新窗口，请检查浏览器设置')
      return
    }
    
    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>批量二维码</title>
        <style>
          body { font-family: Arial, sans-serif; padding: 20px; }
          .qrcode-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 20px; }
          .qrcode-item { text-align: center; }
          .qrcode-img { width: 120px; height: 120px; margin: 0 auto; }
          .qrcode-label { font-size: 12px; margin-top: 5px; }
          @media print {
            body { padding: 10px; }
            .qrcode-grid { gap: 10px; }
            .qrcode-img { width: 100px; height: 100px; }
          }
        </style>
      </head>
      <body>
        <h2 style="text-align:center;margin-bottom:20px;">书本二维码批量打印</h2>
        <div class="qrcode-grid">
    `)
    
    for (const book of selectedBookItems) {
      const canvas = document.createElement('canvas')
      await QRCode.toCanvas(canvas, book.bookCode, {
        width: 120,
        margin: 2
      })
      const dataUrl = canvas.toDataURL('image/png')
      
      printWindow.document.write(`
        <div class="qrcode-item">
          <img src="${dataUrl}" class="qrcode-img" />
          <div class="qrcode-label">${book.bookName}</div>
          <div class="qrcode-label">${book.bookCode}</div>
        </div>
      `)
    }
    
    printWindow.document.write(`
        </div>
      </body>
      </html>
    `)
    
    printWindow.document.close()
    printWindow.focus()
    setTimeout(() => printWindow.print(), 500)
  } catch (err) {
    alert('批量生成二维码失败')
    console.error(err)
  }
}

// ==================== 批量导入导出 ====================
const showImportModal = ref(false)
const importResult = ref({ total: 0, success: 0, skipped: 0, errors: [] as string[] })
const fileInput = ref<HTMLInputElement | null>(null)

// CSV 模板字段
const templateHeaders = ['年度', '时期', '年级', '科目', '难度', '班级', '洪河校区入库数量', '龙华校区入库数量']

const downloadTemplate = () => {
  // 生成示例数据行（难度可选：无、基础、培优、尖子）
  const sampleRows = [
    ['2026', '暑期', '1年级', '语文', '基础', '', '80', '60'],
    ['2026', '暑期', '1年级', '语文', '培优', '', '50', '40'],
    ['2026', '暑期', '1年级', '数学', '基础', '', '75', '55'],
    ['2026', '暑期', '2年级', '语文', '无', '', '70', '50'],
    ['2026', '暑期', '2年级', '数学', '尖子', '', '65', '45'],
    ['2026', '秋期', '1年级', '语文', '基础', '', '90', '70'],
    ['2026', '秋期', '1年级', '数学', '培优', '', '85', '65'],
    ['2026', '秋期', '2年级', '语文', '无', '', '80', '60'],
  ]

  // 构建CSV内容（BOM for Excel UTF-8 support）
  const BOM = '\uFEFF'
  let csv = BOM + templateHeaders.join(',') + '\n'
  sampleRows.forEach(row => {
    csv += row.join(',') + '\n'
  })

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = '书本批量导入模板.csv'
  link.click()
  URL.revokeObjectURL(url)
  
  setTimeout(() => {
    alert('模板已下载！\n\n文件保存位置：浏览器默认下载文件夹（通常是「下载」文件夹）\n\n请用 Excel 或 WPS 打开模板，按示例格式填写后保存为 CSV 格式再导入。')
  }, 300)
}

const triggerImport = () => {
  // —— 关键修复 1：保证无论如何都弹出文件选择框 ——
  // 优先使用 template 里绑定好的 ref；如果 ref 没绑定好（null/undefined），
  // 就 querySelector 兜底；再不行就创建临时 <input type="file" accept=".csv"> 直接 click（最可靠）
  let inputEl: HTMLInputElement | null | undefined = fileInput.value;
  if (!inputEl) {
    inputEl = document.querySelector('input.bs-file-input') as HTMLInputElement | null;
  }
  if (!inputEl) {
    inputEl = document.createElement('input');
    inputEl.type = 'file';
    inputEl.accept = '.csv,text/csv';
    inputEl.style.display = 'none';
    inputEl.className = 'bs-file-input bs-file-input-fallback';
    inputEl.addEventListener('change', (evt: Event) => {
      handleFileImport(evt).finally(() => {
        if (inputEl && inputEl.parentNode) inputEl.parentNode.removeChild(inputEl);
      });
    }, { once: true });
    document.body.appendChild(inputEl);
  }
  // 同步 click，确保处于"用户手势栈"中，浏览器不会阻止弹窗
  try { inputEl.click(); }
  catch (e) {
    console.error('[triggerImport] 无法触发文件选择框:', e);
    alert('❌ 无法打开文件选择框，请刷新页面重试。');
  }
};

const handleFileImport = async (event: Event) => {
  const target = event.target as HTMLInputElement | null;
  if (!target) return;
  const file = target.files?.[0];
  // 无论成功失败，先把 value 清了，允许下次选同一个文件再次触发 change
  try { target.value = ''; } catch {}
  if (!file) return;

  // —— 关键修复 2：禁止 xlsx/xls，明确提示需要 CSV（避免把二进制 xlsx 当文本读，全是乱码导致用户以为没反应）
  const name = file.name || '';
  const low = name.toLowerCase();
  if (low.endsWith('.xlsx') || low.endsWith('.xls') || low.endsWith('.xlsm')) {
    alert(
      '⚠️  你选择的是 Excel 文件（.xlsx / .xls），系统只支持 CSV 格式导入。\n\n' +
      '操作步骤：\n' +
      '1) 用 Excel / WPS 打开 .xlsx 文件\n' +
      '2) 点击「文件」→「另存为」\n' +
      '3) 保存类型选择「CSV UTF-8(逗号分隔)(*.csv)」\n' +
      '4) 用保存好的 CSV 文件重新导入。'
    );
    return;
  }
  if (!low.endsWith('.csv')) {
    alert('⚠️  请选择后缀为 .csv 的文件（不支持其他格式）。');
    return;
  }

  try {
    // 先用 UTF-8 读取
    const text = await file.text();

    // 检测是否有乱码（如果包含替换字符，尝试 GBK 解码）
    let finalText = text;
    if (text.includes('\uFFFD')) {
      try {
        const buffer = await file.arrayBuffer();
        const decoder = new TextDecoder('gbk');
        finalText = decoder.decode(buffer);
      } catch {
        finalText = text;
      }
    }

    await parseCSV(finalText);
  } catch (e) {
    console.error('[导入] 读取文件失败:', e);
    alert('❌ 读取文件失败：\n\n' + (e as Error).message + '\n\n请尝试用 Excel 重新「另存为 CSV（UTF-8 逗号分隔）」格式，或刷新页面重试。');
  }
};

const parseCSV = async (text: string) => {
  try {
    importResult.value = { total: 0, success: 0, skipped: 0, errors: [] }

    // 移除BOM
    const cleanText = text.replace(/^\uFEFF/, '')
    const lines = cleanText.split(/\r?\n/).filter(line => line.trim())

    if (lines.length < 2) {
      alert('文件为空或格式不正确')
      return
    }

    // 自动检测分隔符：逗号或分号（Excel中文环境可能用分号）
    const headerLine = lines[0].trim()
    const commaCount = (headerLine.match(/,/g) || []).length
    const semicolonCount = (headerLine.match(/;/g) || []).length
    const delimiter = semicolonCount > commaCount ? ';' : ','

    // 解析 CSV 行（处理引号包裹的值）
    const parseLine = (line: string): string[] => {
      const result: string[] = []
      let current = ''
      let inQuotes = false
      for (let i = 0; i < line.length; i++) {
        const char = line[i]
        if (char === '"') {
          if (inQuotes && line[i + 1] === '"') {
            current += '"'
            i++
          } else {
            inQuotes = !inQuotes
          }
        } else if (char === delimiter && !inQuotes) {
          result.push(current.trim())
          current = ''
        } else {
          current += char
        }
      }
      result.push(current.trim())
      return result
    }

    const headers = parseLine(headerLine)

    // 校验表头
    const requiredHeaders = ['年度', '时期', '年级', '科目']
    const missingHeaders = requiredHeaders.filter(h => !headers.includes(h))
    if (missingHeaders.length > 0) {
      alert(`缺少必要列：${missingHeaders.join('、')}。请使用下载的模板填写。\n\n检测到的列：${headers.join('、')}\n分隔符：${delimiter === ';' ? '分号' : '逗号'}`)
      return
    }

    // （storage.ts 已固定年级/科目/难度为默认值，不从 localStorage 读，所以这里一定有值。
    //  保留安全 fallback：万一 storage 层改了导致列表为空，直接跳过校验，避免误拦有效导入）
    const hasValidLists = gradeList.value.length && subjectList.value.length && difficultyList.value.length
    if (hasValidLists) {
      try {
        await Promise.all([loadGrades(), loadSubjects(), loadDifficulties()])
      } catch {}
    }

    // 获取系统配置的年级、科目、难度列表（用于校验）
    const validGrades = gradeList.value.map((g: any) => g.name)
    const validSubjects = subjectList.value.map((s: any) => s.name)
    const validDifficulties = difficultyList.value.map((d: any) => d.name)

    // —— 提前提示：解析完行数立刻告知（不用等预加载 Supabase 10 秒超时后才姗姗来迟）
    const dataRows = lines.length - 1
    if (dataRows > 30) {
      alert(`📦 检测到 ${dataRows} 本书待导入，大约需要 ${Math.ceil(dataRows / 20)} 秒，请耐心等待，完成后会自动弹窗提示！`)
    } else if (dataRows > 0) {
      // 即使 <=30 也弹个小提示？别弹太多 alert 了，默默跑即可，保证至少流程在动
      console.info(`[导入] 检测到 ${dataRows} 本书，开始处理...`)
    } else {
      alert('⚠️  CSV 里除了表头没有任何数据行，请检查 CSV 是否正确。')
      return
    }

    // === 预加载一次所需数据（直接读本地 localStorage，毫秒级，避免 Supabase 访问卡死用户） ===
    //     注意：fetchBooks()/fetchStock() 异步版内部会先 await isReallyOnline()，在 GitHub Pages
    //     访问 Supabase 不通时要等 5-10 秒超时。导入场景直接同步读本地数据即可，秒出结果。
    const bookListData: any[] = localOnlyGetBookList() || []
    let stockListData: StockItem[] = localOnlyGetStockData() || []
    const now = Date.now()

    // 第一遍扫描：解析所有行，校验并检测冲突
    interface ParsedRow {
      lineNum: number
      year: string
      term: string
      grade: string
      subject: string
      difficulty: string
      hongheQty: number
      longhuaQty: number
      bookName: string
      bookCode: string
      exists: boolean
      valid: boolean
      error?: string
    }

    const parsedRows: ParsedRow[] = []
    const conflictRows: ParsedRow[] = []

    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim()
      if (!line) continue

      const values = parseLine(line)
      importResult.value.total++

      const year = values[0] || ''
      const term = values[1] || ''
      const grade = values[2] || ''
      const subject = values[3] || ''
      const difficulty = values[4] || ''
      const hongheQty = parseInt(values[6]) || 0
      const longhuaQty = parseInt(values[7]) || 0

      const row: ParsedRow = {
        lineNum: i + 1,
        year, term, grade, subject, difficulty,
        hongheQty, longhuaQty,
        bookName: '',
        bookCode: '',
        exists: false,
        valid: true
      }

      if (!year || !term || !grade || !subject) {
        row.valid = false
        row.error = `第${i + 1}行：年度/时期/年级/科目不能为空`
      } else if (validGrades.length && !validGrades.includes(grade)) {
        row.valid = false
        row.error = `第${i + 1}行：年级「${grade}」不在系统配置中，系统年级：${validGrades.join('、')}`
      } else if (validSubjects.length && !validSubjects.includes(subject)) {
        row.valid = false
        row.error = `第${i + 1}行：科目「${subject}」不在系统配置中，系统科目：${validSubjects.join('、')}`
      } else if (difficulty && validDifficulties.length && !validDifficulties.includes(difficulty)) {
        row.valid = false
        row.error = `第${i + 1}行：难度「${difficulty}」不在系统配置中，系统难度：${validDifficulties.join('、')}`
      } else {
        const validTerms = ['春期', '暑期', '秋期', '冬期']
        if (!validTerms.includes(term)) {
          row.valid = false
          row.error = `第${i + 1}行：时期「${term}」不正确，可选：${validTerms.join('、')}`
        } else {
          row.bookName = `${year}年${term}${grade}${subject}${difficulty}`
          row.bookCode = `${year}-${term}-${grade}-${subject}-${difficulty || '无'}`
          // 检查是否已存在
          const exists = bookListData.find((b: BookItem) =>
            (b as any).year === year &&
            (b as any).term === term &&
            b.grade === grade &&
            b.subject === subject &&
            b.difficulty === difficulty
          )
          if (exists) {
            row.exists = true
            conflictRows.push(row)
          }
        }
      }

      if (!row.valid) {
        importResult.value.errors.push(row.error!)
      }
      parsedRows.push(row)
    }

    // 如果有冲突行，弹出选择框让用户决定处理方式
    let conflictMode = 'merge' // 默认合并
    if (conflictRows.length > 0) {
      const conflictNames = conflictRows.slice(0, 5).map(r => r.bookName).join('\n')
      const moreText = conflictRows.length > 5 ? `\n... 等共 ${conflictRows.length} 本` : ''

      // 关键：浏览器在连续弹窗（alert 后又 prompt）后，很容易静默拦截原生对话框
      //     prompt 被拦截时直接返回 null，原来代码会走 "已取消导入" return，
      //     但如果 alert("已取消") 也被同时拦截，用户就以为"点确定后没反应、也不添加书本"。
      // —— 修复：如果 prompt 返回 null，不直接取消；先靠时间差判断"用户真点了取消"还是"被拦截立刻返回 null"。
      //     被拦截时默认走【合并累加】并额外 alert 告知（alert 就算被拦，结果弹窗里也会有文字说明）。
      const t0 = Date.now()
      const choice = window.prompt(
        `检测到 ${conflictRows.length} 本已存在的书本：\n${conflictNames}${moreText}\n\n` +
        `请选择处理方式（输入对应数字）：\n` +
        `1 - 合并求和：在原有库存基础上累加（推荐）\n` +
        `2 - 覆盖数据：用导入数据替换原有库存\n` +
        `3 - 跳过不导：已存在的书本不导入\n\n` +
        `请输入 1、2 或 3：`
      )
      const dt = Date.now() - t0

      if (choice === '1') {
        conflictMode = 'merge'
      } else if (choice === '2') {
        conflictMode = 'overwrite'
      } else if (choice === '3') {
        conflictMode = 'skip'
      } else if (choice === null && dt < 150) {
        // —— 可疑：用户点击"确定"（前面的 alert 确定）+ prompt 展示 + 用户输入数字，至少几百毫秒
        //     150ms 内返回 null = 浏览器直接拦截了 prompt，根本没给用户看选项
        console.warn('[导入] prompt 被浏览器拦截（返回 null，耗时仅', dt, 'ms），已自动降级为【合并累加(merge)】继续导入')
        conflictMode = 'merge'
        const fallbackMsg = `⚠️  浏览器拦截了冲突选择对话框，已自动按【合并求和(累加)】处理 ${conflictRows.length} 本重复书本。\n\n如需"覆盖"或"跳过"模式，请稍后分批导入少量书本，或在浏览器地址栏右侧允许该站点弹窗后重试。`
        importResult.value.errors.push(fallbackMsg)
        try { alert(fallbackMsg) } catch {} // alert 就算又被拦也没事，上面已经把说明写进错误明细了
      } else if (choice === null) {
        // 用户显式取消（点了取消按钮/ESC，耗时超过 150ms）
        alert('已取消导入')
        return
      } else {
        alert('输入无效，已取消导入（请直接输入数字 1、2 或 3，不要加空格或其他字符）')
        return
      }
    }

    // 第二遍：执行导入（全部纯 localStorage 同步写入，毫秒级完成，绝不卡用户）
    for (const row of parsedRows) {
      if (!row.valid) continue

      if (row.exists) {
        // 已存在的书本，根据用户选择处理
        if (conflictMode === 'skip') {
          importResult.value.skipped++
          continue
        }

        if (conflictMode === 'overwrite') {
          // 覆盖：先删除原有本地书本/库存/日志/预测，再创建新记录
          localOnlyDeleteBook(row.year, row.term, row.grade, row.subject, row.difficulty)
          // 重新创建书本
          const newBook: any = {
            _id: generateId(),
            bookName: row.bookName,
            bookCode: row.bookCode,
            year: row.year,
            term: row.term,
            grade: row.grade,
            subject: row.subject,
            difficulty: row.difficulty || '',
            totalQuantity: row.hongheQty + row.longhuaQty,
            hongheQuantity: row.hongheQty,
            longhuaQuantity: row.longhuaQty,
            createTime: now
          }
          let savedOk = true
          try {
            localOnlyAddBook(newBook)
            bookListData.push(newBook)
          } catch (e) {
            savedOk = false
            importResult.value.errors.push(`第${row.lineNum}行【${row.bookName}】创建书本失败：${(e as Error).message || e}`)
          }
          if (savedOk) {
            let stockFailed = false
            try {
              updateOrCreateStockPreloaded(stockListData, 'honghe', '洪河校区', row.year, row.term, row.grade, row.subject, row.difficulty, row.bookName, row.hongheQty, now, 'overwrite')
            } catch (e) { stockFailed = true; importResult.value.errors.push(`第${row.lineNum}行【${row.bookName}】洪河校区库存覆盖失败：${(e as Error).message || e}`) }
            try {
              updateOrCreateStockPreloaded(stockListData, 'longhua', '龙华校区', row.year, row.term, row.grade, row.subject, row.difficulty, row.bookName, row.longhuaQty, now, 'overwrite')
            } catch (e) { stockFailed = true; importResult.value.errors.push(`第${row.lineNum}行【${row.bookName}】龙华校区库存覆盖失败：${(e as Error).message || e}`) }
            // 覆盖模式写入入库日志（本地同步）
            const userInfo = getUserInfo()
            if (row.hongheQty > 0) {
              try {
                localOnlyAddLog({
                  type: 'stock_in', operator: userInfo?.userName || '管理员', operatorName: userInfo?.userName || '管理员',
                  action: '入库', detail: '批量导入(覆盖)',
                  year: row.year, term: row.term, grade: row.grade, subject: row.subject, difficulty: row.difficulty,
                  campus: 'honghe', bookName: row.bookName, quantity: row.hongheQty, note: '批量导入(覆盖)', createTime: now
                })
              } catch {}
            }
            if (row.longhuaQty > 0) {
              try {
                localOnlyAddLog({
                  type: 'stock_in', operator: userInfo?.userName || '管理员', operatorName: userInfo?.userName || '管理员',
                  action: '入库', detail: '批量导入(覆盖)',
                  year: row.year, term: row.term, grade: row.grade, subject: row.subject, difficulty: row.difficulty,
                  campus: 'longhua', bookName: row.bookName, quantity: row.longhuaQty, note: '批量导入(覆盖)', createTime: now
                })
              } catch {}
            }
            if (!stockFailed) importResult.value.success++
          }
        } else {
          // 合并：在原有库存基础上累加
          let mergeFailed = false
          try {
            updateOrCreateStockPreloaded(stockListData, 'honghe', '洪河校区', row.year, row.term, row.grade, row.subject, row.difficulty, row.bookName, row.hongheQty, now, 'merge')
          } catch (e) { mergeFailed = true; importResult.value.errors.push(`第${row.lineNum}行【${row.bookName}】洪河校区库存累加失败：${(e as Error).message || e}`) }
          try {
            updateOrCreateStockPreloaded(stockListData, 'longhua', '龙华校区', row.year, row.term, row.grade, row.subject, row.difficulty, row.bookName, row.longhuaQty, now, 'merge')
          } catch (e) { mergeFailed = true; importResult.value.errors.push(`第${row.lineNum}行【${row.bookName}】龙华校区库存累加失败：${(e as Error).message || e}`) }
          if (!mergeFailed) importResult.value.success++
          else importResult.value.skipped++
        }
      } else {
        // 创建新书本
        const newBook: any = {
          _id: generateId(),
          bookName: row.bookName,
          bookCode: row.bookCode,
          year: row.year,
          term: row.term,
          grade: row.grade,
          subject: row.subject,
          difficulty: row.difficulty || '',
          totalQuantity: row.hongheQty + row.longhuaQty,
          hongheQuantity: row.hongheQty,
          longhuaQuantity: row.longhuaQty,
          createTime: now
        }
        let savedOk = true
        try {
          localOnlyAddBook(newBook)
          bookListData.push(newBook)
        } catch (e) {
          savedOk = false
          importResult.value.errors.push(`第${row.lineNum}行【${row.bookName}】创建书本失败：${(e as Error).message || e}`)
        }
        if (savedOk) {
          importResult.value.success++
          try {
            updateOrCreateStockPreloaded(stockListData, 'honghe', '洪河校区', row.year, row.term, row.grade, row.subject, row.difficulty, row.bookName, row.hongheQty, now, 'merge')
          } catch (e) { importResult.value.errors.push(`第${row.lineNum}行【${row.bookName}】洪河校区库存失败：${(e as Error).message || e}`) }
          try {
            updateOrCreateStockPreloaded(stockListData, 'longhua', '龙华校区', row.year, row.term, row.grade, row.subject, row.difficulty, row.bookName, row.longhuaQty, now, 'merge')
          } catch (e) { importResult.value.errors.push(`第${row.lineNum}行【${row.bookName}】龙华校区库存失败：${(e as Error).message || e}`) }
        }
      }
    }

    const { total, success, skipped, errors } = importResult.value

    // —— 关键修复（终极版）：全部本地写入已经毫秒级完成了
    // 1) 立刻从本地刷列表、立刻弹结果窗 → 1 秒内有反馈，绝不"没反应"
    // 2) void 异步调 syncLocalToCloud 慢慢同步云端，失败/超时都不影响用户可见的结果
    try {
      bookList.value = localOnlyGetBookList() || []
    } catch (e) {
      console.warn('[导入] 刷新书本列表失败：', e)
    }
    showImportModal.value = true

    // 后台异步同步到云端（失败、超时都无人值守，绝不阻塞结果弹窗）
    // 说明：syncLocalToCloud 本身会把所有本地变更 upsert 到 Supabase
    void Promise.resolve().then(async () => {
      try {
        await withTimeout(ds.syncLocalToCloud(), 30000, null, 'syncLocalToCloud(导入后云同步)')
      } catch (e) {
        console.warn('[导入后云同步] 失败或超时，数据已保留在本地，下次进入/导出时可继续同步：', e)
      }
    })

    // 如果 0 成功 + 0 跳过 + 有错误，额外弹窗告知用户（避免用户觉得"没反应"）
    if (success === 0 && skipped === 0 && errors.length > 0) {
      alert('⚠️  本次导入没有成功的书本，全部行都有错误。\n\n请关闭结果弹窗查看具体错误说明，修正 CSV 后再导入。')
    } else if (total > 0 && success === 0 && skipped === 0 && errors.length === 0) {
      alert('⚠️  导入解析完成，但没有产生任何新增或更新。请检查 CSV 内容是否为空行或全部取消。')
    }
  } catch (e) {
    console.error('[parseCSV] 导入过程异常：', e)
    alert('❌ 导入过程出错：\n\n' + (e as Error).message + '\n\n请关闭页面重试，或截图此消息联系技术支持。')
    // 无论如何，让 importModal 里能看到错误明细
    showImportModal.value = true
  }
}

/**
 * 库存更新（预加载版本）
 * - stockList: 预先加载的完整库存列表（用于在内存中查找是否已存在）
 * - mode: 'merge' 表示累加；'overwrite' 表示直接覆盖为传入的 quantity
 * - 【全部纯 localStorage 同步操作】，毫秒级完成，绝不等待云端
 *   操作完成后，会把新/更新后的记录 push 回 stockList，保证后续相同书的查找能命中最新值
 */
const updateOrCreateStockPreloaded = (
  stockList: StockItem[],
  campus: string, campusName: string,
  year: string, term: string, grade: string, subject: string,
  difficulty: string, bookName: string, quantity: number, now: number,
  mode: 'merge' | 'overwrite' = 'merge'
): StockItem => {
  const existing = stockList.find((s: StockItem) =>
    s.campus === campus && s.year === year && s.term === term &&
    s.grade === grade && s.subject === subject && s.difficulty === difficulty
  )

  let saved: StockItem

  if (existing) {
    if (mode === 'overwrite') {
      // 覆盖：totalIn/remainingStock/totalQuantity/校区数量 全部直接设为传入值
      saved = localOnlyUpsertStock({
        ...existing,
        campus, year, term, grade, subject, campusName, bookName,
        totalIn: quantity,
        totalOut: existing.totalOut || 0,
        totalQuantity: quantity,
        hongheQuantity: campus === 'honghe' ? quantity : (existing.hongheQuantity || 0),
        longhuaQuantity: campus === 'longhua' ? quantity : (existing.longhuaQuantity || 0),
        remainingStock: Math.max(0, quantity - (existing.totalOut || 0)),
        updateTime: now
      }, 'overwrite')
    } else {
      const qtyDelta = quantity
      const newTotalIn = (existing.totalIn ?? 0) + qtyDelta
      saved = localOnlyUpsertStock({
        ...existing,
        campus, year, term, grade, subject, campusName, bookName,
        // 传入累加增量：localOnlyUpsertStock(mode=merge) 会自己处理 +=
        totalIn: qtyDelta,
        totalQuantity: qtyDelta,
        hongheQuantity: campus === 'honghe' ? qtyDelta : 0,
        longhuaQuantity: campus === 'longhua' ? qtyDelta : 0,
        remainingStock: qtyDelta,
        updateTime: now
      }, 'merge')
      // 修正：上面 localOnlyUpsertStock(merge) 是在本地存量上累加，但我们想基于 existing 预先计算 totalIn/remaining 以便返回给 caller 一致，
      // 所以读回最新值即可（localOnlyUpsertStock 已返回合并后的 saved）
      void newTotalIn
    }
    // 更新内存里的同一条，保证后续相同书本仍在同一批次导入时，查找命中的是最新值
    const idx = stockList.findIndex(s => s._id === existing!._id)
    if (idx >= 0) stockList[idx] = saved
  } else {
    const payload: Partial<StockItem> & { campus: string; year: string; term: string; grade: string; subject: string } = {
      _id: generateId(),
      campus,
      campusName,
      year,
      term,
      grade,
      subject,
      difficulty,
      bookName,
      bookCode: '',
      totalQuantity: quantity,
      hongheQuantity: campus === 'honghe' ? quantity : 0,
      longhuaQuantity: campus === 'longhua' ? quantity : 0,
      totalIn: quantity,
      totalOut: 0,
      remainingStock: quantity,
      createTime: now,
      updateTime: now
    }
    saved = localOnlyUpsertStock(payload, mode === 'overwrite' ? 'overwrite' : 'merge')
    stockList.push(saved)
  }

  // 写入入库日志（批量导入只有 merge 模式会记一次单独的 addLog，overwrite 模式由外层统一记录，避免重复）
  if (quantity > 0 && mode === 'merge') {
    const userInfo = getUserInfo()
    try {
      localOnlyAddLog({
        stockId: existing?._id || saved?._id || '',
        type: 'stock_in',
        operator: userInfo?.userName || userInfo?.nickName || '管理员',
        operatorName: userInfo?.userName || userInfo?.nickName || '管理员',
        action: '入库',
        detail: '批量导入',
        year, term, grade, subject, difficulty, campus,
        bookName,
        quantity,
        note: '批量导入',
        createTime: now
      })
    } catch (e) {
      // 日志失败不影响主流程，只 warn
      console.warn('[导入] 写入入库日志失败，不影响库存结果：', campus, bookName, e)
    }
  }

  return saved
}

// 保留旧签名（其他地方如果有调用也兼容）
const updateOrCreateStock = async (
  campus: string, campusName: string,
  year: string, term: string, grade: string, subject: string,
  difficulty: string, bookName: string, quantity: number, now: number
) => {
  let stocks: StockItem[] = []
  try {
    stocks = await ds.fetchStock()
  } catch (e) {
    console.warn('[updateOrCreateStock] fetchStock 失败，按新建处理：', e)
    stocks = []
  }
  await updateOrCreateStockPreloaded(stocks, campus, campusName, year, term, grade, subject, difficulty, bookName, quantity, now, 'merge')
}
// 显式引用，避免 TS6133 "声明但未使用"（作为兼容函数保留，其他模块未来可能调用）
void updateOrCreateStock

const closeImportModal = () => {
  showImportModal.value = false
}
</script>

<template>
  <div class="book-settings-page">
    <div class="page-header">
      <span class="back-btn" @click="goBack">‹</span>
      <h1 class="page-title">📚 书本设置</h1>
    </div>
    
    <div class="toolbar">
      <button class="toolbar-btn template-btn" @click="downloadTemplate">
        📥 下载模板
      </button>
      <button class="toolbar-btn import-btn" @click="triggerImport">
        📤 批量导入
      </button>
      <input 
        type="file" 
        ref="fileInput" 
        accept=".csv" 
        class="bs-file-input"
        style="display: none" 
        @change="handleFileImport"
      />
    </div>

    <!-- 筛选栏 -->
    <div class="filter-bar">
      <div class="filter-group" @click="selectFilter('year')">
        <span class="filter-label">年度</span>
        <span class="filter-value">{{ selectedYear || '全部' }}</span>
        <span class="filter-arrow">▼</span>
        <div v-if="showOptions === 'year'" class="filter-dropdown">
          <div class="filter-option" :class="{ active: selectedYear === '' }" @click.stop="selectedYear = ''; showOptions = ''">全部</div>
          <div v-for="y in years" :key="y" class="filter-option" :class="{ active: selectedYear === y }" @click.stop="confirmFilter(y)">{{ y }}</div>
        </div>
      </div>
      <div class="filter-group" @click="selectFilter('term')">
        <span class="filter-label">时期</span>
        <span class="filter-value">{{ selectedTerm || '全部' }}</span>
        <span class="filter-arrow">▼</span>
        <div v-if="showOptions === 'term'" class="filter-dropdown">
          <div class="filter-option" :class="{ active: selectedTerm === '' }" @click.stop="selectedTerm = ''; showOptions = ''">全部</div>
          <div v-for="t in terms" :key="t" class="filter-option" :class="{ active: selectedTerm === t }" @click.stop="confirmFilter(t)">{{ t }}</div>
        </div>
      </div>
      <button class="filter-reset-btn" @click="resetFilter">重置</button>
    </div>
    
    <div class="book-list">
      <div v-if="filteredBooks.length === 0" class="empty-state">
        <span class="empty-icon">📚</span>
        <span>暂无书本数据</span>
      </div>
      
      <div class="list-header" v-if="filteredBooks.length > 0">
        <div class="select-all" @click="selectAllBooks">
          <span class="checkbox">{{ selectedBooks.length === filteredBooks.length && filteredBooks.length > 0 ? '✓' : '' }}</span>
          <span>全选</span>
        </div>
        <div class="batch-actions" v-if="selectedBooks.length > 0">
          <button class="batch-download-btn" @click="batchDownloadQrcode">
            批量下载二维码
          </button>
          <button class="batch-delete-btn" @click="batchDeleteBooks">
            批量删除 ({{ selectedBooks.length }})
          </button>
        </div>
      </div>
      
      <div v-for="book in filteredBooks" :key="book._id" class="book-card">
        <div class="select-item" @click="toggleSelect(book._id || '')">
          <span class="checkbox">{{ selectedBooks.includes(book._id || '') ? '✓' : '' }}</span>
        </div>
        <div class="book-info">
          <span class="book-name">{{ book.bookName }}</span>
          <span class="book-code">编号: {{ book.bookCode }}</span>
          <span class="book-meta" v-if="(book as any).year || (book as any).term">{{ (book as any).year }}年{{ (book as any).term }} · {{ getGradeLabel(book.grade) }} · {{ getSubjectLabel(book.subject) }}<span v-if="book.difficulty"> · {{ getDifficultyLabel(book.difficulty) }}</span></span>
          <span class="book-meta" v-else>{{ getGradeLabel(book.grade) }} · {{ getSubjectLabel(book.subject) }}<span v-if="book.difficulty"> · {{ getDifficultyLabel(book.difficulty) }}</span></span>
        </div>
        <div class="book-actions">
          <button class="qrcode-btn" @click="generateSingleQrcode(book)">二维码</button>
          <button class="edit-btn" @click="openEditModal(book)">编辑</button>
          <button class="delete-btn" @click="deleteBook(book._id || '')">删除</button>
        </div>
      </div>
    </div>
    
    <!-- 导入结果弹窗 -->
    <div v-if="showImportModal" class="modal-overlay" @click="closeImportModal">
      <div class="modal-content" @click.stop>
        <div class="modal-header">
          <span class="modal-title">📤 导入结果</span>
          <span class="modal-close" @click="closeImportModal">✕</span>
        </div>
        <div class="form-content">
          <div class="import-summary">
            <div class="summary-item success">
              <span class="summary-num">{{ importResult.success }}</span>
              <span class="summary-label">新增书本</span>
            </div>
            <div class="summary-item skipped">
              <span class="summary-num">{{ importResult.skipped }}</span>
              <span class="summary-label">已存在（已更新库存）</span>
            </div>
            <div class="summary-item error">
              <span class="summary-num">{{ importResult.errors.length }}</span>
              <span class="summary-label">错误</span>
            </div>
          </div>
          <div v-if="importResult.errors.length > 0" class="import-errors">
            <div class="error-title">错误详情：</div>
            <div v-for="(err, idx) in importResult.errors" :key="idx" class="error-item">{{ err }}</div>
          </div>
          <button class="btn-confirm" @click="closeImportModal">确定</button>
        </div>
      </div>
    </div>
    
    <button class="add-btn" @click="openAddModal">+ 添加书本</button>
    
    <!-- 添加弹窗 -->
    <div v-if="showAddModal" class="modal-overlay" @click="closeAddModal">
      <div class="modal-content" @click.stop>
        <div class="modal-header">
          <span class="modal-title">添加书本</span>
          <span class="modal-close" @click="closeAddModal">✕</span>
        </div>
        <div class="form-content">
          <div class="form-row">
            <div class="form-group half">
              <label>年度</label>
              <select class="form-select" v-model="newBook.year">
                <option value="">请选择年度</option>
                <option v-for="y in years" :key="y" :value="y">{{ y }}年</option>
              </select>
            </div>
            <div class="form-group half">
              <label>时期</label>
              <select class="form-select" v-model="newBook.term">
                <option value="">请选择时期</option>
                <option v-for="t in terms" :key="t" :value="t">{{ t }}</option>
              </select>
            </div>
          </div>
          <div class="form-row">
            <div class="form-group half">
              <label>年级</label>
              <select class="form-select" v-model="newBook.grade">
                <option value="">请选择年级</option>
                <option v-for="g in grades" :key="g.id" :value="g.name">{{ g.name }}</option>
              </select>
            </div>
            <div class="form-group half">
              <label>科目</label>
              <select class="form-select" v-model="newBook.subject">
                <option value="">请选择科目</option>
                <option v-for="s in subjects" :key="s.id" :value="s.name">{{ s.name }}</option>
              </select>
            </div>
          </div>
          <div class="form-group">
            <label>难度</label>
            <select class="form-select" v-model="newBook.difficulty">
              <option value="">请选择难度（可选）</option>
              <option v-for="d in difficulties" :key="d.id" :value="d.name">{{ d.name }}</option>
            </select>
          </div>
          <div class="form-group">
            <label>自动生成名称</label>
            <div class="auto-name">{{ generatedBookName }}</div>
          </div>
          <div class="form-group">
            <label>书本编号（可选，留空自动生成）</label>
            <input type="text" class="form-input" v-model="newBook.bookCode" :placeholder="`${newBook.year}-${newBook.term}-${newBook.grade}-${newBook.subject}-${newBook.difficulty || '无'}`" />
          </div>
          <button class="btn-confirm" @click="addBook">确认添加</button>
        </div>
      </div>
    </div>
    
    <!-- 编辑弹窗 -->
    <div v-if="showEditModal" class="modal-overlay" @click="closeEditModal">
      <div class="modal-content" @click.stop>
        <div class="modal-header">
          <span class="modal-title">编辑书本</span>
          <span class="modal-close" @click="closeEditModal">✕</span>
        </div>
        <div class="form-content">
          <div class="form-row">
            <div class="form-group half">
              <label>年度</label>
              <select class="form-select" v-model="editBookData.year">
                <option value="">请选择年度</option>
                <option v-for="y in years" :key="y" :value="y">{{ y }}年</option>
              </select>
            </div>
            <div class="form-group half">
              <label>时期</label>
              <select class="form-select" v-model="editBookData.term">
                <option value="">请选择时期</option>
                <option v-for="t in terms" :key="t" :value="t">{{ t }}</option>
              </select>
            </div>
          </div>
          <div class="form-row">
            <div class="form-group half">
              <label>年级</label>
              <select class="form-select" v-model="editBookData.grade">
                <option value="">请选择年级</option>
                <option v-for="g in grades" :key="g.id" :value="g.name">{{ g.name }}</option>
              </select>
            </div>
            <div class="form-group half">
              <label>科目</label>
              <select class="form-select" v-model="editBookData.subject">
                <option value="">请选择科目</option>
                <option v-for="s in subjects" :key="s.id" :value="s.name">{{ s.name }}</option>
              </select>
            </div>
          </div>
          <div class="form-group">
            <label>难度</label>
            <select class="form-select" v-model="editBookData.difficulty">
              <option value="">请选择难度（可选）</option>
              <option v-for="d in difficulties" :key="d.id" :value="d.name">{{ d.name }}</option>
            </select>
          </div>
          <div class="form-group">
            <label>自动生成名称</label>
            <div class="auto-name">{{ generatedEditBookName }}</div>
          </div>
          <div class="form-group">
            <label>书本编号（可选，留空自动生成）</label>
            <input type="text" class="form-input" v-model="editBookData.bookCode" :placeholder="`${editBookData.year}-${editBookData.term}-${editBookData.grade}-${editBookData.subject}-${editBookData.difficulty || '无'}`" />
          </div>
          <button class="btn-confirm" @click="saveEdit">保存修改</button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.book-settings-page {
  min-height: 100vh;
  background-color: #f5f5f5;
  padding-bottom: 120px;
}

.page-header {
  background: linear-gradient(135deg, #722ed1 0%, #531dab 100%);
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

.toolbar {
  display: flex;
  gap: 12px;
  padding: 12px 15px;
  background: #fff;
  border-bottom: 1px solid #f0f0f0;
}

.toolbar-btn {
  flex: 1;
  padding: 10px 0;
  border: none;
  border-radius: 8px;
  font-size: 14px;
  font-weight: bold;
  cursor: pointer;
}

.template-btn {
  background: #e6f7ff;
  color: #1890ff;
  border: 1px solid #91d5ff;
}

.import-btn {
  background: #f6ffed;
  color: #52c41a;
  border: 1px solid #b7eb8f;
}

.page-title {
  font-size: 20px;
  font-weight: bold;
  color: #fff;
}

.book-list {
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

.list-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}

.select-all {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
  color: #666;
}

.checkbox {
  width: 20px;
  height: 20px;
  background: #fff;
  border-radius: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  border: 1px solid #ddd;
}

.batch-download-btn {
  padding: 8px 16px;
  background: #52c41a;
  color: #fff;
  border: none;
  border-radius: 8px;
  font-size: 14px;
  cursor: pointer;
}

.batch-actions {
  display: flex;
  gap: 8px;
}

.batch-delete-btn {
  padding: 8px 16px;
  background: #ff4d4f;
  color: #fff;
  border: none;
  border-radius: 8px;
  font-size: 14px;
  cursor: pointer;
}

.book-card {
  display: flex;
  align-items: center;
  background: #fff;
  border-radius: 12px;
  padding: 12px 15px;
  margin-bottom: 12px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);
}

.select-item {
  margin-right: 12px;
}

.book-info {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.book-name {
  font-size: 16px;
  font-weight: bold;
  color: #333;
}

.book-code {
  font-size: 12px;
  color: #999;
}

.book-meta {
  font-size: 12px;
  color: #666;
}

.book-actions {
  display: flex;
  gap: 8px;
}

.qrcode-btn {
  padding: 6px 10px;
  background: #e6f7ff;
  color: #1890ff;
  border: none;
  border-radius: 4px;
  font-size: 12px;
  cursor: pointer;
}

.edit-btn {
  padding: 6px 10px;
  background: #fff7e6;
  color: #fa8c16;
  border: none;
  border-radius: 4px;
  font-size: 12px;
  cursor: pointer;
}

.delete-btn {
  padding: 6px 10px;
  background: #fff1f0;
  color: #ff4d4f;
  border: none;
  border-radius: 4px;
  font-size: 12px;
  cursor: pointer;
}

.add-btn {
  position: fixed;
  bottom: 100px;
  right: 15px;
  width: 56px;
  height: 56px;
  background: #1890ff;
  color: #fff;
  border: none;
  border-radius: 50%;
  font-size: 24px;
  cursor: pointer;
  box-shadow: 0 4px 12px rgba(24, 144, 255, 0.4);
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

.form-content {
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

.form-input, .form-select {
  width: 100%;
  padding: 12px;
  border: 1px solid #ddd;
  border-radius: 8px;
  font-size: 14px;
  background: #fff;
}

.form-row {
  display: flex;
  gap: 12px;
}

.form-group.half {
  flex: 1;
}

.auto-name {
  padding: 12px;
  background: #e6f7ff;
  border: 1px solid #91d5ff;
  border-radius: 8px;
  font-size: 14px;
  font-weight: bold;
  color: #1890ff;
  text-align: center;
  word-break: break-all;
}

.btn-confirm {
  width: 100%;
  padding: 14px;
  background: #722ed1;
  color: #fff;
  border: none;
  border-radius: 8px;
  font-size: 16px;
  font-weight: bold;
  cursor: pointer;
}

.import-summary {
  display: flex;
  gap: 12px;
  margin-bottom: 15px;
}

.summary-item {
  flex: 1;
  text-align: center;
  padding: 15px 8px;
  border-radius: 8px;
}

.summary-item.success {
  background: #f6ffed;
  border: 1px solid #b7eb8f;
}

.summary-item.skipped {
  background: #fff7e6;
  border: 1px solid #ffd591;
}

.summary-item.error {
  background: #fff1f0;
  border: 1px solid #ffa39e;
}

.summary-num {
  display: block;
  font-size: 28px;
  font-weight: bold;
  color: #333;
  margin-bottom: 4px;
}

.summary-item.success .summary-num { color: #52c41a; }
.summary-item.skipped .summary-num { color: #fa8c16; }
.summary-item.error .summary-num { color: #ff4d4f; }

.summary-label {
  font-size: 12px;
  color: #666;
}

.import-errors {
  background: #fff1f0;
  border: 1px solid #ffa39e;
  border-radius: 8px;
  padding: 10px;
  margin-bottom: 15px;
  max-height: 150px;
  overflow-y: auto;
}

.error-title {
  font-size: 13px;
  font-weight: bold;
  color: #ff4d4f;
  margin-bottom: 6px;
}

.error-item {
  font-size: 12px;
  color: #ff4d4f;
  padding: 3px 0;
}
</style>
