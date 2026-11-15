import type { Message } from "./types.js";
import { chat } from "./llm.js";
import { getToolSchemas, executeTool } from "./tools.js";

const SYSTEM_PROMPT = "你是运行在用户电脑上的编码助手。凡涉及查看或操作用户电脑上文件的任务，必须调用工具实际执行，不要只给建议、不要让用户自己动手。回答用中文。";

export async function runAgent(task: string, maxSteps: number): Promise<string> {
  // 账本第一页：岗位说明书 + 用户任务（你 G0 答的「第一圈发什么」）
  const messages: Message[] = [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: task },
  ];

  for (let step = 1; step <= maxSteps; step++) {
    console.log(`—— 第 ${step} 圈 ——`);
    const reply = await chat(messages, getToolSchemas());
    messages.push(reply);                       // 账本追加：模型的回答（可能带工单）

    if (!reply.tool_calls || reply.tool_calls.length === 0) {
      return reply.content;                     // 不开单 = 收工
    }

    for (const call of reply.tool_calls) {      // 这轮开了几张单，逐张执行
      console.log(`开单：${call.function.name} 参数：${call.function.arguments}`);
      const result = executeTool(call);         // 哨兵接管
      messages.push(result);                    // 账本追加：结果（或错误文本）
    }
  }

  return `已到 ${maxSteps} 圈硬上限，强制收工`;   // 想法 #1 的 Phase 1 兜底形态
}