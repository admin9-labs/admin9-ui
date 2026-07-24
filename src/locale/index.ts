import type { InjectionKey } from 'vue';
import zhCN from './zh-CN';
import enUS from './en-US';
import type { MediaService, UserService } from '../services/types';

/** 库文案前缀：admin9Ui.<component>.<key>。App 合并时以此前缀注入宿主 vue-i18n。 */
export const localePrefix = 'admin9Ui';

/** 库导出的 messages，供 App 合并进宿主 vue-i18n（不建独立实例，避免 locale 割裂）。 */
export const messages = {
  'zh-CN': { admin9Ui: zhCN },
  'en-US': { admin9Ui: enUS },
};

/** 注入 token：App 通过 app.use(Admin9UI, { mediaService }) 注入默认服务。 */
export interface Admin9UIOptions {
  /** 默认媒体服务，供 <AMediaPicker> 不传 :service 时回退使用 */
  mediaService?: MediaService;
  /** 默认用户服务，供 <AUserPicker> 不传 :service 时回退使用 */
  userService?: UserService;
}

export const admin9UIOptionsKey: InjectionKey<Admin9UIOptions> = Symbol('admin9-ui-options');

export { zhCN, enUS };
