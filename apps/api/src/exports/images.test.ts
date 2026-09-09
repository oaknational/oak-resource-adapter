import type { Asset } from "@oaknational/resource-document";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createRemoteImageLoader } from "./images";

const origin = "https://images.example.com";
const mib = 1024 * 1024;
const png = Uint8Array.from(
  Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLttAAAAABJRU5ErkJggg==",
    "base64",
  ),
);
// JFIF header and baseline SOF (width 40, height 20, three components).
const jpeg = new Uint8Array([
  0xff, 0xd8, 0xff, 0xe0, 0, 16, 0x4a, 0x46, 0x49, 0x46, 0, 1, 1, 0, 0, 1, 0, 1, 0, 0,
  0xff, 0xc0, 0, 17, 8, 0, 20, 0, 40, 3, 1, 0x11, 0, 2, 0x11, 0, 3, 0x11, 0, 0xff, 0xd9,
]);
const fetchMock = vi.fn<typeof fetch>();
let unexpectedFetches: number;

function asset(overrides: Partial<Asset> = {}): Asset {
  return {
    id: "picture",
    contentRef: `${origin}/picture.png`,
    mediaType: "image/png",
    alternative: { kind: "text", text: "A picture", origin: "source" },
    ...overrides,
  };
}

function response(
  chunks: Uint8Array[] = [png],
  headers: HeadersInit = { "content-type": "image/png" },
) {
  const cancel = vi.fn();
  let index = 0;
  const body = new ReadableStream<Uint8Array>(
    {
      pull(controller) {
        const chunk = chunks[index++];
        if (chunk) controller.enqueue(chunk);
        else controller.close();
      },
      cancel,
    },
    { highWaterMark: 0 },
  );
  return { response: new Response(body, { headers }), cancel };
}

beforeEach(() => {
  unexpectedFetches = 0;
  fetchMock.mockReset().mockImplementation(() => {
    unexpectedFetches++;
    throw new Error("Unexpected fetch");
  });
  vi.stubGlobal("fetch", fetchMock);
  vi.stubEnv("EXPORT_IMAGE_ALLOWED_ORIGINS", origin);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  expect(unexpectedFetches).toBe(0);
});

