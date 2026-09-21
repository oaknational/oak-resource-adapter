import type { NextRequest } from "next/server";
import { raLogger } from "@oaknational/resource-adapter-logger";
import { requestAuthenticator } from "../authentication";
import { getCorsHeaders } from "../cors";
import { devRoutesEnabled } from "../dev-routes";
import { storageEnvironment } from "../environment";
import { personalFixture } from "./personal-fixture";

export function personalFixturesEnabled() {
  if (!devRoutesEnabled() || process.env.VERCEL_ENV === "production") return false;
  const target = process.env.VERCEL_TARGET_ENV;
  if (target && !["development", "preview", "staging"].includes(target)) return false;
  if (process.env.VERCEL_ENV === "preview")
    return !target || ["preview", "staging"].includes(target);
  if (process.env.VERCEL_ENV && process.env.VERCEL_ENV !== "development") return false;
  if (target && target !== "development") return false;
  if (
    process.env.NODE_ENV !== "development" ||
    process.env.VERCEL ||
    process.env.CLOUD_SQL_INSTANCE_CONNECTION_NAME ||
    process.env.DATABASE_CA_CERT
  )
    return false;
  try {
    const url = new URL(process.env.DATABASE_URL ?? "");
    return (
      ["postgres:", "postgresql:"].includes(url.protocol) &&
      ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) &&
      url.pathname !== "/ora"
    );
  } catch {
    return false;
  }
}
export async function personalFixtureRoute(request: NextRequest) {
  const environment = storageEnvironment();
  if (!personalFixturesEnabled() || environment === "production")
    return new Response(null, { status: 404 });
  const headers = new Headers(getCorsHeaders(request, "GET, POST, DELETE, OPTIONS"));
  headers.set("Cache-Control", "private, no-store");
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers });
  try {
    const teacher = await requestAuthenticator(request);
    if (!teacher)
      return Response.json(
        { error: "Sign in to manage your fixture." },
        { status: 401, headers },
      );
    if (!["GET", "POST", "DELETE"].includes(request.method))
      return new Response(null, { status: 405, headers });
    return Response.json(
      {
        ...(await personalFixture(
          teacher.teacherId,
          request.method as "GET" | "POST" | "DELETE",
          environment,
        )),
        environment,
      },
      { headers },
    );
  } catch (error) {
    raLogger("internal-api").error(error, { report: true });
    return Response.json(
      {
        error:
          "Could not update your fixture. Check database and storage access, then refresh its status.",
      },
      { status: 500, headers },
    );
  }
}
