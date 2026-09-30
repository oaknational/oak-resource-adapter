console.error(
  "pnpm env:pull:dev is unavailable: Terraform no longer writes the Vercel development target.\n" +
    "Generate .env from Doppler instead; see docs/DEVELOPMENT.md#where-configuration-lives.",
);
process.exit(1);
