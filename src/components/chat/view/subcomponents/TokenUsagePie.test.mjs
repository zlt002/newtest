import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { register } from 'node:module';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

const tsxLoaderUrl = new URL('../../../code-editor/view/subcomponents/tsx-loader.mjs', import.meta.url).href;

register(tsxLoaderUrl, import.meta.url);

const { default: TokenUsagePie } = await import('./TokenUsagePie.tsx');

test('TokenUsagePie renders a clickable context window breakdown with free space', () => {
  const markup = renderToStaticMarkup(
    React.createElement(TokenUsagePie, {
      used: 70500,
      total: 200000,
      contextUsage: {
        totalTokens: 70500,
        maxTokens: 200000,
        percentage: 35.25,
        categories: [
          { name: 'Messages', tokens: 47000, color: '#5b8def' },
          { name: 'System tools', tokens: 16800, color: '#8ab4f8' },
        ],
      },
    }),
  );

  assert.match(markup, /aria-label="Context window details"/);
  assert.match(markup, /Context window/);
  assert.match(markup, /70\.5k \/ 200\.0k/);
  assert.match(markup, /Messages/);
  assert.match(markup, /47\.0k/);
  assert.match(markup, /23\.5%/);
  assert.match(markup, /System tools/);
  assert.match(markup, /Free space/);
  assert.match(markup, /129\.5k/);
});

test('TokenUsagePie renders the detail panel in a body portal to avoid composer overflow clipping', async () => {
  const source = await readFile(new URL('./TokenUsagePie.tsx', import.meta.url), 'utf8');

  assert.match(source, /createPortal/);
  assert.match(source, /document\.body/);
  assert.match(source, /position:\s*'fixed'/);
  assert.doesNotMatch(source, /absolute bottom-full/);
});

test('TokenUsagePie renders SDK context usage subcategory details', () => {
  const markup = renderToStaticMarkup(
    React.createElement(TokenUsagePie, {
      used: 70500,
      total: 200000,
      contextUsage: {
        totalTokens: 70500,
        maxTokens: 200000,
        percentage: 35.25,
        categories: [
          { name: 'Messages', tokens: 47000, color: '#5b8def' },
          { name: 'MCP tools', tokens: 3200, color: '#7aa7f6' },
          { name: 'Memory files', tokens: 1900, color: '#9bbcf8' },
          { name: 'System prompt', tokens: 306, color: '#c4d7fb' },
          { name: 'Custom agents', tokens: 329, color: '#a8c3f5' },
          { name: 'Skills', tokens: 1100, color: '#bfd2fb' },
          { name: 'System tools', tokens: 16800, color: '#8ab4f8' },
        ],
        messageBreakdown: {
          userMessageTokens: 12000,
          assistantMessageTokens: 9000,
          toolCallTokens: 3000,
          toolResultTokens: 17000,
          attachmentTokens: 600,
          redirectedContextTokens: 400,
          unattributedTokens: 5000,
          toolCallsByType: [{ name: 'Bash', callTokens: 1200, resultTokens: 4800 }],
          attachmentsByType: [{ name: 'image/png', tokens: 600 }],
        },
        mcpTools: [{ name: 'read_file', serverName: 'filesystem', tokens: 1400, isLoaded: true }],
        memoryFiles: [{ path: 'C:/demo/CLAUDE.md', type: 'project', tokens: 1900 }],
        systemPromptSections: [{ name: 'Project instructions', tokens: 306 }],
        agents: [{ agentType: 'cook-zh-cn:roles:backend', source: 'user', tokens: 329 }],
        skills: {
          includedSkills: 1,
          totalSkills: 3,
          tokens: 1100,
          skillFrontmatter: [{ name: 'planning', source: 'project', tokens: 1100 }],
        },
        systemTools: [{ name: 'TodoWrite', tokens: 1200 }],
      },
    }),
  );

  assert.match(markup, /User messages/);
  assert.match(markup, /Tool results/);
  assert.match(markup, /Bash result/);
  assert.match(markup, /filesystem:read_file/);
  assert.match(markup, /CLAUDE\.md/);
  assert.match(markup, /Project instructions/);
  assert.match(markup, /cook-zh-cn:roles:backend/);
  assert.match(markup, /planning/);
  assert.match(markup, /TodoWrite/);
});
