export function resolveRunFailureMessage(payload: Record<string, unknown> | null | undefined): string {
  const subtype = typeof payload?.subtype === 'string' ? payload.subtype.trim() : '';
  const error = typeof payload?.error === 'string' ? payload.error.trim() : '';
  if (subtype === 'error_during_execution' || error === 'error_during_execution') {
    return '该旧会话已无法继续，建议新建会话后重试。';
  }

  if (error) {
    return error;
  }

  if (subtype) {
    return `运行失败：${subtype}`;
  }

  return '运行失败';
}
