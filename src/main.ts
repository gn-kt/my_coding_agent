const agentName: string = "my_coding_agent";
const model: string = "deepseek-chat";
let maxSteps: number = 20;

console.log(agentName, model, maxSteps);

type Role = "system" | "user" | "assistant" | "tool";

const role: Role = "user";
console.log(role);