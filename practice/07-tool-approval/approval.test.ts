// AI 仅建立运行入口；用户先在 design.md 选择验证方式，再替换此占位。
import {
  expect,
  it,
  describe,
} from "../../repos/pi-mono/node_modules/vitest/dist/index.js";
import { agentLoop } from "../../repos/pi-mono/packages/agent/src/agent-loop.js";
import { createApprovalSession } from "./approval-session.js";
import { createFixture } from "./fixtures.js";
it.todo("用户设计并实现真实 Agent 的审批验收，覆盖 README 契约");

// 审批通过，审批拒绝，审批超时，重复审批，用户aborted后审批
describe("异步写入审批: ", async () => {
  let currentFixture: ReturnType<typeof createFixture> | null = null;

  it("场景一： 制度操作直通，不触发审批", async () => {
    currentFixture = createFixture([
      { id: "call_1", name: "read_note", arguments: {} },
    ]);
    let requestTriggered = false;

    const session = createApprovalSession({
      fixture: currentFixture,
      onRequest: () => {
        requestTriggered = true;
      },
    });
    await session.agent.prompt("读一下笔记");
    await session.agent.waitForIdle();

    expect(requestTriggered).toBe(false);
    expect(session.pending).toBeNull();
    expect(currentFixture.executions).toHaveLength(1);
  });

  it("场景二： 写入操作先挂起等待，同意后才真正修改文件", async () => {
    const writeContent = "修改后的内容";
    currentFixture = createFixture([
      {
        id: "call-1",
        name: "write_note",
        arguments: { content: writeContent },
      },
    ]);

    let resolveRequest!: (req: any) => void;
    const requestPromise = new Promise<any>((resolve) => {
      resolveRequest = resolve;
    });
    const session = createApprovalSession({
      fixture: currentFixture,
      onRequest: (req) => {
        resolveRequest(req);
        session.decide(req.requestId, { kind: "approve" });
      },
    });
    const promptPromise = session.agent.prompt("帮我改笔记");

    const req = await requestPromise;

    session.agent.waitForIdle();
    expect(currentFixture.executions.length).toBe(1);
    expect(currentFixture.snapshot).toBe(writeContent);
    expect(session.pending).not.toBeNull();
  });

  it("场景三：用户aborted 后审批", async () => {
    currentFixture = createFixture([
      {
        id: "call_1",
        name: "read_note",
        arguments: {},
      },
      {
        id: "call_2",
        name: "write_note",
        arguments: {
          content: "这是一个测试",
        },
      },
    ]);
    let notifyRequest!: () => void;
    let requestPromise = new Promise<void>((resolve) => {
      notifyRequest = resolve;
    });

    try {
      const initialContent = currentFixture.snapshot();

      const session = createApprovalSession({
        fixture: currentFixture,
        onRequest: async (pending) => {
          const decide = session.decide;
          notifyRequest();
        },
      });
      const { agent } = session;

      await agent.prompt("读取当前文件");

      expect(session.pending).toBeNull();
      expect(currentFixture?.executions?.length).toBe(1);

      const writePromise = agent.prompt(
        '给当前文件的末尾添加一行代码 “hello world"',
      );

      await requestPromise;

      console.log("currentFixture", currentFixture.executions);
      expect(session.pending).not.toBeNull();

      const requestId = session.pending!.requestId;

      await agent.abort();
      expect(session.decide(requestId, { kind: "approve" })).toBe(false);
      await agent.waitForIdle();

      expect(session.pending).toBeNull();
      expect(currentFixture?.executions?.length).toBe(1);
      expect(currentFixture.executions[0].name).toBe("read_note");
      expect(currentFixture.snapshot).toBe(initialContent);
    } catch (error) {
      currentFixture.dispose();
      // requestPromise = null;
    }
  });

  it("拒绝审批后再次拒绝", async () => {
    currentFixture = createFixture([
      {
        id: "call_1",
        name: "write_note",
        arguments: { content: "content" },
      },
    ]);

    const session = createApprovalSession({
      fixture: currentFixture,
      onRequest: () => {},
    });

    const requestId = session.pending!.requestId;
    session.agent.prompt("写一个文件");
    const firstDecide = session.decide(requestId, {
      kind: "reject",
      reason: "拒绝测试",
    });
    const decide = session.decide(requestId, {
      kind: "reject",
      reason: "二次拒绝",
    });

    await session.agent.waitForIdle();
    expect(firstDecide).toBe(true);
    expect(decide).toBe(false);
    expect(currentFixture.executions.length).toBe(0);
  });
});
//
