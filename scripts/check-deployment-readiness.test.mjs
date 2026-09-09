import assert from "node:assert/strict";
import { execFile, spawnSync } from "node:child_process";
import { createServer } from "node:http";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import { checkDeploymentReadiness } from "./check-deployment-readiness.mjs";

const config = {
  url: "https://deployment.example/health/ready",
  bypassSecret: "private-bypass-value",
};

function dependencies(respond) {
  const requests = [];
  const waits = [];
  const logs = [];
  return {
    requests,
    waits,
    logs,
    fetch: async (...args) => {
      requests.push(args);
      return respond(requests.length);
    },
    wait: async (delay) => {
      waits.push(delay);
    },
    log: (message) => {
      logs.push(message);
    },
  };
}

test("requires HTTP 200 and ready without following redirects", async () => {
  const deps = dependencies(() => Response.json({ status: "ready" }));
  assert.equal(await checkDeploymentReadiness(config, deps), true);
  assert.equal(deps.requests.length, 1);
  const [url, options] = deps.requests[0];
  assert.equal(url.href, config.url);
  assert.equal(options.redirect, "manual");
  assert.equal(options.cache, "no-store");
  assert.ok(options.signal instanceof AbortSignal);
  assert.deepEqual(options.headers, {
    "x-vercel-protection-bypass": config.bypassSecret,
  });
  assert.deepEqual(deps.waits, []);
});

for (const status of [201, 301, 302, 307, 401, 503]) {
  test(`rejects HTTP ${status} even with a ready body`, async () => {
    const deps = dependencies(() => Response.json({ status: "ready" }, { status }));
    assert.equal(await checkDeploymentReadiness(config, deps), false);
    assert.equal(deps.requests.length, 5);
    assert.deepEqual(deps.waits, [10_000, 10_000, 10_000, 10_000]);
  });
}

for (const body of [null, {}, { status: "ok" }, { status: "not-ready" }]) {
  test(`rejects a non-ready body: ${JSON.stringify(body)}`, async () => {
    const deps = dependencies(() => Response.json(body));
    assert.equal(await checkDeploymentReadiness(config, deps), false);
    assert.equal(deps.requests.length, 5);
  });
}

test("retries network, timeout and malformed JSON failures before succeeding", async () => {
  const deps = dependencies((attempt) => {
    if (attempt === 1) throw new Error(config.bypassSecret);
    if (attempt === 2) throw new DOMException(config.bypassSecret, "TimeoutError");
    if (attempt === 3) return new Response("not-json");
    return Response.json({ status: "ready" });
  });
  assert.equal(await checkDeploymentReadiness(config, deps), true);
  assert.equal(deps.requests.length, 4);
  assert.deepEqual(deps.waits, [10_000, 10_000, 10_000]);
  assert.ok(!deps.logs.join("\n").includes(config.bypassSecret));
});

test("never prints upstream bodies or URL credentials", async () => {
  const deps = dependencies(() => Response.json({ status: config.bypassSecret }));
  assert.equal(await checkDeploymentReadiness(config, deps), false);
  assert.ok(!deps.logs.join("\n").includes(config.bypassSecret));
  const invalid = dependencies(() => {
    throw new Error("must not fetch");
  });
  assert.equal(
    await checkDeploymentReadiness({ url: "https://user:secret@example.com" }, invalid),
    false,
  );
  assert.equal(invalid.requests.length, 0);
  assert.ok(!invalid.logs.join("\n").includes("secret"));
});

function notReady(checks) {
  return Response.json({ status: "not-ready", checks }, { status: 503 });
}

test("names the failing checks and their codes", async () => {
  const deps = dependencies(() =>
    notReady({
      modelConfiguration: {
        label: "Model configuration",
        status: "not-ready",
        code: "MISSING_OPENAI_API_KEY",
        retryable: false,
      },
      futureStorage: { label: "Export storage", status: "ready", message: "Fine." },
    }),
  );
  assert.equal(await checkDeploymentReadiness(config, deps), false);
  assert.equal(deps.requests.length, 1);
  assert.match(deps.logs[0], /HTTP 503 \(modelConfiguration=MISSING_OPENAI_API_KEY\)/);
  assert.ok(!deps.logs.join("\n").includes("Export storage"));
});

test("stops retrying a failure that cannot change without a deployment", async () => {
  const deps = dependencies(() =>
    notReady({
      modelConfiguration: {
        label: "Model configuration",
        status: "not-ready",
        code: "DETERMINISTIC_TRANSPORT_FORBIDDEN",
        retryable: false,
      },
    }),
  );
  assert.equal(await checkDeploymentReadiness(config, deps), false);
  assert.equal(deps.requests.length, 1);
  assert.deepEqual(deps.waits, []);
  assert.match(deps.logs.at(-1), /cannot change without a new deployment/);
});

test("keeps retrying while any failing check may still become ready", async () => {
  const deps = dependencies((attempt) =>
    attempt < 3
      ? notReady({
          alpha: { status: "not-ready", code: "TERMINAL_ONE", retryable: false },
          beta: { status: "not-ready", code: "TRANSIENT", retryable: true },
        })
      : Response.json({ status: "ready" }),
  );
  assert.equal(await checkDeploymentReadiness(config, deps), true);
  assert.equal(deps.requests.length, 3);
});

