# 02 · 有边界的重试

来源：实践入口第 2 项，Q034。模式：能力校准，AI 提供接口、场景与测试，用户实现请求包装器。

## 本轮目标

实现 `src/retry.ts` 中的 `retry`。传入一个请求函数和配置，请求失败时等待后再次尝试，直到成功或次数耗尽。请求使用模拟函数，无需网络、模型或新依赖。

本轮约定：`retries` 是首次请求以外的重试次数。例如 retries=2，最多请求 3 次。这是本次明确的接口契约，不需要猜测。

## 验收

- 首次成功立即返回结果，不等待、不重试。
- retries=2，前两次失败、第三次成功：调用 3 次、等待 2 次，返回第三次结果。
- retries=2，始终失败：调用 3 次、等待 2 次，最后抛出最后一次请求的原始错误。
- retries=0：只调用一次，失败时直接抛出该错误。
- 等待只发生在两次请求之间；首次请求前、成功后、最终失败后均不等待。
- 调用方必须能拿到最终结果或错误；不可启动未等待的后台重试。

本轮只接收非负整数 retries 和非负有限数 delayMs，所有请求失败都可重试；不加入取消、指数退避、错误分类、并发或参数校验。这些不是本轮完成门槛。

## 接口与设施

- `retry(request, { retries, delayMs, wait? })`：用户实现。request 每次调用返回一个 Promise；失败通过 throw 或 Promise rejection 表达。
- `wait(ms)`：测试时可注入可控等待函数；默认使用已提供的 `sleep`。约定 wait 本身不失败。
- `src/main.ts`：AI 提供场景入口，打印每次调用、等待以及最终结果，实际等待 50ms。
- `tests/retry.test.ts`：AI 提供集中验收，注入等待函数，验证请求确实等待其完成后才重试。

```sh
cd practice/02-retry
node src/main.ts immediate
node src/main.ts recover
node src/main.ts exhausted
node src/main.ts zero
node --test tests/retry.test.ts
```

无需独立 package.json 或安装依赖，使用工作区现有 Node.js 直接运行。exhausted 和 zero 的业务失败会被入口捕获并打印。本练习用于局部能力校准，不是必须依次完成的课程节点，也不等同于已掌握真实模型请求重试。

## 开始方式

先在 `prediction.md` 简短写出 recover 与 exhausted 的调用/等待顺序，再集中实现 retry，不需要每写一个分支就等反馈。卡住时留下当前代码和具体问题。

完成后用户解释：为什么最后一次失败不能再等待？调用次数与重试次数如何对应？测试由 AI 编写不等于独立测试设计能力已验证。
