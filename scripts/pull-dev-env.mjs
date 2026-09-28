// This used to pull the Vercel `development` target. Terraform no longer writes
// it: Vercel rejects a key that exists in both `development` and a custom
// environment. See infrastructure/project/locals.tf.

console.error(
  "pnpm env:pull:dev is unavailable: Terraform no longer writes the Vercel development target.\n" +
    "Generate .env from Doppler instead; see docs/DEVELOPMENT.md#where-configuration-lives.\n" +
    "ADAPT-98 tracks the replacement: https://linear.app/oaknational/issue/ADAPT-98",
);
process.exit(1);
