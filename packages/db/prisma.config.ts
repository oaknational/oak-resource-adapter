import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { config } from "dotenv";
import { defineConfig } from "prisma/config";

config({
  path: resolve(fileURLToPath(new URL("../../.env", import.meta.url))),
  quiet: true,
});

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: process.env.DATABASE_URL
    ? {
        url: process.env.DATABASE_URL,
      }
    : undefined,
});
