// approval.ts —— L0 两档审批门（想法 #9）：safe/yolo 全局开关 + write_file 工作区围挡。
// 信任模型连着 API 面一起设计（pi 判断③）：门只有一个下手点（agent.ts 哨兵前），
// 决定是判别联合三面单——pass/ask/block，章（kind）盖在面单上，编译器管收窄。
// fail-closed 两处落地：越界 block 两档不豁免；问人无人应答 = 不执行（TTY 挂起等答 /
// 管道流尽 = 视为拒绝），绝不超时放行、绝不静默透传。
import path from "node:path";
import type { Message, ToolCall } from "./types.js";

export type GateMode = "safe" | "yolo";

export type GateDecision =
  | { kind: "pass"; tool: string } // 直放（safe 的 read / yolo 的全部）
  | { kind: "ask"; tool: string; prompt: string } // 问人（safe 的 write/execute）
  | { kind: "block"; tool: string; reason: string }; // 硬拦（围挡越界 / 参数算不出围挡）

export type Asker = (prompt: string) => Promise<boolean>;

// 工作区围挡：resolve 吸掉 .. 漂移，relative 判越界——精确分量判断（OCR 采纳）：
// "..foo.txt" 是合法文件名不算逃逸，".." 与 "..<sep>" 前缀才是；异盘绝对路径 relative
// 回原样（isAbsolute 命中）→ 也算越界。
export function isInsideWorkspace(target: string, workspaceRoot: string): boolean {
  const rel = path.relative(workspaceRoot, path.resolve(workspaceRoot, target));
  return rel !== ".." && !rel.startsWith(`..${path.sep}`) && !path.isAbsolute(rel);
}

// 判定顺序：围挡先于档位（硬边界不随档位松）→ yolo 全放 → safe：read 直放、其余问人。
export function decideGate(
  toolName: string,
  args: Record<string, unknown>,
  mode: GateMode,
  workspaceRoot: string,
): GateDecision {
  if (toolName === "write_file") {
    // path 必须是非空字符串才核对围挡（OCR 采纳）：String() 强转会把数组/对象捏成
    // 「看着合法」的路径、缺 path 会静默当根目录——围挡算不出 = 宁拦不放
    const raw = args.path;
    if (typeof raw !== "string" || raw.trim() === "") {
      return {
        kind: "block",
        tool: toolName,
        reason: `write_file 缺少合法 path 参数（${JSON.stringify(raw ?? null)}），围挡无从核对`,
      };
    }
    if (!isInsideWorkspace(raw, workspaceRoot)) {
      return { kind: "block", tool: toolName, reason: `落点「${raw}」在工作区 ${workspaceRoot} 之外` };
    }
  }
  if (mode === "yolo") return { kind: "pass", tool: toolName };
  if (toolName === "read_file") return { kind: "pass", tool: toolName };
  const what =
    toolName === "execute_command" ? `执行命令：${String(args.command ?? "(?)")}` : `写入：${String(args.path ?? "(?)")}`;
  return { kind: "ask", tool: toolName, prompt: `safe 档需要批准${what}` };
}

// 工单参数解析（给围挡核对用）：解析失败 / 非对象 = null → 调用方按 block 处理
// （围挡算不出 = 拦，宁严勿松；原来 executeTool 的 catch 报错路径对坏参数会照跑，门这层先挡）。
export function parseToolArgs(call: ToolCall): Record<string, unknown> | null {
  try {
    const v: unknown = JSON.parse(call.function.arguments);
    return typeof v === "object" && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

// 方案 A（intent 已定）：拒绝/拦截折进工具结果正文——树里这条结果就是审计记录，
// 模型天然看得到被拒（反例 3），零新条目类型、投影零改动。
export function denyResult(call: ToolCall): Message {
  return {
    role: "tool",
    tool_call_id: call.id,
    content: `用户拒绝了这次 ${call.function.name}：未执行。请调整方案（换路径或换做法），不要原样重试。`,
  };
}

export function blockResult(call: ToolCall, reason: string): Message {
  return {
    role: "tool",
    tool_call_id: call.id,
    content: `工作区围挡拦截（未执行）：${reason}。请把目标改到工作区内再试。`,
  };
}

// y/n 解析：只有明确 y 开头才算批准（宁严勿松——空串/乱按都当拒绝）
export function isYes(answer: string): boolean {
  return answer.trim().toLowerCase().startsWith("y");
}
