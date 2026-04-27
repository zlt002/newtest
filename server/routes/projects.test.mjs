import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';

import { sessionNamesDb } from '../database/db.js';
import { clearProjectDirectoryCache, getProjects, getSessions } from '../projects.js';
import { detectWorkspaceTypeForPath, getOpenDirectoryCommand, resolveOpenFileTreeTargetPath, resolveProjectPreviewFilePath } from './projects.js';
import { getSerializedFileSaveQueueSizeForTests, readProjectFileForEditor, saveProjectFileFromEditor } from './files.js';

test('getOpenDirectoryCommand uses open on macOS', () => {
  assert.deepEqual(
    getOpenDirectoryCommand('/tmp/demo', 'darwin'),
    { command: 'open', args: ['/tmp/demo'] },
  );
});

test('getOpenDirectoryCommand uses explorer.exe on Windows', () => {
  assert.deepEqual(
    getOpenDirectoryCommand('C:\\demo', 'win32'),
    { command: 'explorer.exe', args: ['C:\\demo'] },
  );
});

test('getOpenDirectoryCommand uses xdg-open on Linux', () => {
  assert.deepEqual(
    getOpenDirectoryCommand('/tmp/demo', 'linux'),
    { command: 'xdg-open', args: ['/tmp/demo'] },
  );
});

test('getOpenDirectoryCommand throws on unsupported platform', () => {
  assert.throws(
    () => getOpenDirectoryCommand('/tmp/demo', 'plan9'),
    /Unsupported platform: plan9/,
  );
});

test('detectWorkspaceTypeForPath returns existing for a non-empty directory', async () => {
  const existingDir = await mkdtemp(path.join(os.tmpdir(), 'project-route-existing-'));
  await mkdir(path.join(existingDir, 'src'));

  await assert.doesNotReject(async () => {
    const result = await detectWorkspaceTypeForPath(existingDir);
    assert.equal(result, 'existing');
  });
});

test('detectWorkspaceTypeForPath returns new for an empty directory', async () => {
  const existingDir = await mkdtemp(path.join(os.tmpdir(), 'project-route-empty-'));

  const result = await detectWorkspaceTypeForPath(existingDir);

  assert.equal(result, 'new');
});

test('detectWorkspaceTypeForPath returns new for a path that does not exist yet', async () => {
  const baseDir = await mkdtemp(path.join(os.tmpdir(), 'project-route-new-'));
  const missingDir = path.join(baseDir, 'new-workspace');

  const result = await detectWorkspaceTypeForPath(missingDir);

  assert.equal(result, 'new');
});

test('detectWorkspaceTypeForPath rejects files', async () => {
  const baseDir = await mkdtemp(path.join(os.tmpdir(), 'project-route-file-'));
  const filePath = path.join(baseDir, 'notes.txt');
  await writeFile(filePath, 'demo', 'utf8');

  await assert.rejects(
    () => detectWorkspaceTypeForPath(filePath),
    /Path exists but is not a directory/,
  );
});

test('resolveProjectPreviewFilePath returns a project file path for nested html assets', () => {
  const result = resolveProjectPreviewFilePath('/workspace/demo', 'reports/wms_analysis_report.html');

  assert.equal(result, path.resolve('/workspace/demo', 'reports/wms_analysis_report.html'));
});

test('resolveProjectPreviewFilePath rejects project root and path traversal', () => {
  assert.equal(resolveProjectPreviewFilePath('/workspace/demo', ''), null);
  assert.equal(resolveProjectPreviewFilePath('/workspace/demo', '../secrets.html'), null);
});

test('resolveOpenFileTreeTargetPath opens a file parent directory and preserves directories', () => {
  assert.equal(
    resolveOpenFileTreeTargetPath('/workspace/demo', { path: 'docs/guide.md', type: 'file' }),
    path.resolve('/workspace/demo', 'docs'),
  );

  assert.equal(
    resolveOpenFileTreeTargetPath('/workspace/demo', { path: 'docs', type: 'directory' }),
    path.resolve('/workspace/demo', 'docs'),
  );
});

test('resolveOpenFileTreeTargetPath rejects paths outside the project root', () => {
  assert.throws(
    () => resolveOpenFileTreeTargetPath('/workspace/demo', { path: '../secret.txt', type: 'file' }),
    /Path must be under project root/,
  );
});

