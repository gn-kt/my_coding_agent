// explain.ts —— 解释树（想法 #7）：侧枝问答 + 复述检验 + 注脚生成
// 侧枝三铁律（intent 反例 2/3/4）：全文不进主线上下文（回主线只靠注脚）；
// 复述不过不静默回主线（注脚带「待巩固」）；物理禁工具（chat 不发 tools 字段，同软着陆手法）。
import type { Entry, Message, SessionHeader } from "./types.js";
import { chat } from "./llm.js";
import { appendMessage } from "./session.js";
import { buildProjection } from "./projection.js";

// 侧枝根标记：/explain 的首条 user 条目前缀——resume 靠它在活跃路径上认出「正站在侧枝里」
export const BRANCH_MARKER = "【侧枝提问】";

// 侧枝系统提示后缀：主 system prompt 要求「必须调用工具」，侧枝恰恰相反——不发 tools 的同时
// 把话说明白，两头堵住，模型不再尝试开单
const BRANCH_SYSTEM_SUFFIX = "\n当前处于解释模式侧枝：你没有工具，只做讲解，用大白话。";

export function makeBranchQuestion(term: string): string {
  return `${BRANCH_MARKER}${term}——请解释这个概念，用大白话。`;
}

export function parseBranchTerm(content: string): string {
  return content.slice(BRANCH_MARKER.length).split("——")[0].trim();
}

// 复述检验判定标记：prompt 与 parser 共用同一常量——两处各写一份迟早漂移（OCR 评审采纳）
export const VERDICT_PASS = "【判定：通过】";
export const VERDICT_FAIL = "【判定：不通过】";

// 复述检验判定：回复里必须带标记；缺失或不通过都算不过（宁严勿松，intent 反例 3）。
// 模型输出的冒号/空格是方言（坑 4 家族）：半角「判定:」、标记里混空格都会漏判——先收编再匹配。
export function parseVerdict(text: string): boolean {
  const t = text.replace(/\s+/g, "").replace(/判定:/g, "判定：");
  if (t.includes(VERDICT_FAIL)) return false;
  return t.includes(VERDICT_PASS);
}

export const PROMPTS = {
  checkQuestion: "【系统】用户要回主线了。请基于本次解释出一道复述检验题：一题、考核核心理解、不要超纲。只出题，不要自己回答。",
  judge: `【系统】上面是用户的复述。请先一句话点评，然后判定是否抓住要点，回复末尾必须带${VERDICT_PASS}或${VERDICT_FAIL}。`,
  reexplain: "【系统】复述没答到点上。请针对没答对的地方再用大白话讲一遍，讲完另出一道新的复述检验题。",
  footnote: "【系统】回主线前把本次解释链压成注脚：术语是什么、核心结论、追问过哪些点。150 字以内，纯文本。",
} as const;

// 树尾 id：追加写 ⇒ 数组最后一条就是活跃叶（主线/侧枝通用）
export function tailId(entries: Entry[]): string | null {
  return entries.length > 0 ? entries[entries.length - 1].id : null;
}

// 侧枝通用一问：content 入账（可带第二段 instruction，如判定指令）→ 按活跃路径投影（无工具）发车 → 回答回账。
// 全部侧枝交互（追问/出题/判定/注脚）都走这一条路——账本原则：模型可见即已记录。
export async function talk(
  stem: string,
  header: SessionHeader,
  entries: Entry[],
  content: string,
  instruction?: string,
): Promise<string> {
  const q = appendMessage(stem, tailId(entries), { role: "user", content });
  entries.push(q);
  if (instruction) {
    const inst = appendMessage(stem, tailId(entries), { role: "user", content: instruction });
    entries.push(inst);
  }
  const messages: Message[] = [
    { role: "system", content: header.systemPrompt + BRANCH_SYSTEM_SUFFIX },
    ...buildProjection(entries),
  ];
  const { message } = await chat(messages, [], "none"); // "none" = 连工具登记簿都不发——物理禁开单
  const replyEntry = appendMessage(stem, tailId(entries), message);
  entries.push(replyEntry);
  return message.content;
}
