import "./env.js";
import { runAgent } from "./agent.js";

const MAX_STEPS = Number(process.env.GLM_MAX_STEPS ?? "20");   

const task = process.argv[2];

if (!task) {
  console.error('用法：npm run dev "任务描述"');
  process.exit(1);
}

if (!process.env.GLM_API_KEY) {
  console.error("缺 GLM_API_KEY——检查项目根目录 .env");
  process.exit(1);   
}

const answer = await runAgent(task, MAX_STEPS);
console.log("最终回答：", answer);