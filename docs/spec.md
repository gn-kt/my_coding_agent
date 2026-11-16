# spec：Phase 2——会话持久化 + 上下文压缩

> 上游：`docs/intent.md`（Phase 2，已确认）· pi 03 研究笔记 · 想法 #1/#2/#3
> 红线对照：零框架自研 ✅（全部手写，node:test 为 Node 内建）；少做做成架构 ✅——pi 11 种条目**只取 2 种**（message/compaction），context_edit / branch_summary 留给 Phase 3，明码标价。

## 一、方案选型（开放点 3 处，推荐已标）

| 决策点 | 方案 | 选定 |
|------|------|------|
| token 计数 | ① GLM 响应自带 `usage.totalTokens`（pi 同款，准）② 字符数估算（简单，中文偏差大） | **①**，响应缺 usage 时降级 ② |
| 摘要注入角色 | ① user 包装（「前情摘要：…」，顺着对话流）② system 角色插队（挤压岗位说明书语义） | **①** |
| 软着陆机制 | ① 预警 + 最后一圈 `tool_choice:"none"` 强制文本收尾 ② 只预警（模型可能继续开单，仍需硬截断兜底） | **①** |

## 二、数据模型（JSONL 树，pi 同构最简版）

`sessions/<HHMMSS>-<8位id>.jsonl`，一行一条 entry，追加写：

- 第 1 行 `session` 头（不在树内）：`version / cwd / createdAt / systemPrompt`——岗位说明书静态放头部；pi 的「补丁式 system 消息」等 prompt 可变那天再学
- `message` 条目：`id / parentId / type:"message" / message:Message`（复用 Phase 1 合同，含 tool_calls / tool_call_id）
- `compaction` 条目：`id / parentId / type:"compaction" / summary / firstKeptEntryId / tokensBefore`

`id` = randomUUID 前 8 位；`parentId` = 前一条 id——**线性成链，树形从 v1 就是树形**（fork 是 Phase 3 的事，结构今天埋好）。

## 三、数据流

**跑新任务**：main（argv：默认新任务 / `--list` / `--resume <id> "任务"`）→ session.createOrLoad（逐行 JSON + id 链校验，fail-loud）→ agent.run：

```
每圈：projection.buildContext(全树) → chat → 追加条目进树（append 一行）
      ├─ 有 tool_calls → 逐张执行 → 追加 tool 条目 → 下一圈
      └─ 无 tool_calls → 收工
发车前：compaction.shouldCompact？
      → findCutPoint（合法切点 = user/assistant 条目前；永不切 tool 条目——Q2 铁律）
      → summarize（两级 prompt：无前摘要用 checkpoint 模板 / 有前摘要用增量更新指令）
      → compaction 条目追加进树（原文零删除）→ 下一圈投影自动重建
```

**投影规则**：`[system(会话头)] + [最新 compaction 的摘要 user 消息] + firstKeptEntryId 起沿 parentId 链到叶子`；多条 compaction 只有最新贡献摘要；无 compaction = 全量。

**软着陆**：倒数第 2 圈末打预警（进账一条提示）；最后一圈 `tool_choice:"none"` + 收尾指令，保证文本收工；只有异常才回落硬截断声明。

## 四、接口变更

| 文件 | 变更 |
|------|------|
| `types.ts` | + `TokenUsage` / `SessionHeader` / `Entry` 判别联合（MessageEntry｜CompactionEntry）——scratch-entries.ts 毕业于此，草稿删 |
| `llm.ts` | `chat()` 返回 `{ message, usage }`；+ `toolChoice` 参数（软着陆传 `"none"`） |
| `session.ts` | **新建**：create / load（fail-loud）/ append |
| `projection.ts` | **新建**：buildContext（纯函数） |
| `compaction.ts` | **新建**：shouldCompact / findCutPoint（纯函数）/ summarize / compact |
| `agent.ts` | 循环接树追加 + 压缩触发 + 软着陆；SYSTEM_PROMPT 移交会话头 |
| `main.ts` | argv 解析：默认新任务 / `--list` / `--resume <id> "任务"` |
| `.env` | + `GLM_CONTEXT_WINDOW`(默认 128000) / `GLM_RESERVE_TOKENS`(默认 16384) / `GLM_KEEP_RECENT_TOKENS`(默认 20000) |

## 五、测试计划

1. **node:test 单测**（零依赖内建）：findCutPoint（工具链不切裂）/ buildContext（无压缩全量 · 有压缩三段式 · 多 compaction 取最新）——纯函数好测，Q2 那条铁律直接变成断言
2. **Phase 1 五条验收全量回归**（改 A 不炸 B）
3. **Phase 2 五条验收**（intent.md）——用户亲手跑（验收模式合同）
4. typecheck 门 + 命令行核心路径
