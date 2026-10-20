import type {
  Anime,
  AnimeDetail,
  CalendarDay,
  MetaFilters,
  SearchResult,
  ChatSession,
  ChatMessage,
} from "@/types";
import { DEMO_ANIME, DEMO_META, demoDetail, demoSearch } from "./demo";
export const DEMO_MODE = process.env.NEXT_PUBLIC_DEMO_MODE === "true";
export const API_BASE = (process.env.NEXT_PUBLIC_API_BASE || "/api").replace(
  /\/$/,
  "",
);
export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}
export async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${API_BASE}${path}`, {
      ...init,
      headers: { "Content-Type": "application/json", ...init?.headers },
    });
  } catch {
    throw new ApiError(
      0,
      "NETWORK_ERROR",
      "无法连接服务，请检查后端是否已启动",
    );
  }
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new ApiError(
      response.status,
      body.code || body.detail?.code || "API_ERROR",
      typeof body.detail === "string"
        ? body.detail
        : body.message || "请求失败，请稍后重试",
    );
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}
export async function getCalendar(nsfw: boolean): Promise<CalendarDay[]> {
  if (DEMO_MODE)
    return Array.from({ length: 7 }, (_, i) => ({
      weekday: i + 1,
      items: DEMO_ANIME.filter(
        (a) => a.air_weekday === i + 1 && (nsfw || !a.nsfw),
      ),
    }));
  return request(`/calendar?nsfw=${nsfw}`);
}
export async function searchAnime(
  params: URLSearchParams,
  nsfw: boolean,
): Promise<SearchResult> {
  const p = new URLSearchParams(params);
  for (const key of ["year", "season"]) if (p.get(key) === "all") p.delete(key);
  p.set("nsfw", String(nsfw));
  return DEMO_MODE ? demoSearch(p) : request(`/anime/search?${p}`);
}
export async function suggestAnime(q: string, nsfw: boolean): Promise<Anime[]> {
  if (!q.trim()) return [];
  if (DEMO_MODE) {
    const p = new URLSearchParams({
      q,
      nsfw: String(nsfw),
      page_size: "8",
      region: "all",
    });
    return demoSearch(p).items;
  }
  const data = await request<Anime[] | { items: Anime[] }>(
    `/anime/suggest?q=${encodeURIComponent(q)}&nsfw=${nsfw}`,
  );
  return Array.isArray(data) ? data : data.items;
}
export async function getAnime(
  id: number,
  nsfw: boolean,
): Promise<AnimeDetail> {
  if (DEMO_MODE) {
    const found = demoDetail(id, nsfw);
    if (found) return found;
    throw new ApiError(
      DEMO_ANIME.some((a) => a.id === id) ? 403 : 404,
      "NSFW_BLOCKED",
      "该作品属于敏感内容",
    );
  }
  const data = await request<
    AnimeDetail & { related?: (Anime & { relation_type: string })[] }
  >(`/anime/${id}?nsfw=${nsfw}`);
  return {
    ...data,
    eps: data.eps || 0,
    latest_ep: data.latest_ep || 0,
    relations:
      data.relations ||
      data.related?.map((r) => ({
        relation_type: r.relation_type,
        anime: r,
      })) ||
      [],
  };
}
export async function getMeta(nsfw: boolean): Promise<MetaFilters> {
  return DEMO_MODE ? DEMO_META : request(`/meta/filters?nsfw=${nsfw}`);
}
export async function getSessions(
  clientId: string,
  nsfw = false,
): Promise<ChatSession[]> {
  if (DEMO_MODE)
    return JSON.parse(
      localStorage.getItem(`fjw.demo.sessions.${clientId}`) || "[]",
    );
  const data = await request<ChatSession[] | { items: ChatSession[] }>(
    `/chat/sessions?client_id=${clientId}&nsfw=${nsfw}`,
  );
  return Array.isArray(data) ? data : data.items;
}
export async function deleteSession(
  id: string,
  clientId: string,
): Promise<void> {
  if (DEMO_MODE) {
    const sessions = await getSessions(clientId);
    localStorage.setItem(
      `fjw.demo.sessions.${clientId}`,
      JSON.stringify(sessions.filter((x) => x.id !== id)),
    );
    localStorage.removeItem(`fjw.demo.messages.${id}`);
    return;
  }
  return request(`/chat/sessions/${id}?client_id=${clientId}`, {
    method: "DELETE",
  });
}
export async function getMessages(
  id: string,
  clientId: string,
  nsfw: boolean,
): Promise<ChatMessage[]> {
  if (DEMO_MODE)
    return JSON.parse(localStorage.getItem(`fjw.demo.messages.${id}`) || "[]");
  const data = await request<{
    messages: Record<string, unknown>[];
    anime_refs: Anime[];
  }>(`/chat/sessions/${id}?client_id=${clientId}&nsfw=${nsfw}`);
  return data.messages.map((m) => ({
    id: String(m.id),
    role: m.role as ChatMessage["role"],
    content: String(m.content || ""),
    refs: ((m.anime_refs || []) as number[])
      .map((id) => data.anime_refs?.find((a) => a.id === id))
      .filter((a): a is Anime => !!a),
    sources: (m.sources || []) as ChatMessage["sources"],
    tools: [],
  }));
}
