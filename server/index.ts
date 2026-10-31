import os from "node:os";
import { fileURLToPath } from "node:url";
import { realpath } from "node:fs/promises";
import { createApp } from "./app.js";
import { resolveDataDir } from "./data-dir.js";

const port = Number(process.env.PORT || 4317);
const root = await realpath(process.env.FROST_ROOT || "/");
const installation = fileURLToPath(new URL("../../", import.meta.url));
const development = process.env.FROST_DEV === "1";
const { server } = await createApp({
  root,
  dataDir: await resolveDataDir(installation),
  initialPath: process.env.FROST_START_PATH || os.homedir(),
  distDir: development
    ? undefined
    : fileURLToPath(new URL("../../dist", import.meta.url)),
  allowedPorts: development ? [4317, 4318] : [port],
});
server.on("error", (error) => {
  console.error(`Frost could not start: ${error.message}`);
  process.exitCode = 1;
});
server.listen(port, "127.0.0.1", () => {
  const address = server.address();
  console.log(`Frost is running at http://127.0.0.1:${typeof address === "object" && address ? address.port : port}`);
  console.log(`Available files: ${root}`);
});
const close = () => {
  server.close(() => process.exit(0));
  server.closeAllConnections();
};
process.on("SIGINT", close);
process.on("SIGTERM", close);
