import zhCN from './zh-CN';
import enUS from './en-US';

/** 库文案前缀：admin9Ui.<component>.<key>。App 合并时以此前缀注入宿主 vue-i18n。 */
export const localePrefix = 'admin9Ui';

/** 库导出的 messages，供 App 合并进宿主 vue-i18n（不建独立实例，避免 locale 割裂）。 */
export const messages = {
  'zh-CN': { admin9Ui: zhCN },
  'en-US': { admin9Ui: enUS },
};

export { zhCN, enUS };
