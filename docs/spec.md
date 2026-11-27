# spec：Phase 3+ 想法#6——模型能力识别两段式

> 上游：`docs/intent.md`（⑥）· 想法池 #6 定稿 · G0 补课锚点「门禁拦事实，建议管程度」
> 红线对照：零框架自研 ✅；少做做成架构 ✅——两探针各一次请求、档案手维护常量表、`--check` 手动入口，明码标价见 intent「范围外」。

## 一、方案选型（3 处，已定）

| 决策点 | 方案 | 选定 |
|------|------|------|
| 入口形态 | ① `--check` 手动子命令 ② 启动自动门禁 ③ 记状态文件换名才探 | **①**——零 token 零开销，批量实测不被拖（2026-11-27 用户裁定） |
| 档案形态 | ① 内置 TS 常量表（走 git）② 外部 JSON | **①**——零依赖零读取路径；数据填**权威真值**（官方模型卡 + BFCL/SWE-bench 榜单，动手前 web_search 取数，不编数字） |
| 探针判据 | 复用主循环同一把刀（`tool_calls` 非空 / `usage` 在）②另造判据 | **①**——「发菜单看开单」就是主循环第一圈抽出来单独跑；判据漂移 = 两法官打架（站 5 教训） |

## 二、核心模型

```ts
// capability.ts —— 内置档案 + 先验判级（纯函数，零网络）
interface ModelProfile {
  model: string;              // 档案键 = GLM_MODEL 名
  supportsToolCalls: boolean; // 硬：官方是否支持 function calling
  contextWindow: number;      // 硬：官方上下文窗口（tokens）
  maxOutput: number;          // 硬：官方最大输出（tokens）
  bfcl?: number;              // 软：BFCL 工具调用榜分数（0-100，只建议）
  swebench?: number;          // 软：SWE-bench Verified 分数（只建议）
  source: string;             // 取数来源+日期（档案可信度可追溯）
}

decidePrior(profile | undefined, model): PriorVerdict
// PriorVerdict = 硬门禁 ❌（不支持工具调用）/ ✅ 硬规格过 + ⚠️ 软建议行 / 「无先验档案」

// probe.ts —— 实测探针（各 1 次请求）+ verdict 纯函数
probeToolCalls(): 发 tools 字段的最小请求 → verdict: tool_calls 非空 ?
probeUsage(): 发普通请求 → verdict: usage 字段（prompt/completion tokens）在 ?
```

判级铁律（G0 补课入库）：**门禁只认硬规格事实（能不能），软分数只进建议行（好不好）**；未知模型不编档，实测照跑并注明先验缺席。

## 三、数据流

```
main.ts --check:
  读 .env（model/baseUrl/key）→ 【第一段】decidePrior(档案查名)
      硬门禁 ❌（supportsToolCalls=false）→ 报告 + exit 1（不进实测——必然干不成活）
      ✅/无档案 → 【第二段】probeToolCalls + probeUsage（真请求，各 1 次）
  汇总报告上屏（先验行/探针行/软建议行分列）→ exit 0/1
```

- 探针走 `llm.ts` 既有 seam（chat + getToolSchemas），不另起请求通道
- `--check` 建在 `--list` 之前、模式横幅之后？否——`--check` 零副作用，放 `--list` 同层（本地+钥匙闸后）；不设 `--yolo` 交互（探针无工具执行，审批门无关）

## 四、接口变更

| 文件 | 变更 |
|------|------|
| `capability.ts` 🆕 | ModelProfile 档案表（GLM 系 + 主流兼容方言若干，来源+日期随条目）+ decidePrior 纯函数 |
| `probe.ts` 🆕 | 两探针 + verdict 纯函数（好测） |
| `main.ts` | `--check` 子命令（零副作用，exit 0/1） |
| 其余全部 | 零改动（审批门/会话/压缩/投影不碰） |

## 五、测试计划

1. **node:test 单测**（纯函数零 API）：decidePrior 矩阵（不支持工具调用 ❌ / 全过 ✅+软建议行 / 未知=无档案）｜探针 verdict（tool_calls 空=不及格 / 非空=过 / usage 缺=不及格）
2. **回归**：34+新 全绿；one-shot/`-i`/`--resume` 用法路径不炸
3. **手验**：`npm run dev -- --check` 对 glm-5.3-flash 真跑——先验行+两探针+软建议行上屏、exit 0
4. typecheck 门 + ocr scan
