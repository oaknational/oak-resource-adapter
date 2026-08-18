import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  compiler: {
    styledComponents: true,
  },
  // The fixture corpus is read at runtime by a path the bundler cannot see, so
  // file tracing leaves it out of the deployed function unless it is named here.
  outputFileTracingIncludes: {
    "/": ["../../packages/original-resource-documents/fixtures/**"],
  },
  serverExternalPackages: [
    "@oaknational/resource-adapter-original-resource-documents",
    "@oaknational/resource-document",
  ],
  transpilePackages: ["@oaknational/resource-adapter"],
  // The browser can't read `process.env` at runtime, so mirror the server-side
  // DEBUG value into the client bundle at build time.
  env: {
    NEXT_PUBLIC_DEBUG: process.env.DEBUG,
    // oak-components resolves its icons against these; without them controls
    // such as the modal close button render blank.
    NEXT_PUBLIC_OAK_ASSETS_HOST:
      process.env.NEXT_PUBLIC_OAK_ASSETS_HOST ?? "res.cloudinary.com",
    NEXT_PUBLIC_OAK_ASSETS_PATH:
      process.env.NEXT_PUBLIC_OAK_ASSETS_PATH ?? "oak-web-application/image/upload",
  },
};

export default nextConfig;
