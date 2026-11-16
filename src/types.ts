type Role = "system" | "user" | "assistant" | "tool";

export interface ToolCall {
    id: string;
    type: "function";
    function: {
        name: string;
        arguments: string;
    };
}

export interface Message {
    role: Role;
    content: string;
    tool_calls?: ToolCall[];
    tool_call_id?: string;
}

// —— Phase 2 新增：token 用量（GLM 响应自带，压缩触发靠它；响应缺 usage 时降级字符估算）——
export interface TokenUsage {
    totalTokens: number;
}

// —— Phase 2 新增：会话文件头（第 1 行，不在树内）——
export interface SessionHeader {
    type: "session";
    version: number;
    cwd: string;
    createdAt: string;
    systemPrompt: string;
}

// —— Phase 2 新增：会话树条目（判别联合，想法 #2）——
// id/parentId 管挂树；面单 type 管判别；货各不相同
export interface MessageEntry {
    id: string;
    parentId: string | null;
    type: "message";
    message: Message;
}

export interface CompactionEntry {
    id: string;
    parentId: string | null;
    type: "compaction";
    summary: string;
    firstKeptEntryId: string; // 保留段起点——摘要只换投影，原文留树
    tokensBefore: number; // 压缩发生时的上下文 token 数（审计用）
}

export type Entry = MessageEntry | CompactionEntry;