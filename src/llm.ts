import type { Message } from "./types.js";

const DEFAULT_BASE_URL = "https://open.bigmodel.cn/api/paas/v4";
const DEFAULT_MODEL = "glm-5.3-flash";

export async function chat(messages: Message[], tools: unknown[]): Promise<Message> {
    const baseUrl = process.env.GLM_BASE_URL ?? DEFAULT_BASE_URL;
    const model = process.env.GLM_MODEL ?? DEFAULT_MODEL;

    const res = await fetch(`${baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${process.env.GLM_API_KEY}`,
        },
        body: JSON.stringify({ model, messages, tools }),
    });

    const data = await res.json();
    if (data.error) {
        throw new Error(`GLM API 错误 ${data.error.code}: ${data.error.message}`);
    }
    return data.choices[0].message;
}