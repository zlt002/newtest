// 中断指定 run，并把它标记成 aborted。
export async function abortRun({ repo, runId }) {
  const run = await repo.updateRun(runId, { status: 'aborted' });
  if (!run) {
    throw new Error(`Run ${runId} not found`);
  }
  return run;
}
