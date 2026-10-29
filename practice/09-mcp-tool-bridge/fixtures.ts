// AI 设施：复用 08 离线模型，增加 MCP 子进程配置、协议轨迹与脚本响应。
// 不连接 MCP、不发现/适配工具、不创建用户 Agent。
import { mkdtempSync, mkdirSync, rmSync, existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  fauxAssistantMessage,
  getCurrentSystemPrompt,
  type TranscriptContext,
  type AssistantMessage,
} from "../../repos/pi-mono/packages/ai/src/index.ts";
import { registerFauxProvider } from "../../repos/pi-mono/packages/ai/src/compat.ts";
import { AuthStorage } from "../../repos/pi-mono/packages/coding-agent/src/core/auth-storage.ts";
import { ModelRuntime } from "../../repos/pi-mono/packages/coding-agent/src/core/model-runtime.ts";
import { ModelRegistry } from "../../repos/pi-mono/packages/coding-agent/src/core/model-registry.ts";

export { createTestUiContext } from "../../repos/pi-mono/packages/coding-agent/test/suite/harness.ts";

export async function createFixture(options: {
  docsExtraTool?: boolean;
  issuesFault?: "none" | "initialize" | "call";
} = {}) {
  const root = mkdtempSync(join(tmpdir(), "pi-mcp-bridge-"));
  const cwd = join(root, "workspace");
  const agentDir = join(root, "agent");
  const sessionDir = join(root, "sessions");
  for (const path of [cwd, agentDir, sessionDir]) mkdirSync(path);
  const faux = registerFauxProvider();
  try {
    const model = faux.getModel();
    const credentials = AuthStorage.inMemory();
    await credentials.modify(model.provider, async () => ({
      type: "api_key",
      key: "offline-fixture-key",
    }));
    const modelRuntime = await ModelRuntime.create({
      credentials,
      modelsPath: null,
      allowModelNetwork: false,
    });
    const registry = new ModelRegistry(modelRuntime);
    registry.registerProvider(model.provider, {
      baseUrl: model.baseUrl,
      apiKey: "offline-fixture-key",
      api: faux.api,
      models: faux.models.map((item) => ({
        id: item.id,
        name: item.name,
        api: item.api,
        reasoning: item.reasoning,
        input: item.input,
        inputLimits: item.inputLimits,
        cost: item.cost,
        contextWindow: item.contextWindow,
        maxTokens: item.maxTokens,
        baseUrl: item.baseUrl,
      })),
    });
    const requests: Array<{
      systemPrompt: string;
      context: TranscriptContext;
    }> = [];
    const serverPath = fileURLToPath(new URL("./catalog-server.mjs", import.meta.url));
    const tracePaths = { docs: join(root, "docs.jsonl"), issues: join(root, "issues.jsonl") };
    const servers = [
      { name: "docs", command: process.execPath, args: [serverPath, "docs", tracePaths.docs, "none", String(options.docsExtraTool ?? false)] },
      { name: "issues", command: process.execPath, args: [serverPath, "issues", tracePaths.issues, options.issuesFault ?? "none", "false"] },
    ];
    function readTrace(name: "docs" | "issues"): Array<{ pid: number; server: string; event: string; message?: unknown }> {
      const path = tracePaths[name];
      return existsSync(path) ? readFileSync(path, "utf8").trim().split("\n").filter(Boolean).map((line) => JSON.parse(line)) : [];
    }
    return {
      servers,
      readTrace,
      getApiKey: () => "offline-fixture-key",
      streamFn: (model: Parameters<typeof modelRuntime.streamSimple>[0], context: Parameters<typeof modelRuntime.streamSimple>[1], options?: Parameters<typeof modelRuntime.streamSimple>[2]) => modelRuntime.streamSimple(model, context, options),
      queueResponses(...responses: Array<(context: TranscriptContext) => AssistantMessage>) {
        faux.appendResponses(responses.map((respond) => (context: TranscriptContext) => {
          requests.push({ systemPrompt: getCurrentSystemPrompt(context.messages), context: structuredClone(context) });
          return respond(context);
        }));
      },
      root,
      cwd,
      agentDir,
      sessionDir,
      model,
      modelRuntime,
      requests,
      queueReplies(count = 1) {
        faux.appendResponses(
          Array.from({ length: count }, () => (context: TranscriptContext) => {
            requests.push({
              systemPrompt: getCurrentSystemPrompt(context.messages),
              context: structuredClone(context),
            });
            return fauxAssistantMessage("离线测试回答");
          }),
        );
      },
      dispose() {
        // 调用者先结束并 dispose 自己创建的所有 session，再清理设施。
        // 只用于失败路径兜底。正式测试必须在调用此处之前确认用户 dispose 已释放进程。
        for (const name of ["docs", "issues"] as const) {
          const pid = readTrace(name).find((entry) => entry.event === "started")?.pid;
          if (pid) { try { process.kill(pid, "SIGTERM"); } catch (error) {
            if ((error as NodeJS.ErrnoException).code !== "ESRCH") throw error;
          } }
        }
        faux.unregister();
        rmSync(root, { recursive: true, force: true });
      },
    };
  } catch (error) {
    faux.unregister();
    rmSync(root, { recursive: true, force: true });
    throw error;
  }
}
