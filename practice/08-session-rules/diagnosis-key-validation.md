# key 校验诊断（2026-10-27 20:58，Asia/Shanghai）

AI 按用户请求诊断并解释，未修改用户实现或测试。当前代码与旧验收记录不同。

命令：`node repos/pi-mono/node_modules/vitest/dist/cli.js --run --root practice/08-session-rules --config ../../repos/pi-mono/packages/coding-agent/vitest.config.ts rules.test.ts`。

- 当前注释状态：10 passed / 3 failed，见 [输出](diagnosis-disabled-output.txt)。失败为 set 缺 key、两条空 value 用例。
- 对照实验：将 rules-extension.ts、rules.test.ts、fixtures.ts 复制到 practice 下临时同层目录，仅取消 key 校验块注释，使用相同命令（root 换成临时目录）。5 passed / 8 failed，见 [输出](diagnosis-enabled-output.txt)。临时目录已删除。
- 原因：全局 key 校验会拒绝无需 key 的 list，导致命令交互及恢复用例失败；四条缺参/未知命令用例的通知断言不接受“key 必须…”文案（测试文案匹配偏窄，不能全算实现错误）；合法 key 的空 value 仍未被拦截。
- list 前后都被拒绝时，列表相等断言可能比较的是两条错误通知；仍需依赖模型请求断言观察实际状态。
- 下一步：用户按子命令确定必要参数，再校验 key；set 单独拒绝空 value。错误文案断言应遵循 README 文案自定契约。此轮不代改，不构成最终验收。

当前原文件 SHA-256（对照版本仅取消指定注释块）：

```text
2a0f69cc97adfe1e1257c6a8d68a924e40c8243ee4e26e2b0493e63394d753f0  rules-extension.ts
c16cddd50f6ac586b19681b202bf9ac6052a603fc479d5a9c62be24889ec43bb  rules.test.ts
e6bfff9368f328fb058a426ad97834eca84c0fa19ef70606b006f6ba8c21d1b1  fixtures.ts
```
