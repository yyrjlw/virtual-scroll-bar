import type { App } from 'vue'
import VirtualScrollBar from './VirtualScrollBar.vue'
VirtualScrollBar.install = (app: App) => {
  app.component('VirtualScrollBar', VirtualScrollBar)
}
export { VirtualScrollBar }
