// projection 单测：树 → 模型看到的 messages（想法 #2 投影规则 + Phase 3 活跃路径）
// Phase 3 起 fixture 必须真成链（parentId 指向前文）——路径投影按 parentId 走，不再信数组顺序
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildProjection, renderTree } from "../src/projection.js";
import type { BranchSummaryEntry, Entry, Message } from "../src/types.js";

let seq = 0;
function msg(parentId: string | null, role: Message["role"], content: string): Entry {
  seq += 1;
  return { id: `e${seq}`, parentId, type: "message", message: { role, content } };
}
function compactEntry(parentId: string | null, summary: string, firstKeptEntryId: string): Entry {
  seq += 1;
  return { id: `e${seq}`, parentId, type: "compaction", summary, firstKeptEntryId, tokensBefore: 0 };
}
function footEntry(parentId: string | null, term: string, passed = true): Entry {
  seq += 1;
  const e: BranchSummaryEntry = {
    id: `e${seq}`,
    parentId,
    type: "branch_summary",
    term,
    summary: `${term}的注脚`,
    branchLeafId: "whatever",
    passed,
  };
  return e;
}

test("无 compaction：全路径投影（链式）", () => {
  const e1 = msg(null, "user", "任务");
  const e2 = msg(e1.id, "assistant", "答");
  const e3 = msg(e2.id, "tool", "结果");
  const e4 = msg(e3.id, "assistant", "收尾");
  const out = buildProjection([e1, e2, e3, e4]);
  assert.equal(out.length, 4);
  assert.deepEqual(out.map((m) => m.role), ["user", "assistant", "tool", "assistant"]);
  assert.equal(out[0].content, "任务");
});

test("侧枝不进主线上下文：兄弟分支被剔除，注脚代表它出场（intent 反例 2）", () => {
  const m1 = msg(null, "user", "主线任务");
  const m2 = msg(m1.id, "assistant", "提到了闭包");
  const b1 = msg(m2.id, "user", "【侧枝提问】闭包——请解释这个概念，用大白话。");
  const b2 = msg(b1.id, "assistant", "闭包是函数与其词法环境的组合……");
  const foot = footEntry(m2.id, "闭包", true); // 注脚挂分叉点下，与侧枝根互为兄弟
  const m3 = msg(foot.id, "user", "继续主线");
  const out = buildProjection([m1, m2, b1, b2, foot, m3]);
  const contents = out.map((m) => m.content);
  assert.equal(out.length, 4); // m1 m2 注脚 m3——侧枝全文（b1/b2）零出现
  assert.ok(!contents.some((c) => c.includes("词法环境")));
  assert.ok(contents.some((c) => c.startsWith("【注脚·闭包】")));
});

test("侧枝内的投影 = 主线前史 + 解释链（无注脚）", () => {
  const m1 = msg(null, "user", "主线任务");
  const m2 = msg(m1.id, "assistant", "提到了闭包");
  const b1 = msg(m2.id, "user", "【侧枝提问】闭包——请解释这个概念，用大白话。");
  const b2 = msg(b1.id, "assistant", "闭包是……");
  const b3 = msg(b2.id, "user", "那箭头函数呢？"); // 下钻 = 链延伸
  const out = buildProjection([m1, m2, b1, b2, b3]);
  assert.deepEqual(
    out.map((m) => m.content),
    ["主线任务", "提到了闭包", "【侧枝提问】闭包——请解释这个概念，用大白话。", "闭包是……", "那箭头函数呢？"],
  );
});

test("复述未过的注脚带「待巩固」标记（intent 反例 3）", () => {
  const m1 = msg(null, "user", "任务");
  const foot = footEntry(m1.id, "闭包", false);
  const m2 = msg(foot.id, "user", "继续");
  const out = buildProjection([m1, foot, m2]);
  assert.ok(out[1].content.includes("待巩固"));
});

test("有 compaction：三段式——摘要打头 + firstKept 起的保留段", () => {
  const u = msg(null, "user", "任务");
  const a1 = msg(u.id, "assistant", "中间步");
  const t = msg(a1.id, "tool", "结果");
  const a2 = msg(t.id, "assistant", "后继");
  const comp = compactEntry(a2.id, "这是摘要", a1.id);
  const a3 = msg(comp.id, "assistant", "压缩后新账");
  const out = buildProjection([u, a1, t, a2, comp, a3]);
  assert.equal(out.length, 5);
  assert.ok(out[0].content.includes("这是摘要"));
  assert.equal(out[1].content, "中间步");
  assert.equal(out[4].content, "压缩后新账");
});

test("多条 compaction：只有最新贡献摘要，老的贡献零消息", () => {
  const u = msg(null, "user", "任务");
  const c1 = compactEntry(u.id, "第一版摘要", u.id);
  const a1 = msg(c1.id, "assistant", "二次推进");
  const c2 = compactEntry(a1.id, "第二版摘要", a1.id);
  const a2 = msg(c2.id, "assistant", "三次推进");
  const out = buildProjection([u, c1, a1, c2, a2]);
  assert.equal(out.length, 3);
  assert.ok(out[0].content.includes("第二版摘要"));
  assert.ok(!out[0].content.includes("第一版摘要"));
  assert.equal(out[1].content, "二次推进");
});

test("firstKeptEntryId 不在活跃路径 → fail-loud 抛错（不静默吞）", () => {
  const m1 = msg(null, "user", "任务");
  const ghost = compactEntry(m1.id, "幽灵摘要", "不存在的id");
  assert.throws(() => buildProjection([m1, ghost]), /不在活跃路径上/);
});

test("压缩后开侧枝：摘要与保留段（含 firstKept 祖先）仍在侧枝路径上", () => {
  const m1 = msg(null, "user", "任务");
  const m2 = msg(m1.id, "assistant", "中间步");
  const comp = compactEntry(m2.id, "checkpoint摘要", m1.id);
  const m3 = msg(comp.id, "assistant", "压缩后新账");
  const b1 = msg(m3.id, "user", "【侧枝提问】闭包——请解释这个概念，用大白话。");
  const b2 = msg(b1.id, "assistant", "闭包是……");
  const out = buildProjection([m1, m2, comp, m3, b1, b2]);
  // 摘要 + 保留段(m1,m2) + compaction 零贡献 + 新账(m3) + 侧枝(b1,b2)
  assert.equal(out.length, 6);
  assert.ok(out[0].content.includes("checkpoint摘要"));
  assert.equal(out[1].content, "任务"); // firstKept = m1，是 compaction 的祖先，仍在活跃路径上
  assert.equal(out[2].content, "中间步");
  assert.equal(out[3].content, "压缩后新账");
  assert.equal(out[5].content, "闭包是……");
});

test("renderTree：分叉渲染 ├─/└─，侧枝与注脚是兄弟", () => {
  const m1 = msg(null, "user", "主线任务");
  const b1 = msg(m1.id, "user", "【侧枝提问】闭包——请解释这个概念，用大白话。");
  const b2 = msg(b1.id, "assistant", "闭包是……");
  const foot = footEntry(m1.id, "闭包", true);
  const lines = renderTree([m1, b1, b2, foot]).split("\n");
  assert.equal(lines.length, 4);
  assert.ok(lines[1].includes("├─")); // 侧枝根（非末子）
  assert.ok(lines[2].includes("└─") && lines[2].includes("│")); // 侧枝叶带竖线缩进
  assert.ok(lines[3].includes("注脚·闭包") && lines[3].includes("└─")); // 注脚 = m1 的末子
});
