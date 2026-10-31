import { browser } from './browser.mjs';
import { settings } from './settings.mjs';
import { assistant } from './assistant.mjs';
export const adapters = Object.freeze({ standard: {}, browser, settings, assistant });
