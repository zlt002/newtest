import test from 'node:test';
import assert from 'node:assert/strict';
import { getFileOpenPayload } from './fileOpenPayload.ts';
import { sortFileTree } from './fileTreeSort.ts';

const createFiles = () => [
  {
    name: 'zeta.txt',
    type: 'file',
    path: '/zeta.txt',
    size: 20,
    modified: '2024-01-03T00:00:00.000Z',
  },
  {
    name: 'folder',
    type: 'directory',
    path: '/folder',
    modified: '2024-01-02T00:00:00.000Z',
    children: [
      {
        name: 'b.txt',
        type: 'file',
        path: '/folder/b.txt',
        size: 5,
        modified: '2024-01-02T00:00:00.000Z',
      },
      {
        name: 'a.txt',
        type: 'file',
        path: '/folder/a.txt',
        size: 10,
        modified: '2024-01-01T00:00:00.000Z',
      },
    ],
  },
  {
    name: 'alpha.txt',
    type: 'file',
    path: '/alpha.txt',
    size: 10,
    modified: '2024-01-01T00:00:00.000Z',
  },
];

test('getFileOpenPayload keeps html open payload free of previewUrl', () => {
  const result = getFileOpenPayload({
    item: {
      type: 'file',
      name: 'preview.html',
      path: '/demo/reports/preview.html',
    },
  });

  assert.deepEqual(result, {
    filePath: '/demo/reports/preview.html',
  });
  assert.equal('previewUrl' in result, false);
});

test('sortFileTree sorts each directory level by name without mutating input', () => {
  const files = createFiles();
  const sorted = sortFileTree(files, { key: 'name', direction: 'asc' });

  assert.deepEqual(sorted.map((item) => item.name), ['alpha.txt', 'folder', 'zeta.txt']);
  assert.deepEqual(sorted[1].children.map((item) => item.name), ['a.txt', 'b.txt']);
  assert.deepEqual(files.map((item) => item.name), ['zeta.txt', 'folder', 'alpha.txt']);
  assert.deepEqual(files[1].children.map((item) => item.name), ['b.txt', 'a.txt']);
});

test('sortFileTree sorts numeric size descending and keeps missing values last', () => {
  const files = createFiles();
  const sorted = sortFileTree(files, { key: 'size', direction: 'desc' });

  assert.deepEqual(sorted.map((item) => item.name), ['zeta.txt', 'alpha.txt', 'folder']);
  assert.deepEqual(sorted[2].children.map((item) => item.name), ['a.txt', 'b.txt']);
});
