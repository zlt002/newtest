function decodePartialJsonString(rawValue, isComplete) {
  if (typeof rawValue !== 'string') {
    return '';
  }

  let sanitized = rawValue.replace(/\r?\n/g, '\\n');

  if (!isComplete) {
    sanitized = sanitized
      .replace(/\\u[0-9a-fA-F]{0,3}$/, '')
      .replace(/\\x[0-9a-fA-F]?$/, '')
      .replace(/\\$/, '');
  }

  try {
    return JSON.parse(`"${sanitized}"`);
  } catch {
    return sanitized
      .replace(/\\\\/g, '\\')
      .replace(/\\"/g, '"')
      .replace(/\\n/g, '\n')
      .replace(/\\r/g, '\r')
      .replace(/\\t/g, '\t');
  }
}

function extractJsonStringField(buffer, fieldName) {
  const match = new RegExp(`"${fieldName}"\\s*:\\s*"`, 'm').exec(buffer);
  if (!match) {
    return undefined;
  }

  let cursor = match.index + match[0].length;
  let rawValue = '';
  let escaped = false;

  while (cursor < buffer.length) {
    const char = buffer[cursor];

    if (escaped) {
      rawValue += char;
      escaped = false;
      cursor += 1;
      continue;
    }

    if (char === '\\') {
      rawValue += char;
      escaped = true;
      cursor += 1;
      continue;
    }

    if (char === '"') {
      return decodePartialJsonString(rawValue, true);
    }

    rawValue += char;
    cursor += 1;
  }

  return decodePartialJsonString(rawValue, false);
}

function extractJsonBooleanField(buffer, fieldName) {
  const match = new RegExp(`"${fieldName}"\\s*:\\s*(true|false)`, 'm').exec(buffer);
  if (!match) {
    return undefined;
  }

  return match[1] === 'true';
}

function parsePartialToolInput(buffer) {
  if (!buffer) {
    return null;
  }

  const partialInput = {};
  const filePath = extractJsonStringField(buffer, 'file_path');
  const content = extractJsonStringField(buffer, 'content');
  const oldString = extractJsonStringField(buffer, 'old_string');
  const newString = extractJsonStringField(buffer, 'new_string');
  const replaceAll = extractJsonBooleanField(buffer, 'replace_all');

  if (filePath !== undefined) {
    partialInput.file_path = filePath;
  }
  if (content !== undefined) {
    partialInput.content = content;
  }
  if (oldString !== undefined) {
    partialInput.old_string = oldString;
  }
  if (newString !== undefined) {
    partialInput.new_string = newString;
  }
  if (replaceAll !== undefined) {
    partialInput.replace_all = replaceAll;
  }

  return Object.keys(partialInput).length > 0 ? partialInput : null;
}

export function createClaudeStreamToolPreviewTracker() {
  const blocksByIndex = new Map();

  return {
    consume(message) {
      if (message?.type !== 'stream_event' || !message.event) {
        return [];
      }

      const event = message.event;

      if (event.type === 'content_block_start' && event.content_block?.type === 'tool_use') {
        const nextState = {
          toolId: event.content_block.id,
          toolName: event.content_block.name,
          inputBuffer: '',
          partialInput: event.content_block.input && typeof event.content_block.input === 'object'
            ? { ...event.content_block.input }
            : {},
        };

        blocksByIndex.set(event.index, nextState);

        return [{
          type: 'tool_use_partial',
          uuid: message.uuid ? `${message.uuid}:tool:${event.index}:start` : undefined,
          session_id: message.session_id,
          parent_tool_use_id: message.parent_tool_use_id ?? null,
          toolName: nextState.toolName,
          toolCallId: nextState.toolId,
          toolInput: nextState.partialInput,
          partial: true,
        }];
      }

      if (event.type === 'content_block_delta' && event.delta?.type === 'input_json_delta') {
        const blockState = blocksByIndex.get(event.index);
        if (!blockState) {
          return [];
        }

        blockState.inputBuffer += event.delta.partial_json || '';
        const parsedInput = parsePartialToolInput(blockState.inputBuffer);
        if (parsedInput) {
          blockState.partialInput = {
            ...blockState.partialInput,
            ...parsedInput,
          };
        }

        return [{
          type: 'tool_use_partial',
          uuid: message.uuid ? `${message.uuid}:tool:${event.index}:delta` : undefined,
          session_id: message.session_id,
          parent_tool_use_id: message.parent_tool_use_id ?? null,
          toolName: blockState.toolName,
          toolCallId: blockState.toolId,
          toolInput: blockState.partialInput,
          partial: true,
        }];
      }

      if (event.type === 'content_block_stop') {
        blocksByIndex.delete(event.index);
      }

      return [];
    },
  };
}

export const __testables__ = {
  parsePartialToolInput,
};
