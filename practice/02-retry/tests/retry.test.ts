// AI 提供的验收；初始失败应由用户完成 retry 后消除。
import assert from "node:assert/strict";
import test from "node:test";
import { retry } from "../src/retry.ts";

for (const scenario of [
  { name: "首次成功", failures: 0, retries: 2, expectedCalls: 1, success: true },
  { name: "两次失败后成功", failures: 2, retries: 2, expectedCalls: 3, success: true },
  { name: "耗尽重试", failures: Infinity, retries: 2, expectedCalls: 3, success: false },
  { name: "零次重试", failures: Infinity, retries: 0, expectedCalls: 1, success: false },
]) {
  test(scenario.name, async () => {
    let calls = 0;
    let waiting = false;
    const events: string[] = [];
    const errors: Error[] = [];
    const value = { answer: 42 };
    let result: unknown;
    let caught: unknown;
    try {
      result = await retry(async () => {
        assert.equal(waiting, false, "等待尚未完成就发起了请求");
        calls++;
        assert.ok(calls <= scenario.expectedCalls, "超出请求次数");
        events.push(`request:${calls}`);
        if (calls <= scenario.failures) {
          const error = new Error(`failure:${calls}`);
          errors.push(error);
          throw error;
        }
        return value;
      }, {
        retries: scenario.retries,
        delayMs: 25,
        wait: async (ms) => {
          assert.equal(ms, 25);
          assert.equal(waiting, false);
          waiting = true;
          events.push("wait:start");
          await new Promise<void>((resolve) => setImmediate(resolve));
          events.push("wait:end");
          waiting = false;
        },
      });
    } catch (error) {
      caught = error;
    }
    assert.equal(calls, scenario.expectedCalls);
    assert.equal(waiting, false, "函数返回时仍有后台等待");
    const expected: string[] = [];
    for (let attempt = 1; attempt <= scenario.expectedCalls; attempt++) {
      if (attempt > 1) expected.push("wait:start", "wait:end");
      expected.push(`request:${attempt}`);
    }
    assert.deepEqual(events, expected);
    if (scenario.success) {
      assert.equal(caught, undefined);
      assert.equal(result, value, "保留原始返回值");
    } else {
      assert.equal(caught, errors.at(-1), "抛出最后一次的原始错误");
    }
  });
}

test("未提供 wait 时可使用默认等待", async () => {
  let calls = 0;
  const result = await retry(async () => {
    calls++;
    assert.ok(calls <= 2);
    if (calls === 1) throw new Error("first failure");
    return 42;
  }, { retries: 1, delayMs: 0 });
  assert.equal(result, 42);
  assert.equal(calls, 2);
});
