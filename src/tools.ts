import { readFileSync } from "node:fs";
import type { Message, ToolCall } from "./types.js"

interface Tool {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
    execute: (args: Record<string, unknown>) => string;
}

const readFile: Tool = {
    name: "read_file",
    description: "读取指定路径的文本文件，返回全部内容",
    parameters: {
        type: "object",
        properties: {
            path: { type: "string", description: "要读的文件路径" },
        },
        required: ["path"],
    },
    execute: (args) => {
        const path = String(args.path);
        return readFileSync(path, "utf-8");
    },
};

export const registry = new Map<string, Tool>();

registry.set(readFile.name, readFile);

export function getToolSchemas() {
    return [...registry.values()].map((tool) => ({
        type: "function",
        function: {
            name: tool.name,
            description: tool.description,
            parameters: tool.parameters,
        },
    }));
}

export function executeTool(call: ToolCall): Message {
    const tool = registry.get(call.function.name);

    if (!tool) {
        return {
            role: "tool",
            tool_call_id: call.id,
            content: `错误：登记本里没有叫 [${call.function.name}] 的工具`,
        };
    }

    try {
        const args = JSON.parse(call.function.arguments);
        const result = tool.execute(args);
        return { role: "tool", tool_call_id: call.id, content: result };
    } catch (err) {
        return { role: "tool", tool_call_id: call.id, content: `工具执行出错：${String(err)}` };
    }
}