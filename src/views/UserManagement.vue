<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { useRouter } from 'vue-router'
import { getRolePermissions, getRoleList } from '../utils/storage'
import * as ds from '../services/dataService'
import type { UserInfo, Role } from '../types'

const router = useRouter()
const userList = ref<UserInfo[]>([])
const showAddModal = ref(false)
const showEditModal = ref(false)
const editingUser = ref<UserInfo | null>(null)
const showUserPermissions = ref<string | null>(null)
const showResetPassword = ref(false)
const resetPasswordUser = ref<UserInfo | null>(null)
const newPassword = ref('')
const submitting = ref(false)

const newUser = ref({
  userName: '',
  nickName: '',
  role: '',
  campus: '',
  roles: [] as string[],
  campuses: [] as string[],
  password: ''
})

const editUser = ref({
  userName: '',
  nickName: '',
  role: '',
  campus: '',
  roles: [] as string[],
  campuses: [] as string[]
})

const roles = [
  { value: 'super', label: '超级管理员', color: '#ff4d4f' },
  { value: 'admin', label: '管理员', color: '#fa8c16' },
  { value: 'educational', label: '教务', color: '#52c41a' },
  { value: 'teacher', label: '教师', color: '#1890ff' }
]

const campuses = [
  { value: 'honghe', label: '洪河校区' },
  { value: 'longhua', label: '龙华校区' }
]

// 权限定义（与 storage.ts 一致）
const allPermissions = [
  { id: 'view_stock', label: '库存查询', group: '库存管理' },
  { id: 'stock_in', label: '入库', group: '库存管理' },
  { id: 'stock_out', label: '出库', group: '库存管理' },
  { id: 'delete_book', label: '删除书本', group: '库存管理' },
  { id: 'forecast_view', label: '查看预计', group: '预计管理' },
  { id: 'forecast_set', label: '设置预计', group: '预计管理' },
  { id: 'forecast_approve', label: '同意预计', group: '预计管理' },
  { id: 'forecast_modify', label: '修改预计', group: '预计管理' },
  { id: 'forecast_delete', label: '删除预计', group: '预计管理' },
  { id: 'forecast_stats', label: '预计统计', group: '预计管理' },
  { id: 'receive_view', label: '查看领取', group: '领取管理' },
  { id: 'receive_set', label: '设置领取', group: '领取管理' },
  { id: 'receive_approve', label: '同意领取', group: '领取管理' },
  { id: 'receive_modify', label: '修改领取', group: '领取管理' },
  { id: 'receive_delete', label: '删除领取', group: '领取管理' },
  { id: 'manage_books', label: '书本管理', group: '系统管理' },
  { id: 'manage_users', label: '用户管理', group: '系统管理' },
  { id: 'manage_roles', label: '角色管理', group: '系统管理' },
  { id: 'manage_system', label: '系统设置', group: '系统管理' },
  { id: 'view_stats', label: '数据统计', group: '系统管理' },
  { id: 'qrcode_generate', label: '二维码生成', group: '系统管理' },
  { id: 'manage_subjects', label: '科目管理', group: '系统管理' }
]

const getRolePermissionList = (role: string): string[] => {
  const rp = getRolePermissions()
  if (rp[role] && rp[role].length > 0) return rp[role]
  const roleList = getRoleList()
  const roleObj = roleList.find((r: Role) => r.role === role)
  if (roleObj && roleObj.permissions) return roleObj.permissions
  return []
}

const getUserMergedPermissions = (userRoles: string[]): string[] => {
  const permSet = new Set<string>()
  userRoles.forEach(role => {
    getRolePermissionList(role).forEach(p => permSet.add(p))
  })
  return Array.from(permSet)
}

const getGroupedPermissions = (permIds: string[]) => {
  const groups: Record<string, { id: string; label: string }[]> = {}
  allPermissions.forEach(p => {
    if (permIds.includes(p.id)) {
      if (!groups[p.group]) groups[p.group] = []
      groups[p.group].push(p)
    }
  })
  return Object.entries(groups).map(([group, items]) => ({ group, items }))
}

