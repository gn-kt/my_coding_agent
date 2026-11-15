type Role = "system" | "user" | "assistant" | "tool";

interface ToolCall {
    id: string;
    name: string;
    arguments: string;
}

interface Message {
    role: Role;
    content: string;
    tool_calls?: ToolCall[]; 
}