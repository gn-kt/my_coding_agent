// compaction.ts —— 上下文压缩（想法 #3）：阈值触发 + 合法切点 + 两级摘要
// 触发/切点/估算是纯函数（单测盯着）；summarize 调 GLM（压缩器也是模型）。
import type { Entry } from "./types.js";
import { chat } from "./llm.js";

// 触发判断（pi 同款）：used > window - reserve 就该压了——给收尾留足余量
export function shouldCompact(usedTokens: number, contextWindow: number, reserveTokens: number): boolean {
  return usedTokens > contextWindow - reserveTokens;
}

// 字符估算：usage 缺失时的降级计量（JSON 长度 / 2，宁高勿低）
export function estimateEntryTokens(entry: Entry): number {
  return Math.ceil(JSON.stringify(entry).length / 2);
}

// 合法切点（Q2 铁律的代码形态：永不切 tool 条目——切了就是孤儿，下一圈被 API 400 拒收）。
// 从最新往回累计 keepRecentTokens 预算，停下的位置往后找第一个合法条目（user/assistant 都合法；
// assistant 带 tool_calls 时结果排在它后面，天然跟着保留）。searchStart = 最新 compaction 之后
// 的起点（增量压缩只消化上次压缩后的新账）。找不到合法切点返回 -1，调用方本轮放弃。
export function findCutPoint(
  entries: Entry[],
  searchStart: number,
  keepRecentTokens: number,
  estimate: (e: Entry) => number = estimateEntryTokens,
): number {
  let acc = 0;
  let i = entries.length - 1;
  while (i > searchStart && acc < keepRecentTokens) {
    acc += estimate(entries[i]);
    i--;
  }
  for (let j = Math.max(i, searchStart + 1); j < entries.length; j++) {
    const e = entries[j]; // const 拷贝才吃收窄
    if (e.type === "message" && e.message.role === "tool") continue;
    return j;
  }
  return -1;
}

// —— 两级摘要 prompt（pi 模板：首次 = 结构化 checkpoint，有前摘要 = 增量更新）——
const CHECKPOINT_TEMPLATE = `你是会话压缩器。把下面的对话历史压缩成一份结构化 checkpoint，它将作为后续工作的唯一上下文。六节模板：

【目标】当前要完成什么
【约束与偏好】硬性约束、用户偏好
【进展】Done（已完成）/ In Progress（进行中）/ Blocked（被卡住）
【关键决策】决定 + 一句话理由
【下一步】接下来做什么
【关键上下文】精确文件路径、函数名、报错原文——必须原样保留，不许转述

对话历史：
`;

const INCREMENTAL_TEMPLATE = `你是会话压缩器。已有 checkpoint 摘要 + 新增对话如下。规则：PRESERVE——旧摘要的信息一字不丢，只增补新推进（In Progress 完成的移进 Done，新决策进关键决策）。输出更新后的完整 checkpoint，六节同前。

旧摘要：
`;

function renderEntries(entries: Entry[]): string {
  return entries
    .map((e) => {
      if (e.type === "compaction") return `[旧压缩摘要] ${e.summary}`;
      if (e.type === "branch_summary") return `[注脚·${e.term}] ${e.summary}`; // Phase 3：主线路径上的注脚也是历史，压缩器要看得见
      const m = e.message;
      const who = m.role === "tool" ? `工具结果(${m.tool_call_id})` : m.role;
      return `${who}: ${m.content}`;
    })
    .join("\n");
}

// 生成摘要：有前摘要走增量模板（PRESERVE），没有走 checkpoint 模板。
// 压缩调用不带工具（[], "none"）——压缩器只许输出文本。
export async function summarize(entries: Entry[], previousSummary: string | null): Promise<string> {
  const history = renderEntries(entries);
  const prompt = previousSummary
    ? `${INCREMENTAL_TEMPLATE}${previousSummary}\n\n新增对话：\n${history}`
    : `${CHECKPOINT_TEMPLATE}${history}`;
  const { message } = await chat([{ role: "user", content: prompt }], [], "none");
  return message.content;
}
