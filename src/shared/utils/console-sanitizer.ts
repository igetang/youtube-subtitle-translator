/* eslint-disable no-console */

const globalScope: any =
  typeof globalThis !== 'undefined'
    ? globalThis
    : typeof self !== 'undefined'
      ? self
      : typeof window !== 'undefined'
        ? window
        : {};

if (!globalScope.__ytTranslatorConsoleSanitized) {
  globalScope.__ytTranslatorConsoleSanitized = true;

  const envMode =
    (typeof import.meta !== 'undefined' && (import.meta as any).env && (import.meta as any).env.MODE) ||
    (typeof process !== 'undefined' && process.env && process.env.NODE_ENV) ||
    'production';

  const isProduction = envMode === 'production';

  if (isProduction) {
    if (typeof console !== 'undefined' && typeof console.debug === 'function') {
      console.debug = () => {};
    }

    if (typeof console !== 'undefined' && typeof console.log === 'function') {
      const originalLog = console.log.bind(console);
      console.log = (...args: unknown[]) => {
        const firstArg = args[0];
        if (typeof firstArg === 'string' && firstArg.includes('[debug]')) {
          return;
        }
        originalLog(...args);
      };
    }
  }
}

export {};
