// AI 提供最小接口；调度实现由用户完成。
export type TaskResult<T> =
  | { status: "fulfilled"; value: T }
  | { status: "rejected"; reason: unknown };

export async function runTasks<T>(
  tasks: ReadonlyArray<() => Promise<T>>,
  concurrency: number,
): Promise<TaskResult<T>[]> {
  if (
    Number.isFinite(concurrency) &&
    concurrency <= 0 &&
    Number.isInteger(concurrency)
  ) {
    throw new Error("concurrency must be a positive integer");
  }
  let index = 0;
  const results: TaskResult<T>[] = new Array(tasks.length);
  const runTask = async () => {
    if (index >= tasks.length) {
      return;
    }
    const currentIndex = index;
    index++;
    try {
      const result = await tasks[currentIndex]();
      results[currentIndex] = { status: "fulfilled", value: result };
    } catch (error) {
      results[currentIndex] = { status: "rejected", reason: error };
    }
    await runTask();
  };

  let queue = [];
  for (let i = 0; i < concurrency; i++) {
    queue.push(runTask());
  }
  await Promise.all(queue);
  return results;
}
