import { adapterProxyPath } from "../../harness-api";
import { downloadFilename } from "./export-api";

export async function downloadArtifactFile(
  artifactId: string,
  token: string,
  signal?: AbortSignal,
  format = "docx",
) {
  const response = await fetch(
    `${adapterProxyPath}/resource-artifacts/${encodeURIComponent(artifactId)}`,
    {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
      ...(signal === undefined ? {} : { signal }),
    },
  );
  if (response.status === 401) throw new Error("Sign in again to download this file.");
  if (response.status === 404)
    throw new Error("This file is not available to your account.");
  if (!response.ok)
    throw new Error(`The download failed (HTTP ${response.status}). Try again.`);
  return {
    blob: await response.blob(),
    filename: downloadFilename(response.headers.get("content-disposition"), format),
  };
}