onMounted(() => {
  loadUsers()
})

const goBack = () => {
  router.back()
}

const loadUsers = async () => {
  try {
    userList.value = await ds.fetchUsers()
  } catch (err) {
    console.error('[loadUsers] 加载用户列表失败:', err)
  }
}

const openAddModal = () => {
  newUser.value = {
    userName: '',
    nickName: '',
    role: '',
    campus: '',
    roles: [],
    campuses: [],
    password: ''
  }
  showAddModal.value = true
}

const closeAddModal = () => {
  showAddModal.value = false
}

const addUser = async () => {
  if (submitting.value) return
  submitting.value = true
  
  if (!newUser.value.nickName || newUser.value.roles.length === 0) {
    alert('请填写昵称并选择角色')
    submitting.value = false
    return
  }
  if (newUser.value.password.length < 4) {
    alert('密码至少4位')
    submitting.value = false
    return
  }

  const userCampuses = newUser.value.campuses.length > 0 ? [...newUser.value.campuses] : ['honghe']
  const defaultCampus = userCampuses[0]

  const newUserInfo: any = {
    _id: Date.now().toString(),
    openid: 'mock-' + Date.now(),
    userName: newUser.value.nickName,
    nickName: newUser.value.nickName,
    role: newUser.value.roles[0] || 'teacher',
    campus: defaultCampus,
    campusName: defaultCampus === 'honghe' ? '洪河校区' : '龙华校区',
    roles: [...newUser.value.roles],
    campuses: userCampuses,
    password: newUser.value.password,
    createTime: Date.now()
  }

  try {
    const result = await ds.addUser(newUserInfo)
    if (!result.success) {
      alert('添加失败：' + (result.error || '未知错误'))
      submitting.value = false
      return
    }
    alert('添加成功，初始密码为: ' + newUser.value.password)
    closeAddModal()
    await loadUsers()
  } catch (err) {
    console.error('[addUser] 添加用户失败:', err)
    alert('添加失败，请重试')
  } finally {
    submitting.value = false
  }
}

const toggleRole = (role: string, user: { roles: string[] }) => {
  const index = user.roles.indexOf(role)
  if (index >= 0) {
    user.roles.splice(index, 1)
  } else {
    user.roles.push(role)
  }
}

const toggleCampus = (campus: string, user: { campuses: string[] }) => {
  const index = user.campuses.indexOf(campus)
  if (index >= 0) {
    user.campuses.splice(index, 1)
  } else {
    user.campuses.push(campus)
  }
}

const openEditModal = (user: UserInfo) => {
  editingUser.value = user
  editUser.value = {
    userName: user.userName || '',
    nickName: user.nickName,
    role: user.role,
    campus: user.campus,
    roles: [...user.roles],
    campuses: [...user.campuses]
  }
  showEditModal.value = true
}

const closeEditModal = () => {
  showEditModal.value = false
  editingUser.value = null
}

const saveEdit = async () => {
  if (submitting.value) return
  submitting.value = true
  
  if (!editingUser.value || editUser.value.roles.length === 0) {
    alert('请至少选择一个角色')
    submitting.value = false
    return
  }

  const userCampuses = editUser.value.campuses.length > 0 ? [...editUser.value.campuses] : ['honghe']
  const defaultCampus = userCampuses[0]

  try {
    const result = await ds.updateUser(editingUser.value._id!, {
      nickName: editUser.value.nickName,
      role: editUser.value.roles[0] || 'teacher',
      campus: defaultCampus,
      campusName: defaultCampus === 'honghe' ? '洪河校区' : '龙华校区',
      roles: [...editUser.value.roles],
      campuses: userCampuses
    })
    if (!result.success) {
      alert('修改失败：' + (result.error || '未知错误'))
      submitting.value = false
      return
    }
    alert('修改成功')
    closeEditModal()
    await loadUsers()
  } catch (err) {
    console.error('[saveEdit] 修改用户失败:', err)
    alert('修改失败，请重试')
  } finally {
    submitting.value = false
  }
}

