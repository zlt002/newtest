// 真正执行一轮 Claude run 的最小执行器。
// 它只负责把 prompt / 图片输入喂给 session，再持续把 stream 里的 SDK 消息交回上层处理。
function parseImageDataUrl(value) {
  const normalized = String(value || '').trim();
  const match = normalized.match(/^data:(image\/(?:png|jpeg|gif|webp));base64,(.+)$/i);
  if (!match) {
    return null;
  }

  return {
    mediaType: match[1].toLowerCase(),
    data: match[2],
  };
}

function buildClaudeUserMessage({ prompt, images = [] }) {
  const content = [];
  let hasImageContent = false;

  for (const image of images) {
    const parsed = parseImageDataUrl(image?.data);
    if (!parsed) {
      continue;
    }

    content.push({
      type: 'image',
      source: {
        type: 'base64',
        media_type: parsed.mediaType,
        data: parsed.data,
      },
    });
    hasImageContent = true;
  }

  const normalizedPrompt = String(prompt || '');
  if (!hasImageContent) {
    return normalizedPrompt;
  }

  if (normalizedPrompt.trim()) {
    content.push({
      type: 'text',
      text: normalizedPrompt,
    });
  }

  return {
    type: 'user',
    parent_tool_use_id: null,
    message: {
      role: 'user',
      content,
    },
  };
}

function normalizeOfficialUserMessage(message) {
  if (!message || typeof message !== 'object') {
    return null;
  }

  if (
    message.type === 'user'
    && message.message
    && typeof message.message === 'object'
    && !Array.isArray(message.message)
  ) {
    return message;
  }

  const role = typeof message.role === 'string' ? message.role.trim() : '';
  const content = message.content;
  const hasContent = typeof content === 'string'
    || Array.isArray(content)
    || (content && typeof content === 'object');

  if (role !== 'user' || !hasContent) {
    return message;
  }

  return {
    type: 'user',
    parent_tool_use_id: null,
    message: {
      role: 'user',
      content,
    },
  };
}

export async function executeClaudeRun({ session, prompt, images = [], message = null, onMessage, translateMessage }) {
  const outboundMessage =
    message && typeof message === 'object'
      ? normalizeOfficialUserMessage(message)
      : buildClaudeUserMessage({ prompt, images });

  await session.send(outboundMessage);

  for await (const sdkMessage of session.stream()) {
    if (typeof translateMessage === 'function') {
      const translated = await translateMessage(sdkMessage);
      const events = Array.isArray(translated) ? translated : translated ? [translated] : [];
      for (const event of events) {
        if (onMessage) {
          await onMessage(event);
        }
      }
      continue;
    }

    if (onMessage) {
      await onMessage(sdkMessage);
    }
  }
}
