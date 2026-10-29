# 重试实现验收

- 用户完成 retry 主体，AI 提供接口和测试；本次 AI 未修改实现。
- 去掉独立 package.json 后执行 `node --test tests/retry.test.ts`：5 项全部通过。
- `node src/main.ts recover`：请求 1 失败、等待约 52ms、请求 2 失败、再等待约 51ms、请求 3 成功。等待时间是本次观测，不是精确计时保证。
- 结果限于约定的非负整数重试次数、合法间隔、所有请求错误可重试且 wait 不失败；没有验证真实模型重试、幂等性、错误分类或取消。
- Node 自动识别 ESM 成功运行，但由于上层 package 未声明模块类型，会输出 MODULE_TYPELESS_PACKAGE_JSON 警告；未修改工作区外的配置。
- 本练习作为局部校准证据收尾，不按实践入口编号自动开启下一项。
