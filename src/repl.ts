// repl.ts —— 交互模式状态机（Phase 3，想法 #7）：主线 ↔ 侧枝 ↔ 复述检验
// 状态只存内存、事实全在树上——进程死了树还在，resume 沿路径找标记就能还原状态。
import * as readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { readFileSync } from "node:fs";
import type { CompactionConfig } from "./agent.js";
import { runAgent } from "./agent.js";
import { appendBranchSummary } from "./session.js";
import { pathFromLeaf, renderTree } from "./projection.js";
import { BRANCH_MARKER, PROMPTS, makeBranchQuestion, parseBranchTerm, parseVerdict, tailId, talk } from "./explain.js";
import type { Entry, MessageEntry, SessionHeader } from "./types.js";

type Mode =
  | { state: "idle" } // 主线：普通输入 = 跑任务（工具开、压缩查）
  | { state: "explain"; term: string } // 侧枝：普通输入 = 追问下钻（无工具）
  | { state: "check"; term: string; attempts: number }; // 等复述答案（首答 + 1 次重答）

const HELP = "命令：/explain <术语> 开侧枝 ｜ /back 回主线（先复述检验）｜ /tree 看树 ｜ /exit 退出";
const MAX_CHECK_ATTEMPTS = 1; // 首答之外最多重答 1 次——两次复述都不过就以「待巩固」收枝

// 侧枝根查找：detectBranch 与 closeBranch 共用一处语义（OCR 评审：别让两处 startsWith 各自漂移）。
// 已知局限（明码标价）：标记是内容前缀，用户主线输入恰以「【侧枝提问】」开头会被误认——
// 与 Phase 2 的【系统】条目同一造假面，结构化条目留给需要的那天再学 pi 的 context_edit。
function findBranchRoot(path: Entry[]): MessageEntry | undefined {
  return path.find((e): e is MessageEntry => e.type === "message" && e.message.content.startsWith(BRANCH_MARKER));
}

// resume 态还原：沿活跃路径找侧枝根标记——命中 = 还在侧枝里。
// 检验中退出视同解释中（检验可重跑，无损）；不在路径上的老侧枝天然不干扰。
export function detectBranch(entries: Entry[]): Mode {
  if (entries.length === 0) return { state: "idle" };
  const root = findBranchRoot(pathFromLeaf(entries, tailId(entries)));
  if (!root) return { state: "idle" };
  return { state: "explain", term: parseBranchTerm(root.message.content) };
}

// 收枝三连：注脚摘要（侧枝上最后一问）→ branch_summary 挂回分叉点（= 侧枝根的 parentId，
// 与侧枝根互为兄弟）→ 状态回主线。branchLeafId 记摘要时刻的树尾，审计用。
async function closeBranch(
  stem: string,
  header: SessionHeader,
  entries: Entry[],
  term: string,
  passed: boolean,
): Promise<void> {
  const branchRoot = findBranchRoot(pathFromLeaf(entries, tailId(entries)));
  if (!branchRoot) throw new Error("收枝失败：活跃路径上找不到侧枝根标记——状态机与树脱节");
  const summary = await talk(stem, header, entries, PROMPTS.footnote);
  console.log(`—— 注脚内容 ——\n${summary}`); // 挂回主线前先亮货：用户该看到注脚写了什么
  const leaf = tailId(entries);
  if (!leaf) throw new Error("收枝失败：注脚生成后树尾为空"); // talk 后树必非空，这行给类型一个诚实的出口
  const footEntry = appendBranchSummary(stem, branchRoot.parentId, { term, summary, branchLeafId: leaf, passed });
  entries.push(footEntry);
  console.log(passed ? "✅ 复述通过，注脚已挂回主线" : "⚠️ 复述未过/未完成——注脚带「待巩固」标记");
}

