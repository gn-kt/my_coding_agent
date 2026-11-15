# CLAUDE.md — my_coding_agent

## 技术栈
- TypeScript 7 + tsx（Node 22；Nvm 路径 `D:\IT_environment\Nvm\nodejs`）
- 零框架自研 harness（红线，沿 mergegate 决议）；模型 GLM（OpenAI 兼容方言）
- 闸门 artifact：`docs/intent.md` + `docs/内核生态分配表.md`（改动前先读）

## 命令
- `npm run dev "任务"`   # 跑 agent（任务从 argv[2] 进）
- `npm run typecheck`    # 质检——独立于 dev，两道门都要过

## 目录约定
- `src/types.ts`  类型合同（Role / ToolCall / Message）
- `src/env.ts`    .env 读取器——**必须是 main.ts 第一根电线**（顺序不能动）
- `src/tools.ts`  Tool 接口 + 注册表 + 三工具（read/write/execute）+ executeTool 哨兵
- `src/llm.ts`    `chat()`：GLM 薄 seam + 错误守卫（200 信封里的 error 也要认）
- `src/agent.ts`  `runAgent()` 主循环 + SYSTEM_PROMPT
- 钥匙在 `.env`：GLM_API_KEY / GLM_MODEL / GLM_BASE_URL（已 gitignore；真实环境变量优先于 .env）

## 踩过的坑（AI 同一个错犯第二次 → 先来这里回写）
1. **TS7 必须显式 `"types": ["node"]`**——否则 `node:fs` 进货报 TS2591
2. TS 里 import 兄弟文件写 `"./x.js"` 后缀（NodeNext 规矩，写 `.ts` 质检员拦）
3. **新工具两步缺一不可**：`const` 定义 + `registry.set` 上册——只定义不上册，模型看不见（v0.3 实锤：模型照实说「我没有这个工具」）
4. **对外字段名是对外合同**：`tool_calls` 少个 s，typecheck 照绿、API 静默不认——名字类错误质检员全瞎，只有对照规格 review 能抓
5. **GLM 错误可能装在 HTTP 200 信封里**（body 里 `error.code: '500'`）——判成功看 `choices` 在不在，别只看状态码
6. **行动类任务 system prompt 必须指令语气**（「必须调用工具」）；许可语气（「可以」）模型会光说不练（验收 1 首跑 ❌ 实锤）
7. Windows cmd 下 `ls`/`find` 不可用——模型会自己试错换成 `dir`，前提是哨兵把错误回灌给它（自愈机制实测有效）
8. env 值全是字符串：`Number(process.env.X ?? "20")` 才是数字
