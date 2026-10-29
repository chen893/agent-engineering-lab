// AI 提供：可控请求与运行轨迹，不实现重试逻辑。
import { retry, sleep } from "./retry.ts";

const scenarios = {
  immediate: { failures: 0, retries: 2 },
  recover: { failures: 2, retries: 2 },
  exhausted: { failures: Infinity, retries: 2 },
  zero: { failures: Infinity, retries: 0 },
};
const name = process.argv[2] ?? "recover";
if (!Object.hasOwn(scenarios, name)) {
  console.error(`场景必须为 ${Object.keys(scenarios).join(", ")}`);
  process.exitCode = 1;
} else {
  const scenario = scenarios[name as keyof typeof scenarios];
  let calls = 0;
  const started = performance.now();
  const trace = (event: string) => console.log(`${Math.round(performance.now() - started)}ms ${event}`);
  try {
    const result = await retry(async () => {
      calls++;
      trace(`请求 ${calls}`);
      if (calls <= scenario.failures) throw new Error(`请求 ${calls} 失败`);
      return `请求 ${calls} 成功`;
    }, {
      retries: scenario.retries,
      delayMs: 50,
      wait: async (ms) => {
        trace(`等待开始 ${ms}ms`);
        await sleep(ms);
        trace("等待完成");
      },
    });
    trace(`最终结果：${result}`);
  } catch (error) {
    trace(`最终错误：${String(error)}`);
    if (calls === 0) process.exitCode = 1;
  }
}
