export type ProviderSelectionWelcomeContent = {
  title: string;
  description: string;
  providerName: string;
  providerDescription: string;
  modelLabel: string;
  modelName: string;
};

export function getProviderSelectionWelcomeContent(
  claudeModel: string,
): ProviderSelectionWelcomeContent {
  return {
    title: '欢迎使用 Claude Code',
    description: '当前已连接 Claude 助手，可以直接开始新的对话。',
    providerName: 'Claude Code',
    providerDescription: 'Claude Code 已准备就绪，您可以立即开始提问或输入需求。',
    modelLabel: '当前模型：',
    modelName: claudeModel,
  };
}