const deleteUser = async (userId: string) => {
  if (!userId) {
    alert('无效的用户ID')
    return
  }
  if (confirm('确定要删除该用户吗？')) {
    try {
      await ds.deleteUser(userId)
      alert('删除成功')
      await loadUsers()
    } catch (err) {
      console.error('[deleteUser] 删除用户失败:', err)
      alert('删除失败，请重试')
    }
  }
}

const toggleUserPermissions = (userId: string) => {
  showUserPermissions.value = showUserPermissions.value === userId ? null : userId
}

const openResetPassword = (user: UserInfo) => {
  resetPasswordUser.value = user
  newPassword.value = ''
  showResetPassword.value = true
}

const closeResetPassword = () => {
  showResetPassword.value = false
  resetPasswordUser.value = null
  newPassword.value = ''
}

const doResetPassword = async () => {
  if (!resetPasswordUser.value) return
  if (submitting.value) return
  submitting.value = true
  
  if (newPassword.value.length < 4) {
    alert('密码至少4位')
    submitting.value = false
    return
  }
  try {
    const result = await ds.updateUser(resetPasswordUser.value._id!, { password: newPassword.value })
    if (!result.success) {
      alert('密码重置失败：' + (result.error || '未知错误'))
      submitting.value = false
      return
    }
    alert('密码重置成功')
    closeResetPassword()
  } catch (err) {
    console.error('[doResetPassword] 密码重置失败:', err)
    alert('密码重置失败，请重试')
  } finally {
    submitting.value = false
  }
}

const editMergedPermissions = computed(() => {
  return getUserMergedPermissions(editUser.value.roles)
})
</script>

