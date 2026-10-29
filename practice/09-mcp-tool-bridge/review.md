# Node.js 子进程、MCP 与 TypeScript Schema 复习笔记

**适用阶段：** 前端开发者学习 Pi Agent / MCP Agent 源码  
**学习目标：** 能独立阅读 `StdioTransport`，理解 MCP Client 的工作方式，并使用 TypeBox 正确设计 Agent 工具类型。

---

## 一、首先建立完整的知识模型

一个支持本地 MCP Server 的 Agent，可以划分为四层：

```text
Agent
  │
  │ 需要调用某个工具
  ▼
MCP Client（协议层）
  │
  │ 构造 JSON-RPC 请求
  │ 匹配请求与响应
  ▼
StdioTransport（传输层）
  │
  │ spawn() 创建子进程
  │ stdin 写入消息
  │ stdout 接收消息
  ▼
MCP Server（独立进程）
  │
  └── 执行工具并返回结果
```

这些组件的职责不能混淆。

| 组件           | 主要职责                               |
| -------------- | -------------------------------------- |
| Agent          | 决定调用什么工具，使用工具结果继续推理 |
| MCP Client     | 管理 MCP 协议、初始化、请求及响应      |
| StdioTransport | 管理子进程及输入输出通信               |
| MCP Server     | 提供并执行实际工具                     |

**核心认知：MCP Client 和 StdioTransport 不是同一个概念。**

Client 关注协议，Transport 关注如何发送和接收消息。

---

## 二、知识点 1：Node.js 子进程是如何工作的？

### 1. `spawn()` 不会等待子进程执行结束

```ts
import { spawn } from "node:child_process";

const child = spawn("node", ["-e", "console.log('hello')"]);

console.log("主进程继续执行");
```

`spawn()` 返回的是一个 `ChildProcess` 对象。

它并不会同步返回子进程的 stdout 内容，也不会阻塞主线程直到子进程退出。

因此，想获得子进程后续的状态，需要通过事件监听。

### 2. 必须区分三个标准流

```ts
const child = spawn("node", ["server.js"], {
  stdio: ["pipe", "pipe", "pipe"],
});
```

这个数组对应：

```text
stdio[0] = stdin
stdio[1] = stdout
stdio[2] = stderr
```

方向永远是相对于子进程而言：

- `stdin`：子进程接收数据的入口。
- `stdout`：子进程输出正常数据的出口。
- `stderr`：子进程输出错误和诊断信息的出口。

例如：

```ts
child.stdin?.write("hello\n");

child.stdout?.on("data", (chunk) => {
  console.log("收到：", chunk.toString());
});

child.stderr?.on("data", (chunk) => {
  console.error("错误输出：", chunk.toString());
});
```

特别注意：`stderr` 输出内容并不意味着子进程一定执行失败。很多正常运行的程序也会将日志输出到 stderr。

### 3. `pipe` 的意义

`pipe` 表示 Node.js 为指定的标准流建立可供父进程访问的数据通道。

如果使用 `inherit`，子进程将直接使用父进程对应的标准流。

因此：

```ts
stdio: ["pipe", "pipe", "inherit"];
```

意味着：

- 可以向子进程写入 stdin。
- 可以读取子进程的 stdout。
- stderr 直接输出到父进程的 stderr。

---

## 三、知识点 2：为什么要注册大量事件监听器？

Node.js 的子进程是事件驱动的。

需要区分以下事件：

| 事件          | 触发含义                                        |
| ------------- | ----------------------------------------------- |
| `spawn`       | 子进程成功启动                                  |
| `error`       | 进程启动失败、终止请求失败等错误                |
| `exit`        | 子进程已经退出                                  |
| `close`       | 子进程退出或启动失败后，关联的 stdio 流也已关闭 |
| `stdout.data` | 收到一段输出数据                                |
| `stdin.error` | 输入流发生错误                                  |

### 1. `on` 与 `once`

```ts
child.on("close", callback);
child.once("spawn", callback);
```

区别：

- `on`：持续监听，每次事件触发都会调用。
- `once`：只响应第一次事件，随后自动移除监听器。

例如：

```ts
child.stdout?.on("data", handleData);
```

stdout 可能多次产生数据，因此适合使用 `on`。

```ts
child.once("spawn", handleSpawn);
```

一个子进程最多成功启动一次，因此适合使用 `once`。

### 2. `off` 是做什么的？

```ts
child.off("error", onError);
```

它从事件发射器上移除指定的监听器。

要注意：必须传入原来注册的同一个函数引用。

### 3. 为什么 `start()` 要把事件转换成 Promise？

例如：

