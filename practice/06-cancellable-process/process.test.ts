// AI 按用户要求编写正式测试；真实进程与 Agent，仅模型传输模拟。
import { getEventListeners } from "node:events";
import { mkdtempSync, readFileSync, realpathSync, rmSync, watch } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setImmediate as nextTurn } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "../../repos/pi-mono/node_modules/vitest/dist/index.js";
import { Agent } from "../../repos/pi-mono/packages/agent/src/agent.ts";
import type { AgentEvent, StreamFn } from "../../repos/pi-mono/packages/agent/src/types.ts";
import { AssistantMessageEventStream } from "../../repos/pi-mono/packages/ai/src/utils/event-stream.ts";
import { assistant, model } from "../05-pi-context-hook/fixtures.ts";
import { runProcess, type RunOptions, type RunResult } from "./process-runner.ts";
import { createProcessTool } from "./process-tool.ts";

const worker = fileURLToPath(new URL("./worker.mjs", import.meta.url));
const pids = new Set<number>();
const pending: Promise<unknown>[] = [];
const disposers: (() => void)[] = [];

// 超时只防挂死；业务取消时点来自 READY/事件。
async function within<T>(promise: Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([promise, new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error("等待测试事件或收尾超时")), 5000);
    })]);
  } finally { clearTimeout(timer); }
}

function keep<T>(promise: Promise<T>): Promise<T> {
  pending.push(promise);
  // 等待 READY 时也及时处理执行失败，避免 unhandled rejection。
  void promise.catch(() => {});
  return promise;
}

function run(executable: string, args: string[], options: RunOptions = {}) {
  return keep(runProcess(executable, args, {
    ...options,
    onSpawn(pid) { pids.add(pid); options.onSpawn?.(pid); },
  }));
}

function pidError(pid: number): string | undefined {
  try { process.kill(pid, 0); return undefined; }
  catch (error) {
    if (error instanceof Error && "code" in error) return String(error.code);
    throw error;
  }
}

function readyPid(text: string): number | undefined {
  const match = /READY:(\d+)\n/.exec(text);
  return match ? Number(match[1]) : undefined;
}

function tempDirectory() {
  const directory = mkdtempSync(join(tmpdir(), "process06-test-"));
  disposers.push(() => rmSync(directory, { recursive: true, force: true }));
  return directory;
}

function readyFromFile(directory: string) {
  const path = join(directory, "ready");
  const ready = Promise.withResolvers<number>();
  const check = () => {
    try {
      const pid = readyPid(readFileSync(path, "utf8"));
      if (pid !== undefined) { pids.add(pid); ready.resolve(pid); }
    } catch (error) {
      if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) ready.reject(error);
    }
  };
  const watcher = watch(directory, check);
  watcher.on("error", ready.reject);
  disposers.push(() => watcher.close());
  disposers.push(check); // 失败清理时也拾取已写入的 PID。
  check();
  return { path, ready: ready.promise };
}

afterEach(async () => {
  for (const dispose of disposers.splice(0).reverse()) dispose();
  for (const pid of pids) {
    if (pidError(pid) === undefined) {
      try { process.kill(pid, "SIGKILL"); }
      catch (error) {
        if (!(error instanceof Error && "code" in error && error.code === "ESRCH")) throw error;
      }
    }
  }
  pids.clear();
  await within(Promise.allSettled(pending.splice(0)));
});

