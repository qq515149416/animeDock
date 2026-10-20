import type { NextApiRequest, NextApiResponse } from "next";
import http from "node:http";
import https from "node:https";
import { isIP } from "node:net";

export const config = {
  api: { bodyParser: false, responseLimit: false, externalResolver: true },
};
const HOP_HEADERS = new Set([
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
  "host",
  "x-forwarded-for",
  "x-real-ip",
  "x-fanjuwu-client-ip",
]);

/** 同源流式代理，覆盖客户端 IP 标头并在浏览器中止时关闭上游请求。 */
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
): Promise<void> {
  const base = new URL(process.env.API_INTERNAL_URL || "http://127.0.0.1:8000");
  const incoming = new URL(req.url || "/api/health", "http://local");
  const path = Array.isArray(req.query.path) ? req.query.path : [];
  base.pathname = `${base.pathname.replace(/\/$/, "")}/api/${path.map(encodeURIComponent).join("/")}`;
  base.search = incoming.search;
  const headers: Record<string, string | string[]> = {};
  for (const [key, value] of Object.entries(req.headers))
    if (value && !HOP_HEADERS.has(key.toLowerCase())) headers[key] = value;
  const peer = (req.socket.remoteAddress || "").replace(/^::ffff:/, "");
  if (isIP(peer)) headers["x-fanjuwu-client-ip"] = peer;
  headers["accept-encoding"] = "identity";
  await new Promise<void>((resolve) => {
    const upstream = (base.protocol === "https:" ? https : http).request(
      base,
      { method: req.method, headers },
      (response) => {
        res.statusCode = response.statusCode || 502;
        for (const [key, value] of Object.entries(response.headers))
          if (value && !HOP_HEADERS.has(key.toLowerCase()))
            res.setHeader(key, value);
        if (
          String(response.headers["content-type"]).includes("text/event-stream")
        ) {
          res.setHeader("Cache-Control", "no-cache, no-transform");
          res.setHeader("X-Accel-Buffering", "no");
          res.flushHeaders();
        }
        response.on("error", () => {
          res.destroy();
          resolve();
        });
        response.pipe(res);
        response.on("end", resolve);
      },
    );
    upstream.setTimeout(600_000, () =>
      upstream.destroy(new Error("Upstream timeout")),
    );
    upstream.on("error", () => {
      if (!res.headersSent)
        res
          .status(502)
          .json({
            code: "UPSTREAM_UNAVAILABLE",
            message: "后端服务暂时无法连接，请稍后重试",
          });
      else res.destroy();
      resolve();
    });
    res.on("close", () => {
      if (!res.writableEnded) upstream.destroy();
      resolve();
    });
    req.on("aborted", () => {
      upstream.destroy();
      resolve();
    });
    req.pipe(upstream);
  });
}
