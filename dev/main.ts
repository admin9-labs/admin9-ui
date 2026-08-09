import { createApp } from 'vue';
import { createI18n } from 'vue-i18n';
import ArcoVue from '@arco-design/web-vue';
import ArcoVueIcon from '@arco-design/web-vue/es/icon';
import '@arco-design/web-vue/dist/arco.css';
import '../src/styles/index.less';
import { messages } from '../src/locale';
import App from './App.vue';
import './style.css';

const app = createApp(App);
const i18n = createI18n({
  legacy: false,
  locale: 'zh-CN',
  fallbackLocale: 'en-US',
  messages,
});

app.use(i18n);
app.use(ArcoVue);
app.use(ArcoVueIcon);
app.mount('#app');
