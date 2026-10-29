# 08：按变化原因拆分职责（AI 示例）

这是用户请求的讲解示范，未替换 rules-extension.ts，也未作为运行通过的实现。复用现有 getRulesList 和 set_rule/remove_rule 存储格式；不改变逆序恢复算法，不引入新框架、类或目录。

## 当前值得拆开的部分

handler 同时包含字符串切片、参数校验、历史读取、持久化和 UI 通知。以后修改命令格式时，会在读写会话的分支中改字符串处理；这才是本例拆分的具体理由。getRulesList 已经独立且不产生副作用，可以先保留，名字改成 restoreRules 更能表达从历史重建状态的含义。

先在同一文件形成三个边界：parseRulesCommand 只解析和校验；executeRulesCommand 处理已合法的命令及 pi 副作用；formatRules 只格式化。入口负责把它们接起来。不要求每个函数都少于某个行数。

## 解析结果表达“哪些参数已经合法”

```ts
type RulesCommand =
  | { kind: "list" }
  | { kind: "get"; key: string }
  | { kind: "remove"; key: string }
  | { kind: "set"; key: string; value: string };

type ParseResult =
  | { ok: true; command: RulesCommand }
  | { ok: false; message: string };

function parseRulesCommand(input: string): ParseResult {
  // 保留当前按普通空格分隔的方式；内部 value 空格不会被重组。
  const args = input.trim();
  const commandEnd = args.indexOf(" ");
  const kind = commandEnd === -1 ? args : args.slice(0, commandEnd);
  const rest = commandEnd === -1 ? "" : args.slice(commandEnd).trim();

  if (kind === "list") return { ok: true, command: { kind } };
  if (kind !== "get" && kind !== "remove" && kind !== "set") {
    return { ok: false, message: "用法：/rules set/list/remove/get" };
  }

  const keyEnd = rest.indexOf(" ");
  const key = keyEnd === -1 ? rest : rest.slice(0, keyEnd);
  const value = keyEnd === -1 ? "" : rest.slice(keyEnd).trim();
  if (!/^[a-z][a-z0-9-]{0,31}$/.test(key)) {
    return { ok: false, message: "key 必须以小写字母开头，只含小写字母、数字和连字符，长度 1～32" };
  }
  if (kind === "set") {
    if (!value) return { ok: false, message: "值不能为空" };
    return { ok: true, command: { kind, key, value } };
  }
  return { ok: true, command: { kind, key } };
}
```

这里的联合类型不只是写得更复杂：list 不需要 key，set 一定带 value，后续执行函数不再猜测参数是否缺失。输入错误是正常命令结果，不必用异常处理。

## 执行层保留直接的 pi 调用

以下使用真实的 ExtensionAPI、ExtensionCommandContext 类型（从当前项目同一 pi 类型入口导入）。getRulesList 复用用户现有函数，不在示范中重写。

```ts
function formatRules(rules: Record<string, string>): string {
  return Object.entries(rules)
    .map(([key, value]) => `${key}: ${value}`)
    .join("\n");
}

function executeRulesCommand(
  command: RulesCommand,
  pi: ExtensionAPI,
  ctx: ExtensionCommandContext,
): void {
  if (command.kind === "set") {
    pi.appendEntry("set_rule", { [command.key]: command.value });
    ctx.ui.notify(`${command.key}: ${command.value} 保存成功`);
    return;
  }

  const rules = getRulesList(ctx.sessionManager.getEntries());
  switch (command.kind) {
    case "list":
      ctx.ui.notify(formatRules(rules) || "数据为空");
      return;
    case "get":
      ctx.ui.notify(
        Object.hasOwn(rules, command.key)
          ? `${command.key}: ${rules[command.key]}`
          : `不存在 ${command.key} 的值，请检查`,
      );
      return;
    case "remove":
      if (!Object.hasOwn(rules, command.key)) {
        ctx.ui.notify(`未找到 ${command.key}`);
        return;
      }
      pi.appendEntry("remove_rule", { [command.key]: "" });
      ctx.ui.notify(`${command.key} 移除成功`);
      return;
  }
}

// 放在 rulesExtension(pi) 中：
pi.registerCommand("rules", {
  description: "管理当前会话约定",
  handler: async (args, ctx) => {
    const result = parseRulesCommand(args);
    if (!result.ok) {
      ctx.ui.notify(result.message, "error");
      return;
    }
    executeRulesCommand(result.command, pi, ctx);
  },
});
```

这一步有意让执行层仍依赖 pi：整个功能就是一个 pi 扩展，目前没有多存储后端或跨框架复用需求，无需为了“解耦”增加 repository/service 类。解析和格式化已经能脱离 pi 使用；执行流程仍集中可读。

通知排版与模型区块可以使用不同 formatter。若复用上面的带空格格式，现有模型区块精确字符串断言也需同步调整；这是排版变化，不是业务失败。

## 与拆分同时值得清理的地方

- 移除调试 console.log、废弃注释和空类型 import。
- 当前错误提示“子命令不存在 key 必须…”混合了两个原因，应该直接说明 key 格式问题。此前 AI 测试的关键词匹配过窄，不能为迎合断言往文案里塞词；未来改文案时按契约同步修正测试。
- 当前 before_agent_start 生效依赖对 event.systemPromptOptions.sections 的修改。已核对当前 runner：返回的 systemPromptOptions 没被该分支读取，sessions 也不是 sections。应先解释并保留真实的生效路径，再去掉无效返回字段；这属于 API 理解问题，单纯多拆几个函数不会解决。

如采用示例，属于 AI 提供结构方案。跑通它能证明集成和审查结果，不能直接记作用户独立设计了职责边界。
