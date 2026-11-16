// compaction 纯函数单测：触发判断 + 合法切点（Q2 铁律的断言形态）
import { test } from "node:test";
import assert from "node:assert/strict";
import { shouldCompact, findCutPoint, estimateEntryTokens } from "../src/compaction.js";
import type { Entry, Message } from "../src/types.js";

let seq = 0;
function msg(role: Message["role"], content: string, withToolCall = false): Entry {
  seq += 1;
  const message: Message = { role, content };
  if (withToolCall) {
    message.tool_calls = [
      { id: `call-${seq}`, type: "function", function: { name: "read_file", arguments: "{}" } },
    ];
  }
  return { id: `e${seq}`, parentId: null, type: "message", message };
}
function compactEntry(summary: string, firstKeptEntryId: string): Entry {
  seq += 1;
  return { id: `e${seq}`, parentId: null, type: "compaction", summary, firstKeptEntryId, tokensBefore: 0 };
}

test("shouldCompact：used 超过 window-reserve 才触发", () => {
  assert.equal(shouldCompact(100, 1000, 900), false); // 100 > 100 不成立
  assert.equal(shouldCompact(101, 1000, 900), true); // 101 > 100 触发
});

test("findCutPoint：预算停在工具链中间时，切点跳到下一个合法条目", () => {
  // 布局：user, asst(带单), tool, asst(带单), tool, asst——预算在 idx3 停下
  const entries: Entry[] = [
    msg("user", "任务"),
    msg("assistant", "我看看", true),
    msg("tool", "文件内容"),
    msg("assistant", "再看看", true),
    msg("tool", "更多内容"),
    msg("assistant", "结论"),
  ];
  const cut = findCutPoint(entries, 0, 2, () => 1);
  // 铁律断言：切点绝不落在 tool 条目上
  assert.notEqual(cut, -1);
  const keptFirst = entries[cut];
  assert.equal(keptFirst.type, "message");
  if (keptFirst.type === "message") {
    assert.notEqual(keptFirst.message.role, "tool");
  }
  // 切在 asst(带单) 上时，它的结果必须跟着在保留段里
  assert.equal(cut, 3);
  const next = entries[cut + 1];
  if (next.type === "message") assert.equal(next.message.role, "tool");
});

test("findCutPoint：预算充足时停在最早合法边界（searchStart+1）", () => {
  const entries: Entry[] = [msg("user", "任务"), msg("assistant", "答"), msg("tool", "x")];
  const cut = findCutPoint(entries, 0, 10_000, () => 1);
  assert.equal(cut, 1); // idx0 是根任务，永不摘要它（下限 searchStart+1）
});

test("findCutPoint：尊重 searchStart（增量压缩只消化上次压缩后的新账）", () => {
  const entries: Entry[] = [
    msg("user", "老任务"),
    msg("assistant", "老答"),
    compactEntry("老摘要", "e1"),
    msg("assistant", "新答", true),
    msg("tool", "新结果"),
    msg("assistant", "更新"),
  ];
  // COMP 在 idx2，searchStart=3；预算在 idx4（tool）停下 → 跳到 idx5
  const cut = findCutPoint(entries, 3, 1, () => 1);
  assert.equal(cut, 5);
  assert.ok(cut >= 4); // 永不越过消化区下界
});

test("estimateEntryTokens：按 JSON 长度一半向上取整", () => {
  const e = msg("user", "abcdef"); // JSON 长度远大于内容，这里只验它是正数且随内容增长
  const bigger = msg("user", "a".repeat(100));
  assert.ok(estimateEntryTokens(e) > 0);
  assert.ok(estimateEntryTokens(bigger) > estimateEntryTokens(e));
});