```ts
await new Promise<void>((resolve, reject) => {
  const onSpawn = () => {
    child.off("error", onError);
    resolve();
  };

  const onError = (error: Error) => {
    child.off("spawn", onSpawn);
    reject(error);
  };

  child.once("spawn", onSpawn);
  child.once("error", onError);
});
```

因为调用方更希望这样使用：

```ts
await transport.start();
```

而不是自己到处注册启动事件监听器。

这实际上是一种非常常见的 Node.js 编程技巧：

**把一次性事件转换成 Promise，把持续发生的事件保留为事件监听。**

需要特别注意：`start()` 成功并不意味着整个 MCP 协议握手完成，只能说明底层进程已经成功启动。

---

## 四、知识点 3：stdout 是流，不是完整消息

这是阅读 `handleStdout()` 最重要的前置知识。

假设服务器发送：

```json
{ "jsonrpc": "2.0", "id": 1, "result": {} }
```

即使服务器一次性写入完整字符串，父进程也不一定只收到一个 `data` 事件。

可能分成：

```text
第一次：{"jsonrpc":"2.0",
第二次："id":1,"result":{}}
第三次：\n
```

因此不能这样做：

```ts
child.stdout?.on("data", (chunk) => {
  JSON.parse(chunk.toString());
});
```

因为 `chunk` 可能不是完整 JSON。

### 正确思路：缓冲与按行拆分

MCP stdio 传输使用按行分隔的 JSON-RPC 消息。

基本算法是：

1. 将新数据追加到 Buffer。
2. 查找换行符 `\n`。
3. 找到后，取出换行符之前的数据。
4. 将这一行解析为 JSON-RPC 消息。
5. 保留剩余数据，等待下次接收。

示例：

```ts
let buffer = Buffer.alloc(0);

function handleData(chunk: Buffer) {
  buffer = Buffer.concat([buffer, chunk]);

  while (true) {
    const index = buffer.indexOf(0x0a);

    if (index === -1) {
      break;
    }

    const line = buffer.subarray(0, index);

    buffer = buffer.subarray(index + 1);

    const text = line.toString("utf8").replace(/\r$/, "");

    if (!text.trim()) continue;

    try {
      const message: unknown = JSON.parse(text);
      console.log("收到消息", message);
    } catch (error) {
      console.error("JSON 解析失败", error);
    }
  }
}
```

这是教学版示例。生产实现还需要考虑：

- 单条消息最大字节数。
- JSON-RPC 数据格式校验。
- 超长消息处理和恢复策略。
- 子进程退出时残留的不完整数据。
- 消息解析错误如何通知上层。

**重要结论：一次 `data` 事件不等于一条完整消息。**

---

## 五、知识点 4：MCP Client 如何等待远端工具返回结果？

传输层提供：

```ts
await transport.send(message);
```

但它只表示消息写入操作完成，不代表服务器执行完成。

假设发送：

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "tools/list"
}
```

服务器稍后返回：

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": {
    "tools": []
  }
}
```

Client 怎么知道这两条消息属于同一个请求？

答案是 **JSON-RPC 的 `id`**。

常见实现会维护一个 Map：

```ts
type PendingRequest = {
  resolve: (value: unknown) => void;
  reject: (reason: Error) => void;
};

const pending = new Map<number, PendingRequest>();
```

发送请求时：

```ts
const id = 1;

const resultPromise = new Promise<unknown>((resolve, reject) => {
  pending.set(id, { resolve, reject });
});

await transport.send({
  jsonrpc: "2.0",
  id,
  method: "tools/list",
});

const result = await resultPromise;
```

接收对应响应时，Client 根据 `id` 查找 Map 并调用 `resolve()` 或 `reject()`。

以上只是原理示例。完整实现还需要处理响应结构、请求 ID 分配、发送失败、错误响应、超时、连接关闭时拒绝待处理请求等问题。

这里要理解一个关键关系：

**Transport 负责发送和接收消息；Client 负责让一问一答的异步通信表现得像普通的 `await` 函数调用。**

---

## 六、知识点 5：如何正确关闭子进程？

不应该认为：

```ts
child.kill();
```

就意味着子进程已经完全退出。

`kill()` 是发出终止请求，不是等待进程结束。

一个更可靠的关闭过程通常包括：

```text
1. 停止发送新请求
2. 关闭 stdin
3. 等待服务器自行退出
4. 超时后发送 SIGTERM
5. 仍未退出时发送 SIGKILL
6. 等待进程和标准流关闭
7. 清理监听器、定时器和状态
```

### 进程组的作用

假设：

```text
Agent
 └── npx
      └── server.js
           └── worker.js
```

如果只终止直接启动的 `npx`，不一定能终止其他进程。

在 macOS/Linux 上，可以通过独立进程组及组信号尝试终止相关进程。