describe("remote export images", () => {
  it.each([
    undefined,
    "",
    " ",
    "http://images.example.com",
    `${origin}/path`,
    `${origin}?q=1`,
    `${origin}#hash`,
    "not a URL",
  ])(
    "permits no fetch with invalid or absent origin configuration: %s",
    async (configuration) => {
      vi.stubEnv("EXPORT_IMAGE_ALLOWED_ORIGINS", configuration);
      expect(await createRemoteImageLoader()(asset())).toBeUndefined();
      expect(fetchMock).not.toHaveBeenCalled();
    },
  );

  it("snapshots comma-separated origins when created and preserves intrinsic dimensions", async () => {
    vi.stubEnv(
      "EXPORT_IMAGE_ALLOWED_ORIGINS",
      ` https://other.example.com, ${origin} `,
    );
    const loader = createRemoteImageLoader();
    vi.stubEnv("EXPORT_IMAGE_ALLOWED_ORIGINS", "");
    fetchMock.mockResolvedValueOnce(response().response);
    expect(await loader(asset({ dimensions: { width: 999, height: 20 } }))).toEqual({
      data: png,
      type: "png",
      width: 1,
      height: 1,
    });
    fetchMock.mockResolvedValueOnce(response().response);
    expect(
      await loader(asset({ contentRef: "https://other.example.com/image" })),
    ).toBeDefined();
    expect(await createRemoteImageLoader()(asset())).toBeUndefined();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it.each([
    "/picture.png",
    "picture.png",
    "//images.example.com/picture.png",
    "data:image/png;base64,AAAA",
    "file:///picture.png",
    "http://images.example.com/a",
    "https://user:secret@images.example.com/a",
    "https://images.example.com.evil.test/a",
    "https://sub.images.example.com/a",
    "https://images.example.com:444/a",
    "https://other.example.com/a",
  ])("blocks non-allowed URL %s", async (contentRef) => {
    expect(await createRemoteImageLoader()(asset({ contentRef }))).toBeUndefined();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    "localhost",
    "foo.localhost",
    "service.local",
    "service.internal",
    "127.0.0.1",
    "127.1",
    "2130706433",
    "0x7f000001",
    "0.0.0.0",
    "10.0.0.1",
    "172.16.0.1",
    "192.168.0.1",
    "169.254.169.254",
    "100.64.0.1",
    "198.18.0.1",
    "224.0.0.1",
    "[::1]",
    "[::ffff:127.0.0.1]",
    "[fc00::1]",
  ])("blocks local/private literal host even if configured: %s", async (host) => {
    const url = `https://${host}`;
    vi.stubEnv("EXPORT_IMAGE_ALLOWED_ORIGINS", url);
    expect(
      await createRemoteImageLoader()(asset({ contentRef: `${url}/a` })),
    ).toBeUndefined();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each(["image/svg+xml", "image/gif", "image/webp", "application/octet-stream"])(
    "skips unsupported declared media type %s",
    async (mediaType) => {
      expect(await createRemoteImageLoader()(asset({ mediaType }))).toBeUndefined();
      expect(fetchMock).not.toHaveBeenCalled();
    },
  );

  it("loads and deduplicates images independently of alternative-text policy", async () => {
    const loader = createRemoteImageLoader();
    const missing = asset({ alternative: { kind: "missing" } });
    fetchMock.mockResolvedValueOnce(response().response);
    expect(await loader(missing)).toBeDefined();
    expect(await loader(asset({ alternative: { kind: "decorative" } }))).toBeDefined();
    expect(await loader(asset())).toBeDefined();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("uses restrictive fetch policy and falls back when a redirect is rejected", async () => {
    fetchMock.mockRejectedValueOnce(new TypeError("redirect"));
    expect(await createRemoteImageLoader()(asset())).toBeUndefined();
    expect(fetchMock).toHaveBeenCalledWith(`${origin}/picture.png`, {
      redirect: "error",
      credentials: "omit",
      cache: "no-store",
      signal: expect.any(AbortSignal),
    });
  });

  it.each([301, 404, 500])(
    "rejects HTTP status %s and cancels the body",
    async (status) => {
      const cancel = vi.fn();
      fetchMock.mockResolvedValueOnce(
        new Response(new ReadableStream({ cancel }), { status }),
      );
      expect(await createRemoteImageLoader()(asset())).toBeUndefined();
      expect(cancel).toHaveBeenCalledOnce();
    },
  );

  it("rejects an already redirected response", async () => {
    const streamed = response();
    Object.defineProperty(streamed.response, "redirected", { value: true });
    fetchMock.mockResolvedValueOnce(streamed.response);
    expect(await createRemoteImageLoader()(asset())).toBeUndefined();
    expect(streamed.cancel).toHaveBeenCalledOnce();
  });

  it("rejects a response without a body", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(null, { headers: { "content-type": "image/png" } }),
    );
    expect(await createRemoteImageLoader()(asset())).toBeUndefined();
  });

  it.each([undefined, "text/html", "image/svg+xml", "image/jpeg"])(
    "rejects missing or mismatched response content-type %s",
    async (contentType) => {
      const streamed = response(
        [png],
        contentType ? { "content-type": contentType } : {},
      );
      fetchMock.mockResolvedValueOnce(streamed.response);
      expect(await createRemoteImageLoader()(asset())).toBeUndefined();
      expect(streamed.cancel).toHaveBeenCalledOnce();
    },
  );

  it.each([
    new Uint8Array(),
    new TextEncoder().encode("<svg/>"),
    jpeg,
    png.slice(0, 8),
  ])(
    "rejects invalid signatures, mismatches and truncated dimensions (%#)",
    async (data) => {
      fetchMock.mockResolvedValueOnce(response([data]).response);
      expect(await createRemoteImageLoader()(asset())).toBeUndefined();
    },
  );

  it("reads JPEG aspect dimensions without resizing or trusting asset dimensions", async () => {
    fetchMock.mockResolvedValueOnce(
      response([jpeg], { "content-type": "image/jpeg; charset=binary" }).response,
    );
    expect(
      await createRemoteImageLoader()(
        asset({ mediaType: "image/jpeg", dimensions: { width: 1, height: 1 } }),
      ),
    ).toEqual({ data: jpeg, type: "jpg", width: 40, height: 20 });
  });

  it("rejects zero intrinsic dimensions", async () => {
    const data = png.slice();
    data.fill(0, 16, 20);
    fetchMock.mockResolvedValueOnce(response([data]).response);
    expect(await createRemoteImageLoader()(asset())).toBeUndefined();
  });

  it("rejects oversized Content-Length before reading", async () => {
    const streamed = response([png], {
      "content-type": "image/png",
      "content-length": String(5 * mib + 1),
    });
    fetchMock.mockResolvedValueOnce(streamed.response);
    expect(await createRemoteImageLoader()(asset())).toBeUndefined();
    expect(streamed.cancel).toHaveBeenCalledOnce();
  });

  it.each([undefined, "1", "invalid"])(
    "enforces actual streamed bytes with Content-Length %s",
    async (length) => {
      const headers: Record<string, string> = { "content-type": "image/png" };
      if (length) headers["content-length"] = length;
      const streamed = response([png, new Uint8Array(5 * mib), png], headers);
      fetchMock.mockResolvedValueOnce(streamed.response);
      expect(await createRemoteImageLoader()(asset())).toBeUndefined();
      expect(streamed.cancel).toHaveBeenCalledOnce();
    },
  );

  it("accepts exactly 5 MiB and stops fetching at the 20 MiB shared budget", async () => {
    const loader = createRemoteImageLoader();
    for (let index = 0; index < 4; index++) {
      fetchMock.mockResolvedValueOnce(
        response([png, new Uint8Array(5 * mib - png.length)]).response,
      );
      expect(
        (await loader(asset({ contentRef: `${origin}/${index}` })))?.data.length,
      ).toBe(5 * mib);
    }
    expect(await loader(asset())).toBeUndefined();
    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(await loader(asset({ contentRef: `${origin}/0` }))).toBeDefined();
  });

  it("charges invalid images to the total budget and enforces it across concurrent streams", async () => {
    const loader = createRemoteImageLoader();
    for (let index = 0; index < 3; index++) {
      fetchMock.mockResolvedValueOnce(response([new Uint8Array(5 * mib)]).response);
      expect(await loader(asset({ contentRef: `${origin}/${index}` }))).toBeUndefined();
    }
    fetchMock.mockResolvedValueOnce(response([png, new Uint8Array(3 * mib)]).response);
    fetchMock.mockResolvedValueOnce(response([png, new Uint8Array(3 * mib)]).response);
    const results = await Promise.all([
      loader(asset({ contentRef: `${origin}/a` })),
      loader(asset({ contentRef: `${origin}/b` })),
    ]);
    expect(results.filter(Boolean).length).toBeLessThanOrEqual(1);
    expect(await loader(asset())).toBeUndefined();
    expect(fetchMock).toHaveBeenCalledTimes(5);
  });

  it("rejects declared sizes exceeding the remaining total budget", async () => {
    const loader = createRemoteImageLoader();
    for (let index = 0; index < 4; index++) {
      fetchMock.mockResolvedValueOnce(response([new Uint8Array(4 * mib)]).response);
      expect(await loader(asset({ contentRef: `${origin}/${index}` }))).toBeUndefined();
    }
    const streamed = response([png], {
      "content-type": "image/png",
      "content-length": String(4 * mib + 1),
    });
    fetchMock.mockResolvedValueOnce(streamed.response);
    expect(await loader(asset())).toBeUndefined();
    expect(streamed.cancel).toHaveBeenCalledOnce();
  });

  it("bounds fetch attempts including failures to 20", async () => {
    const loader = createRemoteImageLoader();
    for (let index = 0; index < 20; index++) {
      fetchMock.mockRejectedValueOnce(new Error("offline"));
      expect(await loader(asset({ contentRef: `${origin}/${index}` }))).toBeUndefined();
    }
    expect(await loader(asset())).toBeUndefined();
    expect(fetchMock).toHaveBeenCalledTimes(20);
  });

  it("deduplicates in-flight and completed loads by contentRef, not asset id", async () => {
    const loader = createRemoteImageLoader();
    fetchMock.mockResolvedValueOnce(response().response);
    const [first, second] = await Promise.all([
      loader(asset()),
      loader(asset({ id: "other" })),
    ]);
    expect(first).toBeDefined();
    expect(second).toBe(first);
    expect(await loader(asset())).toBe(first);
    expect(await loader(asset({ mediaType: "image/jpeg" }))).toBeUndefined();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    fetchMock.mockResolvedValueOnce(response().response);
    expect(await createRemoteImageLoader()(asset())).toBeDefined();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("deduplicates failed loads", async () => {
    fetchMock.mockRejectedValueOnce(new Error("offline"));
    const loader = createRemoteImageLoader();
    expect(await loader(asset())).toBeUndefined();
    expect(await loader(asset())).toBeUndefined();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("aborts a stalled fetch at five seconds and caches the fallback", async () => {
    vi.useFakeTimers();
    fetchMock.mockImplementationOnce(() => new Promise(() => undefined));
    const loader = createRemoteImageLoader();
    const pending = loader(asset());
    const signal = fetchMock.mock.calls[0]?.[1]?.signal;
    await vi.advanceTimersByTimeAsync(4_999);
    expect(signal?.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(await pending).toBeUndefined();
    expect(signal?.aborted).toBe(true);
    expect(await loader(asset())).toBeUndefined();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("applies the timeout to body streaming and cancels a stalled reader", async () => {
    vi.useFakeTimers();
    const cancel = vi.fn();
    fetchMock.mockResolvedValueOnce(
      new Response(new ReadableStream({ cancel }), {
        headers: { "content-type": "image/png" },
      }),
    );
    const pending = createRemoteImageLoader()(asset());
    await vi.advanceTimersByTimeAsync(5_000);
    expect(await pending).toBeUndefined();
    expect(cancel).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("clears the timeout after success", async () => {
    vi.useFakeTimers();
    fetchMock.mockResolvedValueOnce(response().response);
    expect(await createRemoteImageLoader()(asset())).toBeDefined();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("falls back on a stream read failure", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(
        new ReadableStream({
          pull(controller) {
            controller.error(new Error("connection lost"));
          },
        }),
        { headers: { "content-type": "image/png" } },
      ),
    );
    expect(await createRemoteImageLoader()(asset())).toBeUndefined();
  });
});
