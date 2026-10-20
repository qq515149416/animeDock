"use client";
import { useEffect, useState, useRef, useCallback } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import useSWR from "swr";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useApp } from "./providers";
import { Icon, MiniAnime, ErrorState } from "./ui";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "./ui/dialog";
import {
  DEMO_MODE,
  API_BASE,
  getSessions,
  getMessages,
  deleteSession,
} from "@/lib/api";
import { parseSSE } from "@/lib/sse";
import { exampleConversation, demoReply } from "@/lib/demo-chat";
import { cn } from "@/lib/utils";
import type {
  ChatMessage,
  ChatSession,
  Anime,
  Source,
  SSEEvent,
} from "@/types";
const SUGGEST = [
  { icon: "Trophy", text: "推荐几部 2025 年评分最高的漫画改番" },
  { icon: "Droplets", text: "有没有类似 CLANNAD 那样催泪的番？" },
  { icon: "CalendarCheck", text: "今天更新了哪些番？" },
  { icon: "Flame", text: "帮我讲讲这季度最火的新番" },
];
export function Chat() {
  const app = useApp(),
    params = useSearchParams() ?? new URLSearchParams(),
    router = useRouter();
  const [messages, setMessages] = useState<ChatMessage[]>([]),
    [sessionId, setSessionId] = useState<string | null>(null),
    [input, setInput] = useState(""),
    [busy, setBusy] = useState(false),
    [side, setSide] = useState(true),
    [loadingHistory, setLoadingHistory] = useState(false),
    [deleteId, setDeleteId] = useState<string | null>(null);
  const abort = useRef<AbortController | null>(null),
    scroller = useRef<HTMLDivElement>(null),
    ta = useRef<HTMLTextAreaElement>(null),
    stick = useRef(true),
    generation = useRef(0),
    busyRef = useRef(false),
    current = useRef<string | null>(null),
    messagesRef = useRef(messages),
    handledPrompt = useRef<string | null>(null),
    initialized = useRef(false),
    previousNsfw = useRef(app.nsfw),
    policy = useRef(app.nsfw);
  policy.current = app.nsfw;
  messagesRef.current = messages;
  current.current = sessionId;
  const {
    data: sessions = [],
    mutate: refreshSessions,
    error: sessionsError,
  } = useSWR(app.clientId ? ["sessions", app.clientId, app.nsfw] : null, () =>
    getSessions(app.clientId, app.nsfw),
  );
  const stop = useCallback(() => {
    generation.current++;
    abort.current?.abort();
    busyRef.current = false;
    setBusy(false);
    setLoadingHistory(false);
    setMessages((old) =>
      old.map((m, i) =>
        i === old.length - 1 && m.role === "assistant"
          ? {
              ...m,
              stopped: true,
              tools: m.tools.map((t) => ({ ...t, done: true })),
            }
          : m,
      ),
    );
  }, []);
  useEffect(() => {
    if (window.innerWidth < 1024) setSide(false);
    return () => {
      generation.current++;
      abort.current?.abort();
    };
  }, []);
  useEffect(() => {
    if (previousNsfw.current !== app.nsfw) {
      previousNsfw.current = app.nsfw;
      stop();
      setSessionId(null);
      setMessages([]);
    }
  }, [app.nsfw, stop]);
  useEffect(() => {
    const el = scroller.current;
    if (el && stick.current) el.scrollTop = el.scrollHeight;
  }, [messages, busy]);
  useEffect(() => {
    if (ta.current) {
      ta.current.style.height = "auto";
      ta.current.style.height = Math.min(ta.current.scrollHeight, 180) + "px";
    }
  }, [input]);
  useEffect(() => {
    if (
      DEMO_MODE &&
      app.clientId &&
      !initialized.current &&
      !params.get("prompt")
    ) {
      initialized.current = true;
      const key = `fjw.demo.sessions.${app.clientId}`;
      if (!localStorage.getItem(key)) {
        const example = exampleConversation();
        localStorage.setItem(key, JSON.stringify([example.session]));
        localStorage.setItem(
          `fjw.demo.messages.${example.session.id}`,
          JSON.stringify(example.messages),
        );
        setSessionId(example.session.id);
        setMessages(example.messages);
        refreshSessions();
      }
    }
  }, [app.clientId, params, refreshSessions]);
  const persistDemo = async (
    id: string,
    msgs: ChatMessage[],
    title: string,
  ) => {
    const list = await getSessions(app.clientId, true);
    const session = { id, title, updated_at: new Date().toISOString() };
    localStorage.setItem(
      `fjw.demo.sessions.${app.clientId}`,
      JSON.stringify([session, ...list.filter((s) => s.id !== id)]),
    );
    localStorage.setItem(`fjw.demo.messages.${id}`, JSON.stringify(msgs));
  };
  const send = async (text = input, regenerate = false, newSession = false) => {
    const value = text.trim();
    if (!value || busyRef.current || !app.clientId) return;
    busyRef.current = true;
    setLoadingHistory(false);
    setBusy(true);
    setInput("");
    stick.current = true;
    const run = ++generation.current;
    const requestNsfw = app.nsfw;
    const controller = new AbortController();
    abort.current = controller;
    let id = newSession ? null : current.current;
    if (DEMO_MODE && !id) id = crypto.randomUUID();
    if (newSession || !current.current) {
      setSessionId(id);
      setMessages([]);
    }
    const user: ChatMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content: value,
      refs: [],
      sources: [],
      tools: [],
    };
    const assistant: ChatMessage = {
      id: crypto.randomUUID(),
      role: "assistant",
      content: "",
      refs: [],
      sources: [],
      tools: [],
    };
    const base = newSession
      ? []
      : regenerate
        ? messagesRef.current.slice(0, -1)
        : messagesRef.current;
    const next = regenerate ? [...base, assistant] : [...base, user, assistant];
    setMessages(next);
    const patch = (fn: (message: ChatMessage) => ChatMessage) => {
      if (generation.current !== run || policy.current !== requestNsfw) return;
      setMessages((old) => old.map((m) => (m.id === assistant.id ? fn(m) : m)));
    };
    const onEvent = ({ event, data }: SSEEvent) => {
      if (generation.current !== run || policy.current !== requestNsfw) return;
      if (event === "session") {
        id = String(data.session_id);
        setSessionId(id);
        current.current = id;
      }
      if (event === "token")
        patch((m) => ({
          ...m,
          content: m.content + String(data.content || ""),
        }));
      if (event === "tool_start")
        patch((m) => ({
          ...m,
          tools: [
            ...m.tools,
            {
              tool: String(data.tool),
              label: String(data.label || "正在查询站内数据…"),
              done: false,
            },
          ],
        }));
      if (event === "tool_end")
        patch((m) => {
          const index = m.tools.findIndex(
            (t) => t.tool === data.tool && !t.done,
          );
          return {
            ...m,
            tools: m.tools.map((t, i) =>
              i === index
                ? { ...t, done: true, count: Number(data.result_count || 0) }
                : t,
            ),
          };
        });
      if (event === "anime_refs")
        patch((m) => ({ ...m, refs: (data.items || []) as Anime[] }));
      if (event === "sources")
        patch((m) => ({ ...m, sources: (data.items || []) as Source[] }));
      if (event === "error")
        patch((m) => ({
          ...m,
          error: String(data.message || data.detail || "生成失败，请稍后重试"),
        }));
    };
    try {
      if (DEMO_MODE) {
        for await (const event of demoReply(
          value,
          app.nsfw,
          id!,
          controller.signal,
        ))
          onEvent(event);
      } else {
        const response = await fetch(`${API_BASE}/chat`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            session_id: id,
            client_id: app.clientId,
            message: value,
            nsfw: app.nsfw,
          }),
          signal: controller.signal,
        });
        if (!response.ok) {
          const error = await response.json().catch(() => ({}));
          throw new Error(
            typeof error.detail === "string"
              ? error.detail
              : error.message || `请求失败（${response.status}）`,
          );
        }
        if (!response.body) throw new Error("浏览器不支持流式响应");
        for await (const event of parseSSE(response.body)) onEvent(event);
      }
    } catch (error) {
      if (!controller.signal.aborted)
        patch((m) => ({
          ...m,
          error:
            error instanceof Error ? error.message : "网络连接中断，请重试",
        }));
    } finally {
      if (generation.current === run) {
        busyRef.current = false;
        setBusy(false);
        patch((m) => ({
          ...m,
          tools: m.tools.map((t) => ({ ...t, done: true })),
        }));
        if (DEMO_MODE && id) {
          setTimeout(() => {
            if (generation.current !== run || policy.current !== requestNsfw)
              return;
            persistDemo(id!, messagesRef.current, value.slice(0, 22)).then(() =>
              refreshSessions(),
            );
          }, 0);
        } else refreshSessions();
      }
    }
  };
  useEffect(() => {
    const prompt = params.get("prompt");
    if (
      prompt &&
      app.ready &&
      app.clientId &&
      handledPrompt.current !== prompt
    ) {
      handledPrompt.current = prompt;
      initialized.current = true;
      void send(prompt, false, true);
      router.replace("/chat", { scroll: false });
    }
  }, [params, app.ready, app.clientId]);
  const newChat = () => {
    stop();
    setSessionId(null);
    setMessages([]);
    setInput("");
    if (window.innerWidth < 1024) setSide(false);
    ta.current?.focus();
  };
  const openSession = async (session: ChatSession) => {
    stop();
    const run = generation.current;
    const requestNsfw = app.nsfw;
    const valid = () =>
      generation.current === run && policy.current === requestNsfw;
    setSessionId(session.id);
    setMessages([]);
    setLoadingHistory(true);
    if (window.innerWidth < 1024) setSide(false);
    try {
      const msgs = await getMessages(session.id, app.clientId, app.nsfw);
      if (valid()) setMessages(msgs);
    } catch {
      if (valid()) app.toast("无法读取这个会话，请重试");
    } finally {
      if (valid()) setLoadingHistory(false);
    }
  };
  const remove = async () => {
    if (!deleteId) return;
    try {
      await deleteSession(deleteId, app.clientId);
      if (sessionId === deleteId) newChat();
      refreshSessions();
      app.toast("会话已删除");
    } catch {
      app.toast("删除失败，请稍后重试");
    } finally {
      setDeleteId(null);
    }
  };
  const title =
    sessions.find((s) => s.id === sessionId)?.title || "AI 番剧助手";
  return (
    <div className="ai-grad relative flex h-[calc(100dvh-129px-env(safe-area-inset-bottom))] min-h-[420px] overflow-hidden md:h-[calc(100dvh-65px)]">
      {side && (
        <button
          className="absolute inset-0 z-40 bg-black/50 lg:hidden"
          aria-label="关闭会话栏"
          onClick={() => setSide(false)}
        />
      )}
      <aside
        className={cn(
          "absolute inset-y-0 left-0 z-40 flex w-[272px] shrink-0 flex-col border-r border-line bg-card/95 backdrop-blur-xl transition-all lg:relative lg:bg-card/50",
          side ? "translate-x-0" : "-translate-x-full lg:hidden",
        )}
      >
        <div className="flex h-[72px] items-center gap-2 px-4">
          <button
            onClick={newChat}
            className="flex h-10 flex-1 items-center justify-center gap-2 rounded-xl border border-sakura/30 bg-sakura/10 text-[13px] font-semibold text-sakura hover:bg-sakura/15"
          >
            <Icon name="SquarePen" size={16} />
            新对话
          </button>
          <button
            onClick={() => setSide(false)}
            className="icon-btn"
            aria-label="收起会话栏"
          >
            <Icon name="PanelLeftClose" size={18} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-3">
          <div className="px-2 pb-3 pt-2 text-[11px] text-mut">历史会话</div>
          {sessionsError && (
            <p className="px-2 text-xs text-mut">暂时无法加载历史会话</p>
          )}
          {sessions.length === 0 && !sessionsError && (
            <p className="px-2 text-xs leading-6 text-mut">
              新的故事，从一次对话开始。
            </p>
          )}
          {sessions.map((session) => (
            <div
              key={session.id}
              className={cn(
                "group mb-1 flex items-center rounded-lg transition",
                session.id === sessionId
                  ? "bg-sakura/12 text-sakura"
                  : "text-fg/75 hover:bg-elev",
              )}
            >
              <button
                onClick={() => openSession(session)}
                className="flex min-w-0 flex-1 items-center gap-2 px-3 py-3 text-left text-[13px]"
              >
                <Icon name="MessageSquare" size={15} />
                <span className="truncate">{session.title || "新对话"}</span>
              </button>
              <button
                onClick={() => setDeleteId(session.id)}
                className="icon-btn mr-1 h-7 w-7 opacity-60 hover:text-red-400 lg:opacity-0 lg:group-hover:opacity-100 lg:focus:opacity-100"
                aria-label={`删除会话 ${session.title}`}
              >
                <Icon name="Trash2" size={13} />
              </button>
            </div>
          ))}
        </div>
        <div className="border-t border-line p-4 text-[11px] leading-relaxed text-mut">
          <div className="mb-2 flex items-center gap-1.5 text-fg/70">
            <Icon name="ShieldAlert" size={13} />
            优先检索站内数据
          </div>
          AI 回答仅供参考，请结合来源核实。
          <br />
          NSFW 内容由全局设置统一控制。
          {DEMO_MODE && (
            <div className="mt-2 text-sakura">设计预览 · 对话为示例演示</div>
          )}
        </div>
      </aside>
      <section className="flex min-w-0 flex-1 flex-col">
        <div className="flex h-12 shrink-0 items-center gap-3 border-b border-line/60 px-4 md:px-6">
          {!side && (
            <button
              onClick={() => setSide(true)}
              className="icon-btn"
              aria-label="展开会话栏"
            >
              <Icon name="PanelLeftOpen" size={18} />
            </button>
          )}
          <span className="truncate text-[13px] font-medium">{title}</span>
          <span className="rounded bg-ind/10 px-1.5 py-0.5 text-[9px] font-semibold tracking-wide text-ind">
            BETA
          </span>
          <div className="flex-1" />
          <span className="hidden items-center gap-1.5 text-[11px] text-mut sm:flex">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
            {app.nsfw ? "NSFW 已开启" : "安全模式"}
          </span>
        </div>
        <div
          ref={scroller}
          onScroll={() => {
            const el = scroller.current;
            if (el)
              stick.current =
                el.scrollHeight - el.scrollTop - el.clientHeight < 80;
          }}
          className="min-h-0 flex-1 overflow-y-auto overscroll-contain"
        >
          {loadingHistory ? (
            <div className="mx-auto flex max-w-[820px] items-center justify-center gap-3 py-24 text-sm text-mut">
              <Icon name="LoaderCircle" className="animate-spin text-sakura" />
              正在读取会话…
            </div>
          ) : messages.length === 0 ? (
            <div className="mx-auto flex min-h-full max-w-[760px] flex-col items-center justify-center px-5 py-8 md:px-8">
              <div className="relative">
                <div className="absolute -inset-5 rounded-full bg-gradient-to-br from-sakura/25 to-ind/25 blur-2xl" />
                <div className="relative grid h-16 w-16 place-items-center rounded-[20px] bg-gradient-to-br from-sakura to-ind text-white shadow-lg">
                  <Icon name="Sparkles" size={30} />
                </div>
              </div>
              <h1 className="mt-6 text-2xl font-semibold md:text-[30px]">
                今天想看点什么？
              </h1>
              <p className="mt-3 text-center text-[13px] leading-6 text-mut">
                找番、聊剧情、看放送。
                <br className="sm:hidden" /> 你的下一部心动番剧，也许就在这里。
              </p>
              <div className="mt-8 grid w-full grid-cols-1 gap-3 sm:grid-cols-2">
                {SUGGEST.map((s, i) => (
                  <button
                    key={s.text}
                    onClick={() => send(s.text)}
                    className="group flex items-center gap-3 rounded-xl border border-line bg-card/70 p-4 text-left transition hover:-translate-y-0.5 hover:border-sakura/40 hover:shadow-card"
                  >
                    <span
                      className={cn(
                        "grid h-9 w-9 shrink-0 place-items-center rounded-lg",
                        i % 2
                          ? "bg-ind/10 text-ind"
                          : "bg-sakura/10 text-sakura",
                      )}
                    >
                      <Icon name={s.icon} size={18} />
                    </span>
                    <span className="text-[13px] leading-relaxed text-fg/80 group-hover:text-fg">
                      {s.text}
                    </span>
                    <Icon
                      name="ChevronRight"
                      size={14}
                      className="ml-auto text-mut"
                    />
                  </button>
                ))}
              </div>
              {DEMO_MODE && (
                <p className="mt-5 text-[11px] text-sakura">
                  设计预览模式：此处展示示例数据与对话交互
                </p>
              )}
            </div>
          ) : (
            <div className="mx-auto max-w-[820px] space-y-8 px-4 py-7 md:px-8">
              {messages.map((m, i) => (
                <Message
                  key={m.id}
                  message={m}
                  generating={busy && i === messages.length - 1}
                  regenerate={() => {
                    const q = [...messages]
                      .slice(0, i)
                      .reverse()
                      .find((x) => x.role === "user");
                    if (q) send(q.content, true);
                  }}
                />
              ))}
            </div>
          )}
        </div>
        <div className="mx-auto w-full max-w-[820px] shrink-0 px-4 pb-3 pt-3 md:px-8 md:pb-4">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              send();
            }}
            className="rounded-2xl border border-line bg-card/90 p-3 shadow-card backdrop-blur transition-colors focus-within:border-sakura/50"
          >
            <textarea
              ref={ta}
              value={input}
              maxLength={8000}
              onChange={(e) => setInput(e.target.value)}
              aria-label="向 AI 番剧助手提问"
              placeholder="问问番剧助手，发现你的下一部心动作品…"
              rows={1}
              onKeyDown={(e) => {
                if (
                  e.key === "Enter" &&
                  !e.shiftKey &&
                  !e.nativeEvent.isComposing &&
                  e.keyCode !== 229
                ) {
                  e.preventDefault();
                  send();
                }
              }}
              className="max-h-[180px] min-h-[32px] w-full resize-none bg-transparent px-1 py-1 text-[14px] leading-6 outline-none focus-visible:outline-none"
            />
            <div className="mt-1 flex items-center">
              <span className="flex items-center gap-1.5 px-1 text-[11px] text-mut">
                <Icon name="Sparkles" size={12} className="text-sakura" />
                优先查询站内数据
              </span>
              <span className="ml-auto mr-3 hidden text-[10px] text-mut sm:block">
                Enter 发送 · Shift + Enter 换行
              </span>
              {busy ? (
                <button
                  type="button"
                  onClick={stop}
                  className="grid h-10 w-10 place-items-center rounded-xl bg-sakura text-white hover:brightness-110"
                  aria-label="停止生成"
                >
                  <Icon name="Square" size={15} fill="currentColor" />
                </button>
              ) : (
                <button
                  type="submit"
                  disabled={!input.trim() || !app.ready}
                  className="grid h-10 w-10 place-items-center rounded-xl bg-sakura text-white transition hover:brightness-110"
                  aria-label="发送消息"
                >
                  <Icon name="ArrowUp" size={20} />
                </button>
              )}
            </div>
          </form>
          <p className="mt-2 text-center text-[10px] text-mut/70">
            {DEMO_MODE
              ? "设计预览中的回复为示例演示，不代表真实模型输出"
              : "AI 可能产生不准确的信息，重要信息请核实来源"}
          </p>
        </div>
      </section>
      <Dialog open={!!deleteId} onOpenChange={(v) => !v && setDeleteId(null)}>
        <DialogContent className="max-w-sm p-6">
          <DialogTitle className="font-semibold">删除这段会话？</DialogTitle>
          <DialogDescription className="mt-3 text-sm text-mut">
            会话及其中的消息会被删除，无法恢复。
          </DialogDescription>
          <div className="mt-6 flex justify-end gap-3">
            <button onClick={() => setDeleteId(null)} className="btn-secondary">
              取消
            </button>
            <button onClick={remove} className="btn-primary bg-red-500">
              删除会话
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
function Message({
  message: m,
  generating,
  regenerate,
}: {
  message: ChatMessage;
  generating: boolean;
  regenerate: () => void;
}) {
  const { toast } = useApp();
  const [vote, setVote] = useState<string | null>(null);
  if (m.role === "user")
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-md bg-sakura px-4 py-3 text-[14px] leading-relaxed text-white">
          {m.content}
        </div>
      </div>
    );
  return (
    <div className="flex gap-3">
      <div className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-[10px] bg-gradient-to-br from-sakura to-ind text-white">
        <Icon name="Sparkles" size={16} />
      </div>
      <div className="min-w-0 flex-1">
        {m.tools.length > 0 && (
          <div className="mb-4 space-y-2">
            {m.tools.map((t, i) => (
              <div
                key={`${t.tool}-${i}`}
                className="flex items-center gap-2 text-xs"
              >
                {t.done ? (
                  <Icon name="Check" size={14} className="text-emerald-400" />
                ) : (
                  <Icon
                    name="LoaderCircle"
                    size={14}
                    className="animate-spin text-sakura"
                  />
                )}
                <span className={t.done ? "text-mut" : "shimmer-text"}>
                  {t.label}
                  {t.done && t.count != null ? ` · 命中 ${t.count} 条` : ""}
                </span>
              </div>
            ))}
          </div>
        )}
        <SpoilerMarkdown content={m.content} />
        {generating && <span className="caret" />}
        {m.refs.length > 0 && (
          <div className="no-scrollbar mt-4 flex gap-2 overflow-x-auto pb-2">
            {m.refs.map((a) => (
              <MiniAnime key={a.id} a={a} />
            ))}
          </div>
        )}
        {m.sources.length > 0 && (
          <div className="mt-4 border-t border-line/60 pt-3">
            <div className="flex flex-wrap gap-3 text-[11px] text-mut">
              {m.sources.some((s) => s.type === "site") && (
                <span className="flex items-center gap-1">
                  <Icon name="Database" size={12} />
                  站内数据
                </span>
              )}
              {m.sources.some((s) => s.type === "web") && (
                <span className="flex items-center gap-1">
                  <Icon name="ExternalLink" size={12} />
                  网络搜索
                </span>
              )}
            </div>
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-2">
              {m.sources.map((s, i) => (
                <a
                  key={`${s.url}-${i}`}
                  href={s.url}
                  target={s.url.startsWith("http") ? "_blank" : undefined}
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-[11px] text-ind hover:underline"
                >
                  [{i + 1}] {s.title}
                  <Icon name="ExternalLink" size={10} />
                </a>
              ))}
            </div>
          </div>
        )}
        {m.error && (
          <div
            role="alert"
            className="mt-3 rounded-lg border border-red-400/20 bg-red-400/5 px-3 py-2 text-xs leading-6 text-red-400"
          >
            {m.error}
          </div>
        )}
        {m.stopped && <p className="mt-2 text-[11px] text-mut">· 已停止生成</p>}
        {!generating && (
          <div className="mt-3 flex items-center gap-1">
            <button
              onClick={() =>
                navigator.clipboard
                  .writeText(m.content)
                  .then(() => toast("回复已复制"))
                  .catch(() => toast("复制失败，请手动选择文本"))
              }
              className="icon-btn h-7 w-7"
              aria-label="复制回复"
            >
              <Icon name="Copy" size={13} />
            </button>
            <button
              onClick={regenerate}
              className="icon-btn h-7 w-7"
              aria-label="重新生成"
            >
              <Icon name="RefreshCw" size={13} />
            </button>
            {["helpful", "unhelpful"].map((v, i) => (
              <button
                key={v}
                onClick={() => {
                  setVote(vote === v ? null : v);
                  toast(vote === v ? "已取消标记" : "反馈已记在当前对话");
                }}
                className={cn("icon-btn h-7 w-7", vote === v && "text-sakura")}
                aria-label={i ? "没有帮助" : "有帮助"}
                aria-pressed={vote === v}
              >
                <Icon name={i ? "ThumbsDown" : "ThumbsUp"} size={13} />
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
function SpoilerMarkdown({ content }: { content: string }) {
  const parts = content.split(/(\[spoiler\][\s\S]*?(?:\[\/spoiler\]|$))/g);
  return (
    <>
      {parts.map((part, i) =>
        part.startsWith("[spoiler]") ? (
          <Spoiler key={i} text={part.slice(9).replace(/\[\/spoiler\]$/, "")} />
        ) : (
          <div key={i} className="prose-chat text-fg/85">
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              components={{
                a: ({ children, ...props }) => (
                  <a {...props} target="_blank" rel="noreferrer">
                    {children}
                  </a>
                ),
              }}
            >
              {part}
            </ReactMarkdown>
          </div>
        ),
      )}
    </>
  );
}
function Spoiler({ text }: { text: string }) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="relative my-4 overflow-hidden rounded-xl border border-dashed border-sakura/40 bg-sakura/5 p-4">
      <div className="mb-2 flex items-center gap-1.5 text-xs text-sakura">
        <Icon name="TriangleAlert" size={13} />
        剧透内容
      </div>
      <div
        className={cn(
          "prose-chat transition-[filter]",
          !visible && "select-none blur-[6px]",
        )}
        aria-hidden={!visible}
      >
        <ReactMarkdown>{text}</ReactMarkdown>
      </div>
      {!visible && (
        <button
          onClick={() => setVisible(true)}
          className="absolute inset-0 flex items-center justify-center bg-card/20 text-xs font-semibold text-sakura backdrop-blur-[1px]"
        >
          点击显示剧透
        </button>
      )}
    </div>
  );
}
