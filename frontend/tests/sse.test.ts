import test from "node:test";
import assert from "node:assert/strict";
import { parseSSE } from "../src/lib/sse";
function stream(text: string, chunk = 1) {
  const bytes = new TextEncoder().encode(text);
  let index = 0;
  return new ReadableStream<Uint8Array>({
    pull(controller) {
      if (index >= bytes.length) {
        controller.close();
        return;
      }
      controller.enqueue(bytes.slice(index, (index += chunk)));
    },
  });
}
test("SSE handles fragmented UTF-8 and CRLF boundaries", async () => {
  const text =
    'event: token\r\ndata: {"content":"你好，番剧坞"}\r\n\r\nevent: done\r\ndata: {}\r\n\r\n';
  const events = [];
  for await (const item of parseSSE(stream(text))) events.push(item);
  assert.deepEqual(events, [
    { event: "token", data: { content: "你好，番剧坞" } },
    { event: "done", data: {} },
  ]);
});
test("SSE ignores comments and parses multiline data and EOF", async () => {
  const events = [];
  for await (const item of parseSSE(
    stream(
      ': ping\n\nevent: token\ndata: {\ndata: "content": "x"}\n\nevent: done\ndata: {}',
      7,
    ),
  ))
    events.push(item);
  assert.equal(events.length, 2);
  assert.equal(events[0].data.content, "x");
  assert.equal(events[1].event, "done");
});