```ts
const child = spawn("node", ["server.js"], {
  detached: true,
  stdio: ["pipe", "pipe", "pipe"],
});
```

在符合条件的 Unix-like 系统上，可以向该进程组发送信号：

```ts
if (child.pid !== undefined) {
  process.kill(-child.pid, "SIGTERM");
}
```

Windows 进程管理机制不同，可能需要 `taskkill /T /F` 等方案。

但是，进程组清理不能保证覆盖所有后代进程，例如主动脱离原进程组的后代。

---

## 七、知识点 6：MCP Server 配置为什么没有 URL？

实验提供：

```ts
type McpServerConfig = {
  name: string;
  command: string;
  args: string[];
};
```

这说明当前任务采用的是本地 stdio 传输方式。

例如：

```ts
const config: McpServerConfig = {
  name: "filesystem",
  command: "node",
  args: ["./filesystem-server.js"],
};
```

这里：

- `name` 是服务的本地标识。
- `command` 是启动程序。
- `args` 是启动程序的参数。

通过下面的代码就可以启动这个服务器：

```ts
const transport = new StdioTransport({
  command: config.command,
  args: config.args,
});

await transport.start();
```

这里的 `start()` 只启动传输层；完整 MCP Client 还需要完成初始化和能力协商，之后才能正常发现并调用工具。

远程 HTTP MCP Server 的配置则通常需要 URL 和相应的 HTTP Transport。

因此：

**当前实验的服务列表是显式配置的，不是让程序自动扫描并发现所有 MCP Server。**

---

## 八、知识点 7：TypeBox Schema 如何转换成 TypeScript 类型？

你之前反复遇到的这个问题，核心是区分两种东西。

- Schema：运行时存在，用于描述和校验数据。
- TypeScript 类型：编译时用于静态类型检查。

TypeBox 同时连接了这两者。

### 1. `Static<typeof schema>`

```ts
import { Type, type Static } from "@sinclair/typebox";

const serverSchema = Type.Object({
  name: Type.String(),
  command: Type.String(),
  args: Type.Array(Type.String()),
});

type ServerConfig = Static<typeof serverSchema>;
```

推导结果：

```ts
type ServerConfig = {
  name: string;
  command: string;
  args: string[];
};
```

### 2. 为什么需要 `typeof`？

因为 `serverSchema` 是一个变量，而 `Static<T>` 接收的是 TypeScript 类型参数。

```ts
// 获取变量的类型
typeof serverSchema;

// 根据 Schema 类型推导数据类型
Static<typeof serverSchema>;
```

### 3. Schema 与 unknown 的区别

```ts
function handleInput(value: unknown) {
  // 不能直接读取 value.name
}
```

`unknown` 表示编译器不知道数据是什么。

如果输入来自不可信来源，可以先进行运行时验证，再获得类型收窄。

```ts
import { Value } from "@sinclair/typebox/value";

function handleInput(value: unknown) {
  if (!Value.Check(serverSchema, value)) {
    throw new Error("Invalid server config");
  }

  // 此时 value 已经通过 Schema 校验
  console.log(value.name);
}
```

如果是内部已知结构的 API，通常直接给函数参数声明推导类型：

```ts
function createServer(config: ServerConfig) {
  console.log(config.command);
}
```

注意：`Static` 不会自动进行运行时校验。类型推导和运行时验证是两项独立工作。

### 4. 动态 Schema 和泛型

如果一个函数接收任意 TypeBox Schema，可以使用泛型：

```ts
import { Type, type Static, type TSchema } from "@sinclair/typebox";

function makeDataType<T extends TSchema>(schema: T, data: Static<T>) {
  return { schema, data };
}

makeDataType(
  Type.Object({
    age: Type.Number(),
  }),
  {
    age: 18,
  },
);
```

这样 Schema 与对应的数据类型建立了静态关联。

---

## 九、知识点 8：设计 `createMcpAgent()` 时应该如何思考？

根据实验要求，函数需要接收：

```ts
createMcpAgent({
  servers,
  model,
  streamFn,
  getApiKey,
});
```

这实际上涉及两类配置：

**第一类：MCP 服务配置**

负责决定启动什么服务、如何连接、可以获取什么工具。

**第二类：Agent 模型配置**

负责决定使用什么模型、怎样进行推理和获取 API Key。

在类型设计上，应优先复用现有 Agent 的公开类型，而不是把 `model`、`streamFn`、`getApiKey` 都声明为 `unknown`。

例如，如果 Agent 已经导出了配置类型：

```ts
type AgentModelOptions = Pick<AgentOptions, "model" | "streamFn" | "getApiKey">;

interface CreateMcpAgentOptions extends AgentModelOptions {
  servers: McpServerConfig[];
}
```

