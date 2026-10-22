"use client";

import { useEffect, useId, useRef, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Heart,
  ImageOff,
  LoaderCircle,
  Maximize2,
  Minimize2,
  X,
  ZoomIn,
} from "lucide-react";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "./ui/dialog";
import { getPortraitImage } from "@/lib/images";
import { cn } from "@/lib/utils";
import { CharacterCastDialog } from "./character-cast-dialog";
import type { AnimeDetail } from "@/types";

interface GalleryImage {
  id: string;
  name: string;
  caption: string;
  src: string;
  thumbnail: string;
}

function Portrait({ src, name }: { src: string; name: string }) {
  const [failed, setFailed] = useState(false);
  return failed ? (
    name.slice(-1)
  ) : (
    <img
      src={src}
      alt={name}
      loading="lazy"
      referrerPolicy="no-referrer"
      className="absolute inset-0 h-full w-full object-cover transition-transform duration-300 ease-out motion-safe:group-hover/portrait:scale-[1.05] motion-safe:group-focus-visible/portrait:scale-[1.05] motion-reduce:transition-none"
      onError={() => setFailed(true)}
    />
  );
}

function ViewerPhoto({ image }: { image: GalleryImage }) {
  const [src, setSrc] = useState(image.src);
  const [status, setStatus] = useState<"loading" | "loaded" | "error">(
    "loading",
  );
  const [zoomed, setZoomed] = useState(false);
  const canvas = useRef<HTMLDivElement>(null);
  return (
    <>
      <div
        ref={canvas}
        className="relative min-h-0 flex-1 overflow-auto bg-bg/50"
      >
        {status === "loading" && (
          <div
            role="status"
            className="pointer-events-none absolute inset-0 grid place-items-center text-mut"
          >
            <LoaderCircle className="animate-spin motion-reduce:animate-none" />
            <span className="sr-only">正在加载图片</span>
          </div>
        )}
        {status === "error" ? (
          <div
            role="status"
            className="grid h-full place-content-center justify-items-center gap-3 text-sm text-mut"
          >
            <ImageOff size={32} />
            <p>图片暂时无法加载</p>
          </div>
        ) : (
          <button
            type="button"
            aria-label={zoomed ? "适应窗口" : "放大图片"}
            aria-pressed={zoomed}
            onClick={() => setZoomed(!zoomed)}
            className={cn(
              "block p-3 focus-visible:outline focus-visible:outline-2 focus-visible:outline-inset focus-visible:outline-sakura sm:p-5",
              zoomed
                ? "h-[200%] w-[200%] cursor-zoom-out"
                : "h-full w-full cursor-zoom-in",
            )}
          >
            <img
              src={src}
              alt={image.name}
              referrerPolicy="no-referrer"
              draggable={false}
              className="h-full w-full object-contain"
              onLoad={() => setStatus("loaded")}
              onError={() => {
                if (src !== image.thumbnail) setSrc(image.thumbnail);
                else setStatus("error");
              }}
            />
          </button>
        )}
      </div>
      <div className="flex shrink-0 items-center justify-between gap-3 border-t border-line px-4 py-2 text-xs text-mut">
        <span>← → 切换 · Esc 关闭</span>
        <button
          type="button"
          disabled={status === "error"}
          onClick={() => setZoomed(!zoomed)}
          className="inline-flex min-h-11 items-center gap-2 rounded-lg px-3 text-fg transition-colors hover:bg-elev disabled:opacity-40"
          aria-label={zoomed ? "适应窗口" : "放大图片"}
          aria-pressed={zoomed}
        >
          {zoomed ? <Minimize2 size={16} /> : <ZoomIn size={16} />}
          {zoomed ? "适应窗口" : "放大图片"}
        </button>
      </div>
    </>
  );
}

