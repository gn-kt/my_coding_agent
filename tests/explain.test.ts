// explain 纯函数单测：侧枝标记构造/解析 + 复述判定（宁严勿松）+ 树尾 id
import { test } from "node:test";
import assert from "node:assert/strict";
import { BRANCH_MARKER, makeBranchQuestion, parseBranchTerm, parseVerdict, tailId } from "../src/explain.js";
import type { Entry } from "../src/types.js";

test("标记往返：make → parse 还原术语", () => {
  const q = makeBranchQuestion("闭包");
  assert.ok(q.startsWith(BRANCH_MARKER));
  assert.equal(parseBranchTerm(q), "闭包");
});

test("parseVerdict：通过 / 不通过 / 缺失 三态（缺失 = 不过，宁严勿松）", () => {
  assert.equal(parseVerdict("抓住了核心。【判定：通过】"), true);
  assert.equal(parseVerdict("漏了关键点。【判定：不通过】"), false);
  assert.equal(parseVerdict("点评了但忘了带标记"), false);
  assert.equal(parseVerdict("自相矛盾【判定：通过】【判定：不通过】"), false); // 冲突时不过胜出
});

test("parseVerdict：模型输出方言收编——半角冒号 / 标记内空格都能认出", () => {
  assert.equal(parseVerdict("没问题。【判定: 通过】"), true); // 半角冒号 + 空格
  assert.equal(parseVerdict("【 判定：通过 】"), true); // 全角标记被空格拆开
  assert.equal(parseVerdict("【判定:不通过】"), false); // 半角冒号的不通过照样拦
});

test("tailId：空树 null，非空取数组最后一条（追加写 ⇒ 末条 = 活跃叶）", () => {
  assert.equal(tailId([]), null);
  const e: Entry = { id: "a", parentId: null, type: "message", message: { role: "user", content: "x" } };
  const e2: Entry = { ...e, id: "b" };
  assert.equal(tailId([e, e2]), "b");
});
