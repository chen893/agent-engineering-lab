// AI 编写：只验证 pi 既有 shell 后端的取消语义，不调用用户实现。
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "../../repos/pi-mono/node_modules/vitest/dist/index.js";
import { createLocalBashOperations } from "../../repos/pi-mono/packages/coding-agent/src/core/tools/bash.ts";

const worker = fileURLToPath(new URL("./worker.mjs", import.meta.url));
const quote = (value: string) => `'${value.replaceAll("'", "'\\''")}'`;

describe("pi 既有行为基线（不是用户实现验收）", () => {
  it("取消 shell 执行会终止进程，再报告 aborted", async () => {
    const controller = new AbortController();
    let output = "";
    let pid: number | undefined;
    // exec 让 shell 被 Node 替换，基线不涉及后代进程语义。
    const execution = createLocalBashOperations().exec(
      `exec ${quote(process.execPath)} ${quote(worker)} hold`,
      process.cwd(),
      {
        signal: controller.signal,
        timeout: 5,
        onData: (chunk) => {
          output += chunk.toString();
          const match = /READY:(\d+)\n/.exec(output);
          if (match) {
            pid = Number(match[1]);
            controller.abort();
          }
        },
      },
    );
    try {
      await expect(execution).rejects.toThrow("aborted");
      expect(pid).toBeDefined();
      let failureCode: string | undefined;
      try {
        process.kill(pid!, 0);
      } catch (error) {
        failureCode = (error as NodeJS.ErrnoException).code;
      }
      expect(failureCode).toBe("ESRCH");
    } finally {
      controller.abort();
    }
  });
});
