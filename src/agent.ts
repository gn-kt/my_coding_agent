import type { Entry, SessionHeader, TokenUsage } from "./types.js";
import { chat } from "./llm.js";
import { getToolSchemas, executeTool } from "./tools.js";
import { appendMessage, appendCompaction } from "./session.js";
import { buildProjection, pathFromLeaf } from "./projection.js";
import { shouldCompact, findCutPoint, summarize } from "./compaction.js";

export const SYSTEM_PROMPT = "你是运行在用户电脑上的编码助手。凡涉及查看或操作用户电脑上文件的任务，必须调用工具实际执行，不要只给建议、不要让用户自己动手。回答用中文。";

export interface CompactionConfig {
  contextWindow: number;
  reserveTokens: number;
  keepRecentTokens: number;
}

export async function runAgent(opts: {
  stem: string;
  header: SessionHeader;
  entries: Entry[]; // 内存树（loadSession 给历史，新会话给 []）；本函数边跑边往里追加
  task: string;
  maxSteps: number;
  compaction: CompactionConfig;
}): Promise<string> {
  const { stem, header, entries, task, maxSteps, compaction } = opts;
  let lastId: string | null = entries.length > 0 ? entries[entries.length - 1].id : null;
  let lastUsage: TokenUsage | null = null; // 最近一次响应的 token 账单（压缩触发靠它，pi 口径）

  // 任务入账：模型可见即已记录——新任务/续跑任务都作为 user 条目进树
  const taskEntry = appendMessage(stem, lastId, { role: "user", content: task });
  entries.push(taskEntry);
  lastId = taskEntry.id;

  for (let step = 1; step <= maxSteps; step++) {
    const isFinalRound = step === maxSteps;

    // 软着陆（想法 #1）：最后一圈入账收尾指令 + 摘除工具（物理禁开单）；倒数第二圈先预警
    if (isFinalRound) {
      const notice = appendMessage(stem, lastId, {
        role: "user",
        content: "【系统】这是最后一圈步数预算：请直接给出最终回答，不要再调用任何工具。",
      });
      entries.push(notice);
      lastId = notice.id;
      console.log("—— 最后一圈，软着陆：强制文本收尾 ——");
    } else if (step === maxSteps - 1) {
      console.log("⚠️ 还剩 1 圈，请抓紧收尾");
    }

    // 压缩检查（pi 口径：发车前）。首轮还没有 usage，天然跳过
    if (lastUsage && shouldCompact(lastUsage.totalTokens, compaction.contextWindow, compaction.reserveTokens)) {
      const newTail = await compactIfNeeded(stem, entries, lastId, lastUsage.totalTokens, compaction);
      if (newTail !== null) lastId = newTail;
    }

    // 投影：树 → 本圈 messages（历史是算出来的，不是存出来的）
    const messages = [{ role: "system" as const, content: header.systemPrompt }, ...buildProjection(entries)];

    console.log(`—— 第 ${step} 圈 ——`);
    const { message: reply, usage } = await chat(messages, getToolSchemas(), isFinalRound ? "none" : "auto");
    lastUsage = usage;
    const replyEntry = appendMessage(stem, lastId, reply); // 账本追加：模型的回答（可能带工单）
    entries.push(replyEntry);
    lastId = replyEntry.id;

    if (!reply.tool_calls || reply.tool_calls.length === 0) {
      return reply.content; // 不开单 = 收工（软着陆圈摘除了工具，必然走到这）
    }

    for (const call of reply.tool_calls) {
      console.log(`开单：${call.function.name} 参数：${call.function.arguments}`);
      const result = executeTool(call); // 哨兵接管
      const resultEntry = appendMessage(stem, lastId, result); // 结果（或错误文本）入树
      entries.push(resultEntry);
      lastId = resultEntry.id;
    }
  }

  // 理论不可达：最后一圈摘除工具必返文本；这行只防 API 异常路径
  return `已到 ${maxSteps} 圈硬上限，强制收工`;
}

// 压缩三步：找切点 → 两级摘要 → compaction 条目进树（原文零删除）。
// Phase 3 改路径感知：在活跃路径（=主线路径，runAgent 只在主线跑）上找切点和消化区——
// 树里有侧枝后，扫全量 entries 会误摘要侧枝内容、切点可能落在侧枝上（firstKept 不在主线路径 = 投影炸）。
// 返回新链尾 id；没找到合法切点时返回 null（调用方保持原链尾）。
async function compactIfNeeded(
  stem: string,
  entries: Entry[],
  lastId: string | null,
  tokensBefore: number,
  compaction: CompactionConfig,
): Promise<string | null> {
  const path = pathFromLeaf(entries, lastId);

  // 增量消化区：路径上最新 compaction 之后（首次压缩 = 全路径，searchStart=0）
  let searchStart = 0;
  for (let i = 0; i < path.length; i++) {
    if (path[i].type === "compaction") searchStart = i + 1;
  }

  const cut = findCutPoint(path, searchStart, compaction.keepRecentTokens);
  if (cut === -1) return null; // 没有合法切点：本轮放弃，下圈再试

  // 前摘要：消化区前一条就是上次的 compaction（有 = 增量模板，无 = checkpoint 模板）
  let previousSummary: string | null = null;
  if (searchStart > 0) {
    const prev = path[searchStart - 1];
    if (prev.type === "compaction") previousSummary = prev.summary;
  }

  const summarized = path.slice(searchStart, cut);
  console.log(`📦 上下文 ${tokensBefore} tokens 超限——压缩 ${summarized.length} 条历史（原文留树）`);
  const summary = await summarize(summarized, previousSummary);

  const compactionEntry = appendCompaction(stem, lastId, summary, path[cut].id, tokensBefore);
  entries.push(compactionEntry);
  return compactionEntry.id;
}
