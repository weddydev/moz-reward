import http from "node:http";
import { afterEach, describe, expect, it } from "vitest";
import { endToEndHeaders, startForwarder } from "./e2e-forwarder.mjs";
import type { AddressInfo } from "node:net";

type Upstream = { port: number; connections: () => number; seen: http.IncomingHttpHeaders[] };

const closers: (() => Promise<void>)[] = [];
afterEach(async () => {
  await Promise.all(closers.splice(0).map((c) => c()));
});

function closeServer(s: http.Server): () => Promise<void> {
  return () =>
    new Promise((resolve) => {
      s.closeAllConnections();
      s.close(() => {
        resolve();
      });
    });
}

async function upstream(handler: http.RequestListener): Promise<Upstream> {
  let connections = 0;
  const seen: http.IncomingHttpHeaders[] = [];
  const s = http.createServer((req, res) => {
    seen.push(req.headers);
    handler(req, res);
  });
  s.on("connection", () => {
    connections += 1;
  });
  await new Promise<void>((resolve) => s.listen(0, "127.0.0.1", resolve));
  closers.push(closeServer(s));
  return { port: (s.address() as AddressInfo).port, connections: () => connections, seen };
}

async function forwarder(upstreamPort: number, log: string[] = []): Promise<number> {
  const s = (await startForwarder({
    listenPort: 0,
    upstreamHost: "127.0.0.1",
    upstreamPort,
    log: (l: string) => log.push(l),
  })) as http.Server;
  closers.push(closeServer(s));
  return (s.address() as AddressInfo).port;
}

/** One request on a fresh connection that asks to be closed, like a browser context going away. */
function get(
  port: number,
  path = "/",
): Promise<{ status: number; body: string; headers: http.IncomingHttpHeaders }> {
  return new Promise((resolve, reject) => {
    http
      .get(
        { host: "127.0.0.1", port, path, agent: false, headers: { host: "localhost:3100" } },
        (r) => {
          let body = "";
          r.setEncoding("utf8");
          r.on("data", (c: string) => (body += c));
          r.on("end", () => {
            resolve({ status: r.statusCode ?? 0, body, headers: r.headers });
          });
        },
      )
      .on("error", reject);
  });
}

describe("[P0-14] C-76 container forwarder: browser connections reuse a few host connections", () => {
  it("[P0-14] 60 one-shot browser connections ride on a handful of pooled host connections", async () => {
    const up = await upstream((req, res) => res.end(`ok ${String(req.url)}`));
    const port = await forwarder(up.port);
    for (let i = 0; i < 60; i++) {
      const r = await get(port, `/p${String(i)}`);
      expect(r).toMatchObject({ status: 200, body: `ok /p${String(i)}` });
    }
    // A plain TCP pipe would have opened 60 (Docker Desktop stalls after a few thousand of those).
    expect(up.connections()).toBeLessThanOrEqual(2);
  });

  it("[P0-14] the browser's Connection: close never reaches the app; Host and every Set-Cookie pass through", async () => {
    const up = await upstream((_req, res) => {
      res.setHeader("set-cookie", ["a=1; Path=/", "b=2; Path=/"]);
      res.setHeader("connection", "keep-alive");
      res.end("x");
    });
    const port = await forwarder(up.port);
    const r = await get(port);
    expect(up.seen[0]?.host).toBe("localhost:3100");
    expect(up.seen[0]?.connection).not.toBe("close");
    expect(r.headers["set-cookie"]).toEqual(["a=1; Path=/", "b=2; Path=/"]);
  });

  it("[P0-14] a streamed (chunked) response arrives whole", async () => {
    const up = await upstream((_req, res) => {
      res.write("one,");
      setTimeout(() => res.end("two"), 20);
    });
    const r = await get(await forwarder(up.port));
    expect(r.body).toBe("one,two");
  });

  it("[P0-14] the app being down is a 502 and a log line, never a hang", async () => {
    const up = await upstream((_req, res) => res.end());
    const deadPort = up.port;
    await closers.pop()?.();
    const log: string[] = [];
    const r = await get(await forwarder(deadPort, log));
    expect(r.status).toBe(502);
    expect(log.join("\n")).toMatch(/ECONNREFUSED/);
  });

  it("[P0-14] hop-by-hop headers, and any the Connection header names, are dropped; the rest kept", () => {
    expect(
      endToEndHeaders({
        connection: "close, x-hop",
        "keep-alive": "timeout=5",
        "transfer-encoding": "chunked",
        "x-hop": "1",
        host: "localhost:3100",
        cookie: "s=1",
      }),
    ).toEqual({ host: "localhost:3100", cookie: "s=1" });
  });
});
