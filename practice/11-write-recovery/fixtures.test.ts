// AI 设施自检；这些通过不代表 ticket-coordinator 已实现。
import { expect, it } from "../../repos/pi-mono/node_modules/vitest/dist/index.js";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createTicketService, openJsonStore } from "./fixtures.ts";

it("同样的断连错误可以发生在创建前或创建后", async () => {
  const f = createTicketService();
  f.queueCreate("disconnect-before", "disconnect-after");
  await expect(f.service.create({ requestKey: "a", title: "A" })).rejects.toThrow("CONNECTION_LOST");
  expect(await f.service.lookup("a")).toEqual({ status: "absent" });
  await expect(f.service.create({ requestKey: "b", title: "B" })).rejects.toThrow("CONNECTION_LOST");
  expect(await f.service.lookup("b")).toMatchObject({ status: "found", ticket: { requestKey: "b" } });
  expect(f.tickets).toHaveLength(1);
});

it("服务不去重，盲目再次 create 会产生两个工单", async () => {
  const f = createTicketService();
  const input = { requestKey: "a", title: "A" };
  await f.service.create(input);
  await f.service.create(input);
  expect(f.tickets.map((t) => t.ticketId)).toEqual(["ticket-1", "ticket-2"]);
});

it("拒绝与查询不可用是独立结果，查询不创建工单", async () => {
  const f = createTicketService();
  f.queueCreate("reject");
  expect(await f.service.create({ requestKey: "a", title: "A" })).toEqual({ status: "rejected", reason: "TITLE_REJECTED" });
  f.queueLookup("unavailable");
  expect(await f.service.lookup("a")).toEqual({ status: "unavailable" });
  expect(await f.service.lookup("a")).toEqual({ status: "absent" });
  expect(f.tickets).toEqual([]);
  expect(f.trace.map((x) => x.method)).toEqual(["create", "lookup", "lookup"]);
});

it("重新打开存储后能读取先前写入的数据", () => {
  const root = mkdtempSync(join(tmpdir(), "write-recovery-"));
  try {
    const file = join(root, "state.json");
    const store = openJsonStore<{ value: string }>(file);
    expect(store.read()).toBeUndefined();
    store.write({ value: "persisted" });
    expect(openJsonStore<{ value: string }>(file).read()).toEqual({ value: "persisted" });
  } finally { rmSync(root, { recursive: true, force: true }); }
});
