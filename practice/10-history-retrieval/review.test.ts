// AI 编写的审查用例，全部通过公共 leafId 配置调用。
import { readFileSync } from "node:fs";
import { expect, it } from "../../repos/pi-mono/node_modules/vitest/dist/index.js";
import { SessionManager } from "../../repos/pi-mono/packages/coding-agent/src/core/session-manager.ts";
import { fauxAssistantMessage } from "../../repos/pi-mono/packages/ai/src/providers/faux.ts";
import createHistoryTools from "./history-tools.ts";
import { createHistoryFixture } from "./fixtures.ts";

type Result = { isError?: boolean; content: Array<{ type: string; text?: string }> };
type Tool = { name: string; execute(id: string, params: Record<string, string>): Promise<Result> };
type Options = { cwd: string; sources: Array<{ key: string; file: string; leafId: string }> };

async function setup(options: Options) {
  const tools = await createHistoryTools(options);
  return async (name: string, params: Record<string, string>) => {
    const tool = tools.find(t => t.name === name) as unknown as Tool;
    return tool.execute("review-call", params);
  };
}
function json(result: Result) { return JSON.parse(result.content[0].text!); }

it("公共契约：接受 fixtures 提供的 leafId 配置", async () => {
  const f = createHistoryFixture();
  try {
    const call = await setup(f);
    expect(json(await call("search_history", { query: "Redis" })).hits).toHaveLength(1);
  } finally { f.dispose(); }
});

it("诊断：指定分支、cwd、压缩前原文、120 字预览、原文件不变", async () => {
  const f = createHistoryFixture();
  const before = f.sources.map(s => readFileSync(s.file, "utf8"));
  try {
    const call = await setup(f);
    const hits = json(await call("search_history", { query: " 缓存 " })).hits;
    expect(hits.map((h: { entryId: string }) => h.entryId)).toEqual([f.ids.question, f.ids.decision]);
    expect(hits[1].preview).toHaveLength(120);
    const read = json(await call("read_history", { source: hits[1].source, entryId: hits[1].entryId }));
    expect(read.text).toContain("Redis");
    expect(read.text.length).toBeGreaterThan(120);
    for (const params of [
      { source: "design", entryId: f.ids.discarded },
      { source: "other", entryId: f.ids.otherLeaf },
      { source: "missing", entryId: f.ids.question },
      { source: "design", entryId: "missing" },
    ]) {
      const result = await call("read_history", params);
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("HISTORY_NOT_FOUND");
    }
    expect(json(await call("search_history", { query: "Redis" })).hits).toHaveLength(1);
    expect(f.sources.map(s => readFileSync(s.file, "utf8"))).toEqual(before);
  } finally { f.dispose(); }
});

it("诊断：大小写、无匹配、空查询、sources 顺序和五项上限", async () => {
  const f = createHistoryFixture();
  try {
    const session = SessionManager.open(f.sources[0].file);
    const ids = Array.from({ length: 6 }, (_, i) => session.appendMessage(fauxAssistantMessage(`needle ${i}`)));
    const call = await setup({ cwd: f.cwd, sources: [
      { ...f.sources[0], key: "first", leafId: ids[0] },
      { ...f.sources[0], key: "second", leafId: ids[5] },
    ] });
    for (const query of ["needle", " NEEDLE "]) {
      expect(json(await call("search_history", { query })).hits.map((h: { source: string; entryId: string }) => [h.source, h.entryId]))
        .toEqual([["first", ids[0]], ...ids.slice(0, 4).map(id => ["second", id])]);
    }
    expect(json(await call("search_history", { query: "absent" }))).toEqual({ hits: [] });
    for (const query of ["", "   "]) await expect(call("search_history", { query })).rejects.toBeDefined();
  } finally { f.dispose(); }
});

it("诊断：只连接文本块，thinking/toolCall 不贡献换行", async () => {
  const f = createHistoryFixture();
  try {
    const session = SessionManager.open(f.sources[0].file);
    const id = session.appendMessage(fauxAssistantMessage([
      { type: "thinking", thinking: "secret" },
      { type: "text", text: "alpha" },
      { type: "toolCall", id: "old-call", name: "old_tool", arguments: {} },
      { type: "text", text: "beta" },
    ]));
    const call = await setup({ cwd: f.cwd, sources: [{ ...f.sources[0], leafId: id }] });
    expect(json(await call("read_history", { source: "design", entryId: id })).text).toBe("alpha\nbeta");
    expect(json(await call("search_history", { query: "alpha\nbeta" })).hits).toHaveLength(1);
  } finally { f.dispose(); }
});

it("诊断：未配置来源 toString 也返回 HISTORY_NOT_FOUND", async () => {
  const f = createHistoryFixture();
  try {
    const call = await setup(f);
    const result = await call("read_history", { source: "toString", entryId: f.ids.question });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("HISTORY_NOT_FOUND");
  } finally { f.dispose(); }
});

it("正文保真：文本块中的空白保留，只有非文本块被排除", async () => {
  const f = createHistoryFixture();
  try {
    const session = SessionManager.open(f.sources[0].file);
    const id = session.appendMessage(fauxAssistantMessage([
      { type: "text", text: "alpha" },
      { type: "text", text: " " },
      { type: "text", text: "" },
      { type: "text", text: "beta" },
    ]));
    const call = await setup({ cwd: f.cwd, sources: [{ ...f.sources[0], leafId: id }] });
    const expected = "alpha\n \n\nbeta";
    expect(json(await call("read_history", { source: "design", entryId: id })).text).toBe(expected);
    expect(json(await call("search_history", { query: expected })).hits).toHaveLength(1);
  } finally { f.dispose(); }
});

it("诊断：合法来源别名 __proto__ 可以搜索读取", async () => {
  const f = createHistoryFixture();
  try {
    const call = await setup({ cwd: f.cwd, sources: [{ ...f.sources[0], key: "__proto__" }] });
    const hit = json(await call("search_history", { query: "Redis" })).hits[0];
    expect(hit.source).toBe("__proto__");
    expect(json(await call("read_history", { source: hit.source, entryId: hit.entryId })).text).toContain("Redis");
  } finally { f.dispose(); }
});
