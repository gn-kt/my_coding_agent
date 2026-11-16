// session 树校验单测：Phase 3 从「线性成链」放宽为「合法树」——坏树 fail-loud（intent 反例 1）
import { test } from "node:test";
import assert from "node:assert/strict";
import { validateTree } from "../src/session.js";
import type { Entry } from "../src/types.js";

let seq = 0;
function msg(parentId: string | null): Entry {
  seq += 1;
  return { id: `e${seq}`, parentId, type: "message", message: { role: "user", content: "hi" } };
}

test("合法树：线性链与分叉都放行", () => {
  const a = msg(null);
  const b = msg(a.id);
  const c = msg(b.id);
  assert.doesNotThrow(() => validateTree([a, b, c]));
  const b2 = msg(a.id); // 分叉：a 有两个子——Phase 2 的线性校验会拒，Phase 3 这是解释树的常态
  assert.doesNotThrow(() => validateTree([a, b, b2]));
});

test("悬空引用：parentId 指向不存在的 id → 抛错", () => {
  const a = msg(null);
  const ghost = msg("幽灵id");
  assert.throws(() => validateTree([a, ghost]), /悬空引用/);
});

test("重复 id → 抛错", () => {
  const a = msg(null);
  const b = msg(a.id);
  const dup = { ...msg(a.id), id: b.id };
  assert.throws(() => validateTree([a, b, dup]), /重复/);
});

test("第二个根 → 抛错（树只许一个根）", () => {
  const a = msg(null);
  const b = msg(a.id);
  const secondRoot = msg(null);
  assert.throws(() => validateTree([a, b, secondRoot]), /第二个根/);
});

test("父在子后：文件序里 parent 尚未登记 → 同样按悬空引用拒（追加写 ⇒ 环进不来）", () => {
  const a = msg(null);
  const forward = { ...msg(a.id), parentId: "后面的id" };
  assert.throws(() => validateTree([a, forward]), /悬空引用/);
});