<template>
  <div class="user-management-page">
    <div class="page-header">
      <span class="back-btn" @click="goBack">‹</span>
      <h1 class="page-title">用户管理</h1>
    </div>
    
    <div class="user-list">
      <div v-if="userList.length === 0" class="empty-state">
        <span class="empty-icon">👥</span>
        <span>暂无用户数据</span>
      </div>
      <div v-for="user in userList" :key="user._id" class="user-card">
        <div class="user-header">
          <div class="user-info">
            <span class="user-name">{{ user.nickName }}</span>
            <span class="user-username">{{ user.userName || '-' }}</span>
          </div>
          <div class="user-actions">
            <button class="perm-btn" @click="toggleUserPermissions(user._id || '')">
              {{ showUserPermissions === user._id ? '收起' : '权限' }}
            </button>
            <button class="edit-btn" @click="openEditModal(user)">编辑</button>
            <button class="reset-btn" @click="openResetPassword(user)">密码</button>
            <button class="delete-btn" @click="deleteUser(user._id || '')">删除</button>
          </div>
        </div>
        <div class="user-roles">
          <span class="label">角色：</span>
          <span 
            v-for="role in user.roles" 
            :key="role"
            class="role-tag"
            :style="{ background: roles.find(r => r.value === role)?.color + '20', color: roles.find(r => r.value === role)?.color }"
          >{{ roles.find(r => r.value === role)?.label || role }}</span>
        </div>
        <div class="user-campuses">
          <span class="label">校区：</span>
          <span 
            v-for="campus in user.campuses" 
            :key="campus"
            class="campus-tag"
          >{{ campuses.find(c => c.value === campus)?.label || campus }}</span>
        </div>
        
        <div v-if="showUserPermissions === user._id" class="user-permissions-detail">
          <div class="perm-divider"></div>
          <div class="perm-title">权限详情</div>
          <div 
            v-for="group in getGroupedPermissions(getUserMergedPermissions(user.roles))" 
            :key="group.group" 
            class="perm-group"
          >
            <span class="perm-group-title">{{ group.group }}</span>
            <div class="perm-tags">
              <span v-for="item in group.items" :key="item.id" class="perm-tag">{{ item.label }}</span>
            </div>
          </div>
          <div v-if="getUserMergedPermissions(user.roles).length === 0" class="perm-empty">该角色暂无权限配置</div>
        </div>
      </div>
    </div>
    
    <button class="add-btn" @click="openAddModal">+</button>
    
    <!-- 添加弹窗 -->
    <div v-if="showAddModal" class="modal-overlay" @click="closeAddModal">
      <div class="modal-content" @click.stop>
        <div class="modal-header">
          <span class="modal-title">添加用户</span>
          <span class="modal-close" @click="closeAddModal">✕</span>
        </div>
        <div class="form-content">
          <div class="form-group">
            <label>昵称（登录姓名）</label>
            <input type="text" class="form-input" v-model="newUser.nickName" placeholder="请输入昵称" />
          </div>
          <div class="form-group">
            <label>初始密码</label>
            <input type="password" class="form-input" v-model="newUser.password" placeholder="请设置密码（至少4位）" />
          </div>
          <div class="form-group">
            <label>选择角色（可多选）</label>
            <div class="options-group">
              <div 
                v-for="role in roles" 
                :key="role.value"
                class="option-item"
                :class="{ active: newUser.roles.includes(role.value) }"
                :style="newUser.roles.includes(role.value) ? { borderColor: role.color, background: role.color + '15', color: role.color } : {}"
                @click="toggleRole(role.value, newUser)"
              >
                {{ role.label }}
              </div>
            </div>
          </div>
          <div class="form-group">
            <label>选择校区（可多选）</label>
            <div class="options-group">
              <div 
                v-for="campus in campuses" 
                :key="campus.value"
                class="option-item"
                :class="{ active: newUser.campuses.includes(campus.value) }"
                @click="toggleCampus(campus.value, newUser)"
              >
                {{ campus.label }}
              </div>
            </div>
          </div>
          <button class="btn-confirm" @click="addUser">确认添加</button>
        </div>
      </div>
    </div>
    
    <!-- 编辑弹窗 -->
    <div v-if="showEditModal" class="modal-overlay" @click="closeEditModal">
      <div class="modal-content" @click.stop>
        <div class="modal-header">
          <span class="modal-title">编辑用户</span>
          <span class="modal-close" @click="closeEditModal">✕</span>
        </div>
        <div class="form-content">
          <div class="form-group">
            <label>昵称</label>
            <input type="text" class="form-input" v-model="editUser.nickName" placeholder="请输入昵称" />
          </div>
          <div class="form-group">
            <label>选择角色（可多选）</label>
            <div class="options-group">
              <div 
                v-for="role in roles" 
                :key="role.value"
                class="option-item"
                :class="{ active: editUser.roles.includes(role.value) }"
                :style="editUser.roles.includes(role.value) ? { borderColor: role.color, background: role.color + '15', color: role.color } : {}"
                @click="toggleRole(role.value, editUser)"
              >
                {{ role.label }}
              </div>
            </div>
          </div>
          <div class="form-group">
            <label>选择校区（可多选）</label>
            <div class="options-group">
              <div 
                v-for="campus in campuses" 
                :key="campus.value"
                class="option-item"
                :class="{ active: editUser.campuses.includes(campus.value) }"
                @click="toggleCampus(campus.value, editUser)"
              >
                {{ campus.label }}
              </div>
            </div>
          </div>
          
          <div class="form-group">
            <label>权限预览（根据所选角色自动合并）</label>
            <div class="perm-preview">
              <div v-if="editMergedPermissions.length === 0" class="perm-preview-empty">请选择角色以查看权限</div>
              <div 
                v-for="group in getGroupedPermissions(editMergedPermissions)" 
                :key="group.group" 
                class="perm-preview-group"
              >
                <span class="perm-preview-group-title">{{ group.group }}</span>
                <div class="perm-preview-tags">
                  <span v-for="item in group.items" :key="item.id" class="perm-preview-tag">{{ item.label }}</span>
                </div>
              </div>
            </div>
          </div>
          
          <button class="btn-confirm" @click="saveEdit">保存修改</button>
        </div>
      </div>
    </div>

    <!-- 重置密码弹窗 -->
    <div v-if="showResetPassword" class="modal-overlay" @click="closeResetPassword">
      <div class="modal-content" @click.stop>
        <div class="modal-header">
          <span class="modal-title">重置密码 - {{ resetPasswordUser?.nickName }}</span>
          <span class="modal-close" @click="closeResetPassword">✕</span>
        </div>
        <div class="form-content">
          <div class="form-group">
            <label>新密码</label>
            <input type="password" class="form-input" v-model="newPassword" placeholder="请输入新密码（至少4位）" />
          </div>
          <button class="btn-confirm" @click="doResetPassword">确认重置</button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.user-management-page {
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

.user-list {
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

.user-card {
  background: #fff;
  border-radius: 12px;
  padding: 15px;
  margin-bottom: 12px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);
}

.user-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 10px;
}

