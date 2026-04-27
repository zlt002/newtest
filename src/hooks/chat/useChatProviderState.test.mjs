import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import ts from 'typescript';
import vm from 'node:vm';

const sourcePath = path.join(process.cwd(), 'src/hooks/chat/useChatProviderState.ts');

async function loadUseChatProviderStateModule(overrides = {}) {
  const source = await fs.readFile(sourcePath, 'utf8');
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ESNext,
      importsNotUsedAsValues: ts.ImportsNotUsedAsValues.Remove,
    },
  });

  const setItemCalls = [];
  const storage = new Map([
    ['claude-model', 'sonnet'],
    ['claude-settings', JSON.stringify(overrides.claudeSettings || { permissionMode: 'bypassPermissions' })],
  ]);
  let hookIndex = 0;
  const stateSlots = [];

  const mocks = {
    react: {
      useCallback: (fn) => fn,
      useEffect: (fn) => fn(),
      useMemo: (fn) => fn(),
      useState: (initialValue) => {
        const slotIndex = hookIndex++;
        if (!stateSlots[slotIndex]) {
          stateSlots[slotIndex] = {
            value: typeof initialValue === 'function' ? initialValue() : initialValue,
          };
        }
        const slot = stateSlots[slotIndex];
        return [
          slot.value,
          (nextValue) => {
            slot.value = typeof nextValue === 'function' ? nextValue(slot.value) : nextValue;
          },
        ];
      },
    },
    '@components/chat/types/types': {
      isPendingQuestionRequest: (request) => request?.kind === 'interactive_prompt',
      isPendingToolApprovalRequest: (request) => request?.kind === 'permission_request',
    },
    '../../../shared/modelConstants': {
      CLAUDE_MODELS: {
        DEFAULT: 'sonnet',
      },
    },
    '@/types/app': {},
  };

  const runtimeSource = [
    `const { useCallback, useEffect, useMemo, useState } = __mocks.react;`,
    `const { isPendingQuestionRequest, isPendingToolApprovalRequest } = __mocks['@components/chat/types/types'];`,
    `const { CLAUDE_MODELS } = __mocks['../../../shared/modelConstants'];`,
    `const { ProjectSession } = __mocks['@/types/app'];`,
    outputText
      .replace(/^import[\s\S]*?;\n/gm, '')
      .replace(/^export\s*\{\s*\};?\n?/gm, '')
      .replace(/^export\s+/gm, ''),
    'return { useChatProviderState };',
  ].join('\n');

  const context = {
    __mocks: mocks,
    console,
    Map,
    JSON,
    localStorage: {
      getItem: (key) => storage.get(key) || null,
      setItem: (key, value) => {
        setItemCalls.push([key, value]);
        storage.set(key, value);
      },
    },
  };

  const exports = vm.runInNewContext(`(() => { ${runtimeSource} })()`, context);

  return {
    exports,
    setItemCalls,
    storage,
    renderHook: (args) => {
      hookIndex = 0;
      return exports.useChatProviderState(args);
    },
  };
}

test('useChatProviderState persists claude model changes through an effect-based sync', async () => {
  const { renderHook, setItemCalls } = await loadUseChatProviderStateModule();

  const api = renderHook({ selectedSession: null });
  assert.deepEqual(setItemCalls, [['claude-model', 'sonnet']]);

  setItemCalls.length = 0;
  api.setClaudeModel('claude-opus-4-7');
  assert.deepEqual(setItemCalls, []);

  renderHook({ selectedSession: null });
  assert.deepEqual(setItemCalls, [['claude-model', 'claude-opus-4-7']]);
});

test('useChatProviderState falls back to the default permission mode when the session value is invalid', async () => {
  const { renderHook, storage } = await loadUseChatProviderStateModule({
    claudeSettings: { permissionMode: 'plan' },
  });

  storage.set('permissionMode-sess-1', 'definitely-not-a-mode');

  const firstRender = renderHook({ selectedSession: { id: 'sess-1' } });
  const secondRender = renderHook({ selectedSession: { id: 'sess-1' } });

  assert.equal(firstRender.permissionMode, 'plan');
  assert.equal(secondRender.permissionMode, 'plan');
});
