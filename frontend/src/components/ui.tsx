"use client";
import Link from "next/link";
import {
  useState,
  useRef,
  useLayoutEffect,
  useEffect,
  useCallback,
  type ReactNode,
  type CSSProperties,
} from "react";
import {
  Tv,
  CalendarDays,
  LibraryBig,
  Sparkles,
  Search,
  Sun,
  Moon,
  Heart,
  History,
  Bell,
  ShieldAlert,
  X,
  Star,
  EyeOff,
  Leaf,
  Snowflake,
  Flower2,
  LayoutGrid,
  Clock3,
  List,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  SlidersHorizontal,
  Check,
  RotateCcw,
  SearchX,
  Sparkle,
  Share2,
  SquarePen,
  PanelLeftClose,
  PanelLeftOpen,
  MessageSquare,
  Trash2,
  ArrowUp,
  TriangleAlert,
  Copy,
  RefreshCw,
  ThumbsUp,
  ThumbsDown,
  ExternalLink,
  Trophy,
  Droplets,
  CalendarCheck,
  Flame,
  Database,
  ArrowLeft,
  LoaderCircle,
  Square,
  BookOpen,
  type LucideIcon,
} from "lucide-react";
import { cn, animeTitle, formatCount } from "@/lib/utils";
import { getAnimeCoverUrl } from "@/lib/images";
import type { Anime } from "@/types";
import { useApp } from "./providers";
const ICONS: Record<string, LucideIcon> = {
  Tv,
  CalendarDays,
  LibraryBig,
  Sparkles,
  Search,
  Sun,
  Moon,
  Heart,
  History,
  Bell,
  ShieldAlert,
  X,
  Star,
  EyeOff,
  Leaf,
  Snowflake,
  Flower2,
  LayoutGrid,
  Clock3,
  List,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  SlidersHorizontal,
  Check,
  RotateCcw,
  SearchX,
  Sparkle,
  Share2,
  SquarePen,
  PanelLeftClose,
  PanelLeftOpen,
  MessageSquare,
  Trash2,
  ArrowUp,
  TriangleAlert,
  Copy,
  RefreshCw,
  ThumbsUp,
  ThumbsDown,
  ExternalLink,
  Trophy,
  Droplets,
  CalendarCheck,
  Flame,
  Database,
  ArrowLeft,
  LoaderCircle,
  Square,
  BookOpen,
};
export function Icon({
  name,
  size = 18,
  className = "",
  ...props
}: {
  name: string;
  size?: number;
  className?: string;
  fill?: string;
  strokeWidth?: number;
  style?: CSSProperties;
}) {
  const Component = ICONS[name] || Sparkles;
  return (
    <Component
      size={size}
      className={cn("shrink-0", className)}
      aria-hidden
      {...props}
    />
  );
}
export function CoverArt({
  a,
  className = "",
  titleScale = 1,
}: {
  a: Anime;
  className?: string;
  titleScale?: number;
}) {
  const h1 = a.h1 ?? (a.id * 47) % 360,
    h2 = a.h2 ?? (h1 + 70) % 360;
  return (
    <div
      className={cn("absolute inset-0 overflow-hidden", className)}
      style={{
        background: `radial-gradient(120% 80% at 80% 0%, oklch(0.78 0.12 ${h1} / .9), transparent 60%),linear-gradient(165deg, oklch(0.6 0.13 ${h1}), oklch(0.3 0.09 ${h2}))`,
      }}
    >
      <div
        className="absolute rounded-full opacity-80"
        style={{
          width: "62%",
          aspectRatio: "1",
          left: `${10 + ((a.id * 13) % 30)}%`,
          top: `${14 + ((a.id * 7) % 22)}%`,
          background: `radial-gradient(circle at 35% 35%,oklch(0.95 0.05 ${h1}),oklch(0.75 0.13 ${h2}) 70%)`,
          filter: "blur(.3px)",
        }}
      />
      <div
        className="absolute inset-x-0 bottom-0 h-1/2"
        style={{
          background: `linear-gradient(to top,oklch(0.18 0.05 ${h2} / .85),transparent)`,
        }}
      />
      <div className="absolute inset-0 cover-grain" />
      <div
        className="absolute right-[7%] top-[6%] max-h-[60%] overflow-hidden font-semibold leading-none tracking-[.18em] text-white/85"
        style={{
          writingMode: "vertical-rl",
          fontSize: 11 * titleScale,
          textShadow: "0 1px 6px rgba(0,0,0,.25)",
        }}
      >
        {a.name}
      </div>
      <div
        className="absolute bottom-[6%] left-[8%] right-[8%] font-semibold leading-tight text-white"
        style={{
          fontSize: 13 * titleScale,
          textShadow: "0 1px 8px rgba(0,0,0,.35)",
        }}
      >
        <div className="line-clamp-2">{animeTitle(a)}</div>
        <div className="mt-1 h-px w-6 bg-white/60" />
      </div>
    </div>
  );
}
export function CoverImage({
  a,
  titleScale = 1,
  decorative = false,
}: {
  a: Anime;
  titleScale?: number;
  decorative?: boolean;
}) {
  const src = getAnimeCoverUrl(a);
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  return src && failedSrc !== src ? (
    <img
      src={src}
      alt={decorative ? "" : animeTitle(a)}
      loading="lazy"
      referrerPolicy="no-referrer"
      className="h-full w-full object-cover"
      onError={() => setFailedSrc(src)}
    />
  ) : (
    <CoverArt a={a} titleScale={titleScale} />
  );
}
export function Cover({
  a,
  className = "",
  imgClass = "",
  titleScale = 1,
  allowReveal = true,
}: {
  a: Anime;
  className?: string;
  imgClass?: string;
  titleScale?: number;
  allowReveal?: boolean;
}) {
  const { unblur, revealed, reveal } = useApp();
  const hidden = a.nsfw && !unblur && !revealed.has(a.id);
  return (
    <div
      className={cn(
        "relative aspect-[5/7] overflow-hidden rounded-xl bg-elev",
        className,
      )}
    >
      <div
        className={cn(
          "absolute inset-0 transition-[transform,filter] duration-300",
          imgClass,
          hidden && "scale-110 blur-[20px]",
        )}
      >
        <CoverImage a={a} titleScale={titleScale} />
      </div>
      {a.nsfw && (
        <span className="absolute right-2 top-2 z-10 rounded-md bg-red-500/90 px-1.5 py-0.5 text-[10px] font-bold tracking-wide text-white">
          R18
        </span>
      )}
      {hidden && allowReveal && (
        <button
          aria-label={`显示 ${animeTitle(a)} 的封面`}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            reveal(a.id);
          }}
          className="absolute inset-0 z-[5] flex flex-col items-center justify-center gap-1.5 bg-black/30 text-white/90"
        >
          <Icon name="EyeOff" size={20} />
          <span className="text-[11px]">点击显示</span>
        </button>
      )}
    </div>
  );
}
export function Score({
  value,
  className = "",
}: {
  value: number;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 text-xs font-semibold tabular-nums",
        className,
      )}
    >
      <Icon
        name="Star"
        size={12}
        className="text-sakura"
        fill="currentColor"
        strokeWidth={0}
      />
      {Number(value || 0).toFixed(1)}
    </span>
  );
}
export function AnimeCard({
  a,
  extra,
  showEp = true,
}: {
  a: Anime;
  extra?: ReactNode;
  showEp?: boolean;
}) {
  return (
    <Link
      href={`/anime/${a.id}`}
      className="group block cursor-pointer text-left fade-in"
    >
      <div className="relative rounded-xl shadow-card transition-all duration-200 group-hover:-translate-y-1 group-hover:shadow-cardh">
        <Cover a={a} imgClass="group-hover:scale-[1.06]" />
        {(a.is_new || a.is_sequel) && (
          <span
            className={cn(
              "absolute left-2 top-2 z-10 rounded-md px-1.5 py-0.5 text-[10px] font-semibold text-white shadow-sm",
              a.is_sequel ? "bg-ind" : "bg-sakura",
            )}
          >
            {a.is_sequel ? "续作" : "新番"}
          </span>
        )}
        {showEp && !!a.latest_ep && (
          <span className="absolute bottom-2 right-2 z-10 rounded-md bg-black/55 px-1.5 py-0.5 text-[10px] font-medium text-white backdrop-blur-sm">
            更新至第 {a.latest_ep} 话
          </span>
        )}
      </div>
      <div className="mt-2.5 px-0.5">
        <h3 className="line-clamp-2 min-h-[2.5em] text-[14px] font-semibold leading-snug transition-colors duration-200 group-hover:text-sakura">
          {animeTitle(a)}
        </h3>
        <p className="mt-0.5 truncate text-xs text-mut">{a.name}</p>
        <div className="mt-1.5 flex items-center justify-between gap-2">
          <Score value={a.score} />
          {extra}
        </div>
      </div>
    </Link>
  );
}
export function CardSkeleton() {
  return (
    <div aria-hidden>
      <div className="skel aspect-[5/7] rounded-xl" />
      <div className="skel mt-3 h-3.5 w-[85%] rounded" />
      <div className="skel mt-2 h-3 w-[60%] rounded" />
      <div className="skel mt-2 h-3 w-8 rounded" />
    </div>
  );
}
export function GridSkeleton() {
  return (
    <div className="anime-grid" aria-label="正在加载番剧">
      {Array.from({ length: 6 }, (_, i) => (
        <CardSkeleton key={i} />
      ))}
    </div>
  );
}
export function Chip({
  active,
  children,
  count,
  onClick,
  className = "",
}: {
  active?: boolean;
  children: ReactNode;
  count?: number;
  onClick: () => void;
  className?: string;
}) {
  return (
    <button
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "inline-flex h-8 items-center gap-1.5 whitespace-nowrap rounded-full px-3 text-[13px] transition-all duration-200",
        active
          ? "bg-sakura text-white shadow-[0_4px_14px_-4px_rgba(255,107,157,.6)]"
          : "bg-elev text-fg/80 hover:bg-elev2 hover:text-fg",
        count === 0 && !active && "opacity-45",
        className,
      )}
    >
      {children}
      {count != null && (
        <span
          className={cn(
            "text-[11px] tabular-nums",
            active ? "text-white/80" : "text-mut",
          )}
        >
          {count}
        </span>
      )}
    </button>
  );
}
export function Segmented({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; icon?: string; label: string }[];
}) {
  return (
    <div className="inline-flex shrink-0 rounded-lg bg-elev p-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          onClick={() => onChange(o.value)}
          title={o.label}
          aria-label={o.label}
          aria-pressed={value === o.value}
          className={cn(
            "inline-flex h-8 items-center gap-1.5 rounded-md px-2 text-[13px] transition-all duration-200 sm:px-3",
            value === o.value
              ? "bg-card text-fg shadow-sm"
              : "text-mut hover:text-fg",
          )}
        >
          {o.icon && <Icon name={o.icon} size={15} />}
          <span className={o.icon ? "hidden sm:inline" : ""}>{o.label}</span>
        </button>
      ))}
    </div>
  );
}
export function SlideTabs<T extends string | number>({
  items,
  value,
  onChange,
  itemClass = "",
  className = "",
}: {
  items: { key: T; label: ReactNode }[];
  value: T;
  onChange: (key: T) => void;
  itemClass?: string;
  className?: string;
}) {
  const wrap = useRef<HTMLDivElement>(null);
  const [bar, setBar] = useState({ left: 0, width: 0 });
  const measure = useCallback(() => {
    const el = wrap.current?.querySelector<HTMLElement>(`[data-k="${value}"]`);
    setBar(
      el
        ? { left: el.offsetLeft, width: el.offsetWidth }
        : { left: 0, width: 0 },
    );
  }, [value]);
  useLayoutEffect(measure, [measure, items.length]);
  useEffect(() => {
    const ro = new ResizeObserver(measure);
    if (wrap.current) {
      ro.observe(wrap.current);
      wrap.current.querySelectorAll("[data-k]").forEach((el) => ro.observe(el));
    }
    document.fonts.ready.then(measure);
    return () => ro.disconnect();
  }, [measure]);
  return (
    <div ref={wrap} role="tablist" className={cn("relative flex", className)}>
      {items.map((it) => (
        <button
          role="tab"
          aria-selected={value === it.key}
          key={it.key}
          data-k={it.key}
          onClick={() => onChange(it.key)}
          className={cn(
            "relative whitespace-nowrap transition-colors duration-200",
            value === it.key ? "text-fg" : "text-mut hover:text-fg",
            itemClass,
          )}
        >
          {it.label}
        </button>
      ))}
      <span
        className="absolute bottom-0 h-[3px] rounded-full bg-sakura transition-all duration-200 ease-out"
        style={{ left: bar.left + bar.width * 0.2, width: bar.width * 0.6 }}
      />
    </div>
  );
}
export function Highlight({ text, q }: { text: string; q: string }) {
  const i = text.toLowerCase().indexOf(q.toLowerCase());
  return i < 0 || !q ? (
    text
  ) : (
    <>
      {text.slice(0, i)}
      <mark className="bg-transparent font-semibold text-sakura">
        {text.slice(i, i + q.length)}
      </mark>
      {text.slice(i + q.length)}
    </>
  );
}
export function ErrorState({
  message,
  retry,
}: {
  message: string;
  retry?: () => void;
}) {
  return (
    <div
      role="alert"
      className="my-8 rounded-2xl border border-line bg-card p-8 text-center"
    >
      <Icon name="TriangleAlert" className="mx-auto text-sakura" size={28} />
      <p className="mt-3 text-sm text-mut">{message}</p>
      {retry && (
        <button onClick={retry} className="btn-secondary mt-5">
          <Icon name="RotateCcw" size={14} />
          重试
        </button>
      )}
    </div>
  );
}
export function EmptyState({ reset }: { reset?: () => void }) {
  return (
    <div className="py-16 text-center">
      <div className="relative mx-auto mb-8 h-24 w-36">
        <div className="absolute inset-0 rounded-full bg-gradient-to-r from-sakura/20 to-ind/20 blur-2xl" />
        {[-12, 12, 0].map((r, i) => (
          <div
            key={r}
            className="absolute left-1/2 top-2 grid h-20 w-16 -translate-x-1/2 place-items-center rounded-xl border border-line bg-card shadow-card"
            style={{
              marginLeft: i === 0 ? -29 : i === 1 ? 29 : 0,
              rotate: `${r}deg`,
            }}
          >
            {i === 2 && (
              <Icon name="SearchX" className="text-sakura" size={28} />
            )}
          </div>
        ))}
      </div>
      <h2 className="text-lg font-semibold">没有找到符合条件的番剧</h2>
      <p className="mt-2 text-sm text-mut">
        试试调整筛选条件，或让 AI 帮你发现下一部心动作品
      </p>
      <div className="mt-6 flex flex-wrap justify-center gap-3">
        {reset && (
          <button onClick={reset} className="btn-secondary">
            <Icon name="RotateCcw" size={15} />
            清空筛选
          </button>
        )}
        <Link
          href="/chat?prompt=帮我推荐一些好看的动画"
          className="btn-primary bg-gradient-to-r from-sakura to-ind"
        >
          <Icon name="Sparkles" size={15} />
          试试问 AI 助手
        </Link>
      </div>
    </div>
  );
}
export function MiniAnime({ a }: { a: Anime }) {
  return (
    <Link
      href={`/anime/${a.id}`}
      className="group flex w-[232px] shrink-0 gap-3 rounded-xl border border-line bg-card p-2.5 transition hover:border-sakura/40"
    >
      <div className="w-12 shrink-0">
        <Cover a={a} titleScale={0.45} className="rounded-md" />
      </div>
      <div className="min-w-0 flex-1 py-1">
        <h4 className="truncate text-[13px] font-semibold group-hover:text-sakura">
          {animeTitle(a)}
        </h4>
        <p className="mt-1 truncate text-[11px] text-mut">
          {a.year} · {a.category} · {a.source}
        </p>
        <Score value={a.score} className="mt-2" />
      </div>
      <Icon name="ChevronRight" size={14} className="self-center text-mut" />
    </Link>
  );
}
