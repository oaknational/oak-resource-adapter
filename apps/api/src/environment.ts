/** Vercel custom environments, including staging, use VERCEL_ENV=preview. */
export function isDeployment(): boolean {
  return (
    process.env.VERCEL_ENV === "preview" || process.env.VERCEL_ENV === "production"
  );
}

export function isProductionDeployment(): boolean {
  return process.env.VERCEL_ENV === "production";
}

export function isProductionMode(): boolean {
  return process.env.NODE_ENV === "production";
}
