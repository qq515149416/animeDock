import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
export const SEASONS = [
  { value: "winter", label: "冬", month: 1, icon: "Snowflake" },
  { value: "spring", label: "春", month: 4, icon: "Flower2" },
  { value: "summer", label: "夏", month: 7, icon: "Sun" },
  { value: "autumn", label: "秋", month: 10, icon: "Leaf" },
] as const;
export const WEEK = ["周一", "周二", "周三", "周四", "周五", "周六", "周日"];
export const WEEK_FULL = [
  "星期一",
  "星期二",
  "星期三",
  "星期四",
  "星期五",
  "星期六",
  "星期日",
];
export function beijingNow(): Date {
  return new Date(
    new Date().toLocaleString("en-US", { timeZone: "Asia/Shanghai" }),
  );
}
export function currentSeason(d = beijingNow()) {
  const s = SEASONS[Math.floor(d.getMonth() / 3)];
  return {
    ...s,
    year: d.getFullYear(),
    text: `${d.getFullYear()} ${s.label}季番`,
  };
}
export function seasonName(value: string | null | undefined) {
  return SEASONS.find((s) => s.value === value)?.label || "";
}
export function formatCount(n: number) {
  return n >= 10000
    ? `${(n / 10000).toFixed(1)} 万`
    : n.toLocaleString("zh-CN");
}
export function timeKey(value: string) {
  const [h, m] = value.split(":").map(Number);
  return (h < 5 ? h + 24 : h) * 60 + m || 0;
}
export function animeTitle(a: { name_cn?: string; name?: string }) {
  return a.name_cn || a.name || "未命名作品";
}

export function beijingDate(value = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(value);
}
