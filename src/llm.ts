import type { Message, TokenUsage } from "./types.js";

const DEFAULT_BASE_URL = "https://open.bigmodel.cn/api/paas/v4";
export const DEFAULT_MODEL = "glm-5.3-flash"; // 导出（OCR 采纳）：--check 与请求通道共用同一默认，防两处硬编码漂移

export interface ChatResult {
    message: Message;
    usage: TokenUsage | null; // GLM 自带的 token 账单（压缩触发靠它）；响应缺 usage 时调用方降级字符估算
}

// GLM 线上格式是 snake_case（total_tokens）——在 seam 处收编成我们的 camelCase 合同，
// 不做映射就 cast 的话，运行时 totalTokens === undefined（坑 4 变体：typecheck 全绿、触发器哑火）
function parseUsage(raw: unknown): TokenUsage | null {
    if (!raw || typeof raw !== "object") return null;
    const totalTokens = (raw as { total_tokens?: unknown }).total_tokens;
    return typeof totalTokens === "number" ? { totalTokens } : null;
}

export async function chat(
    messages: Message[],
    tools: unknown[],
    toolChoice: "auto" | "none" = "auto",
): Promise<ChatResult> {
    const baseUrl = process.env.GLM_BASE_URL ?? DEFAULT_BASE_URL;
    const model = process.env.GLM_MODEL ?? DEFAULT_MODEL;

    // 软着陆圈的实现取巧："none" = 连登记簿都不发——模型看不见工具，物理上开不了单。
    // 比 tool_choice:"none" 更稳（不赌方言支持度），请求体退化成普通对话。
    const body: Record<string, unknown> = { model, messages };
    if (toolChoice === "auto") {
        body.tools = tools;
    }

    const res = await fetch(`${baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${process.env.GLM_API_KEY}`,
        },
        body: JSON.stringify(body),
    });

    const data = await res.json();
    if (data.error) {
        throw new Error(`GLM API 错误 ${data.error.code}: ${data.error.message}`);
    }
    if (!data.choices?.[0]) {
        // 坑 5 口径：判成功看 choices 在不在，别只看状态码
        throw new Error(`GLM 响应缺 choices：${JSON.stringify(data).slice(0, 200)}`);
    }
    return { message: data.choices[0].message, usage: parseUsage(data.usage) };
}
