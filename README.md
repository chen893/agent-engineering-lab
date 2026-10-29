# Agent Engineering Lab

Agent 开发学习与工程实践：从面试问题出发，通过源码阅读、功能实现、调试验证与复盘积累能力，以 pi 为主要实践对象。

## 学习入口

- [当前进度](learning-state.md)：最新结论、证据与下一步。
- [短期计划](learning-plan.md)：近期目标与候选方向。
- [协作约定](AGENTS.md)：学习模式、能力证据和 AI 协助边界。
- `practice/`：独立实验的需求、实现、测试与验收证据。
- `learning-log/`：阶段复盘与历史记录。
- `面经资料/`：面试资料、问题池与实践入口。
- `prototypes/`：学习应用原型及进展。

## 源码与依赖

`repos/pi-mono/` 是独立源码仓库，不随本仓库上传。当前本地改动备份见 [源码快照](source-snapshots/pi-mono/README.md)。

在新机器恢复当前源码环境：

```sh
git clone https://github.com/badlogic/pi-mono.git repos/pi-mono
cd repos/pi-mono
git checkout 36be9c612e64082a4f0d4d0a94706c38ecbc20a1
git apply ../../source-snapshots/pi-mono/tracked.patch
cp -R ../../source-snapshots/pi-mono/untracked/. .
npm ci --ignore-scripts
```

具体实验的运行命令与依赖要求见各目录 README。历史验收对应记录中的版本与环境，不代表在新机器上已重新验证。

## 记录同步

本仓库保存学习文件、实验代码和运行证据，排除依赖、环境密钥文件及部署压缩包。pi 源码变更需在独立仓库中管理，并按需更新快照。
