import type { InjectionKey } from 'vue';
import type { Admin9UIOptions } from '../services/types';

const admin9UIOptionsKey: InjectionKey<Admin9UIOptions> = Symbol('admin9-ui-options');

export default admin9UIOptionsKey;
