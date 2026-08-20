const { spawnSync } = require("node:child_process");

process.env.NODE_ENV = "production";

const nextBin = require.resolve("next/dist/bin/next");
const result = spawnSync(process.execPath, [nextBin, "build"], {
  env: { ...process.env, NODE_ENV: "production" },
  stdio: "inherit",
});

if (result.error) {
  console.error(result.error);
  process.exit(1);
}

process.exit(result.status ?? 1);
