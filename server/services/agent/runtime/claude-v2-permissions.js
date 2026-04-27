import crypto from 'node:crypto';

function createNormalizedMessage(fields) {
  return {
    ...fields,
    id: fields.id || `msg_${crypto.randomUUID()}`,
    sessionId: fields.sessionId || '',
    timestamp: fields.timestamp || new Date().toISOString(),
    provider: fields.provider,
  };
}

const INTERACTIVE_TOOL_NAMES = new Set(['AskUserQuestion']);

function trimString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function isPlainObject(value) {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function escapePermissionRuleContent(value) {
  return String(value)
    .replace(/\\/g, '\\\\')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)');
}

function unescapePermissionRuleContent(value) {
  return String(value)
    .replace(/\\\(/g, '(')
    .replace(/\\\)/g, ')')
    .replace(/\\\\/g, '\\');
}

function findUnescapedChar(value, needle, fromEnd = false) {
  if (fromEnd) {
    for (let index = value.length - 1; index >= 0; index -= 1) {
      if (value[index] !== needle) {
        continue;
      }

      let slashCount = 0;
      for (let cursor = index - 1; cursor >= 0 && value[cursor] === '\\'; cursor -= 1) {
        slashCount += 1;
      }

      if (slashCount % 2 === 0) {
        return index;
      }
    }

    return -1;
  }

  for (let index = 0; index < value.length; index += 1) {
    if (value[index] !== needle) {
      continue;
    }

    let slashCount = 0;
    for (let cursor = index - 1; cursor >= 0 && value[cursor] === '\\'; cursor -= 1) {
      slashCount += 1;
    }

    if (slashCount % 2 === 0) {
      return index;
    }
  }

  return -1;
}

export function normalizeAskUserQuestionInput(input) {
  if (!isPlainObject(input)) {
    return input;
  }

  const legacyCandidate = input.questions ?? (isPlainObject(input.question) ? input.question : input);
  const questions = normalizeAskUserQuestionQuestions(legacyCandidate);
  if (questions.length === 0) {
    return input;
  }

  const {
    question: _legacyQuestion,
    header: _legacyHeader,
    options: _legacyOptions,
    ...rest
  } = input;
  return {
    ...rest,
    questions,
  };
}

function isQuestionOption(value) {
  return Boolean(value && typeof value === 'object' && typeof value.label === 'string');
}

function isQuestion(value) {
  return Boolean(
    value &&
    typeof value === 'object' &&
    typeof value.question === 'string' &&
    typeof value.header === 'string' &&
    Array.isArray(value.options) &&
    value.options.length >= 2 &&
    value.options.every(isQuestionOption),
  );
}

function normalizeAskUserQuestionQuestions(value) {
  if (Array.isArray(value)) {
    return value.filter(isQuestion);
  }

  if (isQuestion(value)) {
    return [value];
  }

  return [];
}

function normalizeToolInput(input) {
  if (input === null || input === undefined) {
    return {};
  }
  if (isPlainObject(input)) {
    return input;
  }
  return { value: input };
}

function parsePermissionRuleEntry(entry) {
  const value = trimString(entry);
  if (!value) {
    return null;
  }

  const openIndex = findUnescapedChar(value, '(');
  const closeIndex = findUnescapedChar(value, ')', true);
  if (openIndex === -1 || closeIndex !== value.length - 1 || closeIndex <= openIndex) {
    return { toolName: value };
  }

  const toolName = value.slice(0, openIndex).trim();
  if (!toolName) {
    return null;
  }

  const ruleContent = unescapePermissionRuleContent(value.slice(openIndex + 1, closeIndex));
  if (!ruleContent || ruleContent === '*') {
    return { toolName };
  }

  return {
    toolName,
    ruleContent,
  };
}

function formatPermissionRuleEntry(rule) {
  if (!rule?.toolName) {
    return null;
  }

  if (!rule.ruleContent) {
    return rule.toolName;
  }

  return `${rule.toolName}(${escapePermissionRuleContent(rule.ruleContent)})`;
}

function isBashPrefixRule(entry, toolName, input) {
  const parsed = parsePermissionRuleEntry(entry);
  if (!parsed || parsed.toolName !== 'Bash' || toolName !== 'Bash' || !parsed.ruleContent) {
    return false;
  }

  const command = typeof input === 'string'
    ? input.trim()
    : trimString(input?.command);

  if (!command) {
    return false;
  }

  const prefix = parsed.ruleContent.endsWith(':*')
    ? parsed.ruleContent.slice(0, -2)
    : parsed.ruleContent;

  return command.startsWith(prefix);
}

export function matchesToolPermission(entry, toolName, input) {
  const parsed = parsePermissionRuleEntry(entry);
  if (!parsed || !toolName) {
    return false;
  }

  if (parsed.toolName !== toolName) {
    return isBashPrefixRule(entry, toolName, input);
  }

  if (parsed.ruleContent === undefined) {
    return true;
  }

  if (toolName === 'Bash') {
    return isBashPrefixRule(entry, toolName, input);
  }

  if (parsed.ruleContent === '*') {
    return true;
  }

  return true;
}

