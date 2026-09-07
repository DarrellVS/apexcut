import { api } from './api';
import { createApp } from 'vue';
import { createPinia } from 'pinia';
import App from './App.vue';
import { useUiStore } from './stores/ui';
import { logger } from './utils/logger';
import './assets/main.css';

const app = createApp(App);
const pinia = createPinia();
app.use(pinia);

// anything we did not catch shows the error card instead of a half-dead window
const ui = useUiStore(pinia);
const fatal = (e: unknown, where: string): void => {
  const err = e instanceof Error ? e : new Error(String(e));
  logger.error(where, err);
  ui.fatal = { message: err.message, stack: err.stack };
};
app.config.errorHandler = (e, _instance, info) => fatal(e, `vue (${info})`);
window.addEventListener('error', (ev) => fatal(ev.error ?? ev.message, 'window.error'));
window.addEventListener('unhandledrejection', (ev) => fatal(ev.reason, 'unhandled rejection'));
api.app.onFatal((err) => {
  ui.fatal = err;
});

app.mount('#app');
