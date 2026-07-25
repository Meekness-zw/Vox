import { existsSync } from "node:fs";
import { spawn } from "node:child_process";

if (!existsSync("bot-service/.venv/bin/uvicorn")) {
  console.error("Python bot environment is missing. Run `npm run bot:setup` once, then run `npm run dev:all` again.");
  process.exit(1);
}

const children = [
  spawn("npm", ["run", "dev"], { stdio: "inherit", env: process.env }),
  spawn("npm", ["run", "bot:dev"], { stdio: "inherit", env: process.env }),
];

function stop(signal = "SIGTERM") {
  for (const child of children) {
    if (!child.killed) child.kill(signal);
  }
}

process.on("SIGINT", () => { stop("SIGINT"); process.exit(0); });
process.on("SIGTERM", () => { stop(); process.exit(0); });

for (const child of children) {
  child.on("exit", (code) => {
    if (code && code !== 0) {
      stop();
      process.exit(code);
    }
  });
}
