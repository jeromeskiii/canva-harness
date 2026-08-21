import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default {
  resolve: {
    alias: {
      "@canva-harness/runtime": path.resolve(__dirname, "packages/runtime/src/index.ts"),
      "@canva-harness/session": path.resolve(__dirname, "packages/session/src/index.ts"),
      "@canva-harness/capabilities": path.resolve(__dirname, "packages/capabilities/src/index.ts"),
      "@canva-harness/tools": path.resolve(__dirname, "packages/tools/src/index.ts"),
      "@canva-harness/agent": path.resolve(__dirname, "packages/agent/src/index.ts"),
      "@canva-harness/cli": path.resolve(__dirname, "packages/cli/src/index.ts"),
    },
  },
  test: {
    globals: true,
    environment: "node",
    include: ["packages/**/tests/**/*.test.ts"],
  },
};
