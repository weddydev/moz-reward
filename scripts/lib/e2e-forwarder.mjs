// The Linux browser container's way to the app (C-76, 23 Nov 2026), run inside the container by `pnpm e2e:linux`
// and `gate:task` (scripts/e2e-linux.ts): listens on 127.0.0.1:<port> there, so the browsers reach the app as
// http://localhost:3100 like on CI, and forwards to the app on the host through `host.docker.internal`.
//
// Why HTTP with pooled keep-alive connections, not a plain TCP pipe: Docker Desktop's host networking stalls every
// new connection for ~68 s once a few thousand have been opened in a short time (repro 23 Nov: ~3,100 connects in
// ~30 s, then every connect hung 68 s, with or without a forwarder). A 1:1 TCP pipe passes every browser connection
// (each test's new context opens fresh ones) straight through as a new host connection, which is what stalled
// `page.goto` locally for 30–60 s every 1.5–2.5 min (C-76). Here the browser side may open as many connections as it
// likes; the host side reuses a small pool (repro: 370,000 requests over 12 host connections, no stall).
//
// - Hop-by-hop headers are dropped both ways (a browser's `Connection: close` must not close a pooled socket);
//   everything else, including Host, cookies and streaming bodies, passes through unchanged.
// - Idle pooled sockets close after 4 s, before Node's default 5 s keep-alive timeout on `next start`; a GET/HEAD that
//   still lands on a socket the server just closed is retried once on a fresh one.
// - WebSocket upgrades get their own TCP tunnel (rare: the production app opens none).
// - Slow connects (> 3 s) and errors go to the container log (`docker logs moz-pw-linux`).
// Plain JavaScript with no dependencies so the container runs it as is (`node --input-type=module -e`).
import http from "node:http";
import net from "node:net";

const HOP_BY_HOP = [
  "connection",
  "keep-alive",
  "proxy-connection",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
  "expect",
];

/** A copy of `headers` without the hop-by-hop ones (and without any the Connection header names). */
export function endToEndHeaders(headers) {
  const named = String(headers.connection ?? "")
    .split(",")
    .map((h) => h.trim().toLowerCase())
    .filter(Boolean);
  const out = {};
  for (const [k, v] of Object.entries(headers)) {
    if (v === undefined || HOP_BY_HOP.includes(k) || named.includes(k)) continue;
    out[k] = v;
  }
  return out;
}

/**
 * Starts the forwarder; resolves with the server once it listens. `log` gets one line per slow connect or error.
 * @param {{ listenPort: number, listenHost?: string, upstreamHost: string, upstreamPort: number,
 *           maxSockets?: number, log?: (line: string) => void }} o
 */
export function startForwarder(o) {
  const log = o.log ?? ((line) => console.error(`[e2e-forwarder] ${line}`));
  const agent = new http.Agent({ keepAlive: true, maxSockets: o.maxSockets ?? 32, timeout: 4000 });
  const createConnection = agent.createConnection.bind(agent);
  let opened = 0;
  agent.createConnection = (opts, cb) => {
    const started = Date.now();
    opened += 1;
    const s = createConnection(opts, cb);
    s.once("connect", () => {
      const ms = Date.now() - started;
      if (ms > 3000) log(`slow connect ${String(ms)} ms (host connection ${String(opened)})`);
    });
    return s;
  };

  const server = http.createServer((req, res) => {
    const send = (retried) => {
      const up = http.request(
        {
          host: o.upstreamHost,
          port: o.upstreamPort,
          method: req.method,
          path: req.url,
          headers: endToEndHeaders(req.headers),
          agent,
        },
        (upRes) => {
          res.writeHead(
            upRes.statusCode ?? 502,
            upRes.statusMessage,
            endToEndHeaders(upRes.headers),
          );
          upRes.pipe(res);
          upRes.on("error", () => res.destroy());
        },
      );
      up.on("error", (e) => {
        const idempotent = req.method === "GET" || req.method === "HEAD";
        if (!retried && idempotent && up.reusedSocket && !res.headersSent) {
          send(true);
          return;
        }
        log(`${String(req.method)} ${String(req.url)}: ${e.code ?? e.message}`);
        if (res.headersSent) res.destroy();
        else res.writeHead(502).end();
      });
      // The browser gave up (navigation, closed page): drop the host request too.
      res.on("close", () => {
        if (!res.writableFinished) up.destroy();
      });
      if (retried) up.end();
      else req.pipe(up);
    };
    send(false);
  });

  server.on("upgrade", (req, socket, head) => {
    const up = net.connect(o.upstreamPort, o.upstreamHost, () => {
      const lines = [`${String(req.method)} ${String(req.url)} HTTP/${req.httpVersion}`];
      for (let i = 0; i < req.rawHeaders.length; i += 2)
        lines.push(`${String(req.rawHeaders[i])}: ${String(req.rawHeaders[i + 1])}`);
      up.write(`${lines.join("\r\n")}\r\n\r\n`);
      if (head.length > 0) up.write(head);
      socket.pipe(up);
      up.pipe(socket);
    });
    up.on("error", (e) => {
      log(`upgrade ${String(req.url)}: ${e.code ?? e.message}`);
      socket.destroy();
    });
    socket.on("error", () => up.destroy());
  });
  server.on("clientError", (_e, socket) => socket.destroy());

  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(o.listenPort, o.listenHost ?? "127.0.0.1", () => resolve(server));
  });
}