export async function runRepl(opts: {
  stem: string;
  header: SessionHeader;
  entries: Entry[];
  maxSteps: number;
  compaction: CompactionConfig;
}): Promise<void> {
  const { stem, header, entries, maxSteps, compaction } = opts;
  let mode: Mode = detectBranch(entries);
  // 坑 11：非 TTY（管道喂入）不能逐行 question——readline 会在长 await（任务跑圈）期间读到 EOF
  // 并关闭接口，恢复后 question 必炸 ERR_USE_AFTER_CLOSE。管道模式整读 stdin 自建行队列，
  // 队列读尽 = 正常退出；只有 TTY（真人终端）才走 readline。
  const rl = process.stdin.isTTY ? readline.createInterface({ input, output }) : null;
  let stdinClosed = false; // TTY 的 Ctrl-D / 输入流尽头——不处理会让空行循环空转
  rl?.on("close", () => {
    stdinClosed = true;
  });
  let piped: string[] | null = null;
  let pipedIdx = 0;
  if (!rl) {
    try {
      piped = readFileSync(0, "utf-8")
        .split("\n")
        .map((s) => s.trim());
      while (piped.length > 0 && piped[piped.length - 1] === "") piped.pop(); // 尾部空行是 printf 送的，不回显
    } catch (e) {
      throw new Error(`读取管道输入失败：${(e as Error).message}（交互模式需要 TTY 或管道输入）`);
    }
  }
  const nextLine = async (prompt: string): Promise<string | null> => {
    if (piped) {
      if (pipedIdx >= piped.length) return null; // 管道尽 = /exit
      const line = piped[pipedIdx++];
      console.log(`${prompt}${line}`); // 回显一行，日志才可读
      return line;
    }
    if (stdinClosed) return null;
    return await rl!.question(prompt);
  };

  console.log(`交互模式（会话 ${stem}）。${HELP}`);
  if (mode.state !== "idle") console.log(`从侧枝续起：${mode.term}（继续追问，或 /back 回主线）`);

  try {
    for (;;) {
      const tip =
        mode.state === "idle" ? "主线" : mode.state === "explain" ? `侧枝·${mode.term}` : `复述检验·${mode.term}`;
      const line = (await nextLine(`${tip}> `))?.trim() ?? "";
      if (!line) {
        if (stdinClosed) break; // 输入流尽头 = 存盘退出
        continue;
      }
      if (line === "/exit") break;
      if (line === "/tree") {
        console.log(renderTree(entries));
        continue;
      }

      // 单圈隔离（OCR 评审采纳）：一次 API 抖动不该杀掉整个会话——树已持久，报错续站
      try {
        // —— /explain：只在主线有效；侧枝里当普通追问处理（范围外：侧枝内不再分叉）——
        if (line.startsWith("/explain")) {
          if (mode.state !== "idle") {
            console.log("已在侧枝中——直接输入就是追问，不必再 /explain；/back 回主线");
            continue;
          }
          const term = line.slice("/explain".length).trim();
          if (!term) {
            console.log("用法：/explain <术语>");
            continue;
          }
          // 去重（intent 反例 5）：活跃路径上已有同术语注脚 → 指引，不重讲
          const seen = pathFromLeaf(entries, tailId(entries)).find(
            (e) => e.type === "branch_summary" && e.term === term,
          );
          if (seen && seen.type === "branch_summary") {
            console.log(`「${term}」已解释过（见注脚）：\n${seen.summary}\n想再深入就换个更具体的说法问。`);
            continue;
          }
          const answer = await talk(stem, header, entries, makeBranchQuestion(term));
          console.log(answer);
          mode = { state: "explain", term };
          continue;
        }

        // —— /back：explain 态先出检验题；check 态 = 放弃检验直接回主线（注脚带未过标记）——
        if (line === "/back") {
          if (mode.state === "idle") {
            console.log("当前就在主线");
            continue;
          }
          if (mode.state === "explain") {
            const question = await talk(stem, header, entries, PROMPTS.checkQuestion);
            console.log(question); // 考题必须上屏——看不见题没法复述
            mode = { state: "check", term: mode.term, attempts: 0 };
            continue;
          }
          console.log("已放弃本次复述检验。");
          await closeBranch(stem, header, entries, mode.term, false);
          mode = { state: "idle" };
          continue;
        }

        // —— 普通输入按状态分派 ——
        if (mode.state === "idle") {
          console.log(await runAgent({ stem, header, entries, task: line, maxSteps, compaction }));
        } else if (mode.state === "explain") {
          console.log(await talk(stem, header, entries, line));
        } else {
          // 复述检验：答案 + 判定指令（两条入账，模型一起看）
          const reply = await talk(stem, header, entries, line, PROMPTS.judge);
          console.log(reply); // 点评 + 【判定：…】一起上屏
          const passed = parseVerdict(reply);
          if (passed || mode.attempts >= MAX_CHECK_ATTEMPTS) {
            await closeBranch(stem, header, entries, mode.term, passed);
            mode = { state: "idle" };
          } else {
            mode = { ...mode, attempts: mode.attempts + 1 };
            console.log(await talk(stem, header, entries, PROMPTS.reexplain));
            console.log(`—— 第 1 次复述未过，再讲一遍；最多 ${MAX_CHECK_ATTEMPTS + 1} 次复述机会 ——`);
          }
        }
      } catch (e) {
        console.error(`⚠️ 本轮失败（会话已存盘，可直接继续）：${(e as Error).message}`);
      }
    }
  } finally {
    rl?.close();
  }
  console.log(`会话已存盘：${stem}（npm run dev -- -i ${stem} 可续）`);
}

// REPL 外壳（main.ts 用）：异常退出也走人话报错 + 非零退出码——fail-loud 但不甩裸栈给用户
export async function runReplGuarded(opts: Parameters<typeof runRepl>[0]): Promise<void> {
  try {
    await runRepl(opts);
  } catch (e) {
    console.error(`交互模式异常退出（会话树已存盘，可用 -i <id> 续起）：${(e as Error).message}`);
    process.exit(1);
  }
}
