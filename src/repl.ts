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
  | { state: "check"; term: string; attempts: number }; // 等复述答案（上限 2 轮）

const HELP = "命令：/explain <术语> 开侧枝 ｜ /back 回主线（先复述检验）｜ /tree 看树 ｜ /exit 退出";

// resume 态还原：沿活跃路径找侧枝根标记——命中 = 还在侧枝里。
// 检验中退出视同解释中（检验可重跑，无损）；不在路径上的老侧枝天然不干扰。
export function detectBranch(entries: Entry[]): Mode {
  if (entries.length === 0) return { state: "idle" };
  const path = pathFromLeaf(entries, tailId(entries));
  const root = path.find(
    (e): e is MessageEntry => e.type === "message" && e.message.content.startsWith(BRANCH_MARKER),
  );
  if (!root) return { state: "idle" };
  return { state: "explain", term: parseBranchTerm(root.message.content) };
}

// 收枝三连：注脚摘要（侧枝上最后一问）→ branch_summary 挂回分叉点（= 侧枝根的 parentId，
// 与侧枝根互为兄弟）→ 状态回主线。branchLeafId 记摘要时刻的树尾，审计/导航用。
async function closeBranch(
  stem: string,
  header: SessionHeader,
  entries: Entry[],
  term: string,
  passed: boolean,
): Promise<void> {
  const path = pathFromLeaf(entries, tailId(entries));
  const branchRoot = path.find(
    (e): e is MessageEntry => e.type === "message" && e.message.content.startsWith(BRANCH_MARKER),
  );
  if (!branchRoot) throw new Error("收枝失败：活跃路径上找不到侧枝根标记——状态机与树脱节");
  const summary = await talk(stem, header, entries, PROMPTS.footnote);
  const footEntry = appendBranchSummary(stem, branchRoot.parentId, {
    term,
    summary,
    branchLeafId: tailId(entries) as string,
    passed,
  });
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
  let piped: string[] | null = null;
  let pipedIdx = 0;
  if (!rl) {
    piped = readFileSync(0, "utf-8")
      .split("\n")
      .map((s) => s.trim());
  }
  const nextLine = async (prompt: string): Promise<string | null> => {
    if (piped) {
      if (pipedIdx >= piped.length) return null; // 管道尽 = /exit
      const line = piped[pipedIdx++];
      console.log(`${prompt}${line}`); // 回显一行，日志才可读
      return line;
    }
    return await rl!.question(prompt);
  };

  console.log(`交互模式（会话 ${stem}）。${HELP}`);
  if (mode.state !== "idle") console.log(`从侧枝续起：${mode.term}（继续追问，或 /back 回主线）`);

  try {
    for (;;) {
      const tip =
        mode.state === "idle" ? "主线" : mode.state === "explain" ? `侧枝·${mode.term}` : `复述检验·${mode.term}`;
      const line = (await nextLine(`${tip}> `))?.trim() ?? "";
      if (!line) continue;
      if (line === "/exit") break;
      if (line === "/tree") {
        console.log(renderTree(entries));
        continue;
      }

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
        const seen = pathFromLeaf(entries, tailId(entries)).find((e) => e.type === "branch_summary" && e.term === term);
        if (seen && seen.type === "branch_summary") {
          console.log(`「${term}」已解释过（见注脚）：\n${seen.summary}\n想再深入就换个更具体的说法问。`);
          continue;
        }
        await talk(stem, header, entries, makeBranchQuestion(term));
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
          await talk(stem, header, entries, PROMPTS.checkQuestion);
          mode = { state: "check", term: mode.term, attempts: 0 };
          continue;
        }
        await closeBranch(stem, header, entries, mode.term, false);
        mode = { state: "idle" };
        continue;
      }

      // —— 普通输入按状态分派 ——
      if (mode.state === "idle") {
        console.log(await runAgent({ stem, header, entries, task: line, maxSteps, compaction }));
      } else if (mode.state === "explain") {
        await talk(stem, header, entries, line);
      } else {
        // 复述检验：答案 + 判定指令（两条入账，模型一起看）
        const reply = await talk(stem, header, entries, line, PROMPTS.judge);
        const passed = parseVerdict(reply);
        if (passed || mode.attempts >= 1) {
          await closeBranch(stem, header, entries, mode.term, passed);
          mode = { state: "idle" };
        } else {
          mode = { ...mode, attempts: 1 };
          await talk(stem, header, entries, PROMPTS.reexplain);
          console.log("—— 第 1 次复述未过，再讲一遍；这是最后一次检验机会 ——");
        }
      }
    }
  } finally {
    rl?.close();
  }
  console.log(`会话已存盘：${stem}（npm run dev -- -i ${stem} 可续）`);
}
