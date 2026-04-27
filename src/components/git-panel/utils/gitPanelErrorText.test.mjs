import test from 'node:test';
import assert from 'node:assert/strict';
import { translateGitErrorText } from './gitPanelErrorText.ts';

const dictionary = {
  'repositoryError.errors.gitOperationFailed': 'Git 操作失败',
  'repositoryError.errors.failedToGetStatus': '获取 Git 状态失败',
  'repositoryError.errors.notGitRepository': '这不是一个 Git 仓库。当前目录不包含 .git 文件夹，请先运行 git init。',
};

const t = (key) => dictionary[key] ?? key;

test('translateGitErrorText translates generic git failure title', () => {
  assert.equal(translateGitErrorText('Git operation failed', t), 'Git 操作失败');
});

test('translateGitErrorText translates not-a-git-repository detail', () => {
  assert.equal(
    translateGitErrorText(
      'Failed to get git status: Not a git repository. This directory does not contain a .git folder. Initialize a git repository with "git init" to use source control features.',
      t,
    ),
    '获取 Git 状态失败: 这不是一个 Git 仓库。当前目录不包含 .git 文件夹，请先运行 git init。',
  );
});
