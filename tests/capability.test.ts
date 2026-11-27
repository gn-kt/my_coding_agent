// capability 纯函数单测（想法 #6 第一段）：判级矩阵——门禁拦事实 / 建议管程度 / 未知不编档
import { test } from "node:test";
import assert from "node:assert/strict";
import { decidePrior, MODEL_PROFILES } from "../src/capability.js";
import type { ModelProfile } from "../src/capability.js";

test("已知模型 glm-4.6：硬规格全过 + 软分数只进建议行（验收 1/3）", () => {
  const v = decidePrior("glm-4.6");
  assert.equal(v.known, true);
  assert.equal(v.hardPass, true);
  assert.ok(v.hardLines.some((l) => l.includes("工具调用：✅")));
  assert.ok(v.hardLines.some((l) => l.includes("200,000")));
  assert.ok(v.softLines.some((l) => l.includes("SWE-bench Verified（软·只建议）：82.8")));
  assert.ok(v.softLines.every((l) => l.includes("软·只建议"))); // 软行永远标着只建议
  assert.ok(v.source!.includes("docs.z.ai"));
});

test("已知模型 glm-5.3-flash：软分无公开数据如实标（不编数字）", () => {
  const v = decidePrior("glm-5.3-flash");
  assert.equal(v.known, true);
  assert.equal(v.hardPass, true);
  assert.ok(v.softLines.some((l) => l.includes("无公开数据")));
});

test("未知模型：不编档、不判死，先验缺席如实说（验收 4 / 绝不静默降级）", () => {
  const v = decidePrior("some-mystery-model");
  assert.equal(v.known, false);
  assert.equal(v.hardPass, true); // 未知 ≠ 不合格——生死交给实测
  assert.deepEqual(v.hardLines, []);
  assert.equal(v.source, null);
});

test("硬门禁：档案明说不支持工具调用 → hardPass=false（验收 3，注入合成档案测 ❌ 分支）", () => {
  const fake: ModelProfile[] = [
    { model: "legacy-chat", supportsToolCalls: false, contextWindow: 8192, maxOutput: 2048, source: "合成测试档案" },
  ];
  const v = decidePrior("legacy-chat", fake);
  assert.equal(v.known, true);
  assert.equal(v.hardPass, false);
  assert.ok(v.hardLines.some((l) => l.includes("❌ 官方不支持")));
});

test("内置档案只收真值：每条带来源与查证日期 + 规格一致性（OCR 采纳）", () => {
  assert.ok(MODEL_PROFILES.length >= 2);
  for (const p of MODEL_PROFILES) {
    assert.ok(p.source.includes("2026-11-27"), `${p.model} 缺查证日期`);
    assert.ok(p.contextWindow > 0 && p.maxOutput > 0);
    assert.ok(p.maxOutput <= p.contextWindow, `${p.model} 输出上限大于窗口，档案数据异常`);
  }
});

test("model 名带空白：trim 后命中档案，不静默落未知（OCR 采纳）", () => {
  const v = decidePrior("  glm-4.6  ");
  assert.equal(v.known, true);
  assert.equal(v.hardPass, true);
});