export function CharacterGallery({ anime }: { anime: AnimeDetail }) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [castId, setCastId] = useState<number | null>(null);
  const trigger = useRef<HTMLButtonElement | null>(null);
  const castTrigger = useRef<HTMLButtonElement | null>(null);
  const gallery = useRef<HTMLDivElement>(null);
  const galleryId = useId();
  const [scrollable, setScrollable] = useState({ left: false, right: false });

  useEffect(() => {
    const element = gallery.current;
    if (!element) return;
    const updateScroll = () => {
      const left = element.scrollLeft > 1;
      const right =
        element.scrollWidth - element.clientWidth - element.scrollLeft > 1;
      setScrollable((previous) =>
        previous.left === left && previous.right === right
          ? previous
          : { left, right },
      );
    };
    updateScroll();
    element.addEventListener("scroll", updateScroll, { passive: true });
    const observer = new ResizeObserver(updateScroll);
    observer.observe(element);
    return () => {
      element.removeEventListener("scroll", updateScroll);
      observer.disconnect();
    };
  }, [anime.characters.length]);

  const scrollGallery = (direction: number) => {
    const element = gallery.current;
    if (element)
      element.scrollBy({ left: direction * element.clientWidth * 0.8 });
  };

  const images: GalleryImage[] = [];
  for (const c of anime.characters) {
    const portrait = getPortraitImage(c);
    if (portrait)
      images.push({
        id: `character:${c.id}`,
        name: c.name,
        caption: [
          c.relation || "角色",
          c.cv || c.actors?.map((a) => a.name).join("、"),
        ]
          .filter(Boolean)
          .join(" · CV："),
        ...portrait,
      });
    for (const actor of c.actors || []) {
      const photo = getPortraitImage(actor);
      const actorId = `actor:${actor.id}`;
      if (photo && !images.some((image) => image.id === actorId))
        images.push({
          id: actorId,
          name: actor.name,
          caption: "声优",
          ...photo,
        });
    }
  }
  const index = images.findIndex((image) => image.id === selectedId);
  const selected = images[index];
  const select = (id: string, button: HTMLButtonElement) => {
    trigger.current = button;
    setSelectedId(id);
  };
  const step = (offset: number) =>
    setSelectedId(images[(index + offset + images.length) % images.length].id);
  return (
    <>
      <div className="flex min-h-11 items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-lg font-semibold">
          <Heart size={19} className="text-sakura" />
          角色与声优
        </h2>
        {(scrollable.left || scrollable.right) && (
          <div className="flex shrink-0 gap-1">
            <button
              type="button"
              aria-label="向左滚动角色"
              aria-controls={galleryId}
              disabled={!scrollable.left}
              onClick={() => scrollGallery(-1)}
              className="icon-btn !h-11 !w-11 border border-line focus-visible:outline focus-visible:outline-2 focus-visible:outline-sakura disabled:pointer-events-none disabled:opacity-30"
            >
              <ChevronLeft size={20} />
            </button>
            <button
              type="button"
              aria-label="向右滚动角色"
              aria-controls={galleryId}
              disabled={!scrollable.right}
              onClick={() => scrollGallery(1)}
              className="icon-btn !h-11 !w-11 border border-line focus-visible:outline focus-visible:outline-2 focus-visible:outline-sakura disabled:pointer-events-none disabled:opacity-30"
            >
              <ChevronRight size={20} />
            </button>
          </div>
        )}
      </div>
      <div
        ref={gallery}
        id={galleryId}
        role="region"
        aria-label="角色与声优列表"
        tabIndex={scrollable.left || scrollable.right ? 0 : undefined}
        className="-mx-1 mt-4 flex gap-3 overflow-x-auto scroll-smooth rounded-lg px-1 pb-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-sakura motion-reduce:scroll-auto"
      >
        {anime.characters.map((c, i) => {
          const portrait = getPortraitImage(c);
          const firstVoice = c.actors?.[0]?.name || c.cv || "暂无资料";
          const voiceCount = c.actors?.length || (c.cv ? 1 : 0);
          return (
            <div
              key={c.id || i}
              className="w-[148px] shrink-0 overflow-hidden rounded-xl border border-line bg-card"
            >
              <button
                type="button"
                disabled={!portrait}
                aria-label={`查看 ${c.name} 的大图`}
                aria-haspopup="dialog"
                onClick={(e) => select(`character:${c.id}`, e.currentTarget)}
                className="group/portrait relative grid aspect-square w-full place-items-center overflow-hidden text-4xl font-semibold text-white/80 enabled:cursor-zoom-in focus-visible:outline focus-visible:outline-2 focus-visible:outline-inset focus-visible:outline-sakura"
                style={{
                  background: `linear-gradient(135deg,oklch(.65 .13 ${(anime.h1 || anime.id * 47) + i * 35}),oklch(.36 .12 ${(anime.h2 || anime.id * 17) + i * 40}))`,
                }}
              >
                {portrait ? (
                  <Portrait
                    key={portrait.thumbnail}
                    src={portrait.thumbnail}
                    name={c.name}
                  />
                ) : (
                  c.name.slice(-1)
                )}
                <span className="absolute bottom-2 left-2 rounded bg-black/40 px-1.5 py-0.5 text-[10px] font-medium text-white">
                  {c.relation || "角色"}
                </span>
                {portrait && (
                  <span className="absolute right-2 top-2 rounded-md bg-black/50 p-1.5 text-white opacity-0 transition-opacity group-hover/portrait:opacity-100 group-focus-visible/portrait:opacity-100 motion-reduce:transition-none">
                    <Maximize2 size={14} />
                  </span>
                )}
              </button>
              <div className="p-3">
                <p
                  className="truncate text-[13px] font-semibold"
                  title={c.name}
                >
                  {c.name}
                </p>
                <p
                  className="mt-2 truncate text-xs text-mut"
                  title={firstVoice}
                >
                  CV：{firstVoice}
                </p>
                <div className="mt-1 flex min-h-11 items-center justify-between gap-1">
                  {voiceCount > 0 && (
                    <>
                      <span className="text-[10px] text-mut">
                        {voiceCount} 位声优
                      </span>
                      <button
                        type="button"
                        aria-label={`查看 ${c.name} 的声优详情`}
                        aria-haspopup="dialog"
                        onClick={(event) => {
                          castTrigger.current = event.currentTarget;
                          setCastId(c.id);
                        }}
                        className="inline-flex min-h-11 shrink-0 items-center gap-0.5 rounded-md text-[11px] text-sakura transition-colors hover:text-fg focus-visible:outline focus-visible:outline-2 focus-visible:outline-sakura"
                      >
                        查看详情
                        <ChevronRight size={12} />
                      </button>
                    </>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
      <CharacterCastDialog
        character={anime.characters.find((c) => c.id === castId) || null}
        onClose={() => setCastId(null)}
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          castTrigger.current?.focus();
        }}
        onSelectPhoto={(actor, button) => select(`actor:${actor.id}`, button)}
      />
      <Dialog
        open={!!selected}
        onOpenChange={(open) => {
          if (!open) setSelectedId(null);
        }}
      >
        {selected && (
          <DialogContent
            hideClose
            className="flex h-[90dvh] max-w-5xl flex-col overflow-hidden"
            onCloseAutoFocus={(event) => {
              event.preventDefault();
              trigger.current?.focus();
            }}
            onKeyDown={(event) => {
              if (images.length < 2) return;
              if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
                event.preventDefault();
                step(event.key === "ArrowLeft" ? -1 : 1);
              }
            }}
          >
            <div className="flex shrink-0 items-center gap-2 border-b border-line p-3 sm:px-5">
              <div className="min-w-0 flex-1" aria-live="polite">
                <DialogTitle className="truncate text-base font-semibold">
                  {selected.name}
                </DialogTitle>
                <DialogDescription className="truncate text-xs text-mut">
                  {selected.caption}
                </DialogDescription>
              </div>
              <span className="shrink-0 text-xs tabular-nums text-mut">
                {index + 1} / {images.length}
              </span>
              {images.length > 1 && (
                <>
                  <button
                    type="button"
                    onClick={() => step(-1)}
                    className="icon-btn !h-11 !w-11 shrink-0"
                    aria-label="上一张图片"
                  >
                    <ChevronLeft size={20} />
                  </button>
                  <button
                    type="button"
                    onClick={() => step(1)}
                    className="icon-btn !h-11 !w-11 shrink-0"
                    aria-label="下一张图片"
                  >
                    <ChevronRight size={20} />
                  </button>
                </>
              )}
              <DialogClose
                className="icon-btn !h-11 !w-11 shrink-0"
                aria-label="关闭图片查看器"
              >
                <X size={20} />
              </DialogClose>
            </div>
            <ViewerPhoto key={selected.id} image={selected} />
          </DialogContent>
        )}
      </Dialog>
    </>
  );
}
