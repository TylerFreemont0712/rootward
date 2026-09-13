import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// Read the repository's .env (if any) so a ROOTWARD_PORT override reaches both the server and this proxy.
const rootEnv = path.resolve(fileURLToPath(import.meta.url), "../../../.env");
if (existsSync(rootEnv)) process.loadEnvFile(rootEnv);

// The dev server proxies /api to the Fastify server, so the browser talks to one origin in dev and in `pnpm start`.
const configuredPort = Number(process.env.ROOTWARD_PORT);
const apiPort = Number.isInteger(configuredPort) && configuredPort > 0 ? configuredPort : 7331;

export default defineConfig({
  plugins: [react()],
  server: {
    host: "127.0.0.1",
    port: 5173,
    strictPort: true,
    proxy: { "/api": `http://127.0.0.1:${apiPort}` },
  },
  build: {
    outDir: "dist",
    sourcemap: true,
  },
});
