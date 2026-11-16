// projection.ts —— 投影（想法 #2 下半句）：树 → 模型看到的 messages，历史是算出来的不是存出来的
// Phase 3 升级：从「线性数组过滤」改为「活跃路径投影」（pi buildSessionPath 同款）——
// 从活跃叶子沿 parentId 走到根；侧枝不在路径上就自然消失，只以 branch_summary 注脚出场（想法 #7）。
// 纯函数，不碰文件。
import type { CompactionEntry, Entry, Message, MessageEntry } from "./types.js";

function isMessage(e: Entry): e is MessageEntry {
  return e.type === "message";
}

// 活跃路径：叶子 → 根，返回根 → 叶序的数组。runAgent / repl / /tree 共用。
// 链上任何一环找不到 = 树外 id / 悬空引用，fail-loud（resume 的校验口径与 loadSession 一致）。
export function pathFromLeaf(entries: Entry[], leafId: string | null): Entry[] {
  const byId = new Map(entries.map((e) => [e.id, e] as const));
  const path: Entry[] = [];
  let curId = leafId;
  while (curId !== null) {
    const cur = byId.get(curId);
    if (!cur) {
      throw new Error(`路径构建失败：entry ${curId} 不在树里（叶子=${leafId}）——会话树损坏`);
    }
    path.push(cur);
    curId = cur.parentId;
    if (path.length > entries.length) {
      throw new Error("路径构建失败：链长超过树长——疑似环，会话树损坏");
    }
  }
  return path.reverse(); // 根 → 叶
}

// 单条 entry 对投影的贡献：message 原样；branch_summary 折成注脚 user 消息
// （复述未过的带「待巩固」标记——注脚可以不完美，但绝不能假装没问题）；compaction 条目贡献零消息。
function pushEntryMessage(e: Entry, messages: Message[]): void {
  if (isMessage(e)) {
    messages.push(e.message);
  } else if (e.type === "branch_summary") {
    const mark = e.passed ? "" : "｜复述未过，待巩固";
    messages.push({ role: "user", content: `【注脚·${e.term}${mark}】${e.summary}` });
  }
}

// 路径 → messages。路径上最新 compaction = 摘要 + firstKept 起的保留段（多条只有最新贡献摘要，
// pi 性质）；firstKept 不在路径上 = 树损坏，fail-loud。无 compaction = 全路径。
export function projectPath(path: Entry[]): Message[] {
  let latest: CompactionEntry | null = null;
  for (const e of path) {
    if (e.type === "compaction") latest = e;
  }

  if (!latest) {
    const messages: Message[] = [];
    for (const e of path) pushEntryMessage(e, messages);
    return messages;
  }

  const keptIdx = path.findIndex((e) => e.id === latest.firstKeptEntryId);
  if (keptIdx === -1) {
    throw new Error(
      `投影失败：compaction ${latest.id} 的 firstKeptEntryId=${latest.firstKeptEntryId} 不在活跃路径上——会话文件损坏`,
    );
  }

  const messages: Message[] = [
    { role: "user", content: `【前情摘要】此前对话已压缩（原文仍在会话树中）：\n${latest.summary}` },
  ];
  for (let i = keptIdx; i < path.length; i++) {
    pushEntryMessage(path[i], messages);
  }
  return messages;
}

// 兼容入口：活跃叶子 = 数组最后一条（追加写 ⇒ 最后一条就是当前所在分支的叶子）。
// 主线任务和侧枝问答都走这里——站在哪条枝上，就看到哪条枝的前史。
export function buildProjection(entries: Entry[]): Message[] {
  const leafId = entries.length > 0 ? entries[entries.length - 1].id : null;
  return projectPath(pathFromLeaf(entries, leafId));
}

// 树形文本（/tree 用）：根 → 叶深度优先，分叉处 ├─/└─，每行带 id 方便 /resume 定位。纯展示。
export function renderTree(entries: Entry[]): string {
  const children = new Map<string | null, Entry[]>();
  for (const e of entries) {
    const list = children.get(e.parentId) ?? [];
    list.push(e);
    children.set(e.parentId, list);
  }

  const label = (e: Entry): string => {
    const flat = (s: string) => s.replace(/\s+/g, " ").trim().slice(0, 30);
    if (e.type === "compaction") return `📦 压缩: ${flat(e.summary)}`;
    if (e.type === "branch_summary") return `📄 注脚·${e.term}${e.passed ? "" : "（待巩固）"}: ${flat(e.summary)}`;
    const m = e.message;
    const who = m.role === "tool" ? "tool" : m.role;
    return `${who}: ${flat(m.content)}`;
  };

  const lines: string[] = [];
  const walk = (parentId: string | null, prefix: string): void => {
    const list = children.get(parentId) ?? [];
    list.forEach((e, i) => {
      const isLast = i === list.length - 1;
      lines.push(`${prefix}${isLast ? "└─ " : "├─ "}${label(e)} [${e.id}]`);
      walk(e.id, prefix + (isLast ? "   " : "│  "));
    });
  };
  walk(null, "");
  return lines.join("\n");
}
