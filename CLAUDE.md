# CLAUDE.md — my_coding_agent

## 技术栈
- TypeScript 7 + tsx（Node 22；Nvm 路径 `D:\IT_environment\Nvm\nodejs`）
- 零框架自研 harness（红线，沿 mergegate 决议）；模型 GLM（OpenAI 兼容方言）
- 闸门 artifact：`docs/intent.md` + `docs/内核生态分配表.md`（改动前先读）

## 命令
- `npm run dev "任务"`          # one-shot 跑任务（sessions/ 落 .jsonl 树）
- `npm run dev -- --list`       # 列历史会话（免钥匙）
- `npm run dev -- --check`      # 模型能力两段式检查（想法 #6，免钥匙不可——探针真发请求；零会话副作用）
- `npm run dev -- --resume <id> "任务"`  # 从树投影重建上下文续跑
- `npm run dev -- -i [会话id]`  # REPL 解释树模式（Phase 3）：/explain /back /tree /exit
- `npm run dev -- [--yolo] …`   # 审批档位（想法 #9）：缺省 safe 弹卡问人，--yolo 全放行（围挡仍生效）
- `npm run dev -- --watch <id>` # 只读观测者（想法 #8 L0）：第二进程旁观会话，免钥匙零 token，写不进一个字
- `npm run typecheck`           # 质检——独立于 dev，两道门都要过
- `npm test`                    # node:test 单测 55 条（切点铁律 / 树校验 / 路径投影 / 复述判定 / 审批门 / 能力档案 / 探针 / 观测者）

## 目录约定
- `src/types.ts`     类型合同（Entry 判别联合：message / compaction / branch_summary）
- `src/env.ts`       .env 读取器——**必须是 main.ts 第一根电线**（顺序不能动）
- `src/tools.ts`     Tool 接口 + 注册表 + 三工具（read/write/execute）+ executeTool 哨兵
- `src/llm.ts`       `chat()`：GLM 薄 seam + 错误守卫（200 信封里的 error 也要认）
- `src/session.ts`   JSONL 树 I/O：只追加；loadSession/validateTree 树形校验 fail-loud
- `src/projection.ts` 路径投影（叶子→根）+ 注脚消息 + renderTree（/tree）
- `src/compaction.ts` 阈值触发 + 合法切点 + 两级摘要（路径感知，只在主线上跑）
- `src/agent.ts`     `runAgent()` 主循环 + SYSTEM_PROMPT + 软着陆
- `src/explain.ts`   侧枝域：talk（无工具问答）+ 复述判定标记 + 注脚 prompt
- `src/repl.ts`      REPL 状态机（主线 ↔ 侧枝 ↔ 复述检验）+ resume 态还原
- `src/approval.ts`  L0 审批门（想法 #9）：pass/ask/block 三面单 + 工作区围挡 + fail-closed
- `src/capability.ts` 模型权威档案先验判级（想法 #6 上半：零 token 纯函数）
- `src/probe.ts`     模型实测探针（想法 #6 下半：工具调用/usage 两探针，判据与主循环同一把刀）
- `src/watch.ts`     只读观测者（想法 #8 L0）：轮询 tail + 宽容解析（尾行半行等下轮，中间行损坏 fail-loud）+ 状态快照（detectBranch 同一把刀）
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
9. **外部 API 的字段拼写是对外合同，收进来必须映射**：GLM 的 usage 是 snake_case（`total_tokens`），直接 `as TokenUsage` cast 不映射 → typecheck 全绿、运行时 `totalTokens === undefined`、比较恒 false、压缩触发器永久哑火（验收 2 实锤）。坑 4 的变体：坑 4 是发出去的名字错，这条是收进来的名字没翻译——同族教训：seam 处做字段映射，别信 cast
10. **闸门顺序：先验本地资源、再验外部依赖**——钥匙检查挡在 loadSession 前面，坏会话文件的 fail-loud 永远轮不到报（被钥匙错误掩盖）
11. **readline 不能喂管道**：非 TTY（`printf ... | npm run dev -- -i`）时逐行 `rl.question()` 会在长 await（任务跑圈）期间被 EOF 关掉接口，恢复后必炸 `ERR_USE_AFTER_CLOSE`——非 TTY 模式要整读 stdin 自建行队列（`readFileSync(0)`），只有真人才走 readline（Phase 3 验收首跑实锤）
12. **压缩三阈值是联动的，别单看一个**：`KEEP_RECENT_TOKENS` 小于单条工具结果的估算 token 时，切点算法从叶往回第一步就超预算、且切点之后全是 tool 条目 → 正确返回「无合法切点」不压缩——不是 bug，是阈值配错（验收回归实锤：KEEP=200 不触发，KEEP=5000 立即触发）
