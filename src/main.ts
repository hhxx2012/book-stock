import { createApp } from 'vue'
import './style.css'
import App from './App.vue'
import router from './router'

const app = createApp(App)

app.config.errorHandler = (err, instance, info) => {
  console.error('[Vue Error]', err, '\nInfo:', info)
  alert('页面发生错误：\n\n' + (err instanceof Error ? err.message : String(err)) + '\n\n请截图此消息并发送，以便排查问题。')
}

app.use(router)
app.mount('#app')
