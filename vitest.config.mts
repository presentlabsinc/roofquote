import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

// 테스트에서도 tsconfig 의 `@/` 경로를 쓰는 모듈(예: components/EstimatePDF.tsx)을 불러올 수 있게.
export default defineConfig({
  resolve: {
    alias: [{ find: /^@\//, replacement: fileURLToPath(new URL("./", import.meta.url)) }],
  },
});
