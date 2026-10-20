/** 从当前地址构建下一次筛选；连续操作不会读取过期的 React 路由快照。 */
export function updateFilterQuery(
  current: string,
  key: string,
  value: string | string[],
): URLSearchParams {
  const next = new URLSearchParams(current);
  if (!next.has("region")) next.set("region", "日本");
  next.delete(key);
  if (Array.isArray(value)) value.forEach((item) => next.append(key, item));
  else if (value) next.set(key, value);
  if (key !== "page") next.delete("page");
  return next;
}
export function toggleGenreQuery(
  current: string,
  genre: string,
): URLSearchParams {
  const next = new URLSearchParams(current);
  const genres = next.getAll("genres");
  return updateFilterQuery(
    current,
    "genres",
    genres.includes(genre)
      ? genres.filter((g) => g !== genre)
      : [...genres, genre],
  );
}
