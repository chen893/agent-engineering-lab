import { spawn } from "node:child_process";

function runSimple(signal) {
  // 思考：如果调用前就已经取消，
  // 这里应该直接返回什么？
  if (signal.aborted) {
    return Promise.resolve({
      status: "aborted",
    });
  }
  return new Promise((resolve, reject) => {
    let stdout = "";
    let stderr = "";
    let aborted = false;

    const child = spawn(process.execPath, [
      "-e",
      "setTimeout(() => console.log('done'), 5000)",
    ]);

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });

    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    // TODO 1:
    // 监听 signal 的 abort 事件
    // 把 aborted 设为 true
    // 调用 child.kill()

    signal.addEventListener("aborted", () => {
      aborted = true;
      child.kill();
    });

    child.on("error", (err) => {
      reject(err);
    });

    child.on("close", (code) => {
      signal.removeEventListener("aborted");
      // TODO 2:
      // 根据 aborted 判断返回什么结果
      // 记得 resolve(...)
      resolve({
        status: aborted ? "aborted" : "exist",
        code: aborted ? null : code,
        stderr: stderr,
        stdout: stdout,
      });
    });
  });
}

const controller = new AbortController();

setTimeout(() => {
  controller.abort();
}, 1000);

const result = await runSimple(controller.signal);

console.log(result);
