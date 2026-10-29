import { spawn } from "node:child_process";
import { StringDecoder } from "node:string_decoder";

export interface RunOptions {
  cwd?: string;
  signal?: AbortSignal;
  onSpawn?: (pid: number) => void;
  onStdout?: (text: string) => void;
  onStderr?: (text: string) => void;
}

export interface RunResult {
  status: "exited" | "aborted";
  exitCode: number | null;
  stdout: string;
  stderr: string;
}

export function runProcess(
  executable: string,
  args: string[],
  options: RunOptions = {},
): Promise<RunResult> {
  const { cwd = process.cwd(), signal, onSpawn, onStdout, onStderr } = options;

  // 1. 调用前已经取消：不创建子进程
  if (signal?.aborted) {
    return Promise.resolve({
      status: "aborted",
      exitCode: null,
      stdout: "",
      stderr: "",
    });
  }

  return new Promise<RunResult>((resolve, reject) => {
    let stdout = "";
    let stderr = "";

    let aborted = false;
    let settled = false;

    // 处理跨 Buffer 的 UTF-8 字符
    const stdoutDecoder = new StringDecoder("utf8");
    const stderrDecoder = new StringDecoder("utf8");

    // 2. 直接启动程序，不经过 shell
    const child = spawn(executable, args, {
      cwd,
      stdio: ["ignore", "pipe", "pipe"],
      shell: false,
    });

    // 3. 清理本次注册的取消监听器
    function cleanup() {
      signal?.removeEventListener("abort", onAbort);
    }

    // 4. 取消时只请求终止，不立即 resolve
    function onAbort() {
      if (settled || aborted) return;

      aborted = true;
      child.kill();
    }

    // 5. 注册取消监听器
    signal?.addEventListener("abort", onAbort);

    // 防止注册监听器前已经发生取消
    if (signal?.aborted) {
      onAbort();
    }

    // 6. 成功启动时报告 PID
    child.on("spawn", () => {
      if (settled) return;

      if (child.pid !== undefined) {
        onSpawn?.(child.pid);
      }
    });

    // 7. 收集标准输出
    child.stdout!.on("data", (chunk: Buffer) => {
      if (settled) return;

      const text = stdoutDecoder.write(chunk);

      if (text) {
        stdout += text;
        onStdout?.(text);
      }
    });

    // 8. 收集错误输出
    child.stderr!.on("data", (chunk: Buffer) => {
      if (settled) return;

      const text = stderrDecoder.write(chunk);

      if (text) {
        stderr += text;
        onStderr?.(text);
      }
    });

    // 9. 启动失败：拒绝 Promise
    child.on("error", (error) => {
      if (settled) return;

      settled = true;
      cleanup();

      reject(error);
    });

    // 10. 等待进程退出、输出流关闭
    child.on("close", (code) => {
      if (settled) return;

      settled = true;
      cleanup();

      // 刷新 UTF-8 解码器
      const stdoutTail = stdoutDecoder.end();
      const stderrTail = stderrDecoder.end();

      if (stdoutTail) {
        stdout += stdoutTail;
        onStdout?.(stdoutTail);
      }

      if (stderrTail) {
        stderr += stderrTail;
        onStderr?.(stderrTail);
      }

      resolve({
        status: aborted ? "aborted" : "exited",
        exitCode: aborted ? null : code,
        stdout,
        stderr,
      });
    });
  });
}