describe("runProcess：真实子进程", () => {
  it("正常退出，分别收集中文 stdout/stderr，成功报告一次 PID", async () => {
    const spawned: number[] = [];
    const stdout: string[] = [];
    const stderr: string[] = [];
    const result = await run(process.execPath, [worker, "success"], {
      onSpawn: pid => { spawned.push(pid); },
      onStdout: text => { stdout.push(text); },
      onStderr: text => { stderr.push(text); },
    });
    expect(result).toEqual({ status: "exited", exitCode: 0, stdout: "你好\n", stderr: "diagnostic\n" });
    expect(spawned).toHaveLength(1);
    expect(pidError(spawned[0])).toBe("ESRCH");
    expect(stdout.join("")).toBe(result.stdout);
    expect(stderr.join("")).toBe(result.stderr);
    const counts = [spawned.length, stdout.length, stderr.length];
    await nextTurn();
    expect([spawned.length, stdout.length, stderr.length]).toEqual(counts);
  });

  it("非零退出正常 resolve，保留退出码和 stderr", async () => {
    await expect(run(process.execPath, [worker, "fail"])).resolves.toEqual({
      status: "exited", exitCode: 7, stdout: "", stderr: "intentional failure\n",
    });
  });

  it("cwd 与参数按原样传入，不经过 shell", async () => {
    const cwd = tempDirectory();
    const args = ["a b", "$HOME", "*.ts"];
    const result = await run(process.execPath, ["-e",
      "console.log(JSON.stringify({cwd:process.cwd(),args:process.argv.slice(1)}))", ...args], { cwd });
    expect(JSON.parse(result.stdout)).toEqual({ cwd: realpathSync(cwd), args });
    expect(result.exitCode).toBe(0);
  });

  it.each(["executable", "cwd"])("%s 不存在时保留 Node 启动错误并清理监听器", async kind => {
    const missing = join(tempDirectory(), "does-not-exist");
    const executable = kind === "executable" ? missing : process.execPath;
    const controller = new AbortController();
    const spawned: number[] = [];
    await expect(run(executable, [worker, "success"], {
      signal: controller.signal,
      ...(kind === "cwd" ? { cwd: missing } : {}),
      onSpawn: pid => { spawned.push(pid); },
    })).rejects.toMatchObject({ code: "ENOENT", path: executable, spawnargs: [worker, "success"] });
    expect(spawned).toEqual([]);
    expect(getEventListeners(controller.signal, "abort")).toHaveLength(0);
    controller.abort();
    await nextTurn();
    expect(spawned).toEqual([]);
  });

  it("前置取消：即使 executable 不存在也不启动，无 PID/输出/监听器", async () => {
    const controller = new AbortController();
    controller.abort();
    const callbacks: string[] = [];
    await expect(run(join(tempDirectory(), "missing"), [], {
      signal: controller.signal,
      onSpawn: () => { callbacks.push("spawn"); },
      onStdout: () => { callbacks.push("stdout"); },
      onStderr: () => { callbacks.push("stderr"); },
    })).resolves.toEqual({ status: "aborted", exitCode: null, stdout: "", stderr: "" });
    expect(callbacks).toEqual([]);
    expect(getEventListeners(controller.signal, "abort")).toHaveLength(0);
  });

  it("READY 后取消：先确认存活，返回时 PID 已消失并保留输出", async () => {
    const controller = new AbortController();
    const ready = Promise.withResolvers<number>();
    let output = "";
    const execution = run(process.execPath, [worker, "hold"], {
      signal: controller.signal,
      onStdout(text) {
        output += text;
        const pid = readyPid(output);
        if (pid !== undefined) ready.resolve(pid);
      },
    });
    const pid = await within(ready.promise);
    expect(pidError(pid)).toBeUndefined();
    controller.abort();
    const result = await within(execution);
    expect(result).toEqual({ status: "aborted", exitCode: null, stdout: `READY:${pid}\n`, stderr: "" });
    expect(pidError(pid)).toBe("ESRCH");
    expect(getEventListeners(controller.signal, "abort")).toHaveLength(0);
    const snapshot = output;
    await nextTurn();
    expect(output).toBe(snapshot);
  });

  it("同一未取消 signal 可复用，结束后 abort 不影响旧结果或回调", async () => {
    const controller = new AbortController();
    const outputs: string[] = [];
    const results: RunResult[] = [];
    for (let i = 0; i < 2; i++) {
      results.push(await run(process.execPath, [worker, "success"], {
        signal: controller.signal, onStdout: text => { outputs.push(text); },
      }));
      expect(getEventListeners(controller.signal, "abort")).toHaveLength(0);
    }
    const snapshot = structuredClone({ results, outputs });
    controller.abort();
    await nextTurn();
    expect({ results, outputs }).toEqual(snapshot);
    expect(results.map(result => result.status)).toEqual(["exited", "exited"]);
    expect((await run(process.execPath, [worker, "success"])).exitCode).toBe(0);
  });

  it("取消后仍等待收尾输出，两个流排空才返回", async () => {
    const controller = new AbortController();
    const ready = Promise.withResolvers<number>();
    let stdout = "";
    let stderr = "";
    const program = `
      const hold = setInterval(() => {}, 1000);
      process.once('SIGTERM', () => {
        process.stdout.write('cleanup-out\\n', () => {
          process.stderr.write('cleanup-err\\n', () => clearInterval(hold));
        });
      });
      process.stdout.write('READY:' + process.pid + '\\n');
    `;
    const execution = run(process.execPath, ["-e", program], {
      signal: controller.signal,
      onStdout(text) {
        stdout += text;
        const pid = readyPid(stdout);
        if (pid !== undefined) ready.resolve(pid);
      },
      onStderr(text) { stderr += text; },
    });
    const pid = await within(ready.promise);
    controller.abort();
    const result = await within(execution);
    expect(result).toEqual({ status: "aborted", exitCode: null,
      stdout: `READY:${pid}\ncleanup-out\n`, stderr: "cleanup-err\n" });
    expect(pidError(pid)).toBe("ESRCH");
    expect(getEventListeners(controller.signal, "abort")).toHaveLength(0);
    const snapshot = { stdout, stderr };
    await nextTurn();
    expect({ stdout, stderr }).toEqual(snapshot);
    expect(snapshot).toEqual({ stdout: result.stdout, stderr: result.stderr });
  });

  it("UTF-8 分段写入：收到两个流的 ASCII 前缀后才写剩余字节", async () => {
    const text = "你好\n";
    const program = `
      const bytes = Buffer.from(${JSON.stringify(text)});
      const hold = setInterval(() => {}, 1000);
      process.once('SIGUSR2', () => {
        process.stdout.write(bytes.subarray(1));
        process.stderr.write(bytes.subarray(1));
        clearInterval(hold);
      });
      process.stdout.write(Buffer.concat([Buffer.from('OUT:'), bytes.subarray(0, 1)]));
      process.stderr.write(Buffer.concat([Buffer.from('ERR:'), bytes.subarray(0, 1)]));
    `;
    let pid: number | undefined;
    let stdout = "";
    let stderr = "";
    let released = false;
    function release() {
      if (!released && stdout === "OUT:" && stderr === "ERR:" && pid !== undefined) {
        released = true;
        process.kill(pid, "SIGUSR2");
      }
    }
    const result = await within(run(process.execPath, ["-e", program], {
      onSpawn(value) { pid = value; },
      onStdout(chunk) { stdout += chunk; release(); },
      onStderr(chunk) { stderr += chunk; release(); },
    }));
    expect(released).toBe(true);
    expect(result).toEqual({ status: "exited", exitCode: 0, stdout: `OUT:${text}`, stderr: `ERR:${text}` });
    expect({ stdout, stderr }).toEqual({ stdout: result.stdout, stderr: result.stderr });
  });
});

