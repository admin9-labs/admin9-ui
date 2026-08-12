export type AcceptanceState = 'normal' | 'loading' | 'empty' | 'error';

export const wait = (ms = 180) =>
  new Promise<void>((resolve) => {
    window.setTimeout(resolve, ms);
  });
