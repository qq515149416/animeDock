import test from "node:test";
import assert from "node:assert/strict";
import http, { type IncomingMessage, type ServerResponse } from "node:http";
import { once } from "node:events";
import type { NextApiRequest, NextApiResponse } from "next";
import handler from "../src/pages/api/[...path]";
async function listen(server: http.Server) {
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  return (server.address() as { port: number }).port;
}
async function close(server: http.Server) {
  server.closeAllConnections();
  await new Promise<void>((resolve) => server.close(() => resolve()));
}
function proxy() {
  return http.createServer((req: IncomingMessage, res: ServerResponse) => {
    const incoming = req as NextApiRequest;
    incoming.query = {
      path: new URL(req.url!, "http://local").pathname.split("/").slice(2),
    };
    const outgoing = res as NextApiResponse;
    outgoing.status = (code: number) => {
      res.statusCode = code;
      return outgoing;
    };
    outgoing.json = (body: unknown) => {
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify(body));
      return outgoing;
    };
    void handler(incoming, outgoing);
  });
}
test("proxy streams UTF-8 events and overwrites forged client address", async () => {
  let receivedIP = "",
    path = "";
  const upstream = http.createServer((req, res) => {
    receivedIP = String(req.headers["x-fanjuwu-client-ip"]);
    path = req.url!;
    res.writeHead(200, { "content-type": "text/event-stream" });
    res.write('event: token\ndata: {"content":"你好"}\n\n');
    setTimeout(() => res.end("event: done\ndata: {}\n\n"), 30);
  });
  const original = process.env.API_INTERNAL_URL;
  const upstreamPort = await listen(upstream);
  process.env.API_INTERNAL_URL = `http://127.0.0.1:${upstreamPort}`;
  const server = proxy();
  const port = await listen(server);
  try {
    const response = await fetch(
      `http://127.0.0.1:${port}/api/chat?nsfw=false`,
      {
        method: "POST",
        headers: {
          "x-fanjuwu-client-ip": "203.0.113.42",
          "content-type": "application/json",
        },
        body: "{}",
      },
    );
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("x-accel-buffering"), "no");
    const reader = response.body!.getReader();
    const first = await reader.read();
    assert.match(new TextDecoder().decode(first.value), /你好/);
    await reader.cancel();
    assert.equal(receivedIP, "127.0.0.1");
    assert.equal(path, "/api/chat?nsfw=false");
  } finally {
    await close(server);
    await close(upstream);
    if (original === undefined) delete process.env.API_INTERNAL_URL;
    else process.env.API_INTERNAL_URL = original;
  }
});
test("browser cancellation closes the upstream streaming response", async () => {
  let closed!: () => void;
  const didClose = new Promise<void>((resolve) => (closed = resolve));
  const upstream = http.createServer((req, res) => {
    res.writeHead(200, { "content-type": "text/event-stream" });
    res.write('event: token\ndata: {"content":"x"}\n\n');
    res.on("close", () => closed());
  });
  const original = process.env.API_INTERNAL_URL;
  const upstreamPort = await listen(upstream);
  process.env.API_INTERNAL_URL = `http://127.0.0.1:${upstreamPort}`;
  const server = proxy();
  const port = await listen(server);
  let timer: ReturnType<typeof setTimeout>;
  try {
    const controller = new AbortController();
    const response = await fetch(`http://127.0.0.1:${port}/api/chat`, {
      signal: controller.signal,
    });
    await response.body!.getReader().read();
    controller.abort();
    await Promise.race([
      didClose,
      new Promise((_, reject) => {
        timer = setTimeout(
          () => reject(new Error("upstream remained open")),
          2000,
        );
      }),
    ]);
  } finally {
    clearTimeout(timer!);
    await close(server);
    await close(upstream);
    if (original === undefined) delete process.env.API_INTERNAL_URL;
    else process.env.API_INTERNAL_URL = original;
  }
});