describe("工具结果封装", () => {
  it.each([0, 1, 2, 3, 7, 42])("退出码 %i 按是否非零标错，保留 details 和文本", async code => {
    const tool = createProcessTool();
    expect(tool.name).toBe("run_process");
    const result = await tool.execute("mapping", {
      executable: process.execPath,
      args: ["-e", `process.stdout.write('output');process.stderr.write('diagnostic');process.exitCode=${code}`],
    });
    expect(result.isError).toBe(code !== 0);
    expect(result.details).toEqual({ status: "exited", exitCode: code, stdout: "output", stderr: "diagnostic" });
    expect(result.content).toEqual([{ type: "text", text: expect.stringContaining(`exit ${code}`) }]);
    expect(result.content[0]).toMatchObject({ text: expect.stringContaining("output") });
    expect(result.content[0]).toMatchObject({ text: expect.stringContaining("diagnostic") });
  });

  it("前置取消返回错误结果，保留完整 RunResult", async () => {
    const controller = new AbortController();
    controller.abort();
    const result = await createProcessTool().execute("cancel", {
      executable: process.execPath, args: [worker, "hold"],
    }, controller.signal);
    expect(result.isError).toBe(true);
    expect(result.details).toEqual({ status: "aborted", exitCode: null, stdout: "", stderr: "" });
    expect(result.content[0]).toMatchObject({ type: "text", text: expect.stringContaining("aborted") });
  });
});

// 只产出协议事件，由真实 Agent 校验、分发 toolCall；不直接调用工具。
function modelTransport(commands: { executable: string; args: string[] }[]) {
  const calls: { signal: AbortSignal | undefined; lastRole: string | undefined }[] = [];
  let nextCommand = 0;
  const streamFn: StreamFn = (_model, context, options) => {
    const signal = options?.signal;
    const lastRole = context.messages.at(-1)?.role;
    calls.push({ signal, lastRole });
    const stream = new AssistantMessageEventStream();
    queueMicrotask(() => {
      if (signal?.aborted) {
        const message = { ...assistant(""), stopReason: "aborted" as const, errorMessage: "Operation aborted" };
        stream.push({ type: "error", reason: "aborted", error: message });
      } else if (lastRole === "user" && nextCommand < commands.length) {
        const command = commands[nextCommand++];
        const message = { ...assistant(""), stopReason: "toolUse" as const,
          content: [{ type: "toolCall" as const, id: `process-${nextCommand}`, name: "run_process", arguments: command }] };
        stream.push({ type: "done", reason: "toolUse", message });
      } else {
        stream.push({ type: "done", reason: "stop", message: assistant("执行完成") });
      }
    });
    return stream;
  };
  return { streamFn, calls };
}

