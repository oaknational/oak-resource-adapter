import type { Asset } from "@oaknational/resource-document";
import { imageSize } from "image-size";

export interface ExportImage {
  data: Uint8Array;
  type: "png" | "jpg";
  width: number;
  height: number;
}

export type ImageLoader = (asset: Asset) => Promise<ExportImage | undefined>;

const maxImageBytes = 5 * 1024 * 1024;
const maxTotalBytes = 20 * 1024 * 1024;
const maxFetches = 20;
const timeoutMs = 5_000;

function imageType(mediaType: string): ExportImage["type"] | undefined {
  switch (mediaType.split(";", 1)[0]?.trim().toLowerCase()) {
    case "image/png":
      return "png";
    case "image/jpeg":
      return "jpg";
    default:
      return undefined;
  }
}

function remoteUrl(value: string): URL | undefined {
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase().replace(/\.$/, "");
    if (
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      !host.includes(".") ||
      host.startsWith("[") ||
      /(^|\.)(localhost|local|internal)$/.test(host)
    )
      return undefined;

    // IPv6 literals are excluded; URL parsing canonicalises alternative IPv4 spellings.
    if (/^\d+\.\d+\.\d+\.\d+$/.test(host)) {
      const [a = 0, b = 0] = host.split(".").map(Number);
      if (
        a === 0 ||
        a === 10 ||
        a === 127 ||
        a >= 224 ||
        (a === 100 && b >= 64 && b <= 127) ||
        (a === 169 && b === 254) ||
        (a === 172 && b >= 16 && b <= 31) ||
        (a === 192 && (b === 0 || b === 168)) ||
        (a === 198 && (b === 18 || b === 19))
      )
        return undefined;
    }
    return url;
  } catch {
    return undefined;
  }
}

function configuredOrigins(): Set<string> {
  const origins = new Set<string>();
  for (const value of (process.env.EXPORT_IMAGE_ALLOWED_ORIGINS ?? "").split(",")) {
    const url = remoteUrl(value.trim());
    if (url?.pathname === "/" && !url.search && !url.hash) {
      origins.add(url.origin);
    }
  }
  return origins;
}

function hasSignature(data: Uint8Array, type: ExportImage["type"]): boolean {
  const signature =
    type === "png"
      ? [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]
      : [0xff, 0xd8, 0xff];
  return signature.every((byte, index) => data[index] === byte);
}

interface Budget {
  bytes: number;
  fetches: number;
}

async function download(
  url: URL,
  type: ExportImage["type"],
  signal: AbortSignal,
  budget: Budget,
): Promise<ExportImage | undefined> {
  const response = await fetch(url.href, {
    redirect: "error",
    credentials: "omit",
    cache: "no-store",
    signal,
  });
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  const cancel = () => {
    const cancellation = reader ? reader.cancel() : response.body?.cancel();
    void cancellation?.catch(() => undefined);
  };
  signal.addEventListener("abort", cancel, { once: true });
  try {
    if (
      signal.aborted ||
      !response.ok ||
      response.redirected ||
      !response.body ||
      imageType(response.headers.get("content-type") ?? "") !== type
    )
      return undefined;

    const declaredLength = Number(response.headers.get("content-length"));
    if (declaredLength > Math.min(maxImageBytes, maxTotalBytes - budget.bytes)) {
      return undefined;
    }

    reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let bytes = 0;
    while (!signal.aborted) {
      const { done, value } = await reader.read();
      if (signal.aborted) return undefined;
      if (done) break;
      bytes += value.byteLength;
      // Failed downloads also consume the shared budget; concurrent reads cannot refund it.
      budget.bytes += value.byteLength;
      if (bytes > maxImageBytes || budget.bytes > maxTotalBytes) return undefined;
      chunks.push(value);
    }
    if (signal.aborted) return undefined;

    const data = new Uint8Array(bytes);
    let offset = 0;
    for (const chunk of chunks) {
      data.set(chunk, offset);
      offset += chunk.byteLength;
    }
    if (!hasSignature(data, type)) return undefined;
    const dimensions = imageSize(data);
    if (
      dimensions.type !== type ||
      !Number.isSafeInteger(dimensions.width) ||
      dimensions.width <= 0 ||
      !Number.isSafeInteger(dimensions.height) ||
      dimensions.height <= 0
    )
      return undefined;
    return { data, type, width: dimensions.width, height: dimensions.height };
  } finally {
    signal.removeEventListener("abort", cancel);
    cancel();
  }
}

/**
 * Create once per export. Administrator-configured origins must be trusted to
 * resolve to public infrastructure: this is not a DNS-rebinding defence.
 */
export function createRemoteImageLoader(): ImageLoader {
  const origins = configuredOrigins();
  const results = new Map<string, Promise<ExportImage | undefined>>();
  const budget: Budget = { bytes: 0, fetches: 0 };

  async function load(url: URL, type: ExportImage["type"]) {
    if (budget.fetches >= maxFetches || budget.bytes >= maxTotalBytes) return undefined;
    budget.fetches++;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<undefined>((resolve) => {
      timer = setTimeout(() => {
        controller.abort();
        resolve(undefined);
      }, timeoutMs);
    });
    try {
      return await Promise.race([
        download(url, type, controller.signal, budget),
        timeout,
      ]);
    } catch {
      return undefined;
    } finally {
      clearTimeout(timer);
      controller.abort();
    }
  }

  return (asset) => {
    const type = imageType(asset.mediaType);
    const url = remoteUrl(asset.contentRef);
    if (!type || !url || !origins.has(url.origin)) {
      return Promise.resolve(undefined);
    }
    let result = results.get(asset.contentRef);
    if (!result) {
      result = load(url, type);
      results.set(asset.contentRef, result);
    }
    return result.then((image) => (image?.type === type ? image : undefined));
  };
}
