// projection.ts —— 投影（想法 #2 下半句）：树 → 模型看到的 messages，历史是算出来的不是存出来的
// 规则：无 compaction = 全量；有 = [摘要 user 消息] + firstKeptEntryId 起的保留段；
// 多条 compaction 只有最新贡献摘要，老的贡献零消息（pi 性质）。纯函数，不碰文件。
import type { CompactionEntry, Entry, Message, MessageEntry } from "./types.js";

function isMessage(e: Entry): e is MessageEntry {
  return e.type === "message";
}

export function buildProjection(entries: Entry[]): Message[] {
  // 顺序遍历，最后一条 compaction = 最新（多条只有它贡献摘要）
  let latest: CompactionEntry | null = null;
  for (let i = 0; i < entries.length; i++) {
    const e = entries[i]; // 先拷进 const——收窄只认 const 局部变量，索引表达式不吃
    if (e.type === "compaction") {
      latest = e;
    }
  }

  // 无压缩：全量投影
  if (!latest) {
    return entries.filter(isMessage).map((e) => e.message);
  }

  // 有压缩：保留段起点（firstKept 指向 compaction 条目**之前**的历史边界——pi 结构：
  // [被摘要段…][保留段…][COMPACT][之后新账]，保留段在 compaction 条目前面）
  const keptStart = entries.findIndex((e) => e.id === latest.firstKeptEntryId);
  if (keptStart === -1) {
    throw new Error(
      `投影失败：compaction ${latest.id} 的 firstKeptEntryId=${latest.firstKeptEntryId} 不在树里——会话文件损坏`,
    );
  }

  const messages: Message[] = [
    { role: "user", content: `【前情摘要】此前对话已压缩（原文仍在会话树中）：\n${latest.summary}` },
  ];
  for (let i = keptStart; i < entries.length; i++) {
    const e = entries[i];
    if (isMessage(e)) messages.push(e.message); // 老的 compaction 条目：贡献零消息，跳过
  }
  return messages;
}
