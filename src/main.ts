import "./env.js";
import { registry, getToolSchemas } from "./tools.js";
import { chat } from "./llm.js";
import { runAgent } from "./agent.js";

const agentName: string = "my_coding_agent";
const model: string = "glm-5.3-flash";
let maxSteps: number = 20;

console.log(agentName, model, maxSteps);

type Role = "system" | "user" | "assistant" | "tool";

const role: Role = "user";
const answer = await runAgent("读一下 package.json，告诉我这个项目叫什么名字", 20);
console.log("最终回答：", answer);