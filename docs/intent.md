# intent：my_coding_agent Phase 3+ 想法#9-L0——两档审批门 + 工作区路径围挡

- 问题：`execute_command` 现裸跑零防护——模型递什么跑什么，`rm -rf` 也不问人。审批门是面试高频题（DSH ⑦ 审批流 / pi 信任门禁 / opencode PermissionV2 两档），且必须连信任模型一起设计（pi 判断③），不单独抄沙箱零件。想法池 #9 定稿：L0 两档压成全局开关，提前到 Phase 4 实测前。
- 用户/场景：日常 safe 档——写文件/跑命令弹卡问人，看了才放行；批量实测 yolo 档——`--yolo` 全放行不卡审批；两档共用工作区围挡硬边界。
- 输入 → 输出：
  - 输入：CLI 旗标 `--yolo`（one-shot / `--resume` / `-i` 通吃），缺省 = safe
  - 输出：每次工具调用先过审批门出「决定」（pass / ask / block），ask 在终端弹 y/n；决定与结果如实入树（方案 A：拒绝/拦截折进工具结果正文，零新条目类型）
- 该拦什么（反例）：
  1. 围挡外写文件（含 `..` 漂移、异盘绝对路径）两档都硬拦——block 不问人（fail-closed：最坏情况是任务停住，不是命令偷偷跑）
  2. safe 档问人无人应答 → 命令永远不跑（进程挂在等输入），绝不超时放行
  3. 拒绝必须让模型知道：回「被拒」工具结果，不是假成功也不是静默吞掉
  4. yolo 不弹卡，但围挡不豁免——硬边界不随档位松
  5. 侧枝 talk() 维持物理禁工具（plan 档同款，已有，回归盯住）
- 该放什么（正常场景）：safe：read 直放、write/execute 弹卡答 y 放行；yolo：三工具全直放；围挡内 write 按档走
- 验收标准（5 条，每条可验证）：
  1. safe 档 read_file 决定 = pass 零弹卡（单测断言）
  2. safe 档 write_file/execute_command 弹卡：y → 执行；n → 未执行 + 模型收到被拒结果；不答 → 挂起（手验）
  3. write_file 落点在围挡外（含 `..`）→ 两档都 block，reason 说明越界（单测断言 + 手验）
  4. yolo 三工具零弹卡直放，围挡仍 block（单测断言）
  5. 回归：23+新 单测全绿 + one-shot / `-i` / `--resume` 不炸
- 范围外（明码标价）：L1 argv 包装 + 逐调用策略（策略回放时审批入树升方案 B）｜execute_command 命令级围挡（L0 只围 write_file 落点，命令摸出围挡靠问人）｜read_file 围挡（定稿 read 直放）｜REPL 内切档（只认启动旗标）｜审批超时自动拒（挂起等答）｜L2 OS 沙箱（Windows 款另案）
- 状态：已确认（2026-11-27 用户确认开工 + 审批入树选方案 A；Phase 3 intent 见 git 历史 fcf6548）
