import { createServer as createViteServer } from "vite";
import { realpath } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createApp } from "../server/app.js";

const root = await realpath(process.env.FROST_ROOT || "/");
const { server } = await createApp({
  root,
  dataDir: path.resolve(process.env.FROST_DATA_DIR || ".frost-data"),
  initialPath: process.env.FROST_START_PATH || os.homedir(),
  allowedPorts: [4317, 4318],
});
await new Promise<void>((resolve, reject) => {
  server.once("error", reject);
  server.listen(4318, "127.0.0.1", resolve);
});
const vite = await createViteServer();
try {
  await vite.listen();
  vite.printUrls();
  console.log(`Frost can browse: ${root}`);
} catch (error) {
  server.close();
  await vite.close();
  throw error;
}
let closing = false;
async function close() {
  if (closing) return;
  closing = true;
  server.closeAllConnections();
  server.close();
  await vite.close();
}
process.on("SIGINT", () => void close());
process.on("SIGTERM", () => void close());
