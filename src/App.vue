<script setup lang="ts">
import { ref, onMounted } from 'vue'
import router from './router'
import { initMockData } from './utils/mockData'

const currentPath = ref('')

onMounted(() => {
  initMockData()
  currentPath.value = router.currentRoute.value.path
})

router.afterEach((to) => {
  currentPath.value = to.path
})

const tabList = [
  { path: '/stock', name: '库存查询', icon: '📦' },
  { path: '/forecast', name: '预计', icon: '📝' },
  { path: '/receive', name: '领取', icon: '🎁' },
  { path: '/mine', name: '我的', icon: '👤' }
]

const goTo = (path: string) => {
  router.push(path)
}
</script>

<template>
  <div class="app-container">
    <router-view />
    <div 
      v-if="currentPath !== '/' && tabList.some(t => t.path === currentPath)" 
      class="tab-bar"
    >
      <div 
        v-for="tab in tabList" 
        :key="tab.path"
        class="tab-item"
        :class="{ active: currentPath === tab.path }"
        @click="goTo(tab.path)"
      >
        <span class="tab-icon">{{ tab.icon }}</span>
        <span class="tab-text">{{ tab.name }}</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.app-container {
  min-height: 100vh;
  background-color: #f5f5f5;
}

.tab-bar {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  display: flex;
  background-color: #ffffff;
  border-top: 1px solid #f0f0f0;
  padding-bottom: env(safe-area-inset-bottom);
  z-index: 999;
}

.tab-item {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 8px 0;
  transition: all 0.3s ease;
}

.tab-item.active {
  color: #1890ff;
}

.tab-item.active .tab-icon {
  transform: scale(1.1);
}

.tab-icon {
  font-size: 20px;
  margin-bottom: 4px;
  transition: transform 0.3s ease;
}

.tab-text {
  font-size: 10px;
  color: #999;
}

.tab-item.active .tab-text {
  color: #1890ff;
  font-weight: bold;
}
</style>
