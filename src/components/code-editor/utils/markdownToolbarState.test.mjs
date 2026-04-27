import test from 'node:test';
import assert from 'node:assert/strict';

import { createEmptyMarkdownToolbarState, isMarkdownToolbarStateEqual } from './markdownToolbarState.ts';

test('空 toolbar 状态默认不可操作', () => {
  assert.deepEqual(createEmptyMarkdownToolbarState(), {
    addToChatInput: null,
    validAnnotationCount: 0,
    items: [],
    onEditAnnotation: null,
    onDeleteAnnotation: null,
    onSendAnnotationToChatInput: null,
  });
});

test('相同的 toolbar 状态应视为相等，避免重复触发父组件更新', () => {
  const noop = () => {};
  const previousState = {
    addToChatInput: noop,
    validAnnotationCount: 1,
    items: [
      {
        id: 'annotation-1',
        selectedText: '订单直发',
        note: '这里需要关注',
        isValid: true,
      },
    ],
    onEditAnnotation: noop,
    onDeleteAnnotation: noop,
    onSendAnnotationToChatInput: noop,
  };

  const nextState = {
    addToChatInput: noop,
    validAnnotationCount: 1,
    items: [
      {
        id: 'annotation-1',
        selectedText: '订单直发',
        note: '这里需要关注',
        isValid: true,
      },
    ],
    onEditAnnotation: noop,
    onDeleteAnnotation: noop,
    onSendAnnotationToChatInput: noop,
  };

  assert.equal(isMarkdownToolbarStateEqual(previousState, nextState), true);
});

test('只要 toolbar 的函数或条目发生变化，就应该触发状态更新', () => {
  const noop = () => {};
  const previousState = {
    addToChatInput: noop,
    validAnnotationCount: 1,
    items: [
      {
        id: 'annotation-1',
        selectedText: '订单直发',
        note: '这里需要关注',
        isValid: true,
      },
    ],
    onEditAnnotation: noop,
    onDeleteAnnotation: noop,
    onSendAnnotationToChatInput: noop,
  };

  const changedItemState = {
    ...previousState,
    items: [
      {
        id: 'annotation-1',
        selectedText: '订单直发',
        note: '这里需要重新分析',
        isValid: true,
      },
    ],
  };

  const changedHandlerState = {
    ...previousState,
    onDeleteAnnotation: () => {},
  };

  assert.equal(isMarkdownToolbarStateEqual(previousState, changedItemState), false);
  assert.equal(isMarkdownToolbarStateEqual(previousState, changedHandlerState), false);
});