test('getSessions keeps official history output and ignores legacy run overlays', async () => {
  const tempHome = await mkdtemp(path.join(os.tmpdir(), 'project-route-history-'));
  const projectName = 'demo-project';
  const projectDir = path.join(tempHome, '.claude', 'projects', projectName);
  await mkdir(projectDir, { recursive: true });
  await writeFile(
    path.join(projectDir, `${projectName}.jsonl`),
    [
      JSON.stringify({
        sessionId: 'session-1',
        type: 'message',
        uuid: 'user-1',
        timestamp: '2026-04-22T10:00:00.000Z',
        message: {
          role: 'user',
          content: '这里是 official history 里的原始展开内容',
        },
      }),
      JSON.stringify({
        sessionId: 'session-1',
        type: 'message',
        uuid: 'assistant-1',
        timestamp: '2026-04-22T10:00:01.000Z',
        message: {
          role: 'assistant',
          content: '收到',
        },
      }),
    ].join('\n'),
    'utf8',
  );

  const originalHome = process.env.HOME;

  try {
    process.env.HOME = tempHome;
    clearProjectDirectoryCache();
    const result = await getSessions(projectName, 5, 0);
    assert.equal(result.sessions.length, 1);
    assert.equal(result.sessions[0].summary, '这里是 official history 里的原始展开内容');
    assert.equal(result.sessions[0].lastUserMessage, '这里是 official history 里的原始展开内容');
    assert.equal(result.sessions[0].lastActivity.toISOString(), '2026-04-22T10:00:01.000Z');
  } finally {
    process.env.HOME = originalHome;
  }
});

test('getProjects keeps official history output and applies session_names overrides', async () => {
  const tempHome = await mkdtemp(path.join(os.tmpdir(), 'project-route-projects-'));
  const projectName = 'demo-project';
  const projectDir = path.join(tempHome, '.claude', 'projects', projectName);
  const actualProjectDir = path.join(tempHome, 'workspace');
  await mkdir(projectDir, { recursive: true });
  await mkdir(actualProjectDir, { recursive: true });
  await writeFile(
    path.join(projectDir, `${projectName}.jsonl`),
    [
      JSON.stringify({
        sessionId: 'session-1',
        cwd: actualProjectDir,
        type: 'message',
        uuid: 'user-1',
        timestamp: '2026-04-22T10:00:00.000Z',
        message: {
          role: 'user',
          content: '这里是 official history 里的原始展开内容',
        },
      }),
      JSON.stringify({
        sessionId: 'session-1',
        cwd: actualProjectDir,
        type: 'message',
        uuid: 'assistant-1',
        timestamp: '2026-04-22T10:00:01.000Z',
        message: {
          role: 'assistant',
          content: '收到',
        },
      }),
    ].join('\n'),
    'utf8',
  );

  const originalHome = process.env.HOME;
  const originalGetNames = sessionNamesDb.getNames;

  try {
    process.env.HOME = tempHome;
    clearProjectDirectoryCache();
    sessionNamesDb.getNames = () => new Map([
      ['session-1', '自定义标题'],
    ]);

    const projects = await getProjects();
    const project = projects.find((candidate) => candidate.name === projectName);

    assert.ok(project);
    assert.equal(project.fullPath, actualProjectDir);
    assert.equal(project.sessions[0].summary, '自定义标题');
    assert.equal(project.sessions[0].lastUserMessage, '这里是 official history 里的原始展开内容');
  } finally {
    process.env.HOME = originalHome;
    sessionNamesDb.getNames = originalGetNames;
  }
});

test('saveProjectFileFromEditor rejects stale expectedVersion with 409 metadata', async () => {
  const projectRoot = await mkdtemp(path.join(os.tmpdir(), 'project-file-version-'));
  const relativePath = 'src/demo.txt';
  const absoluteDir = path.join(projectRoot, 'src');
  const absolutePath = path.join(projectRoot, relativePath);

  await mkdir(absoluteDir, { recursive: true });
  await writeFile(absolutePath, 'first version', 'utf8');

  const initialRead = await readProjectFileForEditor({
    projectRoot,
    filePath: relativePath,
  });

  await writeFile(absolutePath, 'second version', 'utf8');

  await assert.rejects(
    () =>
      saveProjectFileFromEditor({
        projectRoot,
        filePath: relativePath,
        content: 'my local edit',
        expectedVersion: initialRead.version,
      }),
    (error) => {
      assert.equal(error?.statusCode, 409);
      assert.equal(error?.message, 'File has changed since last load');
      assert.ok(error?.currentVersion);
      assert.notEqual(error?.currentVersion, initialRead.version);
      return true;
    },
  );
});

