// 用户完成了初版真实加载、AgentSession 组装、命令分发及请求快照检查。
// AI 在本轮补齐契约测试、修正断言，并集中管理通知捕获与失败路径清理。
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "../../repos/pi-mono/node_modules/vitest/dist/index.js";
import { Agent } from "../../repos/pi-mono/packages/agent/src/agent.ts";
import { AgentSession } from "../../repos/pi-mono/packages/coding-agent/src/core/agent-session.ts";
import { DefaultResourceLoader } from "../../repos/pi-mono/packages/coding-agent/src/core/resource-loader.ts";
import { SessionManager } from "../../repos/pi-mono/packages/coding-agent/src/core/session-manager.ts";
import { SettingsManager } from "../../repos/pi-mono/packages/coding-agent/src/core/settings-manager.ts";
import { createFixture, createTestUiContext } from "./fixtures.ts";

const extensionPath = fileURLToPath(new URL("./rules-extension.ts", import.meta.url));
const projectInstructions = "PROJECT_SENTINEL_08: Preserve these original project instructions.";

describe("会话约定：README 契约集成验收", () => {
  let fixture: Awaited<ReturnType<typeof createFixture>>;
  const sessions = new Set<AgentSession>();
  let extensionErrors: unknown[];

  beforeEach(async () => {
    fixture = await createFixture();
    extensionErrors = [];
    const extensionsDir = join(fixture.cwd, ".pi", "extensions");
    mkdirSync(extensionsDir, { recursive: true });
    copyFileSync(extensionPath, join(extensionsDir, "rules-extension.ts"));
    writeFileSync(join(fixture.cwd, "AGENTS.md"), projectInstructions);
  });

  afterEach(async () => {
    try {
      for (const session of sessions) {
        await session.abort();
        session.dispose();
      }
      expect.soft(extensionErrors).toEqual([]);
      expect(readFileSync(join(fixture.cwd, "AGENTS.md"), "utf8")).toBe(projectInstructions);
    } finally {
      sessions.clear();
      fixture.dispose();
    }
  });

  async function open(manager = SessionManager.inMemory(fixture.cwd)) {
    const loader = new DefaultResourceLoader({
      cwd: fixture.cwd, agentDir: fixture.agentDir,
      noSkills: true, noPromptTemplates: true, noThemes: true,
    });
    await loader.reload();
    expect(loader.getExtensions().extensions).toHaveLength(1);
    expect(loader.getExtensions().errors).toEqual([]);
    const agent = new Agent({
      streamFn: (model, context, options) => fixture.modelRuntime.streamSimple(model, context, options),
      getApiKey: () => "offline-fixture-key",
      initialState: { model: fixture.model, tools: [] },
    });
    const session = new AgentSession({
      agent, sessionManager: manager, settingsManager: SettingsManager.inMemory(),
      cwd: fixture.cwd, modelRuntime: fixture.modelRuntime, resourceLoader: loader,
    });
    sessions.add(session);
    const notices: string[] = [];
    await session.bindExtensions({
      uiContext: createTestUiContext({ notify: (message) => notices.push(message) }),
      onError: (error) => extensionErrors.push(error),
    });
    return { session, manager, notices, loader };
  }

  type Harness = Awaited<ReturnType<typeof open>>;
  async function command(h: Harness, text: string) {
    const requestsBefore = fixture.requests.length;
    const noticesBefore = h.notices.length;
    await h.session.prompt(text);
    expect(fixture.requests).toHaveLength(requestsBefore);
    expect(h.notices.length).toBeGreaterThan(noticesBefore);
    return h.notices.slice(noticesBefore).join("\n");
  }

  async function prompt(h: Harness) {
    const before = fixture.requests.length;
    fixture.queueReplies();
    await h.session.prompt("检查本轮约定");
    expect(fixture.requests).toHaveLength(before + 1);
    const result = fixture.requests[before].systemPrompt;
    expect(result).toContain(projectInstructions);
    expect(result).toContain("You are an expert coding assistant");
    return result;
  }

  function rulesBlock(systemPrompt: string) {
    // 本实现选择的区块名；契约允许其他排版，改格式时同步这一观察工具即可。
    expect(systemPrompt.match(/<session_rules>/g)).toHaveLength(1);
    const match = systemPrompt.match(/<session_rules>\s*([\s\S]*?)\s*<\/session_rules>/);
    expect(match).not.toBeNull();
    return match![1];
  }

  it("增改查删、删除不存在的键：通知正确，所有命令不调用模型", async () => {
    const h = await open();
    expect(await command(h, "/rules list")).toMatch(/空/);
    await command(h, "/rules set package-manager 使用 npm");
    await command(h, "/rules set language 回复中文");
    await command(h, "/rules set package-manager 使用 pnpm");
    const listing = await command(h, "/rules list");
    expect(listing).toContain("package-manager: 使用 pnpm");
    expect(listing).toContain("language: 回复中文");
    expect(listing).not.toContain("使用 npm");
    expect(await command(h, "/rules remove absent")).toMatch(/未找到/);
    expect(await command(h, "/rules list")).toBe(listing);
    await command(h, "/rules remove language");
    expect(await command(h, "/rules list")).not.toContain("language");
    await command(h, "/rules remove package-manager");
    expect(await command(h, "/rules list")).toMatch(/空/);
  });

  it.each(["/rules", "/rules unknown", "/rules set", "/rules set language", "/rules set language   ", "/rules remove"])(
    "非法输入 %s：通知错误/用法且状态不变", async (input) => {
      const h = await open();
      await command(h, "/rules set language 保留原值");
      const before = await command(h, "/rules list");
      const notice = await command(h, input);
      expect.soft(notice).toMatch(/用法|错误|参数|缺少|不存在|未找到|不能为空|usage|invalid|required/i);
      expect(await command(h, "/rules list")).toBe(before);
      expect(rulesBlock(await prompt(h))).toBe("language:保留原值");
    },
  );

  it("value 去掉首尾空白，保留内部空格", async () => {
    const h = await open();
    await command(h, "/rules set package-manager   使用  pnpm   ");
    expect(rulesBlock(await prompt(h))).toBe("package-manager:使用  pnpm");
  });

  it("合法 key 与子命令同名时，仍正确截取 value", async () => {
    const h = await open();
    await command(h, "/rules set set 唯一约定值");
    expect(rulesBlock(await prompt(h))).toBe("set:唯一约定值");
  });

  it("当前请求反映更新、删除和重新添加，连续轮次不累积", async () => {
    const h = await open();
    await command(h, "/rules set project-name OLD_VALUE_08");
    await command(h, "/rules set path ./retained-path-08");
    const initial = rulesBlock(await prompt(h));
    expect(initial).toContain("project-name:OLD_VALUE_08");
    expect(rulesBlock(await prompt(h))).toBe(initial);
    await command(h, "/rules set project-name NEW_VALUE_08");
    const updated = rulesBlock(await prompt(h));
    expect(updated).toContain("project-name:NEW_VALUE_08");
    expect(updated).not.toContain("OLD_VALUE_08");
    expect(updated.match(/project-name:/g)).toHaveLength(1);
    await command(h, "/rules remove project-name");
    expect(rulesBlock(await prompt(h))).toBe("path:./retained-path-08");
    await command(h, "/rules set project-name RE_ADDED_08");
    expect(rulesBlock(await prompt(h))).toContain("project-name:RE_ADDED_08");
  });

  it("初始空状态和删除最后一条后均不添加约定区块", async () => {
    const h = await open();
    expect.soft((await prompt(h)).includes("<session_rules>")).toBe(false);
    await command(h, "/rules set language 中文");
    await command(h, "/rules remove language");
    expect((await prompt(h)).includes("<session_rules>")).toBe(false);
  });

  it("契约容量内支持十条各二百字的约定", async () => {
    const h = await open();
    const value = "约".repeat(200);
    for (let i = 0; i < 10; i++) await command(h, `/rules set key-${i} ${value}`);
    const block = rulesBlock(await prompt(h));
    expect(block.split("\n")).toHaveLength(10);
    for (let i = 0; i < 10; i++) expect(block).toContain(`key-${i}:${value}`);
  });

  it("真正落盘后用新 manager/扩展实例恢复；另一个会话隔离，再次打开原会话仍保留", async () => {
    const original = await open(SessionManager.create(fixture.cwd, fixture.sessionDir));
    await prompt(original); // 满足 README 的持久化前置条件。
    await command(original, "/rules set package-manager OLD_DISK_08");
    await command(original, "/rules set package-manager PNPM_DISK_08");
    await command(original, "/rules set language DELETED_DISK_08");
    await command(original, "/rules remove language");
    const file = original.manager.getSessionFile()!;
    expect(readFileSync(file, "utf8")).toContain("PNPM_DISK_08");
    original.session.dispose();
    sessions.delete(original.session);

    const restored = await open(SessionManager.open(file, fixture.sessionDir));
    expect(restored.manager).not.toBe(original.manager);
    expect(restored.loader.getExtensions().extensions[0]).not.toBe(original.loader.getExtensions().extensions[0]);
    const listing = await command(restored, "/rules list");
    expect(listing).toContain("package-manager: PNPM_DISK_08");
    expect(listing).not.toContain("language");
    expect(rulesBlock(await prompt(restored))).toBe("package-manager:PNPM_DISK_08");
    restored.session.dispose();
    sessions.delete(restored.session);

    const other = await open(SessionManager.create(fixture.cwd, fixture.sessionDir));
    expect(await command(other, "/rules list")).toMatch(/空/);
    expect(await prompt(other)).not.toContain("PNPM_DISK_08");
    await command(other, "/rules set language OTHER_SESSION_08");
    other.session.dispose();
    sessions.delete(other.session);

    const reopened = await open(SessionManager.open(file, fixture.sessionDir));
    expect(await command(reopened, "/rules list")).toBe(listing);
    expect(rulesBlock(await prompt(reopened))).toBe("package-manager:PNPM_DISK_08");
  });
});
