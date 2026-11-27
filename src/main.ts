import "./env.js";
import { runAgent, SYSTEM_PROMPT } from "./agent.js";
import { runReplGuarded } from "./repl.js";
import { createSession, loadSession, listSessions } from "./session.js";
import type { GateMode } from "./approval.js";

const MAX_STEPS = Number(process.env.GLM_MAX_STEPS ?? "20");
// 压缩三阈值（spec：.env 可调；验收第 2 条靠调 GLM_RESERVE_TOKENS 压低触发线）
const COMPACTION = {
  contextWindow: Number(process.env.GLM_CONTEXT_WINDOW ?? "128000"),
  reserveTokens: Number(process.env.GLM_RESERVE_TOKENS ?? "16384"),
  keepRecentTokens: Number(process.env.GLM_KEEP_RECENT_TOKENS ?? "20000"),
};

const args = process.argv.slice(2);

// L0 审批门档位（想法 #9）：--yolo 旗标位置不限，剥离后再解析子命令；缺省 = safe
const gateMode: GateMode = args.includes("--yolo") ? "yolo" : "safe";
const rest = args.filter((a) => a !== "--yolo");
const WORKSPACE_ROOT = process.cwd(); // 围挡根：启动时定死，运行中不变

// 钥匙闸：外部依赖检查。两个跑任务的路径各自在本地资源校验**之后**调用——
// 先验本地、再验外部，坏会话文件不劳钥匙就该拦下
function requireKey(): void {
  if (!process.env.GLM_API_KEY) {
    console.error("缺 GLM_API_KEY——检查项目根目录 .env");
    process.exit(1);
  }
}

// --list 不用钥匙（纯本地读文件）
if (rest[0] === "--list") {
  const sessions = listSessions();
  if (sessions.length === 0) console.log("还没有会话——跑一个任务就有了");
  for (const s of sessions) {
    console.log(`${s.stem}  ${s.entryCount} 条  ${s.firstTask}`);
  }
  process.exit(0);
}

console.log(
  gateMode === "safe"
    ? `🛡️ safe 档：写入/命令会弹卡问人 ｜ 围挡=${WORKSPACE_ROOT}（批量实测加 --yolo）`
    : `⚡ yolo 档：全放行不弹卡 ｜ 围挡仍生效=${WORKSPACE_ROOT}`,
);

// --interactive [id]（-i）：REPL 解释树模式（Phase 3，想法 #7）。
// 带会话 id = 从树续起（沿活跃路径还原是否在侧枝里）；不带 = 新会话。
// 闸门顺序与 --resume 一致（坑 10）：带 id 先 loadSession（本地 fail-loud）再 requireKey（外部依赖）
if (rest[0] === "--interactive" || rest[0] === "-i") {
  const stem = rest[1];
  if (stem) {
    const { header, entries } = loadSession(stem);
    requireKey();
    console.log(`交互续跑：${stem}（已有 ${entries.length} 条历史）`);
    await runReplGuarded({ stem, header, entries, maxSteps: MAX_STEPS, compaction: COMPACTION, gateMode, workspaceRoot: WORKSPACE_ROOT });
  } else {
    requireKey();
    const { stem: newStem, header } = createSession(SYSTEM_PROMPT);
    console.log(`新会话（交互模式）：${newStem}`);
    await runReplGuarded({ stem: newStem, header, entries: [], maxSteps: MAX_STEPS, compaction: COMPACTION, gateMode, workspaceRoot: WORKSPACE_ROOT });
  }
  process.exit(0);
}

// --resume <id> "任务"：从历史会话续跑（树 → 投影重建上下文，新账追加进同一个文件）
if (rest[0] === "--resume") {
  const stem = rest[1];
  const task = rest[2];
  if (!stem || !task) {
    console.error('用法：npm run dev -- [--yolo] --resume <会话id> "任务描述"');
    process.exit(1);
  }
  const { header, entries } = loadSession(stem); // fail-loud：文件缺/链断在这就拦
  requireKey();
  console.log(`续跑会话：${stem}（已有 ${entries.length} 条历史）`);
  const answer = await runAgent({ stem, header, entries, task, maxSteps: MAX_STEPS, compaction: COMPACTION, gateMode, workspaceRoot: WORKSPACE_ROOT });
  console.log("最终回答：", answer);
  process.exit(0);
}

// 默认：新会话跑新任务
const task = rest[0];
if (!task) {
  console.error(
    '用法：npm run dev [--yolo] "任务描述" ｜ npm run dev -- --list ｜ npm run dev -- [--yolo] --resume <id> "任务" ｜ npm run dev -- [-i] [--yolo] [会话id]',
  );
  process.exit(1);
}
requireKey();
const { stem, header } = createSession(SYSTEM_PROMPT);
console.log(`新会话：${stem}`);
const answer = await runAgent({ stem, header, entries: [], task, maxSteps: MAX_STEPS, compaction: COMPACTION, gateMode, workspaceRoot: WORKSPACE_ROOT });
console.log("最终回答：", answer);
