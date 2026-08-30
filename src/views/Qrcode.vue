<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { getUserInfo } from '../utils/storage'
import * as ds from '../services/dataService'
import type { BookItem } from '../types'

const router = useRouter()
const scanInput = ref('')
const scanning = ref(false)
const scannedBook = ref<BookItem | null>(null)
const showOperateModal = ref(false)
const showResultModal = ref(false)
const operateType = ref('stock_in')
const quantity = ref(1)
const note = ref('')
const campus = ref('')
const bookList = ref<BookItem[]>([])
const submitting = ref(false)

const userInfo = getUserInfo()

const campuses = [
  { value: 'honghe', label: '洪河校区' },
  { value: 'longhua', label: '龙华校区' }
]

const userCampuses = computed(() => {
  if (userInfo.role === 'super') {
    return campuses
  }
  if (userInfo.role === 'admin') {
    return campuses
  }
  return campuses.filter(c => (userInfo.campuses || []).includes(c.value))
})

onMounted(async () => {
  bookList.value = await ds.fetchBooks() as BookItem[]
})

const goBack = () => {
  router.back()
}

const scanQrcode = () => {
  if (!scanInput.value.trim()) {
    alert('请输入二维码内容')
    return
  }
  
  scanning.value = true
  
  setTimeout(() => {
    const book = bookList.value.find((b: BookItem) => b.bookCode === scanInput.value.trim())
    
    if (book) {
      scannedBook.value = book
      showResultModal.value = true
    } else {
      alert('未找到对应的书本')
    }
    
    scanning.value = false
  }, 500)
}

const openOperate = () => {
  showResultModal.value = false
  showOperateModal.value = true
  quantity.value = 1
  note.value = ''
  campus.value = userCampuses.value[0]?.value || ''
}

const closeOperateModal = () => {
  showOperateModal.value = false
}

const closeResultModal = () => {
  showResultModal.value = false
  scannedBook.value = null
  scanInput.value = ''
}

