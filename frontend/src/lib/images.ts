import type { Anime } from "@/types";

export function getAnimeCoverUrl(
  anime: Pick<Anime, "id" | "image_url">,
  demoMode = process.env.NEXT_PUBLIC_DEMO_MODE === "true",
): string | null {
  const url = anime.image_url?.trim();
  if (url) return url;
  if (demoMode || !Number.isSafeInteger(anime.id) || anime.id <= 0) return null;
  // 官方归档不包含封面字段；图片端点会跳转到该条目当前的封面。
  return `https://api.bgm.tv/v0/subjects/${anime.id}/image?type=large`;
}

export interface PortraitImages {
  large?: string;
  medium?: string;
  small?: string;
  grid?: string;
}

export function getPortraitImage(person: {
  image_url?: string;
  images?: PortraitImages;
}) {
  const images = person.images;
  const src =
    images?.large ||
    person.image_url ||
    images?.medium ||
    images?.small ||
    images?.grid;
  if (!src) return null;
  return {
    src,
    thumbnail:
      images?.medium ||
      person.image_url ||
      images?.small ||
      images?.grid ||
      src,
  };
}
