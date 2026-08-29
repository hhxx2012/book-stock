import { createRouter, createWebHashHistory } from 'vue-router'
import type { RouteRecordRaw } from 'vue-router'

const routes: RouteRecordRaw[] = [
  {
    path: '/',
    name: 'Login',
    component: () => import('../views/Login.vue')
  },
  {
    path: '/stock',
    name: 'Stock',
    component: () => import('../views/Stock.vue')
  },
  {
    path: '/forecast',
    name: 'Forecast',
    component: () => import('../views/Forecast.vue')
  },
  {
    path: '/receive',
    name: 'Receive',
    component: () => import('../views/Receive.vue')
  },
  {
    path: '/mine',
    name: 'Mine',
    component: () => import('../views/Mine.vue')
  },
  {
    path: '/qrcode',
    name: 'QrcodePage',
    component: () => import('../views/Qrcode.vue')
  },
  {
    path: '/book-settings',
    name: 'BookSettings',
    component: () => import('../views/BookSettings.vue')
  },
  {
    path: '/log',
    name: 'Log',
    component: () => import('../views/Log.vue')
  },
  {
    path: '/role-management',
    name: 'RoleManagement',
    component: () => import('../views/RoleManagement.vue')
  },
  {
    path: '/user-management',
    name: 'UserManagement',
    component: () => import('../views/UserManagement.vue')
  },
  {
    path: '/system-settings',
    name: 'SystemSettings',
    component: () => import('../views/SystemSettings.vue')
  }
]

const router = createRouter({
  history: createWebHashHistory(),
  routes
})

router.beforeEach((to) => {
  const userInfo = localStorage.getItem('user_info')
  
  if (to.path === '/') {
    return
  } else if (!userInfo) {
    return '/'
  }
})

export default router