test('saveProjectFileFromEditor returns currentVersion null when conflicting file no longer exists', async () => {
  const projectRoot = await mkdtemp(path.join(os.tmpdir(), 'project-file-version-missing-'));
  const relativePath = 'src/demo.txt';
  const absoluteDir = path.join(projectRoot, 'src');
  const absolutePath = path.join(projectRoot, relativePath);

  await mkdir(absoluteDir, { recursive: true });
  await writeFile(absolutePath, 'first version', 'utf8');

  const initialRead = await readProjectFileForEditor({
    projectRoot,
    filePath: relativePath,
  });

  await rm(absolutePath);

  await assert.rejects(
    () =>
      saveProjectFileFromEditor({
        projectRoot,
        filePath: relativePath,
        content: 'my local edit',
        expectedVersion: initialRead.version,
      }),
    (error) => {
      assert.equal(error?.statusCode, 409);
      assert.equal(error?.message, 'File has changed since last load');
      assert.equal(error?.currentVersion, null);
      return true;
    },
  );
});

test('readProjectFileForEditor and saveProjectFileFromEditor return stable version metadata', async () => {
  const projectRoot = await mkdtemp(path.join(os.tmpdir(), 'project-file-read-write-'));
  const relativePath = 'src/demo.txt';
  const absoluteDir = path.join(projectRoot, 'src');
  const absolutePath = path.join(projectRoot, relativePath);

  await mkdir(absoluteDir, { recursive: true });
  await writeFile(absolutePath, 'hello', 'utf8');

  const initialRead = await readProjectFileForEditor({
    projectRoot,
    filePath: relativePath,
  });

  assert.equal(initialRead.content, 'hello');
  assert.ok(initialRead.version);

  const saved = await saveProjectFileFromEditor({
    projectRoot,
    filePath: relativePath,
    content: 'hello world',
    expectedVersion: initialRead.version,
  });

  assert.equal(saved.success, true);
  assert.ok(saved.version);
  assert.notEqual(saved.version, initialRead.version);

  const afterSave = await readProjectFileForEditor({
    projectRoot,
    filePath: relativePath,
  });

  assert.equal(afterSave.content, 'hello world');
  assert.equal(afterSave.version, saved.version);
});

test('saveProjectFileFromEditor serializes same-path concurrent saves inside one process', async () => {
  const projectRoot = await mkdtemp(path.join(os.tmpdir(), 'project-file-save-queue-'));
  const relativePath = 'src/demo.txt';
  const absoluteDir = path.join(projectRoot, 'src');
  const absolutePath = path.join(projectRoot, relativePath);

  await mkdir(absoluteDir, { recursive: true });
  await writeFile(absolutePath, 'base content', 'utf8');

  const initialRead = await readProjectFileForEditor({
    projectRoot,
    filePath: relativePath,
  });

  let releaseFirstSave;
  const firstSaveGate = new Promise((resolve) => {
    releaseFirstSave = resolve;
  });

  const firstSavePromise = saveProjectFileFromEditor({
    projectRoot,
    filePath: relativePath,
    content: 'first edit',
    expectedVersion: initialRead.version,
    __testHooks: {
      afterVersionCheck: async () => {
        await firstSaveGate;
      },
    },
  });

  let secondSaveSettled = false;
  const secondSavePromise = saveProjectFileFromEditor({
    projectRoot,
    filePath: relativePath,
    content: 'second edit',
    expectedVersion: initialRead.version,
  }).finally(() => {
    secondSaveSettled = true;
  });

  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.equal(secondSaveSettled, false);

  releaseFirstSave();

  const firstSave = await firstSavePromise;
  assert.equal(firstSave.success, true);

  await assert.rejects(
    () => secondSavePromise,
    (error) => {
      assert.equal(error?.statusCode, 409);
      assert.equal(error?.message, 'File has changed since last load');
      assert.equal(error?.currentVersion, firstSave.version);
      return true;
    },
  );

  const finalRead = await readProjectFileForEditor({
    projectRoot,
    filePath: relativePath,
  });

  assert.equal(finalRead.content, 'first edit');
  assert.equal(finalRead.version, firstSave.version);
});

test('saveProjectFileFromEditor cleans up same-path queue entries after completion', async () => {
  const projectRoot = await mkdtemp(path.join(os.tmpdir(), 'project-file-save-queue-cleanup-'));
  const relativePath = 'src/demo.txt';
  const absoluteDir = path.join(projectRoot, 'src');
  const absolutePath = path.join(projectRoot, relativePath);

  await mkdir(absoluteDir, { recursive: true });
  await writeFile(absolutePath, 'base content', 'utf8');

  const initialRead = await readProjectFileForEditor({
    projectRoot,
    filePath: relativePath,
  });

  assert.equal(getSerializedFileSaveQueueSizeForTests(), 0);

  await saveProjectFileFromEditor({
    projectRoot,
    filePath: relativePath,
    content: 'updated content',
    expectedVersion: initialRead.version,
  });

  assert.equal(getSerializedFileSaveQueueSizeForTests(), 0);
});
