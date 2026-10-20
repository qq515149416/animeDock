export const STORAGE = {
  nsfw: "fjw.nsfw",
  age: "fjw.ageOk",
  unblur: "fjw.unblur",
  client: "fjw.clientId",
  prefs: "fjw.prefs",
  favorites: "fjw.favorites",
  history: "fjw.history",
  reminders: "fjw.reminders",
};
export function getClientId(): string {
  const stored = localStorage.getItem(STORAGE.client);
  if (stored) return stored;
  const id = crypto.randomUUID();
  localStorage.setItem(STORAGE.client, id);
  return id;
}
