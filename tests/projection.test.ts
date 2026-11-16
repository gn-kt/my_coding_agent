// projection 单测：树 → 模型看到的 messages（想法 #2 的投影规则）
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildProjection } from "../src/projection.js";
import type { Entry, Message } from "../src/types.js";

let seq = 0;
function msg(role: Message["role"], content: string): Entry {
  seq += 1;
  return { id: `e${seq}`, parentId: null, type: "message", message: { role, content } };
}
function compactEntry(summary: string, firstKeptEntryId: string): Entry {
  seq += 1;
  return { id: `e${seq}`, parentId: null, type: "compaction", summary, firstKeptEntryId, tokensBefore: 0 };
}

test("无 compaction：全量投影", () => {
  const entries = [msg("user", "任务"), msg("assistant", "答"), msg("tool", "结果"), msg("assistant", "收尾")];
  const out = buildProjection(entries);
  assert.equal(out.length, 4);
  assert.deepEqual(out.map((m) => m.role), ["user", "assistant", "tool", "assistant"]);
  assert.equal(out[0].content, "任务");
});

test("有 compaction：三段式——摘要 user 消息打头 + firstKept 起的保留段", () => {
  const u = msg("user", "任务");
  const a1 = msg("assistant", "中间步");
  const t = msg("tool", "结果");
  const a2 = msg("assistant", "后继");
  const comp = compactEntry("这是摘要", a1.id);
  const a3 = msg("assistant", "压缩后新账");
  const out = buildProjection([u, a1, t, a2, comp, a3]);
  assert.equal(out.length, 5);
  assert.equal(out[0].role, "user");
  assert.ok(out[0].content.includes("这是摘要"));
  assert.equal(out[1].content, "中间步"); // firstKept = a1
  assert.equal(out[4].content, "压缩后新账");
});

test("多条 compaction：只有最新贡献摘要，老的贡献零消息", () => {
  const u = msg("user", "任务");
  const c1 = compactEntry("第一版摘要", u.id);
  const a1 = msg("assistant", "二次推进");
  const c2 = compactEntry("第二版摘要", a1.id);
  const a2 = msg("assistant", "三次推进");
  const out = buildProjection([u, c1, a1, c2, a2]);
  assert.equal(out.length, 3);
  assert.ok(out[0].content.includes("第二版摘要"));
  assert.ok(!out[0].content.includes("第一版摘要"));
  assert.equal(out[1].content, "二次推进");
});

test("firstKeptEntryId 不在树里 → fail-loud 抛错（不静默吞）", () => {
  const comp = compactEntry("幽灵摘要", "不存在的id");
  assert.throws(() => buildProjection([msg("user", "任务"), comp]), /不在树里/);
});
