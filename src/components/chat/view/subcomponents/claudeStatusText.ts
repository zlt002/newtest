const STATUS_TEXT_MAP: Record<string, string> = {
  Thinking: '思考中',
  Processing: '处理中',
  Analyzing: '分析中',
  Working: '执行中',
  Computing: '计算中',
  Reasoning: '推理中',
  'Starting now': '刚刚开始',
};

export function localizeClaudeStatusText(text: string): string {
  const trimmed = text.trim();
  const ellipsis = trimmed.match(/[.]+$/)?.[0] ?? '';
  const baseText = trimmed.replace(/[.]+$/, '');
  const localized = STATUS_TEXT_MAP[baseText];

  if (!localized) {
    return text;
  }

  return `${localized}${ellipsis}`;
}
