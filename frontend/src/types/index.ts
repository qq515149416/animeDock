export type Season = "winter" | "spring" | "summer" | "autumn";
export interface Anime {
  id: number;
  name: string;
  name_cn: string;
  aliases: string[];
  summary: string;
  category: string;
  source: string;
  region: string;
  genres: string[];
  year: number | null;
  season: Season | null;
  score: number;
  rank: number | null;
  collects: number;
  eps: number;
  air_weekday: number | null;
  air_date: string | null;
  image_url: string | null;
  studio: string;
  director: string;
  nsfw: boolean;
  latest_ep?: number;
  is_new?: boolean;
  is_sequel?: boolean;
  air_time?: string;
  h1?: number;
  h2?: number;
  tags?: { name: string; count: number }[];
}
export interface Episode {
  id: number;
  sort: number;
  type: number;
  name: string;
  name_cn: string;
  airdate: string | null;
  duration: string;
  description: string;
}
export interface Character {
  id: number;
  name: string;
  image_url?: string;
  images?: import("@/lib/images").PortraitImages;
  relation?: string;
  actors?: {
    id: number;
    name: string;
    image_url?: string;
    images?: import("@/lib/images").PortraitImages;
  }[];
  cv?: string;
}
export interface Person {
  id: number;
  name: string;
  relation?: string;
}
export interface RelatedAnime {
  relation_type: string;
  anime?: Anime;
  related_id?: number;
  id?: number;
  name?: string;
  name_cn?: string;
  image_url?: string;
  score?: number;
  nsfw?: boolean;
}
export interface AnimeDetail extends Anime {
  episodes: Episode[];
  characters: Character[];
  persons: Person[];
  relations: RelatedAnime[];
}
export interface CalendarDay {
  weekday: number;
  items: Anime[];
}
export interface SearchResult {
  items: Anime[];
  total: number;
  page: number;
  page_size?: number;
  facets: Record<string, Record<string, number>>;
}
export interface Filters {
  q: string;
  category: string;
  source: string;
  region: string;
  genres: string[];
  year: string;
  season: string;
  sort: string;
  page: number;
}
export interface MetaFilters {
  categories: string[];
  sources: string[];
  regions: string[];
  genres: string[];
  years: number[];
  current_season: { year: number; season: Season };
  total?: number;
}
export interface Source {
  type: "site" | "web";
  title: string;
  url: string;
}
export interface ToolStep {
  tool: string;
  label: string;
  done: boolean;
  count?: number;
}
export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  refs: Anime[];
  sources: Source[];
  tools: ToolStep[];
  stopped?: boolean;
  error?: string;
}
export interface ChatSession {
  id: string;
  title: string;
  updated_at: string;
}
export interface SSEEvent {
  event: string;
  data: Record<string, unknown>;
}