const confirmOperate = async () => {
  if (!scannedBook.value) return
  // 防重复提交
  if (submitting.value) return
  submitting.value = true

  // ===== 立即保存输入值并关闭弹窗 =====
  const book = scannedBook.value
  const type = operateType.value
  const operateCampus = campus.value
  const qty = quantity.value
  const operateNote = note.value
  const userInfo = getUserInfo()

  // 关闭弹窗（第二次调用会被 !scannedBook.value 拦截）
  closeOperateModal()
  closeResultModal()

  if (!operateCampus || qty <= 0) {
    alert('请填写完整信息')
    return
  }

  try {
    const result = type === 'stock_in'
      ? await ds.stockIn({
          campus: operateCampus,
          year: (book as any).year,
          term: (book as any).term,
          grade: book.grade,
          subject: book.subject,
          difficulty: book.difficulty,
          bookName: book.bookName,
          quantity: qty,
          remark: operateNote,
          scanOperate: true,
          operator: userInfo?.userName || userInfo?.nickName || '',
          operatorName: userInfo?.userName || userInfo?.nickName || ''
        })
      : await ds.stockOut({
          campus: operateCampus,
          year: (book as any).year,
          term: (book as any).term,
          grade: book.grade,
          subject: book.subject,
          difficulty: book.difficulty,
          bookName: book.bookName,
          quantity: qty,
          remark: operateNote,
          scanOperate: true,
          operator: userInfo?.userName || userInfo?.nickName || '',
          operatorName: userInfo?.userName || userInfo?.nickName || ''
        })

    if (result.success) {
      alert('操作成功')
    } else {
      alert('操作失败：' + (result.message || '未知错误'))
    }
  } catch (err) {
    console.error('[confirmOperate] 操作失败:', err)
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <div class="qrcode-page">
    <div class="page-header">
      <span class="back-btn" @click="goBack">‹</span>
      <h1 class="page-title">📱 扫码出入库</h1>
    </div>
    
    <div class="scan-area">
      <div class="scan-box">
        <div class="scan-line"></div>
        <div class="scan-corners">
          <div class="corner top-left"></div>
          <div class="corner top-right"></div>
          <div class="corner bottom-left"></div>
          <div class="corner bottom-right"></div>
        </div>
        <div class="scan-tip">请扫描书本二维码</div>
      </div>
    </div>
    
    <div class="input-area">
      <input 
        type="text" 
        class="scan-input" 
        v-model="scanInput" 
        placeholder="或手动输入书本编号"
        :disabled="scanning"
      />
      <button class="scan-btn" @click="scanQrcode" :disabled="scanning">
        {{ scanning ? '扫描中...' : '开始扫描' }}
      </button>
    </div>
    
    <!-- 扫描结果弹窗 -->
    <div v-if="showResultModal && scannedBook" class="modal-overlay" @click="closeResultModal">
      <div class="modal-content" @click.stop>
        <div class="modal-header">
          <span class="modal-title">扫描结果</span>
          <span class="modal-close" @click="closeResultModal">✕</span>
        </div>
        <div class="book-result">
          <div class="book-icon">📚</div>
          <div class="book-name">{{ scannedBook.bookName }}</div>
          <div class="book-code">编号: {{ scannedBook.bookCode }}</div>
        </div>
        <button class="btn-operate" @click="openOperate">立即操作</button>
      </div>
    </div>
    
    <!-- 操作弹窗 -->
    <div v-if="showOperateModal && scannedBook" class="modal-overlay" @click="closeOperateModal">
      <div class="modal-content" @click.stop>
        <div class="modal-header">
          <span class="modal-title">出入库操作</span>
          <span class="modal-close" @click="closeOperateModal">✕</span>
        </div>
        <div class="form-content">
          <div class="form-group">
            <label>书本</label>
            <span class="form-value">{{ scannedBook.bookName }} ({{ scannedBook.bookCode }})</span>
          </div>
          <div class="form-group">
            <label>操作类型</label>
            <div class="options-group">
              <div 
                class="option-item"
                :class="{ active: operateType === 'stock_in' }"
                @click="operateType = 'stock_in'"
              >入库</div>
              <div 
                class="option-item"
                :class="{ active: operateType === 'stock_out' }"
                @click="operateType = 'stock_out'"
              >出库</div>
            </div>
          </div>
          <div class="form-group">
            <label>校区</label>
            <select class="form-select" v-model="campus">
              <option v-for="c in userCampuses" :key="c.value" :value="c.value">{{ c.label }}</option>
            </select>
          </div>
          <div class="form-group">
            <label>数量</label>
            <input type="number" class="form-input" v-model.number="quantity" min="1" />
          </div>
          <div class="form-group">
            <label>备注</label>
            <textarea class="form-textarea" v-model="note" placeholder="请输入备注"></textarea>
          </div>
          <button class="btn-confirm" @click="confirmOperate" :disabled="submitting">{{ submitting ? '提交中...' : '确认' + (operateType === 'stock_in' ? '入库' : '出库') }}</button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.qrcode-page {
  min-height: 100vh;
  background-color: #f5f5f5;
  padding-bottom: 120px;
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

.scan-area {
  padding: 40px 20px;
  display: flex;
  justify-content: center;
}

.scan-box {
  width: 280px;
  height: 280px;
  background: #fff;
  border-radius: 16px;
  position: relative;
  overflow: hidden;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.1);
}

.scan-line {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 4px;
  background: #1890ff;
  animation: scan 2s linear infinite;
}

@keyframes scan {
  0% { top: 0; opacity: 1; }
  100% { top: 100%; opacity: 0.5; }
}

.scan-corners {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
}

.corner {
  position: absolute;
  width: 30px;
  height: 30px;
  border: 3px solid #1890ff;
}

.corner.top-left {
  top: 10px;
  left: 10px;
  border-right: none;
  border-bottom: none;
}

.corner.top-right {
  top: 10px;
  right: 10px;
  border-left: none;
  border-bottom: none;
}

.corner.bottom-left {
  bottom: 10px;
  left: 10px;
  border-right: none;
  border-top: none;
}

.corner.bottom-right {
  bottom: 10px;
  right: 10px;
  border-left: none;
  border-top: none;
}

.scan-tip {
  position: absolute;
  bottom: 30px;
  left: 0;
  right: 0;
  text-align: center;
  color: #999;
  font-size: 14px;
}

.input-area {
  padding: 0 20px;
}

.scan-input {
  width: 100%;
  padding: 14px;
  border: 1px solid #ddd;
  border-radius: 8px;
  font-size: 14px;
  margin-bottom: 15px;
}

.scan-btn {
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

.book-result {
  padding: 30px 20px;
  text-align: center;
}

.book-icon {
  font-size: 64px;
  margin-bottom: 15px;
}

.book-name {
  font-size: 20px;
  font-weight: bold;
  color: #333;
  display: block;
  margin-bottom: 8px;
}

.book-code {
  font-size: 14px;
  color: #999;
}

.btn-operate {
  width: 90%;
  margin: 0 5% 20px;
  padding: 14px;
  background: #1890ff;
  color: #fff;
  border: none;
  border-radius: 8px;
  font-size: 16px;
  font-weight: bold;
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
}

.form-textarea {
  width: 100%;
  padding: 12px;
  border: 1px solid #ddd;
  border-radius: 8px;
  font-size: 14px;
  height: 80px;
}

.form-value {
  padding: 12px;
  background: #f5f5f5;
  border-radius: 8px;
  font-size: 14px;
  color: #666;
}

.options-group {
  display: flex;
  gap: 10px;
}

.option-item {
  flex: 1;
  padding: 12px;
  background: #f5f5f5;
  border-radius: 8px;
  text-align: center;
  font-size: 14px;
  cursor: pointer;
  border: 2px solid transparent;
}

.option-item.active {
  background: #e6f7ff;
  border-color: #1890ff;
  color: #1890ff;
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