这段代码成立的前提是项目中的 `AgentOptions` 确实定义了这些属性；应以实际源码为准。

好处是：

1. 不重复定义已经存在的模型相关类型。
2. 保持 Agent 的配置契约一致。
3. 未来上游类型变化时更容易发现问题。
4. 避免为了通过 TypeScript 检查而使用 `any`。

这属于 TypeScript 类型设计能力，也是学习大型开源项目源码时很重要的一项技能。

---

## 十、对原始 `StdioTransport` 源码的进一步审查

前面主要是基础知识。这里列出几个值得你进一步研究的实现细节，但不直接断言它们全部都是 Bug。

**1. `start()` 失败后的状态**

代码在 `spawn` 成功之前就设置了 `started = true`。启动失败后，实例不能重新启动。这是否符合接口契约，需要查看对应测试和设计要求。

**2. stdout 消息长度限制**

如果收到超过限制但没有换行符的数据，当前实现会清空缓冲区。后续继续到来的那条超长消息的剩余部分，可能被当成新的消息处理。这种错误恢复策略值得测试。

**3. 关闭时的超时语义**

SIGKILL 定时器安排在 `grace + closeTimeoutMs`，而不是从调用 `close()` 开始计算的 `closeTimeoutMs`。因此配置的超时时间实际是 SIGTERM 后的额外等待时间，应与文档契约核对。

**4. `emitError()` 与 Promise 拒绝**

启动失败使用 Promise 的 `reject()`；运行期间错误则通过 `emitError()` 通知上层。它们不是同一种错误处理路径，调用方必须理解这种差别。

**5. 进程关闭与子进程树清理**

`close` 事件和子进程组清理不是一回事。一个直接子进程退出，不代表其后代进程都已终止。

---

## 十一、动手复习：三个练习

### 练习一：子进程事件

编写一个 Node.js 脚本，要求：

- 使用 `spawn()` 启动子进程。
- 子进程输出三次内容，每次间隔 100ms。
- 父进程通过 `stdout.data` 接收。
- 子进程退出后打印退出码。
- 不使用 `exec()`。

完成标准：你能解释 `data`、`exit` 和 `close` 分别在什么时候触发。

### 练习二：JSON 行协议

编写函数：

```ts
function createLineParser(
  onMessage: (message: unknown) => void,
): (chunk: Buffer) => void;
```

要求：

- 每次可以输入任意长度 Buffer。
- 每行是独立 JSON。
- 一次输入可能包含多行。
- 一行可能被分成多个 Buffer。
- 不完整的数据必须留到下一次。
- 无效 JSON 要进行错误处理。

完成标准：你能理解 `handleStdout()` 中 Buffer、`indexOf()`、`subarray()` 和 `while` 循环的作用。

### 练习三：TypeBox 类型系统

已知：

```ts
const inputSchema = Type.Object({
  executable: Type.String(),
  args: Type.Array(Type.String()),
  timeout: Type.Optional(Type.Number()),
});
```

要求：

1. 自动推导 `ProcessInput` 类型。
2. 编写接收 `ProcessInput` 的函数。
3. 编写从 `unknown` 验证得到合法输入的函数。
4. 不允许使用 `any` 和 `as any`。
5. 解释 `Static<typeof inputSchema>` 中 `typeof` 的必要性。

完成标准：你能区分运行时 Schema 校验和编译时类型检查。

---

## 十二、最终知识检查清单

能够独立回答以下问题，就说明本轮知识基本掌握：

- [ ] 为什么 `spawn()` 返回后，还需要监听子进程事件？
- [ ] `stdin`、`stdout`、`stderr` 的方向分别是什么？
- [ ] `spawn`、`exit`、`close` 有什么区别？
- [ ] 为什么不能对每次 `data` 事件都直接执行 `JSON.parse()`？
- [ ] `send()` 完成是否意味着 MCP 工具执行完成？
- [ ] MCP Client 如何根据 JSON-RPC ID 匹配请求和响应？
- [ ] 为什么 `StdioTransport` 与 MCP Client 要分开设计？
- [ ] 为什么本地 stdio Server 不需要 URL？
- [ ] 为什么 `child.kill()` 不等于进程已经退出？
- [ ] 如何通过 `Static<typeof schema>` 推导 TypeScript 类型？
- [ ] 为什么 `Static` 不能替代运行时参数校验？
- [ ] 为什么 Agent 类型设计应该优先复用已有类型？

**最终目标：** 不仅能阅读 `StdioTransport` 的代码，还能够自己实现一个简化的子进程 JSON-RPC Transport，并理解它如何被 MCP Client 和 Agent 使用。