test("prints no check detail it cannot recognise", async () => {
  const deps = dependencies(() =>
    notReady({
      "../../etc": { status: "not-ready", code: "FINE_CODE" },
      injected: { status: "not-ready", code: `<script>${config.bypassSecret}` },
      described: {
        status: "not-ready",
        code: "GOOD",
        label: config.bypassSecret,
        message: config.bypassSecret,
      },
    }),
  );
  assert.equal(await checkDeploymentReadiness(config, deps), false);
  const printed = deps.logs.join("\n");
  assert.ok(!printed.includes(config.bypassSecret));
  assert.ok(!printed.includes("<script>"));
  assert.ok(!printed.includes("etc"));
  assert.match(printed, /\(unrecognised failing check\)/);
  assert.ok(!printed.includes("injected"));
  assert.ok(!printed.includes("described"));
});

for (const code of [
  "MISSING_OPENAI_API_KEY",
  "UNKNOWN_MODEL_TRANSPORT",
  "DETERMINISTIC_TRANSPORT_FORBIDDEN",
]) {
  test(`allows only the modelConfiguration pairing for ${code}`, async () => {
    const deps = dependencies(() =>
      notReady({
        modelConfiguration: { status: "not-ready", code, retryable: false },
        otherCheck: { status: "not-ready", code, retryable: false },
      }),
    );
    assert.equal(await checkDeploymentReadiness(config, deps), false);
    assert.equal(
      deps.logs[0],
      `Readiness attempt 1/5: HTTP 503 (modelConfiguration=${code}, unrecognised failing check).`,
    );
  });
}

test("does not log credential-shaped identifiers or inherited property names", async () => {
  const syntheticSecret = "SYNTHETICSECRET456";
  const deps = dependencies(() =>
    notReady({
      SYNTHETICSECRET123: {
        status: "not-ready",
        code: "MISSING_OPENAI_API_KEY",
        retryable: false,
      },
      modelConfiguration: {
        status: "not-ready",
        code: syntheticSecret,
        retryable: false,
      },
      constructor: { status: "not-ready", code: "toString", retryable: false },
    }),
  );
  assert.equal(
    await checkDeploymentReadiness({ ...config, bypassSecret: syntheticSecret }, deps),
    false,
  );
  assert.deepEqual(deps.logs, [
    "Readiness attempt 1/5: HTTP 503 (unrecognised failing check).",
    "::error::API readiness cannot change without a new deployment.",
  ]);
});

// The reported detail is composed from the check name and its code, so a name
// must not be able to spell out an allowed pair by absorbing the separator.
test("cannot be made to name a check by splitting a pair across the separator", async () => {
  const deps = dependencies(() =>
    notReady({
      "modelConfiguration=MISSING": { status: "not-ready", code: "_OPENAI_API_KEY" },
      "modelConfiguration=MISSING_OPENAI_API_KEY": { status: "not-ready", code: "" },
    }),
  );
  assert.equal(await checkDeploymentReadiness(config, deps), false);
  assert.equal(
    deps.logs[0],
    "Readiness attempt 1/5: HTTP 503 (unrecognised failing check).",
  );
});

test("warns when no bypass secret is supplied", async () => {
  const deps = dependencies(() => Response.json({ status: "ready" }));
  assert.equal(await checkDeploymentReadiness({ url: config.url }, deps), true);
  assert.match(deps.logs[0], /No bypass secret supplied/);
});

test("supports a probe without a bypass secret", async () => {
  const deps = dependencies(() => Response.json({ status: "ready" }));
  assert.equal(await checkDeploymentReadiness({ url: config.url }, deps), true);
  assert.deepEqual(deps.requests[0][1].headers, {});
});

test("the CLI fails when its URL is missing", () => {
  const result = spawnSync(
    process.execPath,
    [fileURLToPath(new URL("./check-deployment-readiness.mjs", import.meta.url))],
    { encoding: "utf8", env: {} },
  );
  assert.equal(result.status, 1);
  assert.match(result.stdout, /valid readiness URL is required/);
});

test("the CLI succeeds against a ready server and sends its environment-held bypass header", async () => {
  let receivedHeader;
  const server = createServer((request, response) => {
    receivedHeader = request.headers["x-vercel-protection-bypass"];
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify({ status: "ready" }));
  });
  try {
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    const { port } = server.address();
    const result = await promisify(execFile)(
      process.execPath,
      [
        fileURLToPath(new URL("./check-deployment-readiness.mjs", import.meta.url)),
        `http://127.0.0.1:${port}/health/ready`,
      ],
      { env: { BYPASS_SECRET: config.bypassSecret } },
    );
    assert.equal(receivedHeader, config.bypassSecret);
    assert.match(result.stdout, /API readiness confirmed/);
    assert.ok(!result.stdout.includes(config.bypassSecret));
    assert.equal(result.stderr, "");
  } finally {
    await new Promise((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
});
