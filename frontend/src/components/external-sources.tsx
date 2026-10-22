"use client";
import { ExternalLink, LoaderCircle, RotateCw } from "lucide-react";
import { CATALOG_LABELS, FIELD_LABELS } from "@/lib/enrichment";
import { formatCount } from "@/lib/utils";
import type { AnimeDetail, AnimeEnrichment } from "@/types";

const STATUS: Record<string, string> = {
  pending: "正在查询", expired: "等待更新", unmatched: "未可靠匹配",
  unavailable: "暂时不可用", blocked: "内容未展示", disabled: "未启用",
};

export function ExternalSources({ anime, data, loading, failed, retry }: {
  anime: AnimeDetail; data?: AnimeEnrichment; loading: boolean; failed: boolean; retry: () => void;
}) {
  const sources = data?.sources ?? anime.external_sources ?? [];
  const ratings = data?.ratings ?? anime.external_ratings ?? [];
  if (!loading && !failed && !sources.length && !data?.providers.length) return null;
  return (
    <section className="rounded-2xl border border-line bg-card p-5" aria-busy={loading || data?.pending}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-[15px] font-semibold">多平台评分与来源</h2>
        <span className="text-xs text-mut">各平台独立统计</span>
      </div>
      {loading || data?.pending ? <p role="status" className="mt-3 flex items-center gap-2 text-xs text-mut"><LoaderCircle size={14} className="animate-spin motion-reduce:animate-none" aria-hidden />正在查询补充信息，作品详情可继续浏览</p> : null}
      {sources.length > 0 && (
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          {sources.map((source) => {
            const rating = ratings.find((r) => r.provider === source.provider);
            return (
              <a key={source.provider} href={source.url} target="_blank" rel="noopener noreferrer" className="group min-h-28 rounded-xl border border-line bg-bg/40 p-3.5 transition hover:border-sakura/40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-sakura" aria-label={`在 ${source.label} 查看这部作品（新窗口）`}>
                <div className="flex items-center justify-between gap-2 text-xs text-mut"><span className="font-medium text-fg/80">{source.label}</span><ExternalLink size={13} aria-hidden /></div>
                <div className="mt-2.5 flex items-baseline gap-1.5 tabular-nums"><span className="text-2xl font-semibold text-sakura">{rating?.score != null ? (rating.scale === 10 ? rating.score.toFixed(2) : Number(rating.score.toFixed(2))) : "—"}</span>{rating?.score != null && <span className="text-xs text-mut">/ {rating.scale}</span>}</div>
                <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-mut">{rating?.rank ? <span>#{rating.rank}</span> : null}{rating?.votes ? <span>{formatCount(rating.votes)} 人评分</span> : null}{rating?.score == null && <span>暂无评分</span>}</div>
                <time dateTime={source.updated_at} className="mt-2 block text-[11px] text-mut">更新于 {new Date(source.updated_at).toLocaleDateString("zh-CN", { timeZone: "Asia/Shanghai" })}</time>
              </a>
            );
          })}
        </div>
      )}
      {Object.keys(anime.field_sources ?? {}).length > 0 && (
        <div className="mt-4 space-y-1.5 border-t border-line pt-3 text-xs leading-5 text-mut">
          {Object.entries(CATALOG_LABELS).map(([provider, label]) => {
            const fields = Object.entries(anime.field_sources ?? {}).filter(([field, p]) => p === provider && FIELD_LABELS[field]).map(([field]) => FIELD_LABELS[field]);
            return fields.length ? <p key={provider}>{label} 补充：{fields.join("、")}</p> : null;
          })}
        </div>
      )}
      {data?.providers.some((p) => p.status !== "matched") && !loading && !data.pending && <p className="mt-3 text-xs leading-5 text-mut">{data.providers.filter((p) => p.status !== "matched").map((p) => `${p.label}：${STATUS[p.status] || "暂未收录"}`).join(" · ")}</p>}
      {failed && <div className="mt-3 flex items-center justify-between gap-3 text-xs text-mut"><span>补充信息暂时无法读取，现有作品信息仍可浏览。</span><button type="button" onClick={retry} className="inline-flex min-h-11 shrink-0 items-center gap-1.5 px-2 text-sakura"><RotateCw size={13} aria-hidden />重试</button></div>}
    </section>
  );
}
