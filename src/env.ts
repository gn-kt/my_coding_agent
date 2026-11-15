import { existsSync, readFileSync } from "node:fs";

// .env 读取器：把 KEY=VALUE 行灌进 process.env。
// 规矩：真实的系统环境变量优先，.env 只补缺（所以判断是 === undefined 才灌）。
if (existsSync(".env")) {
  for (const line of readFileSync(".env", "utf-8").split("\n")) {
    const m = line.match(/^([A-Z_]+)=(.*)$/);
    if (m && process.env[m[1]] === undefined) {
      process.env[m[1]] = m[2].trim(); // trim 顺手处理 Windows 的 \r
    }
  }
}
