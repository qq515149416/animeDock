import type { ChatMessage, ChatSession, SSEEvent } from "@/types";
import { DEMO_ANIME, demoSearch } from "./demo";
import { animeTitle, beijingNow } from "./utils";
export function exampleConversation(): {
  session: ChatSession;
  messages: ChatMessage[];
} {
  const refs = DEMO_ANIME.filter((a) =>
    ["樱之丘的约定 After Story", "时之栞", "白鸦之诗"].includes(a.name_cn),
  );
  const id = "design-example";
  return {
    session: {
      id,
      title: "类似 CLANNAD 的催泪番 · 示例",
      updated_at: new Date().toISOString(),
    },
    messages: [
      {
        id: "example-user",
        role: "user",
        content: "有没有类似 CLANNAD 那样催泪的番？",
        refs: [],
        sources: [],
        tools: [],
      },
      {
        id: "example-assistant",
        role: "assistant",
        content:
          "如果你喜欢 CLANNAD 那种从平凡日常走向深刻情感的叙事，可以先看看这几部。\n\n**《樱之丘的约定 After Story》**\n毕业之后，故事走向社会、家庭和时间，适合想看人生与成长主题的你。\n\n**《时之栞》**\n用跨越二十年的通信串起温柔的牵挂，节奏安静，也更适合慢慢体会。\n\n**《白鸦之诗》**\n一只想变黑的白鸦与想变成鸟的少女，相遇在一段关于自我和告别的旅途。\n\n[spoiler]以下为设计示例的剧透展示区域。点击后可以查看，真正的回答也会用相同方式保护关键剧情。[/spoiler]\n\n你更喜欢 **家庭与成长**，还是 **带一点奇幻的温柔故事**？",
        refs,
        sources: [
          { type: "site", title: "番剧坞动画库 · 设计示例", url: "/anime" },
        ],
        tools: [
          {
            tool: "semantic_search",
            label: "已检索站内相似作品",
            done: true,
            count: 3,
          },
          {
            tool: "get_anime_detail",
            label: "已读取作品详情",
            done: true,
            count: 3,
          },
        ],
      },
    ],
  };
}
/** 仅供显式设计预览，按本地示例数据展示 SSE 交互，不调用或冒充大模型。 */
export async function* demoReply(
  message: string,
  nsfw: boolean,
  sessionId: string,
  signal: AbortSignal,
): AsyncGenerator<SSEEvent> {
  const wait = async (ms: number) => {
    await new Promise<void>((resolve, reject) => {
      const onAbort = () => {
        clearTimeout(timer);
        reject(new DOMException("Aborted", "AbortError"));
      };
      const timer = setTimeout(() => {
        signal.removeEventListener("abort", onAbort);
        resolve();
      }, ms);
      signal.addEventListener("abort", onAbort, { once: true });
      if (signal.aborted) onAbort();
    });
  };
  yield { event: "session", data: { session_id: sessionId } };
  yield {
    event: "tool_start",
    data: { tool: "search_anime", args: {}, label: "正在检索设计示例动画库…" },
  };
  await wait(500);
  let refs = DEMO_ANIME.filter((a) => nsfw || !a.nsfw);
  if (/今天|更新|放送/.test(message))
    refs = refs.filter((a) => a.air_weekday === (beijingNow().getDay() || 7));
  else {
    const match = refs.filter((a) =>
      [a.name_cn, a.name, ...a.genres].some((x) => message.includes(x)),
    );
    refs = match.length
      ? match
      : refs.filter((a) => a.year === 2026).sort((a, b) => b.score - a.score);
  }
  refs = refs.slice(0, 3);
  yield {
    event: "tool_end",
    data: { tool: "search_anime", result_count: refs.length },
  };
  const content =
    "以下是**设计预览中的示例检索结果**，用来展示对话、卡片与来源的呈现方式。正式部署配置模型后，将由 AI 基于真实站内数据回答。\n\n" +
    refs
      .map(
        (a) =>
          `**《${animeTitle(a)}》** · ${a.score.toFixed(1)} 分\n${a.summary}`,
      )
      .join("\n\n") +
    "\n\n想进一步了解哪一部？可以点开卡片查看详情。";
  for (let i = 0; i < content.length; i += 7) {
    await wait(22);
    yield { event: "token", data: { content: content.slice(i, i + 7) } };
  }
  yield { event: "anime_refs", data: { items: refs } };
  yield {
    event: "sources",
    data: {
      items: [
        { type: "site", title: "番剧坞动画库 · 设计示例", url: "/anime" },
      ],
    },
  };
  yield { event: "done", data: {} };
}
