import { afterEach, beforeEach, vi } from 'vitest';

// happy-dom has no layout. Supply only the picker result viewport; other components
// retain their native geometry so these tests cannot silently fake unrelated layouts.
const clientWidth =
  typeof HTMLElement === 'undefined' ? undefined : Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'clientWidth')?.get;
const clientHeight =
  typeof HTMLElement === 'undefined' ? undefined : Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'clientHeight')?.get;

beforeEach(() => {
  if (typeof HTMLElement === 'undefined') return;
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockImplementation(function resultWidth(this: HTMLElement) {
    return this.classList.contains('a9-file-picker__results') ? 822 : clientWidth?.call(this) ?? 0;
  });
  vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockImplementation(function resultHeight(this: HTMLElement) {
    return this.classList.contains('a9-file-picker__results') ? 580 : clientHeight?.call(this) ?? 0;
  });
});

afterEach(() => {
  localStorage.clear();
  sessionStorage.clear();
});
