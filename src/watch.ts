// watch.ts —— 只读观测者（想法 #8 L0）：第二个进程旁观会话树，看得见每个字，写不进一个字。
// 事实靠追加，视图靠重算——观测者是这条口诀最纯的消费者：一辈子只读，每轮全量重算投影。
// 零钥匙零 token：画面全靠读树，不发任何请求（intent 反例 4）。
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { validateTree } from "./session.js";
import { entryLabel, pathFromLeaf, projectPath } from "./projection.js";
import { detectBranch } from "./repl.js"; // 状态标记与 REPL 同一把刀——观测者不造第二个法官
import { tailId } from "./explain.js";
import type { Entry, SessionHeader } from "./types.js";

const SESSIONS_DIR = path.join(process.cwd(), "sessions");
const POLL_MS = 1000; // 轮询 tail（MVP 明码标价：不引 fs.watch，「数秒内上屏」足够 L0）

// 解析会话文件（宽容版）：**只许尾行**是半行（A 正在写）——丢了等下轮补；
// 中间行坏 JSON = 真损坏，fail-loud 不静默吞（intent 反例 3）。
export function parseEntriesLoose(text: string, stem: string): { header: SessionHeader; entries: Entry[] } {
  const lines = text.split("\n").filter((line) => line.trim() !== "");
  if (lines.length === 0) throw new Error(`会话文件是空的：${stem}`);
  const header = JSON.parse(lines[0]) as SessionHeader;
  if (header.type !== "session") {
    throw new Error(`会话文件第 1 行不是 session 头：${stem}`);
  }
  const entries: Entry[] = [];
  for (let i = 1; i < lines.length; i++) {
    try {
      entries.push(JSON.parse(lines[i]) as Entry);
    } catch {
      if (i === lines.length - 1) break; // 尾行半行：A 的笔还没提，等下轮
      throw new Error(`坏 JSON 行 ${i + 1}——会话文件损坏：${stem}`);
    }
  }
  validateTree(entries); // 前缀树必合法（父先于子对任意前缀成立）——口径与 loadSession 一致
  return { header, entries };
}

function readSession(stem: string): { header: SessionHeader; entries: Entry[] } {
  const file = path.join(SESSIONS_DIR, `${stem}.jsonl`);
  if (!existsSync(file)) {
    throw new Error(`会话不存在：${stem}（用 --list 查看有哪些）`);
  }
  return parseEntriesLoose(readFileSync(file, "utf-8"), stem);
}

// 现场快照（resume 三动作只读版）：翻树（珠数）→ 摸线（活跃路径）→ 标状态（detectBranch 同一把刀）。
// 纯字符串，不碰文件不碰网络——单测直接喂 entries。
export function observeSnapshot(stem: string, entries: Entry[]): string {
  const mode = detectBranch(entries);
  const state =
    mode.state === "idle" ? "主线 idle" : mode.state === "explain" ? `侧枝·${mode.term}` : `复述检验·${mode.term}`;
  const path = entries.length > 0 ? pathFromLeaf(entries, tailId(entries)) : [];
  const pathLine = path.map((e) => e.id).join(" → ") || "（空树）";
  const messages = path.length > 0 ? projectPath(path) : [];
  const last = messages[messages.length - 1];
  const preview = last ? last.content.replace(/\s+/g, " ").slice(0, 40) : "（无消息）";
  return [
    `👁 只读观测者已挂上：${stem}（共 ${entries.length} 珠）`,
    `【现场】状态=${state} ｜ 活跃路径：${pathLine}`,
    `【投影】模型此刻看到 ${messages.length} 条消息；最新一条：${preview}`,
    `跟随新珠中（Ctrl+C 退出）…`,
  ].join("\n");
}

// 两个只读函数跨不了界的红线：数变短 = 文件被重写，观测者只懂追加（intent 反例 5）
export function diffNew(prevCount: number, entries: Entry[], stem: string): Entry[] {
  if (entries.length < prevCount) {
    throw new Error(`会话文件变短（${prevCount} → ${entries.length}）——观测者只懂追加，文件被重写了？：${stem}`);
  }
  return entries.slice(prevCount);
}

// 主入口：快照 → 轮询上屏新珠。全程只读（无 append 调用、无 LLM 调用），异常上抛让 main 报非零退出。
const MAX_READ_FAILURES = 10; // 连续读失败 ≥10 轮（~10s）才判死——OCR 应修：Windows 文件锁/写入瞬间的读抖动不该杀观测者
export async function startWatch(stem: string): Promise<void> {
  const { entries } = readSession(stem);
  console.log(observeSnapshot(stem, entries));
  let shown = entries.length;
  let failures = 0;
  for (;;) {
    await new Promise((resolve) => setTimeout(resolve, POLL_MS));
    let cur: { header: SessionHeader; entries: Entry[] };
    try {
      cur = readSession(stem);
      failures = 0;
    } catch {
      failures += 1;
      if (failures >= MAX_READ_FAILURES) throw new Error(`连续 ${failures} 轮读不到会话文件，观测者退出：${stem}`);
      continue; // 瞬时抖动：这轮跳过，下轮重读（结构性损坏不会自愈，10 轮后照样带着真错误死）
    }
    for (const e of diffNew(shown, cur.entries, stem)) {
      console.log(`+珠 #${shown + 1} ${entryLabel(e)} [${e.id}]`);
      shown += 1;
    }
  }
}
