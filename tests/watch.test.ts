// watch 单测：只读观测者的纯函数面（想法 #8 L0）——宽容解析/快照/增量红线。
// 暗号一律用 makeBranchQuestion 真产器造，不手拼（11-26 手拼漂移教训）。
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseEntriesLoose, observeSnapshot, diffNew } from "../src/watch.js";
import { entryLabel } from "../src/projection.js";
import { makeBranchQuestion } from "../src/explain.js";
import type { Entry, SessionHeader } from "../src/types.js";

const header: SessionHeader = {
  type: "session",
  version: 1,
  cwd: "/x",
  createdAt: "t",
  systemPrompt: "s",
};
let seq = 0;
function msg(parentId: string | null, role: "user" | "assistant", content: string): Entry {
  seq += 1;
  return { id: `e${seq}`, parentId, type: "message", message: { role, content } };
}
function serialize(headerLine: SessionHeader, entries: Entry[]): string {
  return [JSON.stringify(headerLine), ...entries.map((e) => JSON.stringify(e))].join("\n") + "\n";
}

// —— parseEntriesLoose ——

test("完整文件：头 + 两条珠正常解析，树校验通过", () => {
  const a = msg(null, "user", "任务");
  const b = msg(a.id, "assistant", "完成");
  const { header: h, entries } = parseEntriesLoose(serialize(header, [a, b]), "s1");
  assert.equal(h.type, "session");
  assert.equal(entries.length, 2);
});

test("尾行半行：丢弃不上屏素材，前面的珠照常解析（等下轮补）", () => {
  const a = msg(null, "user", "任务");
  const text = serialize(header, [a]) + '{"id":"half","parent'; // A 正在写第 3 行
  const { entries } = parseEntriesLoose(text, "s1");
  assert.equal(entries.length, 1);
  assert.equal(entries[0].id, a.id);
});

test("中间行坏 JSON：fail-loud 带行号，不静默吞（尾行宽容只给最后一行）", () => {
  const a = msg(null, "user", "任务");
  const c = msg(a.id, "assistant", "完成");
  const text =
    [JSON.stringify(header), '{"id":"corrupt"', JSON.stringify(c)].join("\n") + "\n";
  assert.throws(() => parseEntriesLoose(text, "s1"), /坏 JSON 行 2/);
});

test("第 1 行不是 session 头：拒载", () => {
  assert.throws(() => parseEntriesLoose('{"type":"message"}\n', "s1"), /不是 session 头/);
});

test("悬空引用：宽容版同样跑树校验，口径与 loadSession 一致", () => {
  const orphan = msg("ghost", "user", "悬空");
  assert.throws(() => parseEntriesLoose(serialize(header, [orphan]), "s1"), /悬空引用/);
});

// —— observeSnapshot（resume 三动作只读版）——

test("主线空树：状态主线 + 路径标空树", () => {
  const snap = observeSnapshot("s1", []);
  assert.match(snap, /主线 idle/);
  assert.match(snap, /空树/);
});

test("主线有珠：状态主线，活跃路径按 id 成链", () => {
  seq = 0;
  const a = msg(null, "user", "任务");
  const b = msg(a.id, "assistant", "完成");
  const snap = observeSnapshot("s1", [a, b]);
  assert.match(snap, /主线 idle/);
  assert.match(snap, /e1 → e2/);
  assert.match(snap, /2 条消息/);
});

test("侧枝暗号在活跃路径上：状态标侧枝·术语（与 repl 同一把刀）", () => {
  seq = 0;
  const m = msg(null, "user", "任务");
  const root = msg(m.id, "user", makeBranchQuestion("投影"));
  const snap = observeSnapshot("s1", [m, root]);
  assert.match(snap, /侧枝·投影/);
});

// —— diffNew（观测者只懂追加）——

test("正常追加：返回新增的珠", () => {
  seq = 0;
  const a = msg(null, "user", "任务");
  const b = msg(a.id, "assistant", "完成");
  assert.deepEqual(diffNew(1, [a, b], "s1"), [b]);
});

test("文件变短：fail-loud，观测者不懂重写", () => {
  seq = 0;
  const a = msg(null, "user", "任务");
  assert.throws(() => diffNew(2, [a], "s1"), /变短/);
});

// —— entryLabel（/tree 与观测者共用的格式，只此一家）——

test("entryLabel：message/compaction/branch_summary 三类各按各的面单出牌", () => {
  seq = 0;
  const a = msg(null, "user", "一句话任务");
  assert.match(entryLabel(a), /^user: 一句话任务$/);
  const c: Entry = { id: "c", parentId: a.id, type: "compaction", summary: "摘要内容", firstKeptEntryId: a.id, tokensBefore: 426 };
  assert.match(entryLabel(c), /📦 压缩: 摘要内容/);
  const f: Entry = { id: "f", parentId: a.id, type: "branch_summary", term: "投影", summary: "注脚", branchLeafId: "x", passed: false };
  assert.match(entryLabel(f), /📄 注脚·投影（待巩固）/);
});
