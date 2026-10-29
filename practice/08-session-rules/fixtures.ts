// AI 提供非目标设施：临时目录、离线模型、模型输入观测。
// 不创建 AgentSession，不加载用户扩展，不实现任何约定状态。
import { mkdtempSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  fauxAssistantMessage,
  getCurrentSystemPrompt,
  type TranscriptContext,
} from "../../repos/pi-mono/packages/ai/src/index.ts";
import { registerFauxProvider } from "../../repos/pi-mono/packages/ai/src/compat.ts";
import { AuthStorage } from "../../repos/pi-mono/packages/coding-agent/src/core/auth-storage.ts";
import { ModelRuntime } from "../../repos/pi-mono/packages/coding-agent/src/core/model-runtime.ts";
import { ModelRegistry } from "../../repos/pi-mono/packages/coding-agent/src/core/model-registry.ts";

export { createTestUiContext } from "../../repos/pi-mono/packages/coding-agent/test/suite/harness.ts";

export async function createFixture() {
  const root = mkdtempSync(join(tmpdir(), "pi-rules-"));
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
    return {
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
