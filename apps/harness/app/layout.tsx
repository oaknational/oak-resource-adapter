import { ClerkProvider } from "@clerk/nextjs";
import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";

import "./globals.css";
import { HarnessProviders } from "./providers";

export const metadata: Metadata = {
  description: "Local integration harness for Resource Adapter",
  title: "Resource Adapter harness",
};

export const viewport: Viewport = {
  initialScale: 1,
  width: "device-width",
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <ClerkProvider>
      <html lang="en">
        <body>
          <HarnessProviders>{children}</HarnessProviders>
        </body>
      </html>
    </ClerkProvider>
  );
}
