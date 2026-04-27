import type { ReactNode } from 'react';
import { resources, type TranslationNamespace } from './resources';
import type { TFunction, TranslationOptions } from './i18next';
type NamespaceInput = TranslationNamespace | TranslationNamespace[] | undefined;

const DEFAULT_NAMESPACE: TranslationNamespace = 'common';

const getValueByPath = (source: unknown, path: string) => {
  return path.split('.').reduce<unknown>((current, segment) => {
    if (current && typeof current === 'object' && segment in current) {
      return (current as Record<string, unknown>)[segment];
    }
    return undefined;
  }, source);
};

const interpolate = (template: string, options?: TranslationOptions) => {
  if (!options) return template;

  return template.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, key: string) => {
    const value = options[key];
    return value == null ? '' : String(value);
  });
};

const resolveNamespaces = (namespace?: NamespaceInput): TranslationNamespace[] => {
  if (!namespace) return [DEFAULT_NAMESPACE];
  return Array.isArray(namespace) ? namespace : [namespace];
};

const resolveTranslation = (namespaces: TranslationNamespace[], key: string) => {
  const [explicitNamespace, scopedKey] = key.includes(':')
    ? (key.split(/:(.+)/, 2) as [TranslationNamespace, string])
    : [undefined, key];

  if (explicitNamespace) {
    const value = getValueByPath(resources[explicitNamespace], scopedKey);
    return typeof value === 'string' ? value : undefined;
  }

  for (const namespace of namespaces) {
    const value = getValueByPath(resources[namespace], scopedKey);
    if (typeof value === 'string') {
      return value;
    }
  }

  if (!namespaces.includes(DEFAULT_NAMESPACE)) {
    const fallbackValue = getValueByPath(resources[DEFAULT_NAMESPACE], scopedKey);
    if (typeof fallbackValue === 'string') {
      return fallbackValue;
    }
  }

  return undefined;
};

export const useTranslation = (namespace?: NamespaceInput) => {
  const namespaces = resolveNamespaces(namespace);
  const t: TFunction = (
    key: string,
    defaultValueOrOptions?: string | TranslationOptions,
    maybeOptions?: TranslationOptions,
  ) => {
    const options = typeof defaultValueOrOptions === 'string'
      ? { ...maybeOptions, defaultValue: defaultValueOrOptions }
      : defaultValueOrOptions;
    const value = resolveTranslation(namespaces, key);
    const resolved = value ?? (typeof options?.defaultValue === 'string' ? options.defaultValue : key);
    return interpolate(resolved, options);
  };

  return {
    t,
    i18n: {
      language: 'zh-CN',
      languages: ['zh-CN'],
      resolvedLanguage: 'zh-CN',
      changeLanguage: async () => 'zh-CN',
    },
    ready: true,
  };
};

export const I18nextProvider = ({ children }: { children: ReactNode }) => children;
