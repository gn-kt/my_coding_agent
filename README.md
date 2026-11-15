# my_coding_agent

自研 coding agent harness（零框架）——把 pi / DSH / opencode / codex 四家源码研究的结论沉淀成每一行都兜得住的 CLI agent。实习作品集项目。

## 快速开始

```bash
npm install          # 依赖：typescript + tsx + @types/node（devDependencies，运行时零依赖）
npm run dev "任务"   # 例：npm run dev "读一下 package.json，告诉我项目名"
npm run typecheck    # 类型质检（独立于运行，两道门都要过）
```

钥匙：项目根建 `.env`（已被 gitignore）：

```
GLM_API_KEY=你的钥匙
GLM_MODEL=glm-5.3-flash
GLM_BASE_URL=https://open.bigmodel.cn/api/paas/v4
```

任意 OpenAI 兼容方言可换：改 `.env` 三个值即可，代码零改。

## 架构（Phase 1，最小闭环）

```
main.ts        入口：argv 任务 + 钥匙 fail-loud
 └ agent.ts    主循环：messages 账本每圈追加变长，max-steps 硬上限
    ├ llm.ts   GLM 薄 seam（chat()：fetch + tool_calls + 错误守卫）
    └ tools.ts Tool 接口 + Map 注册表（read_file / write_file / execute_command）
               + executeTool 哨兵（查名 / JSON.parse 拆包 / try-catch，错误当结果回灌）
env.ts         .env 读取器（必须最先加载）
types.ts       类型合同（Role / ToolCall / Message）
```

设计决策与红线：`docs/intent.md`、`docs/内核生态分配表.md`；踩坑档案：`CLAUDE.md`。
