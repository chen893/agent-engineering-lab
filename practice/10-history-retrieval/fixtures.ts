// AI 提供的非目标设施：真实会话样例，不包含查询实现。
import { mkdtempSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SessionManager } from "../../repos/pi-mono/packages/coding-agent/src/core/session-manager.ts";
import { fauxAssistantMessage } from "../../repos/pi-mono/packages/ai/src/providers/faux.ts";

export function createHistoryFixture() {
  const root = mkdtempSync(join(tmpdir(), "pi-history-"));
  const cwd = join(root, "project");
  const otherCwd = join(root, "other-project");
  const dir = join(root, "sessions");
  for (const path of [cwd, otherCwd, dir]) mkdirSync(path);
  try {
    const session = SessionManager.create(cwd, dir);
    const question = session.appendMessage({ role: "user", content: "缓存方案有哪些取舍？", timestamp: 1 });
    const discarded = session.appendMessage(fauxAssistantMessage("缓存旧分支：使用本地文件。"));
    session.branch(question);
    const decision = session.appendMessage(fauxAssistantMessage("缓存新分支：使用 Redis。" + "需要设置过期时间并保留来源。".repeat(15)));
    const followup = session.appendMessage({ role: "user", content: "继续讨论部署。", timestamp: 2 });
    session.appendCompaction("之前讨论过存储。", followup, 1000);
    const leaf = session.appendMessage(fauxAssistantMessage("部署采用单实例起步。"));
    const other = SessionManager.create(otherCwd, dir);
    const otherLeaf = other.appendMessage(fauxAssistantMessage("缓存其他项目：使用 SQLite。"));
    const file = session.getSessionFile();
    const otherFile = other.getSessionFile();
    if (!file || !otherFile) throw new Error("Fixture files missing");
    return {
      root, cwd,
      sources: [
        { key: "design", file, leafId: leaf },
        { key: "other", file: otherFile, leafId: otherLeaf },
      ],
      ids: { question, discarded, decision, followup, leaf, otherLeaf },
      dispose() { rmSync(root, { recursive: true, force: true }); },
    };
  } catch (error) {
    rmSync(root, { recursive: true, force: true });
    throw error;
  }
}
