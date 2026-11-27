// probe.ts —— 想法 #6 第二段：实测探针（各 1 次真请求）+ verdict 纯函数。
// 探针 = 把主循环第一圈抽出来单独当考卷：「发菜单 → 看它开不开单」——判据和 agent.ts 同一把刀
// （tool_calls 非空才走工具链），判据漂移 = 两法官打架（站 5 教训）。
// 探针只看回包、绝不执行工具——--check 零副作用的保证。
import { chat } from "./llm.js";
import { getToolSchemas } from "./tools.js";
import type { TokenUsage } from "./types.js";

export interface ProbeVerdict {
  passed: boolean;
  detail: string;
}

// verdict 纯函数：开了几单
export function judgeToolCalls(toolCalls: unknown[] | undefined | null): ProbeVerdict {
  const n = Array.isArray(toolCalls) ? toolCalls.length : 0;
  return n > 0
    ? { passed: true, detail: `开了 ${n} 张工单——工具调用链路通` }
    : { passed: false, detail: "只说话不开单（tool_calls 空/缺）——主循环拿到这种模型必然空转" };
}

// verdict 纯函数：账单回没回。usage: null ⟺ API 没回账单（parseUsage 口径）——
// 压缩触发器靠它，哑火 = 上下文只会涨不会压（v2.0 坑 9 同族）。
// 数值合法性一并校（OCR 采纳）：totalTokens 不是数 = 同哑火，探针就是抓这个的
export function judgeUsage(usage: TokenUsage | null): ProbeVerdict {
  return usage && typeof usage.totalTokens === "number"
    ? { passed: true, detail: `账单回传（total ${usage.totalTokens} tokens）——压缩触发器有米下锅` }
    : { passed: false, detail: "usage 未回传/非法——压缩触发器哑火，长会话必爆窗" };
}

// 探针 1：发完整工具菜单 + 明确指令——支持工具调用的模型必然回 tool_calls（考能力不考判断力，
// 指令写死「直接调用工具」消除歧义）；不支持的工具/方言要么纯文本要么 4xx。
// 工具名从登记簿派生（OCR 采纳）——注册表改名探针不假阴性；探针只看回包，目标文件存在与否无关紧要
export async function probeToolCalls(): Promise<ProbeVerdict> {
  const firstTool = getToolSchemas()[0]?.function?.name;
  if (!firstTool) return { passed: false, detail: "登记簿是空的——没有工具可考" };
  try {
    const { message } = await chat(
      [{ role: "user", content: `请调用 ${firstTool} 工具读取文件 package.json。直接调用工具，不要用文字回答。` }],
      getToolSchemas(),
      "auto",
    );
    if (!message) return { passed: false, detail: "回包缺 message 字段——无法判定工具调用（OCR 采纳：别让 TypeError 顶包）" };
    return judgeToolCalls(message.tool_calls);
  } catch (e) {
    return { passed: false, detail: `请求失败（fail-loud 如实报）：${(e as Error).message}` };
  }
}

// 探针 2：最小请求看 usage 回不回传（"none" = 不发工具菜单，纯账单检查）
export async function probeUsage(): Promise<ProbeVerdict> {
  try {
    const { usage } = await chat([{ role: "user", content: "回复两个字：在的" }], [], "none");
    return judgeUsage(usage);
  } catch (e) {
    return { passed: false, detail: `请求失败（fail-loud 如实报）：${(e as Error).message}` };
  }
}
