import common from './locales/zh-CN/common.json';
import settings from './locales/zh-CN/settings.json';
import auth from './locales/zh-CN/auth.json';
import sidebar from './locales/zh-CN/sidebar.json';
import chat from './locales/zh-CN/chat.json';
import codeEditor from './locales/zh-CN/codeEditor.json';
import gitPanel from './locales/zh-CN/gitPanel.json';

export const resources = {
  common,
  settings,
  auth,
  sidebar,
  chat,
  codeEditor,
  gitPanel,
} as const;

export type TranslationNamespace = keyof typeof resources;
