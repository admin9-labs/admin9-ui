import type { InjectionKey } from 'vue';
import type { Admin9UIPluginOptions } from '../services/types';

const admin9UIPluginOptionsKey: InjectionKey<Admin9UIPluginOptions> = Symbol('admin9-ui-options');

export default admin9UIPluginOptionsKey;
