import type { SSEEvent } from "@/types";
/** 将任意分片的 SSE UTF-8 字节流解析为完整事件。 */
export async function* parseSSE(
  stream: ReadableStream<Uint8Array>,
): AsyncGenerator<SSEEvent> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  const parse = (frame: string): SSEEvent | null => {
    let event = "message";
    const data: string[] = [];
    for (const line of frame.split("\n")) {
      if (line.startsWith("event:")) event = line.slice(6).trim();
      if (line.startsWith("data:")) data.push(line.slice(5).trimStart());
    }
    if (!data.length) return null;
    try {
      return {
        event,
        data: JSON.parse(data.join("\n")) as Record<string, unknown>,
      };
    } catch {
      return { event: "error", data: { message: "服务返回了无法解析的事件" } };
    }
  };
  try {
    while (true) {
      const { value, done } = await reader.read();
      buffer += done
        ? decoder.decode()
        : decoder.decode(value, { stream: true });
      buffer = buffer.replace(/\r\n/g, "\n");
      let boundary: number;
      while ((boundary = buffer.indexOf("\n\n")) !== -1) {
        const event = parse(buffer.slice(0, boundary));
        buffer = buffer.slice(boundary + 2);
        if (event) yield event;
      }
      if (done) {
        if (buffer.trim()) {
          const event = parse(buffer);
          if (event) yield event;
        }
        break;
      }
    }
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}
