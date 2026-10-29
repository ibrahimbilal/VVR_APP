import { createPinia } from 'pinia'
import { createApp } from 'vue'
import App from './App.vue'
import { router } from './app/router'
import { bootstrapRenderQueuesAfterNavigation } from './lib/renderQueueBootstrap'
import './style.css'
import '@fontsource/inter/400.css'
import '@fontsource/inter/600.css'
import '@fontsource/inter/700.css'
import '@fontsource/inter/800.css'
import '@fontsource/anton/400.css'
import '@fontsource/oswald/500.css'
import '@fontsource/oswald/700.css'
import '@fontsource/bebas-neue/400.css'
import '@fontsource/montserrat/700.css'
import '@fontsource/montserrat/800.css'

const app = createApp(App)
const pinia = createPinia()
app.use(pinia)
app.use(router)
bootstrapRenderQueuesAfterNavigation()
app.mount('#app')
