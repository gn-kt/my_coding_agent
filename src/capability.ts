// capability.ts —— 想法 #6 第一段：内置权威档案 + 先验判级（纯函数，零网络零 token）。
// 判级铁律（G0 补课入库）：门禁拦「事实」（能不能——规格真值），建议管「程度」（好不好——统计倾向）。
// 档案只收权威真值，每条带来源+日期可追溯；未知模型不编档——未知要明说，交给实测（绝不静默降级）。

export interface ModelProfile {
  model: string; // 档案键 = GLM_MODEL 名
  supportsToolCalls: boolean; // 硬：官方是否支持 function calling——false = 主循环必然空转，门禁拦死
  contextWindow: number; // 硬：官方上下文窗口（tokens）
  maxOutput: number; // 硬：官方最大输出（tokens）
  bfcl?: number; // 软：BFCL 工具调用榜分数（只建议）
  swebench?: number; // 软：SWE-bench Verified 分数（只建议）
  source: string; // 取数来源 + 查证日期
}

// 数据均为 2026-11-27 官方页面查证（web_search），不编数字：
// - glm-5.3-flash：docs.bigmodel.cn / z.ai 博客 / build.nvidia.com 模型卡（1M 上下文、输出 128K–131K、function calling ✅）
// - glm-4.6：docs.z.ai/guides/llm/glm-4.6（200K / 128K）+ vals.ai 第三方 SWE-bench Verified 82.8——
//   同一模型官方 mini-SWE-agent 榜只给 55.40，两数并存正是「榜单=模型×脚手架联合分」的活例，软分只进建议行
export const MODEL_PROFILES: ModelProfile[] = [
  {
    model: "glm-5.3-flash",
    supportsToolCalls: true,
    contextWindow: 1_000_000,
    maxOutput: 131_072,
    source: "docs.bigmodel.cn + build.nvidia.com/z-ai/glm-5-3-flash 模型卡，2026-11-27 查证；BFCL/SWE-bench 官方未公布",
  },
  {
    model: "glm-4.6",
    supportsToolCalls: true,
    contextWindow: 200_000,
    maxOutput: 128_000,
    swebench: 82.8,
    source: "docs.z.ai/guides/llm/glm-4.6 + vals.ai 第三方复核，2026-11-27 查证",
  },
];

export interface PriorVerdict {
  known: boolean; // 档案里有名吗——false 时不判级，交给实测
  hardPass: boolean; // 硬门禁：false = 不进实测直接拒（目前唯一硬指标 = supportsToolCalls）
  hardLines: string[]; // 硬规格行（能不能）
  softLines: string[]; // 软建议行（好不好，永远只 ⚠️ 不拦）
  source: string | null;
}

// profiles 参数默认内置档案，测试可注入合成档案（纯函数好测）
export function decidePrior(model: string, profiles: ModelProfile[] = MODEL_PROFILES): PriorVerdict {
  const p = profiles.find((x) => x.model === model.trim()); // trim 防手滑空白静默落「未知」分支（OCR 采纳）；键区分大小写不乱归一
  if (!p) {
    return {
      known: false,
      hardPass: true, // 未知 ≠ 不合格——先验缺席要明说，生死交给实测
      hardLines: [],
      softLines: [],
      source: null,
    };
  }
  const hardPass = p.supportsToolCalls;
  return {
    known: true,
    hardPass,
    hardLines: [
      `工具调用：${p.supportsToolCalls ? "✅ 官方支持" : "❌ 官方不支持"}`,
      `上下文窗口：${p.contextWindow.toLocaleString("en-US")} tokens`,
      `最大输出：${p.maxOutput.toLocaleString("en-US")} tokens`,
    ],
    softLines: [
      p.bfcl === undefined ? "BFCL（软·只建议）：无公开数据" : `BFCL（软·只建议）：${p.bfcl}`,
      p.swebench === undefined
        ? "SWE-bench Verified（软·只建议）：无公开数据"
        : `SWE-bench Verified（软·只建议）：${p.swebench}——榜单=模型×脚手架联合分，低分≠你的任务必挂`,
    ],
    source: p.source,
  };
}
