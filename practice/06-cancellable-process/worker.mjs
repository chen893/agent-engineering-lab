// AI 提供测试子进程：不启动后代进程，只可写测试传入的 READY 通知文件。
import { renameSync, writeFileSync } from "node:fs";

const mode = process.argv[2];
if (mode === "success") {
  process.stdout.write("你好\n");
  process.stderr.write("diagnostic\n");
} else if (mode === "fail") {
  process.stderr.write("intentional failure\n");
  process.exitCode = 7;
} else if (mode === "hold") {
  process.stdout.write(`READY:${process.pid}\n`);
  // 工具不暴露输出订阅；仅供 Agent 测试同步，不参与被测取消逻辑。
  const readyFile = process.argv[3];
  if (readyFile) {
    writeFileSync(`${readyFile}.tmp`, `READY:${process.pid}\n`);
    renameSync(`${readyFile}.tmp`, readyFile);
  }
  setInterval(() => {}, 1000);
} else {
  process.stderr.write("unknown mode\n");
  process.exitCode = 2;
}
