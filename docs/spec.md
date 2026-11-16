# spec：Phase 3——解释树（想法 #7）

> 上游：`docs/intent.md`（Phase 3）· pi 03 研究笔记（原地分叉 + branch_summary 两机制）· 想法 #7
> 红线对照：零框架自研 ✅（readline 是 node:readline 内建，REPL 零依赖）；少做做成架构 ✅——不做 fork 文件级 / 侧枝内压缩 / 侧枝再分叉 / UI 导航，明码标价见 intent「范围外」。

## 一、方案选型（3 处，推荐已选定）

| 决策点 | 方案 | 选定 |
|------|------|------|
| 交互形态 | ① REPL（node:readline/promises，`--interactive`）② one-shot 扩命令（`--explain`/`--back` 每次冷启） | **①**——解释树天然多轮，冷启每圈重建上下文又慢又绕；REPL 也是想法 #8 fork L0 的底座 |
| 回主线机制 | ① pi branch_summary 同款条目（挂主线叶子下，路径投影自然携带）② 侧枝全文保留在路径上 | **①**——上下文不爆炸、主线不漂移（想法原句）；原文留树可审计 |
| 侧枝工具 | ① 侧枝 chat 不发 tools 字段（物理禁开单）② 侧枝也可用工具 | **①**——解释是纯文本问答；禁工具保切点安全 + 省 token；「少做做成架构」 |

## 二、数据模型（Entry 判别联合扩第 3 种）

```ts
interface BranchSummaryEntry {
  id: string;
  parentId: string | null;   // = 分叉点（主线叶）
  type: "branch_summary";
  term: string;              // /explain 的术语——去重查它
  summary: string;           // 注脚文本（模型生成的侧枝摘要）
  branchLeafId: string;      // 被摘要侧枝的叶子——审计/导航
  passed: boolean;           // 复述检验结果——false 时注脚带「待巩固」
}
```

树不变式：`parentId` = null 或**在文件中先于本条出现**的 entry id（追加写 ⇒ 父必先于子 ⇒ 环天然不可能，无需检测）。树枝允许分叉（同 parentId 多子），`loadSession` 校验随之从「线性成链」放宽为「树形合法」。

## 三、数据流

**REPL 状态机**（repl.ts）：

```
idle（主线>）
  输入 → runAgent（工具开、压缩查、软着陆照旧）
  /explain <术语> → 去重查（活跃路径上 branch_summary 的 term）
      命中 → 打印已有注脚，拒绝重讲；未命中 ↓
      侧枝首条 user 条目（内容前缀【侧枝提问】<术语>）parentId=主线叶 → state=explain
  /tree → renderTree 打印 ｜ /exit → 退出（树已持久，无损）

explain（侧枝·术语>）
  输入 → chat(路径投影, 无工具) → 追加进侧枝（下钻就是链延伸）
  /back → chat 出一道复述检验题（无工具）→ state=check

check（复述检验>）
  输入 = 复述答案 → chat 判定（无工具），解析回复里的【判定：通过】/【判定：不通过】标记
      （标记缺失 = 不通过，宁严勿松）
  通过 ｜ /back（放弃检验）｜ 第 2 轮仍不过 → chat 生成注脚 → branch_summary 挂主线叶下 → state=idle
  第 1 轮不过 → 针对没答对的点再讲一遍 → state=check（第 2 轮，上限 2）
```

**投影规则升级（projection.ts，纯函数）**：`buildProjection(entries)` 从**最后一条 entry（活跃叶子）沿 parentId 走到根** = 活跃路径（pi buildSessionPath 同款），替换旧「线性数组过滤」：

- 路径上 branch_summary 条目 → `user` 注脚消息 `【注脚·术语｜复述未过=待巩固】摘要`（多条各贡献一条，解释知识都要带上）
- 路径上最新 compaction → 【前情摘要】 + firstKept 起的保留段（沿路径取，firstKept 不在路径上 = 树损坏，fail-loud）
- 无 compaction = 全路径消息。侧枝不在路径上 ⇒ 侧枝全文自然消失，只留注脚——反例 2 的机制保证

**压缩只在主线（agent.ts）**：runAgent 内压缩逻辑保留，但改为**路径感知**——`pathFromLeaf` 算主线路径，findCutPoint/摘要/firstKept 全部在路径数组上操作（旧实现扫全量 entries，分叉后会误摘要侧枝、切点可能落在侧枝上）。侧枝循环不查压缩（明码标价不做）。

**resume 还原**：`--interactive <id>` 载入后沿最后一条 entry 的路径找最近的【侧枝提问】前缀——命中 = 还原到 explain 态（该术语），未命中 = idle。

## 四、接口变更

| 文件 | 变更 |
|------|------|
| `types.ts` | + `BranchSummaryEntry`，`Entry` 判别联合扩成 3 种（pi 11 取 3，仍是少做） |
| `session.ts` | loadSession：线性校验 → 树形校验（parentId 必须指向前文已有 id；重复 id / 悬空 / 第二根 fail-loud）；+ `appendBranchSummary` |
| `projection.ts` | buildProjection 重写为路径投影；+ `pathFromLeaf`（叶子→根，多个模块共用）；+ `renderTree`（/tree 纯函数） |
| `agent.ts` | compactIfNeeded 路径感知（切点/摘要只在主线路上找） |
| `explain.ts` 🆕 | 侧枝问答 + 复述检验状态机步进 + 注脚生成 + `parseVerdict`（纯函数好测） |
| `repl.ts` 🆕 | readline 循环 + 状态机分派 + resume 态还原 |
| `main.ts` | `--interactive [stem]`：stem 缺省新建，给了就 loadSession 续 |
| `llm.ts` / `tools.ts` / `compaction.ts` | 零改动（`chat(messages, [], "none")` 已能物理禁工具） |

## 五、测试计划

1. **node:test 单测**（纯函数，零 API）：树校验（合法分叉载入 / 悬空 / 重复 id / 第二根拒载）｜路径投影（主线投影不含侧枝全文、含注脚 / firstKept 不在路径 fail-loud / 侧枝内投影=主线前史+解释链）｜renderTree 分叉渲染｜parseVerdict（通过/不通过/缺失）
2. **Phase 1/2 回归**：one-shot 任务、`--list`、`--resume`、压缩触发、软着陆全量重跑（改 A 不炸 B）
3. **Phase 3 五条验收**（intent.md）——stdin 管道喂 REPL：`printf "任务\n/explain X\n追问\n/back\n复述答案\n/tree\n/exit" | npm run dev -- -i`，用户抽查复述链路（验收模式合同）
4. typecheck 门 + 命令行核心路径