function buildPermissionUpdateFromEntry(entry, behavior = 'allow') {
  const parsed = parsePermissionRuleEntry(entry);
  if (!parsed) {
    return null;
  }

  return {
    type: 'addRules',
    rules: [parsed],
    behavior,
    destination: 'session',
  };
}

function buildUpdatedPermissionsFromDecision(decision, toolName, input) {
  if (Array.isArray(decision?.updatedPermissions) && decision.updatedPermissions.length > 0) {
    return decision.updatedPermissions;
  }

  const rememberEntry = trimString(decision?.rememberEntry);
  if (!rememberEntry) {
    return undefined;
  }

  const update = buildPermissionUpdateFromEntry(rememberEntry, 'allow');
  if (update) {
    return [update];
  }

  const normalizedInput = normalizeToolInput(input);
  if (toolName !== 'Bash' || !normalizedInput.command) {
    return undefined;
  }

  return [{
    type: 'addRules',
    rules: [{
      toolName: 'Bash',
      ruleContent: `${trimString(normalizedInput.command)}:*`,
    }],
    behavior: 'allow',
    destination: 'session',
  }];
}

function buildAllowedInput(decision, input) {
  if (decision && decision.updatedInput && isPlainObject(decision.updatedInput)) {
    return decision.updatedInput;
  }

  if (decision && isPlainObject(decision.answers)) {
    return {
      ...normalizeToolInput(input),
      answers: decision.answers,
      ...(isPlainObject(decision.annotations) ? { annotations: decision.annotations } : {}),
    };
  }

  if (isPlainObject(input)) {
    return input;
  }

  return normalizeToolInput(input);
}

function buildAskUserQuestionContent(input) {
  const normalized = normalizeAskUserQuestionInput(input);
  const questions = Array.isArray(normalized?.questions) ? normalized.questions : [];

  if (questions.length === 0) {
    return 'Claude 需要向你确认一个问题。';
  }

  const lines = ['Claude 需要向你确认以下问题：'];
  questions.forEach((question, questionIndex) => {
    const header = trimString(question.header);
    const title = trimString(question.question);
    lines.push(`${questionIndex + 1}. ${header ? `[${header}] ` : ''}${title}`);
    question.options.forEach((option, optionIndex) => {
      const description = trimString(option.description);
      lines.push(`   ${optionIndex + 1}) ${trimString(option.label)}${description ? ` - ${description}` : ''}`);
    });
  });
  lines.push('请在交互问答卡片中作答，而不是继续发送普通工具确认。');
  return lines.join('\n');
}

function createPendingRequestRecord({
  requestId,
  sessionId,
  toolName,
  input,
  toolUseID,
  kind,
  context,
  questions,
  resolve,
}) {
  return {
    requestId,
    sessionId,
    toolName,
    input,
    toolUseID,
    kind,
    context,
    questions,
    resolve,
    receivedAt: new Date(),
  };
}

function sendPendingMessage(writer, kind, fields) {
  writer?.send?.(createNormalizedMessage({
    kind,
    provider: 'claude',
    ...fields,
  }));
}

function registerPendingRequest(pool, mapName, requestId, record) {
  pool[mapName].set(requestId, record);
}

function resolvePendingRequest(pool, mapName, requestId, decision) {
  const request = pool[mapName].get(requestId);
  if (!request) {
    return false;
  }

  request.resolve(decision);
  pool[mapName].delete(requestId);
  return true;
}

function buildPermissionResult({ requestId, toolName, input, decision }) {
  if (!decision || decision.cancelled) {
    return {
      behavior: 'deny',
      message: 'Permission request cancelled',
      toolUseID: requestId,
    };
  }

  if (!decision.allow) {
    return {
      behavior: 'deny',
      message: decision.message || 'User denied tool use',
      toolUseID: requestId,
    };
  }

  const updatedInput = buildAllowedInput(decision, input);
  const updatedPermissions = buildUpdatedPermissionsFromDecision(decision, toolName, input);

  return {
    behavior: 'allow',
    updatedInput,
    ...(updatedPermissions ? { updatedPermissions } : {}),
    toolUseID: requestId,
  };
}

function updateLocalAllowedRules(allowedTools, updatedPermissions) {
  if (!Array.isArray(updatedPermissions)) {
    return;
  }

  for (const permissionUpdate of updatedPermissions) {
    if (permissionUpdate?.type !== 'addRules' || permissionUpdate.behavior !== 'allow') {
      continue;
    }

    for (const rule of permissionUpdate.rules || []) {
      const formatted = formatPermissionRuleEntry(rule);
      if (formatted && !allowedTools.includes(formatted)) {
        allowedTools.push(formatted);
      }
    }
  }
}

