import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
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

const writeFileTool: Tool = {
  name: "write_file",
  description: "把内容写入指定路径的文件（覆盖式）",
  parameters: {
    type: "object",
    properties: {
      path: { type: "string", description: "目标文件路径" },
      content: { type: "string", description: "要写入的内容" },
    },
    required: ["path", "content"],            
  },
  execute: (args) => {
    const path = String(args.path);
    const content = String(args.content);     
    writeFileSync(path, content);
    return `已写入 ${path}（${content.length} 个字符）`;  
  },
};

const executeCommand: Tool = {
  name: "execute_command",
  description: "在用户电脑上执行一条 shell 命令，返回输出",
  parameters: {
    type: "object",
    properties: {
      command: { type: "string", description: "要执行的命令" },
    },
    required: ["command"],
  },
  execute: (args) => {
    const command = String(args.command);    
    return execSync(command, { encoding: "utf-8" });
  },
};

registry.set(writeFileTool.name, writeFileTool);
registry.set(executeCommand.name, executeCommand);

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