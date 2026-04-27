import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const EXTENSIONS = ['.tsx', '.ts', '.mts', '.jsx', '.js', '.mjs'];

export async function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith('./') || specifier.startsWith('../')) {
    const hasKnownExtension = /\.[a-z]+$/i.test(specifier);

    if (!hasKnownExtension) {
      for (const extension of EXTENSIONS) {
        try {
          return await nextResolve(`${specifier}${extension}`, context);
        } catch {
          // Try the next extension.
        }
      }
    }
  }

  return nextResolve(specifier, context);
}

export async function load(url, context, nextLoad) {
  if (url.endsWith('.tsx')) {
    const source = await readFile(fileURLToPath(url), 'utf8');
    const result = ts.transpileModule(source, {
      compilerOptions: {
        target: ts.ScriptTarget.ES2022,
        module: ts.ModuleKind.ESNext,
        jsx: ts.JsxEmit.ReactJSX,
        esModuleInterop: true,
        allowSyntheticDefaultImports: true,
        sourceMap: false,
      },
      fileName: fileURLToPath(url),
    });

    return {
      format: 'module',
      source: result.outputText,
      shortCircuit: true,
    };
  }

  return nextLoad(url, context);
}
