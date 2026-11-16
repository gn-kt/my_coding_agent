// session.ts —— 会话树 I/O（想法 #2 上半句）：JSONL 一行一条 entry，只追加不改写
import { appendFileSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import path from "node:path";
import type { Entry, Message, MessageEntry, SessionHeader } from "./types.js";

const SESSIONS_DIR = path.join(process.cwd(), "sessions");

function newId(): string {
  return randomUUID().slice(0, 8);
}

function timestamp(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

function filePath(stem: string): string {
  return path.join(SESSIONS_DIR, `${stem}.jsonl`);
}

// 新建会话：写第 1 行会话头（不在树内）。返回 stem（= 会话 id，--resume 的句柄）+ 头（agent 要用）
export function createSession(systemPrompt: string): { stem: string; header: SessionHeader } {
  mkdirSync(SESSIONS_DIR, { recursive: true });
  const stem = `${timestamp()}-${newId()}`;
  const header: SessionHeader = {
    type: "session",
    version: 1,
    cwd: process.cwd(),
    createdAt: new Date().toISOString(),
    systemPrompt,
  };
  writeFileSync(filePath(stem), JSON.stringify(header) + "\n");
  return { stem, header };
}

// 追加条目：树只增不改。生成 id、接上 parentId 链，落盘一行，返回完整条目给调用方入内存树
function appendRaw(stem: string, parentId: string | null, payload: object): Entry {
  const entry = { ...payload, id: newId(), parentId } as Entry;
  appendFileSync(filePath(stem), JSON.stringify(entry) + "\n");
  return entry;
}

export function appendMessage(stem: string, parentId: string | null, message: Message): Entry {
  return appendRaw(stem, parentId, { type: "message", message });
}

export function appendCompaction(
  stem: string,
  parentId: string | null,
  summary: string,
  firstKeptEntryId: string,
  tokensBefore: number,
): Entry {
  return appendRaw(stem, parentId, { type: "compaction", summary, firstKeptEntryId, tokensBefore });
}

export function appendBranchSummary(
  stem: string,
  parentId: string | null,
  fields: { term: string; summary: string; branchLeafId: string; passed: boolean },
): Entry {
  return appendRaw(stem, parentId, { type: "branch_summary", ...fields });
}

// 树形校验（Phase 3：从 Phase 2 的「线性成链」放宽为「合法树」——解释树要真分叉）。
// 不变式：parentId = null 或指向文件中**先于本条**出现的 id（追加写 ⇒ 父必先于子 ⇒ 环天然不可能，
// 环检测就藏在这条里）；外加唯一根 + 重复 id 两条。违反即抛错，调用方拒载（intent 反例 1）。
export function validateTree(entries: Entry[]): void {
  const indexOf = new Map<string, number>();
  let rootSeen = false;
  for (let i = 0; i < entries.length; i++) {
    const e = entries[i];
    if (indexOf.has(e.id)) {
      throw new Error(`重复条目 id：${e.id}`);
    }
    if (e.parentId === null) {
      if (rootSeen) {
        throw new Error(`第二个根条目：${e.id}——树只许一个根`);
      }
      rootSeen = true;
    } else {
      // 单次前向遍历里 map 只装得下先于本条的 id——「父必先于子」在这里同时完成存在性检查与环防控
      if (!indexOf.has(e.parentId)) {
        throw new Error(`悬空引用：entry ${e.id} 的 parentId=${e.parentId} 在文件中不存在`);
      }
    }
    indexOf.set(e.id, i);
  }
}

// 加载会话：fail-loud——文件缺/坏头/坏树，一律抛错拒载，不静默吞（intent 反例 1）
export function loadSession(stem: string): { header: SessionHeader; entries: Entry[] } {
  if (!existsSync(filePath(stem))) {
    throw new Error(`会话不存在：${stem}（用 --list 查看有哪些）`);
  }
  const lines = readFileSync(filePath(stem), "utf-8")
    .split("\n")
    .filter((line) => line.trim() !== "");

  const header = JSON.parse(lines[0]) as SessionHeader;
  if (header.type !== "session") {
    throw new Error(`会话文件第 1 行不是 session 头：${stem}`);
  }

  const entries: Entry[] = lines.slice(1).map((line) => JSON.parse(line) as Entry);
  try {
    validateTree(entries);
  } catch (e) {
    throw new Error(`${(e as Error).message}——${stem}`);
  }
  return { header, entries };
}

// 列会话（--list 用）：文件名含时间戳，倒序 = 最新在上
export function listSessions(): { stem: string; firstTask: string; entryCount: number }[] {
  if (!existsSync(SESSIONS_DIR)) return [];
  const out: { stem: string; firstTask: string; entryCount: number }[] = [];
  for (const name of readdirSync(SESSIONS_DIR)) {
    if (!name.endsWith(".jsonl")) continue;
    const stem = name.replace(/\.jsonl$/, "");
    const { entries } = loadSession(stem); // 坏文件在此抛错——fail-loud 口径一致
    const firstTask = entries.find((e): e is MessageEntry => e.type === "message" && e.message.role === "user")
      ?.message.content;
    out.push({ stem, firstTask: (firstTask ?? "（无任务消息）").slice(0, 50), entryCount: entries.length });
  }
  out.sort((a, b) => (a.stem < b.stem ? 1 : -1));
  return out;
}
