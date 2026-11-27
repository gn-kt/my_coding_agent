// probe verdict 纯函数单测（想法 #6 第二段）：判据和 agent.ts 同一把刀——tool_calls 非空 / usage 在
import { test } from "node:test";
import assert from "node:assert/strict";
import { judgeToolCalls, judgeUsage } from "../src/probe.js";

test("judgeToolCalls：非空数组 = 开了单判过（验收 2 同一把刀）", () => {
  const v = judgeToolCalls([{ id: "c1", type: "function", function: { name: "read_file", arguments: "{}" } }]);
  assert.equal(v.passed, true);
  assert.match(v.detail, /1 张工单/);
});

test("judgeToolCalls：空数组 / 缺字段 / null = 只说话不开单判不过（G0 提取题场景）", () => {
  for (const bad of [[], undefined, null]) {
    const v = judgeToolCalls(bad as undefined);
    assert.equal(v.passed, false);
    assert.match(v.detail, /不开单/);
  }
});

test("judgeUsage：账单在 = 过（压缩触发器有米下锅）", () => {
  const v = judgeUsage({ totalTokens: 426 });
  assert.equal(v.passed, true);
  assert.match(v.detail, /426/);
});

test("judgeUsage：null = 哑火判不过（v2.0 坑 9 同族，fail-loud 不静默）", () => {
  const v = judgeUsage(null);
  assert.equal(v.passed, false);
  assert.match(v.detail, /哑火/);
});
