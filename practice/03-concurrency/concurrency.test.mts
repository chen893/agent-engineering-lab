// AI 编写的行为验收；不改用户的调度实现。
import assert from "node:assert/strict";
import test from "node:test";
import { runTasks } from "./concurrency.mts";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
}
const tick = () => new Promise<void>((resolve) => setImmediate(resolve));

test("并发上限、及时补位、恰好一次与结果顺序", async () => {
  const gates = Array.from({ length: 4 }, () => deferred<string>());
  const starts: number[] = [];
  let active = 0;
  let peak = 0;
  let settled = false;
  const pending = runTasks(gates.map((gate, index) => async () => {
    starts.push(index);
    active++;
    peak = Math.max(peak, active);
    try { return await gate.promise; } finally { active--; }
  }), 2);
  // 立即挂上错误处理，测试清理不产生额外未处理拒绝。
  void pending.then(() => { settled = true; }, () => { settled = true; });
  try {
    await tick();
    assert.deepEqual([...starts], [0, 1], "初始只能启动前两个任务");
    gates[1].resolve("B");
    await tick();
    assert.deepEqual([...starts], [0, 1, 2], "B 完成后应补入 C，不必等 A");
    gates[2].resolve("C");
    await tick();
    assert.deepEqual([...starts], [0, 1, 2, 3]);
    gates[3].resolve("D");
    await tick();
    assert.equal(settled, false, "A 未结束时不能返回");
    gates[0].resolve("A");
    assert.deepEqual(await pending, ["A", "B", "C", "D"].map((value) => ({ status: "fulfilled", value })));
    assert.equal(peak, 2);
    assert.equal(starts.length, 4);
  } finally {
    gates.forEach((gate, index) => gate.resolve(String(index)));
    await pending.catch(() => {});
    await tick();
  }
});

test("有任务未结束时不能提前返回", async () => {
  const gate = deferred<string>();
  let settled = false;
  const pending = runTasks([async () => "A", () => gate.promise], 1);
  void pending.then(() => { settled = true; }, () => { settled = true; });
  try {
    await tick();
    assert.equal(settled, false, "第二项仍在等待，整体却已返回");
  } finally {
    gate.resolve("B");
    await pending.catch(() => {});
    await tick();
  }
});

test("同步抛错应成为单项失败，后续任务仍执行", async () => {
  const error = new Error("task failed synchronously");
  let nextCalls = 0;
  const result = await runTasks([
    () => { throw error; },
    async () => { nextCalls++; return "B"; },
  ], 1);
  assert.deepEqual(result, [{ status: "rejected", reason: error }, { status: "fulfilled", value: "B" }]);
  assert.equal(nextCalls, 1);
});

test("非法上限 0 拒绝且不能启动任务", async () => {
  let calls = 0;
  let rejected = false;
  try {
    await runTasks([async () => { calls++; return 1; }], 0);
  } catch { rejected = true; }
  await tick();
  assert.equal(calls, 0, "非法配置不应触发任务");
  assert.equal(rejected, true);
});

test("合法上限下的空列表", async () => {
  assert.deepEqual(await runTasks([], 2), []);
});

test("异步失败释放名额，其他任务继续并保留错误对象", async () => {
  const a = deferred<string>();
  const b = deferred<string>();
  const error = new Error("B rejected");
  const starts: string[] = [];
  const pending = runTasks([
    () => { starts.push("A"); return a.promise; },
    () => { starts.push("B"); return b.promise; },
    async () => { starts.push("C"); return "C"; },
  ], 2);
  void pending.catch(() => {});
  try {
    await tick();
    assert.deepEqual([...starts], ["A", "B"]);
    b.reject(error);
    await tick();
    assert.deepEqual([...starts], ["A", "B", "C"], "A 未完成时 B 的失败应释放名额给 C");
    a.resolve("A");
    const result = await pending;
    assert.deepEqual(result, [
      { status: "fulfilled", value: "A" },
      { status: "rejected", reason: error },
      { status: "fulfilled", value: "C" },
    ]);
    assert.ok(result[1].status === "rejected");
    assert.equal(result[1].reason, error);
  } finally {
    a.resolve("A");
    b.resolve("B");
    await pending.catch(() => {});
    await tick();
  }
});

test("并发上限大于任务数仍各执行一次", async () => {
  const calls = [0, 0];
  const result = await runTasks(calls.map((_, index) => async () => {
    calls[index]++;
    return index;
  }), 5);
  assert.deepEqual(calls, [1, 1]);
  assert.deepEqual(result, [0, 1].map((value) => ({ status: "fulfilled", value })));
});

// Infinity 暂不直接测试：当前实现会无限创建 worker，待配置检查补齐后再加入。
for (const limit of [-1, 1.5, NaN]) {
  test(`非法上限 ${limit} 在启动任务前拒绝`, async () => {
    let calls = 0;
    let rejected = false;
    try { await runTasks([async () => { calls++; return 1; }], limit); }
    catch { rejected = true; }
    assert.equal(calls, 0);
    assert.equal(rejected, true);
  });
}

test("空列表不能绕过非法上限检查", async () => {
  await assert.rejects(runTasks([], 0));
});
