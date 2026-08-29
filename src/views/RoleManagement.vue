<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { setRolePermissions, getRoleList, setRoleList } from '../utils/storage'
import * as ds from '../services/dataService'

const roleList = ref([
  { role: 'super', label: '超级管理员' },
  { role: 'admin', label: '管理员' },
  { role: 'educational', label: '教务' },
  { role: 'teacher', label: '教师' }
])

// 权限ID必须与 storage.ts 中 hasPermission 检查的ID完全一致
const permissions = ref([
  // 库存管理
  { id: 'view_stock', label: '库存查询', group: '库存管理' },
  { id: 'stock_in', label: '入库', group: '库存管理' },
  { id: 'stock_out', label: '出库', group: '库存管理' },
  { id: 'stock_return', label: '退回', group: '库存管理' },
  { id: 'delete_book', label: '删除书本', group: '库存管理' },
  // 预计管理
  { id: 'forecast_view', label: '查看预计', group: '预计管理' },
  { id: 'forecast_set', label: '设置预计', group: '预计管理' },
  { id: 'forecast_approve', label: '同意预计', group: '预计管理' },
  { id: 'forecast_modify', label: '修改预计', group: '预计管理' },
  { id: 'forecast_delete', label: '删除预计', group: '预计管理' },
  { id: 'forecast_stats', label: '预计统计', group: '预计管理' },
  // 领取管理
  { id: 'receive_view', label: '查看领取', group: '领取管理' },
  { id: 'receive_set', label: '设置领取', group: '领取管理' },
  { id: 'receive_approve', label: '同意领取', group: '领取管理' },
  { id: 'receive_modify', label: '修改领取', group: '领取管理' },
  { id: 'receive_delete', label: '删除领取', group: '领取管理' },
  // 书本管理
  { id: 'manage_books', label: '书本管理', group: '书本管理' },
  { id: 'qrcode_generate', label: '二维码生成', group: '书本管理' },
  // 系统管理
  { id: 'manage_subjects', label: '科目管理', group: '系统管理' },
  { id: 'manage_users', label: '用户管理', group: '系统管理' },
  { id: 'manage_roles', label: '角色管理', group: '系统管理' },
  { id: 'manage_system', label: '系统设置', group: '系统管理' },
  { id: 'view_stats', label: '数据统计', group: '系统管理' }
])

const rolePermissions = ref<Record<string, string[]>>({})
const expandedRole = ref<string | null>('super')

onMounted(() => {
  loadPermissions()
})

const loadPermissions = async () => {
  const perms = await ds.fetchRolePermissions()
  rolePermissions.value = perms
}

const savePermissions = async (perms: Record<string, string[]>) => {
  setRolePermissions(perms)
  // 同步更新角色列表，确保storage.ts的权限校验一致
  const roleListData = getRoleList()
  Object.keys(perms).forEach(role => {
    const roleObj = roleListData.find((r: any) => r.role === role)
    if (roleObj) {
      roleObj.permissions = [...perms[role]]
    }
  })
  setRoleList(roleListData)
  // 同步到 dataService（在线模式会写入Supabase）
  for (const [role, rolePerms] of Object.entries(perms)) {
    await ds.updateRolePermissions(role, rolePerms)
  }
}

const toggleRole = (role: string) => {
  expandedRole.value = expandedRole.value === role ? null : role
}

const togglePermission = async (role: string, permissionId: string) => {
  if (!rolePermissions.value[role]) {
    rolePermissions.value[role] = []
  }
  
  const index = rolePermissions.value[role].indexOf(permissionId)
  if (index >= 0) {
    rolePermissions.value[role].splice(index, 1)
  } else {
    rolePermissions.value[role].push(permissionId)
  }
  
  await savePermissions(rolePermissions.value)
}

const hasPermission = (role: string, permissionId: string): boolean => {
  return rolePermissions.value[role]?.includes(permissionId) || false
}

