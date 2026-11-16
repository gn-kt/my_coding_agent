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

// —— Phase 3 新增：分支注脚（想法 #7，pi branch_summary 同款）——
// /back 时侧枝摘要成注脚挂回分叉点（主线叶）下；侧枝全文不进主线上下文，注脚代表它出场
export interface BranchSummaryEntry {
    id: string;
    parentId: string | null; // = 分叉点（主线叶），与侧枝根互为兄弟
    type: "branch_summary";
    term: string; // /explain 的术语——去重查它
    summary: string; // 注脚文本（模型生成的侧枝摘要）
    branchLeafId: string; // 被摘要侧枝的叶子——审计用（载入时不校验它）
    passed: boolean; // 复述检验结果——false = 注脚带「待巩固」标记（防假懂）
}

export type Entry = MessageEntry | CompactionEntry | BranchSummaryEntry;
