# my_coding_agent

自研 coding agent harness（零框架）——把 pi / DSH / opencode / codex 四家源码研究的结论沉淀成每一行都兜得住的 CLI agent。实习作品集项目。

## 快速开始

```bash
npm install                        # 依赖：typescript + tsx + @types/node（devDependencies，运行时零依赖）
npm run dev "任务"                 # one-shot：例：npm run dev "读一下 package.json，告诉我项目名"
npm run dev -- --list              # 列历史会话（免钥匙）
npm run dev -- --resume <id> "任务" # 从会话树投影重建上下文续跑
npm run dev -- -i                  # 交互模式（解释树）：/explain <术语> /back /tree /exit
npm run typecheck                  # 类型质检（独立于运行）
npm test                           # node:test 单测 21 条
```

钥匙：项目根建 `.env`（已被 gitignore）：

```
GLM_API_KEY=你的钥匙
GLM_MODEL=glm-5.3-flash
GLM_BASE_URL=https://open.bigmodel.cn/api/paas/v4
```

任意 OpenAI 兼容方言可换：改 `.env` 三个值即可，代码零改。

## 架构（Phase 3：树 + 投影 + 解释树）

```
main.ts         入口：one-shot / --list / --resume / -i（REPL）
 ├ agent.ts     主循环：每条消息当场入树；发车前压缩检查；max-steps 软着陆
 │   ├ llm.ts       GLM 薄 seam（chat() + usage 映射 + 错误守卫）
 │   └ tools.ts     read_file / write_file / execute_command + executeTool 哨兵
 ├ session.ts   会话树 I/O：JSONL 一行一条 entry 只追加；树形校验 fail-loud
 ├ projection.ts 投影：活跃路径（叶子→根）→ messages；注脚消息；renderTree
 ├ compaction.ts 阈值触发 + 合法切点（永不切 tool 对）+ 两级摘要（路径感知）
 ├ explain.ts   侧枝域：无工具问答 + 复述检验判定 + 注脚生成
 └ repl.ts      状态机：主线 ↔ 侧枝（/explain）↔ 复述检验（/back）
env.ts / types.ts  .env 读取器（最先加载）/ Entry 判别联合（3 种条目）
```

三条核心机制（面试可讲）：

- **树只进不改，投影随便算**（pi）：会话文件是不可变事实源，模型上下文 = 活跃路径投影，历史/显示/上下文三者分离
- **上下文压缩**：usage 超阈值 → 合法切点（永不切 tool 对）→ 两级摘要进树，原文零删除
- **解释树**（想法 #7）：任务主线遇到不懂的术语 `/explain` 开侧枝层层下钻，`/back` 复述检验防假懂，侧枝摘要成注脚挂回分叉点——主线语境零污染

设计决策与红线：`docs/intent.md`、`docs/spec.md`、`docs/内核生态分配表.md`；踩坑档案：`CLAUDE.md`（12 坑）。
