# 工单提交设计

## 状态与持久化数据

待填写：有哪些本地状态、各自代表什么证据、保存哪些字段。

requestKey status:

- no_found
  created + ticketId
  rejected + reason
  记录存在，状态unknwon

## 再次调用与恢复

待填写：各状态收到相同请求后允许执行哪些操作，以及输入冲突如何处理。

case 无记录 保存 一个本地记录 状态为unknown，发起 create 根据返回值更新本地状态值
case 有记录，状态为unknwon， 使用lookup 查看当前的状态，更新状态值，如果absent 当成首次提交
case create 返回 ticket
case rejected 返回reason

## 验证选择

待填写：选择关键场景，写出输入与故障安排、预期结果、观察的服务调用和持久化数据。测试代码可交由 AI 编写。

## 保证范围

待填写：本方案依赖外部服务的哪些保证；如果 lookup 只能返回最终一致的结果，哪项决策需要调整。
