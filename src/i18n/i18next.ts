type Primitive = string | number | boolean | null | undefined;

export type TranslationOptions = Record<string, Primitive> & {
  defaultValue?: string;
};

export type TFunction<_Namespace = string> = {
  (key: string): string;
  (key: string, options: TranslationOptions): string;
  (key: string, defaultValue: string): string;
  (key: string, defaultValue: string, options: TranslationOptions): string;
};