describe("真实 Agent 集成（模型模拟，进程真实）", () => {
  it.each(["fail", "missing"])("%s 通过 Agent 变成错误 toolResult", async mode => {
    const command = mode === "fail"
      ? { executable: process.execPath, args: [worker, "fail"] }
      : { executable: join(tempDirectory(), "missing"), args: [] };
    const { streamFn } = modelTransport([command]);
    const agent = new Agent({ initialState: { model, tools: [createProcessTool()] }, streamFn });
    await within(keep(agent.prompt("执行失败场景")));
    await within(agent.waitForIdle());
    const results = agent.state.messages.filter(message => message.role === "toolResult");
    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({ toolName: "run_process", isError: true,
      details: mode === "fail" ? { status: "exited", exitCode: 7, stderr: "intentional failure\n" } : {} });
    if (mode === "missing") {
      expect(results[0].content[0]).toMatchObject({ type: "text", text: expect.stringContaining("ENOENT") });
    }
    expect(agent.state.isStreaming).toBe(false);
  });

  it("READY 后 agent.abort：错误结果与进程回收，同一 Agent 再完成正常工具调用", async () => {
    const { path, ready } = readyFromFile(tempDirectory());
    const { streamFn, calls } = modelTransport([
      { executable: process.execPath, args: [worker, "hold", path] },
      { executable: process.execPath, args: [worker, "success"] },
    ]);
    const agent = new Agent({ initialState: { model, tools: [createProcessTool()] }, streamFn });
    const events: AgentEvent[] = [];
    agent.subscribe(event => { events.push(event); });
    const firstRun = keep(agent.prompt("启动后取消"));
    try {
      const pid = await within(ready);
      expect(pidError(pid)).toBeUndefined();
      const firstSignal = agent.signal;
      expect(firstSignal?.aborted).toBe(false);
      agent.abort();
      await within(firstRun);
      await within(agent.waitForIdle());
      expect(pidError(pid)).toBe("ESRCH");
      expect(firstSignal?.aborted).toBe(true);
      expect(getEventListeners(firstSignal!, "abort")).toHaveLength(0);
      expect(agent.state.isStreaming).toBe(false);
      expect(agent.state.pendingToolCalls.size).toBe(0);
      expect(agent.signal).toBeUndefined();
      const cancelled = agent.state.messages.find(message => message.role === "toolResult");
      expect(cancelled).toMatchObject({ role: "toolResult", toolName: "run_process", isError: true,
        details: { status: "aborted", exitCode: null, stdout: `READY:${pid}\n`, stderr: "" } });
      expect(cancelled?.content[0]).toMatchObject({ text: expect.stringContaining(`READY:${pid}`) });
      expect(cancelled?.content[0]).toMatchObject({ text: expect.stringContaining("aborted") });
      expect(agent.state.messages.at(-1)).toMatchObject({ role: "assistant", stopReason: "aborted" });
      expect(events.filter(event => event.type === "agent_end")).toHaveLength(1);
      expect(calls.map(call => call.signal?.aborted)).toEqual([true, true]);

      await within(keep(agent.prompt("再执行正常命令")));
      await within(agent.waitForIdle());
      const results = agent.state.messages.filter(message => message.role === "toolResult");
      expect(results).toHaveLength(2);
      expect(results[1]).toMatchObject({ isError: false,
        details: { status: "exited", exitCode: 0, stdout: "你好\n", stderr: "diagnostic\n" } });
      expect(agent.state.messages.at(-1)).toMatchObject({ role: "assistant", stopReason: "stop",
        content: [{ type: "text", text: "执行完成" }] });
      expect(calls).toHaveLength(4);
      expect(calls[2].signal).not.toBe(firstSignal);
      expect(calls[2].signal?.aborted).toBe(false);
      expect(events.filter(event => event.type === "tool_execution_end").map(event => event.isError)).toEqual([true, false]);
      expect(events.filter(event => event.type === "agent_end")).toHaveLength(2);
      expect(agent.state.isStreaming).toBe(false);
      expect(agent.state.pendingToolCalls.size).toBe(0);
    } finally {
      agent.abort(); // 失败时由 afterEach 读取 READY 文件并兜底回收进程。
    }
  });
});
