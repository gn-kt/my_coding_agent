// approval 纯函数单测（想法 #9-L0）：三面单 × 两档矩阵 + 围挡越界 + 方案 A 结果正文
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  decideGate,
  isInsideWorkspace,
  denyResult,
  blockResult,
  isYes,
  parseToolArgs,
} from "../src/approval.js";
import type { ToolCall } from "../src/types.js";

const ROOT = "D:/tmp/work"; // 围挡根（win32 语义：异盘绝对路径判越界）

test("safe 档 read_file 直放零弹卡（验收 1）", () => {
  const d = decideGate("read_file", { path: "notes/a.md" }, "safe", ROOT);
  assert.equal(d.kind, "pass");
});

test("safe 档 write/execute 问人——ask 面单带参数摘录", () => {
  const w = decideGate("write_file", { path: "notes/a.md", content: "x" }, "safe", ROOT);
  assert.equal(w.kind, "ask");
  if (w.kind === "ask") assert.match(w.prompt, /notes\/a\.md/);

  const e = decideGate("execute_command", { command: "rm -rf draft" }, "safe", ROOT);
  assert.equal(e.kind, "ask");
  if (e.kind === "ask") assert.match(e.prompt, /rm -rf draft/);
});

test("yolo 档三工具全直放零弹卡（验收 4）", () => {
  assert.equal(decideGate("read_file", {}, "yolo", ROOT).kind, "pass");
  assert.equal(decideGate("write_file", { path: "notes/a.md" }, "yolo", ROOT).kind, "pass");
  assert.equal(decideGate("execute_command", { command: "dir" }, "yolo", ROOT).kind, "pass");
});

test("围挡越界两档都 block，yolo 不豁免（验收 3 / 反例 4 硬边界）", () => {
  for (const mode of ["safe", "yolo"] as const) {
    const up = decideGate("write_file", { path: "../escape.txt" }, mode, ROOT); // .. 漂移
    assert.equal(up.kind, "block");
    if (up.kind === "block") assert.match(up.reason, /工作区 .* 之外/);

    const abs = decideGate("write_file", { path: "C:/elsewhere/x.txt" }, mode, ROOT); // 异盘绝对
    assert.equal(abs.kind, "block");
  }
});

test("围挡先于档位：越界的 block 不因 yolo 变 pass（判定顺序）", () => {
  const d = decideGate("write_file", { path: "../out.txt" }, "yolo", ROOT);
  assert.equal(d.kind, "block");
});

test("isInsideWorkspace：相对在内 / .. 被 resolve 吸掉 / 根本身不算逃逸 / 异盘在外", () => {
  assert.equal(isInsideWorkspace("notes/a.md", ROOT), true);
  assert.equal(isInsideWorkspace("notes/../b.txt", ROOT), true);
  assert.equal(isInsideWorkspace("../outside.txt", ROOT), false);
  assert.equal(isInsideWorkspace("C:/elsewhere/x.txt", ROOT), false);
  assert.equal(isInsideWorkspace(".", ROOT), true); // 根本身：写目录会自然报错，不算越界
});

test("isInsideWorkspace：..foo.txt 是合法文件名不算逃逸；父目录本体算逃逸（OCR 采纳·精确分量）", () => {
  assert.equal(isInsideWorkspace("..foo.txt", ROOT), true);
  assert.equal(isInsideWorkspace("notes/..foo.txt", ROOT), true);
  assert.equal(isInsideWorkspace("..", ROOT), false);
  assert.equal(isInsideWorkspace("../", ROOT), false);
});

test("write_file 缺 path / 非字符串 path → block（OCR 采纳：强转造假与缺失静默都封死）", () => {
  for (const bad of [{}, { path: "" }, { path: "   " }, { path: ["../escape.txt"] }, { path: { evil: 1 } }]) {
    const d = decideGate("write_file", bad as Record<string, unknown>, "yolo", ROOT);
    assert.equal(d.kind, "block");
    if (d.kind === "block") assert.match(d.reason, /path/);
  }
});

test("parseToolArgs：坏 JSON / 非对象 / 数组 = null——围挡算不出按 block 处理（宁严勿松）", () => {
  const call = (raw: string): ToolCall => ({
    id: "c1",
    type: "function",
    function: { name: "write_file", arguments: raw },
  });
  assert.deepEqual(parseToolArgs(call('{"path":"a.txt"}')), { path: "a.txt" });
  assert.equal(parseToolArgs(call("not-json")), null);
  assert.equal(parseToolArgs(call("[1,2]")), null);
  assert.equal(parseToolArgs(call("null")), null);
});

test("方案 A：拒/拦结果正文讲真话——role=tool、含「未执行」，模型看得到被拒（反例 3）", () => {
  const c: ToolCall = { id: "c9", type: "function", function: { name: "execute_command", arguments: "{}" } };
  const deny = denyResult(c);
  assert.equal(deny.role, "tool");
  assert.equal(deny.tool_call_id, "c9");
  assert.match(deny.content, /拒绝/);
  assert.match(deny.content, /未执行/);

  const block = blockResult(c, "落点在工作区外");
  assert.match(block.content, /围挡拦截/);
  assert.match(block.content, /未执行/);
});

test("isYes：只有 y 开头算批准——空串/n/乱按都当拒绝（宁严勿松）", () => {
  assert.equal(isYes("y"), true);
  assert.equal(isYes(" Yes "), true);
  assert.equal(isYes(""), false);
  assert.equal(isYes("n"), false);
  assert.equal(isYes("ok"), false);
});