const getGroupedPermissions = (): { group: string; items: typeof permissions.value }[] => {
  const groups: Record<string, typeof permissions.value> = {}
  permissions.value.forEach(p => {
    if (!groups[p.group]) {
      groups[p.group] = []
    }
    groups[p.group].push(p)
  })
  return Object.entries(groups).map(([group, items]) => ({ group, items }))
}

const selectAll = async (role: string) => {
  rolePermissions.value[role] = permissions.value.map(p => p.id)
  await savePermissions(rolePermissions.value)
}

const deselectAll = async (role: string) => {
  rolePermissions.value[role] = []
  await savePermissions(rolePermissions.value)
}
</script>

<template>
  <div class="role-management-page">
    <div class="page-header">
      <h1 class="page-title">角色管理</h1>
    </div>
    
    <div class="role-list">
      <div v-for="role in roleList" :key="role.role" class="role-card">
        <div class="role-header" @click="toggleRole(role.role)">
          <div class="role-info">
            <span class="role-icon">{{ role.role === 'super' ? 'S' : role.role === 'admin' ? 'A' : role.role === 'educational' ? 'E' : 'T' }}</span>
            <span class="role-label">{{ role.label }}</span>
            <span class="perm-count">{{ rolePermissions[role.role]?.length || 0 }}/{{ permissions.length }}</span>
          </div>
          <span class="expand-icon">{{ expandedRole === role.role ? '−' : '+' }}</span>
        </div>
        
        <div v-if="expandedRole === role.role" class="role-content">
          <div class="action-buttons">
            <button class="btn-select-all" @click.stop="selectAll(role.role)">全选</button>
            <button class="btn-deselect-all" @click.stop="deselectAll(role.role)">取消全选</button>
          </div>
          
          <div v-for="group in getGroupedPermissions()" :key="group.group" class="permission-group">
            <div class="group-title">{{ group.group }}</div>
            <div class="permission-items">
              <div 
                v-for="perm in group.items" 
                :key="perm.id"
                class="permission-item"
                :class="{ active: hasPermission(role.role, perm.id) }"
                @click.stop="togglePermission(role.role, perm.id)"
              >
                <span class="checkbox">{{ hasPermission(role.role, perm.id) ? '✓' : '' }}</span>
                <span class="perm-label">{{ perm.label }}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.role-management-page {
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

.role-list {
  padding: 15px;
}

.role-card {
  background: #fff;
  border-radius: 12px;
  margin-bottom: 12px;
  overflow: hidden;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);
}

.role-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 15px;
  cursor: pointer;
}

.role-info {
  display: flex;
  align-items: center;
  gap: 10px;
}

.role-icon {
  width: 32px;
  height: 32px;
  background: #1890ff;
  color: #fff;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 14px;
  font-weight: bold;
}

.role-label {
  font-size: 16px;
  font-weight: bold;
  color: #333;
}

.perm-count {
  font-size: 12px;
  color: #999;
}

.expand-icon {
  font-size: 24px;
  color: #999;
}

.role-content {
  padding: 15px;
  border-top: 1px solid #f0f0f0;
}

.action-buttons {
  display: flex;
  gap: 10px;
  margin-bottom: 15px;
}

.btn-select-all {
  flex: 1;
  padding: 10px;
  background: #e6f7ff;
  color: #1890ff;
  border: none;
  border-radius: 8px;
  font-size: 14px;
  cursor: pointer;
}

.btn-deselect-all {
  flex: 1;
  padding: 10px;
  background: #fff1f0;
  color: #ff4d4f;
  border: none;
  border-radius: 8px;
  font-size: 14px;
  cursor: pointer;
}

.permission-group {
  margin-bottom: 15px;
}

.group-title {
  font-size: 14px;
  font-weight: bold;
  color: #666;
  margin-bottom: 10px;
}

.permission-items {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}

.permission-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 14px;
  background: #f5f5f5;
  border-radius: 8px;
  font-size: 14px;
  cursor: pointer;
  border: 2px solid transparent;
}

.permission-item.active {
  background: #e6f7ff;
  border-color: #1890ff;
  color: #1890ff;
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

.permission-item.active .checkbox {
  background: #1890ff;
  color: #fff;
  border-color: #1890ff;
}
</style>