export function createClaudeV2PermissionHandlers({ pool, entry, options }) {
  const permissionMode = options.permissionMode || 'default';
  const toolsSettings = options.toolsSettings || {};
  const allowedTools = Array.isArray(toolsSettings.allowedTools) ? [...toolsSettings.allowedTools] : [];
  const disallowedTools = Array.isArray(toolsSettings.disallowedTools) ? [...toolsSettings.disallowedTools] : [];
  const allowDangerouslySkipPermissions = permissionMode === 'bypassPermissions';

  const shouldAutoAllowByRule = (toolName, input) => (
    allowedTools.some((rule) => matchesToolPermission(rule, toolName, input))
  );

  const shouldAutoDenyByRule = (toolName, input) => (
    disallowedTools.some((rule) => matchesToolPermission(rule, toolName, input))
  );

  return {
    allowedTools,
    disallowedTools,
    allowDangerouslySkipPermissions,
    async canUseTool(toolName, input, context = {}) {
      const normalizedToolInput = normalizeToolInput(input);
      const currentSessionId = entry.sessionId || null;

      if (permissionMode === 'bypassPermissions' && !INTERACTIVE_TOOL_NAMES.has(toolName)) {
        return {
          behavior: 'allow',
          updatedInput: normalizedToolInput,
          toolUseID: context.toolUseID,
        };
      }

      if (!INTERACTIVE_TOOL_NAMES.has(toolName)) {
        if (shouldAutoDenyByRule(toolName, normalizedToolInput)) {
          return {
            behavior: 'deny',
            message: 'Tool disallowed by settings',
            toolUseID: context.toolUseID,
          };
        }

        if (shouldAutoAllowByRule(toolName, normalizedToolInput)) {
          return {
            behavior: 'allow',
            updatedInput: normalizedToolInput,
            toolUseID: context.toolUseID,
          };
        }
      }

      const requestId = context.toolUseID || (typeof globalThis.crypto?.randomUUID === 'function'
        ? globalThis.crypto.randomUUID()
        : `${Date.now()}-${Math.random()}`);
      const writer = entry.writer;
      const requestBase = {
        requestId,
        toolName,
        input: normalizedToolInput,
        sessionId: currentSessionId,
        provider: 'claude',
        toolUseID: context.toolUseID || null,
      };

      if (INTERACTIVE_TOOL_NAMES.has(toolName)) {
        const normalizedQuestionInput = normalizeAskUserQuestionInput(normalizedToolInput);
        const questions = Array.isArray(normalizedQuestionInput?.questions) ? normalizedQuestionInput.questions : [];
        const interactiveContent = buildAskUserQuestionContent(normalizedQuestionInput);

        sendPendingMessage(writer, 'interactive_prompt', {
          ...requestBase,
          content: interactiveContent,
          questions,
          input: normalizedQuestionInput,
        });

        const decision = await new Promise((resolve) => {
          const record = createPendingRequestRecord({
            requestId,
            sessionId: currentSessionId,
            toolName,
            input: normalizedQuestionInput,
            toolUseID: context.toolUseID || null,
            kind: 'interactive_prompt',
            questions,
            resolve,
          });
          registerPendingRequest(pool, 'pendingInteractivePrompts', requestId, record);

          if (context.signal?.aborted) {
            resolve({ cancelled: true });
            return;
          }

          if (context.signal) {
            const abortHandler = () => resolve({ cancelled: true });
            context.signal.addEventListener('abort', abortHandler, { once: true });
          }
        });

        pool.pendingInteractivePrompts.delete(requestId);
        return buildPermissionResult({
          requestId,
          toolName,
          input: normalizedQuestionInput,
          decision,
        });
      }

      sendPendingMessage(writer, 'permission_request', {
        ...requestBase,
        input: normalizedToolInput,
        context: {
          blockedPath: context.blockedPath || null,
          decisionReason: context.decisionReason || null,
          suggestions: context.suggestions || null,
        },
      });

      const decision = await new Promise((resolve) => {
        const record = createPendingRequestRecord({
          requestId,
          sessionId: currentSessionId,
          toolName,
          input: normalizedToolInput,
          toolUseID: context.toolUseID || null,
          kind: 'permission_request',
          context,
          resolve,
        });
        registerPendingRequest(pool, 'pendingToolApprovals', requestId, record);

        if (context.signal?.aborted) {
          resolve({ cancelled: true });
          return;
        }

        if (context.signal) {
          const abortHandler = () => resolve({ cancelled: true });
          context.signal.addEventListener('abort', abortHandler, { once: true });
        }
      });

      pool.pendingToolApprovals.delete(requestId);

      const result = buildPermissionResult({
        requestId,
        toolName,
        input: normalizedToolInput,
        decision,
      });

      if (decision && decision.cancelled) {
        sendPendingMessage(writer, 'permission_cancelled', {
          requestId,
          reason: 'cancelled',
          sessionId: currentSessionId,
        });
      }

      if (result.behavior === 'allow' && result.updatedPermissions) {
        updateLocalAllowedRules(allowedTools, result.updatedPermissions);
      }

      return result;
    },
    resolvePermissionRequest(requestId, decision) {
      return resolvePendingRequest(pool, 'pendingToolApprovals', trimString(requestId), decision);
    },
    resolveInteractivePrompt(requestId, decision) {
      return resolvePendingRequest(pool, 'pendingInteractivePrompts', trimString(requestId), decision);
    },
  };
}

export function buildPermissionUpdateFromRememberEntry(rememberEntry) {
  return buildPermissionUpdateFromEntry(rememberEntry, 'allow');
}
