# spec：Phase 3+ 想法#9-L0——两档审批门 + 工作区路径围挡

> 上游：`docs/intent.md`（L0）· 想法池 #9 定稿 · DSH ⑦ 审批流 / pi 信任门禁 / opencode PermissionV2 两档
> 红线对照：零框架自研 ✅（纯 node 内建）；少做做成架构 ✅——两档压成一个全局开关、拒绝记录折进工具结果（方案 A），不建条目类型、不动投影；明码标价见 intent「范围外」。

## 一、方案选型（3 处，推荐已选定）

| 决策点 | 方案 | 选定 |
|------|------|------|
| 拒绝/批准怎么入树 | ① 方案 A：折进工具结果正文（被拒 = 一条「用户拒绝了」的工具结果消息）② 方案 B：ask/decision 两笔 ApprovalEntry 新条目类型 | **①**——树照样讲真话，零新条目类型、投影零改动、模型天然看得到被拒（反例 3 直接满足）；L1 做策略回放时再升 B |
| 档位来源 | ① CLI 旗标 `--yolo`，缺省 safe ② REPL 内 `/yolo` 切换 | **①**——全局开关压成启动旗标（opencode build/plan 的品味、静态信任模型）；REPL 内切档明码标价不做 |
| 围挡算法 | ① `path.resolve(root, target)` 后 `path.relative` 判 `..`/异盘 ② 字符串 startsWith 前缀匹配 | **①**——resolve 吸掉 `..` 漂移；startsWith 有 `/work` vs `/workshop` 前缀坑；异盘 relative 返回绝对路径需一并判 |

## 二、核心模型（approval.ts 🆕，判别联合三面单）

```ts
export type GateMode = "safe" | "yolo";
export type GateDecision =
  | { kind: "pass";  tool: string }
  | { kind: "ask";   tool: string; prompt: string }   // safe 档 write/execute
  | { kind: "block"; tool: string; reason: string };  // 围挡越界（两档都拦）

decideGate(toolName, args, mode, workspaceRoot): GateDecision
isInsideWorkspace(target, workspaceRoot): boolean     // resolve + relative 判 .. 与异盘
denyResult(tool): Message / blockResult(reason): Message  // 方案 A 的两条工具结果正文
```

判定顺序：**围挡先于档位**（越界 block 两档不变，硬边界）→ yolo 全 pass → safe：read pass、其余 ask。

## 三、数据流

```
agent.ts 主循环（唯一工具下手点，哨兵前加一道门）:
  reply.tool_calls 循环:
    decision = decideGate(call, mode, workspaceRoot)
    block → blockResult(reason) 入树回灌，不执行，继续下一单
    ask   → asker(prompt) 弹 y/n（REPL 复用自家 readline；one-shot 用 readline/promises）
            n → denyResult(tool) 入树回灌，不执行；y → 落到执行
    pass  → executeTool(call) 照旧
```

- **workspaceRoot = process.cwd()**（启动时定死，运行中不变）
- **asker 注入**：`runAgent` 增可选参 `ask?: (prompt) => Promise<boolean>`；缺省自建 readline（one-shot 场景）；REPL 传自家 rl 包装——同一 stdin 不开第二个监听者
- **无人应答 = 挂起**：asker 的 promise 永不 resolve 就永远不执行（fail-closed 物理形态）；不做超时
- **侧枝零门**：talk() 物理禁工具已有，审批门天然够不着侧枝

## 四、接口变更

| 文件 | 变更 |
|------|------|
| `approval.ts` 🆕 | GateDecision 判别联合 + decideGate + isInsideWorkspace + deny/block 结果正文 |
| `agent.ts` | runAgent 增 `mode` 与 `ask` 参数；tool_calls 循环哨兵前过门；block/ask-denied 两条不执行路径 |
| `main.ts` | 解析 `--yolo`（从 args 剥离，不影响既有子命令）；one-shot/-i/--resume 三路透传 |
| `repl.ts` | 透传 mode；提供 rl-based asker 传给 runAgent |
| `tools.ts` / `session.ts` / `projection.ts` / `compaction.ts` / `types.ts` | 零改动（方案 A 的收益：条目类型、投影、压缩全不碰） |

## 五、测试计划

1. **node:test 单测**（纯函数，零 API）：decideGate 三面单 × 两档矩阵（safe read pass / safe write ask / safe write 越界 block / yolo 全 pass / yolo 越界 block / safe execute ask）｜isInsideWorkspace（相对在内 / `..` 逃逸 / 绝对在外 / 异盘在外 / 根本身）｜deny/block 正文含「未执行/拒绝」关键词
2. **回归**：既有 23 条全绿 + one-shot / `--list` / `-i` / `--resume` 不炸
3. **手验**（用户实跑，验收模式合同）：safe 档让 agent 写个文件 → 弹卡 y 放行；再写一次答 n → 模型收到被拒并改道；`--yolo` 同任务零弹卡
4. typecheck 门 + ocr scan
