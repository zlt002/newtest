// SessionRecord 是产品层保留的最小会话元数据外壳。
// 它与 Claude runtime 的真实 sessionId 对齐，不再引入第二套 conversation 主身份。
export function createSessionRecord({
  id,
  title,
  createdAt = new Date().toISOString(),
}) {
  return {
    id,
    title,
    createdAt,
  };
}