.user-info {
  display: flex;
  flex-direction: column;
}

.user-name {
  font-size: 16px;
  font-weight: bold;
  color: #333;
}

.user-username {
  font-size: 12px;
  color: #999;
}

.user-actions {
  display: flex;
  gap: 6px;
}

.perm-btn {
  padding: 6px 10px;
  background: #e6f7ff;
  color: #1890ff;
  border: none;
  border-radius: 4px;
  font-size: 12px;
  cursor: pointer;
  white-space: nowrap;
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

.reset-btn {
  padding: 6px 10px;
  background: #f0f5ff;
  color: #2f54eb;
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

.user-roles, .user-campuses {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 8px;
}

.label {
  font-size: 13px;
  color: #666;
}

.role-tag, .campus-tag {
  padding: 4px 8px;
  background: #e6f7ff;
  color: #1890ff;
  border-radius: 4px;
  font-size: 12px;
}

.user-permissions-detail {
  margin-top: 8px;
}

.perm-divider {
  height: 1px;
  background: #f0f0f0;
  margin-bottom: 10px;
}

.perm-title {
  font-size: 13px;
  font-weight: bold;
  color: #333;
  margin-bottom: 10px;
}

.perm-group {
  margin-bottom: 10px;
}

.perm-group-title {
  display: block;
  font-size: 12px;
  color: #999;
  margin-bottom: 6px;
}

.perm-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.perm-tag {
  padding: 3px 8px;
  background: #f0f5ff;
  color: #2f54eb;
  border-radius: 4px;
  font-size: 11px;
}

.perm-empty {
  font-size: 12px;
  color: #999;
  text-align: center;
  padding: 10px;
}

.perm-preview {
  background: #fafafa;
  border: 1px solid #f0f0f0;
  border-radius: 8px;
  padding: 12px;
  max-height: 200px;
  overflow-y: auto;
}

.perm-preview-empty {
  font-size: 13px;
  color: #999;
  text-align: center;
  padding: 10px;
}

.perm-preview-group {
  margin-bottom: 8px;
}

.perm-preview-group:last-child {
  margin-bottom: 0;
}

.perm-preview-group-title {
  display: block;
  font-size: 11px;
  color: #999;
  margin-bottom: 4px;
}

.perm-preview-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

.perm-preview-tag {
  padding: 2px 6px;
  background: #e6f7ff;
  color: #1890ff;
  border-radius: 3px;
  font-size: 11px;
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
  font-size: 28px;
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
  max-width: 340px;
  overflow: hidden;
  max-height: 80vh;
  overflow-y: auto;
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

.form-input {
  width: 100%;
  padding: 12px;
  border: 1px solid #ddd;
  border-radius: 8px;
  font-size: 14px;
  box-sizing: border-box;
}

.form-value {
  display: block;
  padding: 12px;
  background: #f5f5f5;
  border-radius: 8px;
  font-size: 14px;
  color: #666;
}

.options-group {
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
  transition: all 0.2s ease;
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