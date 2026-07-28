import { clerkMiddleware } from "@clerk/nextjs/server";

// Required by @clerk/nextjs so the Clerk session is available to the app.
export default clerkMiddleware();

export const config = {
  matcher: [
    // Skip Next internals and static files, unless found in search params.
    String.raw`/((?!_next|[^?]*\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)`,
    // Always run for API/tRPC routes.
    "/(api|trpc)(.*)",
  ],
};
