"use client";
import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
} from "react";
import { ThemeProvider } from "next-themes";
import { SWRConfig } from "swr";
import { STORAGE, getClientId } from "@/lib/nsfw";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "./ui/dialog";
import { ShieldAlert } from "lucide-react";
interface Preferences {
  dailyView: string;
  libraryView: string;
}
interface AppState {
  nsfw: boolean;
  unblur: boolean;
  revealed: Set<number>;
  requestNsfw: (v: boolean) => void;
  setUnblur: (v: boolean) => void;
  reveal: (id: number) => void;
  clientId: string;
  prefs: Preferences;
  setPref: (key: keyof Preferences, value: string) => void;
  searchOpen: boolean;
  setSearchOpen: (v: boolean) => void;
  settingsOpen: boolean;
  setSettingsOpen: (v: boolean) => void;
  favorites: number[];
  toggleFavorite: (id: number) => void;
  history: number[];
  recordHistory: (id: number) => void;
  reminders: number[];
  toggleReminder: (id: number) => void;
  toast: (msg: string) => void;
  ready: boolean;
}
const Context = createContext<AppState | null>(null);
export function useApp() {
  const state = useContext(Context);
  if (!state) throw new Error("AppProvider is required");
  return state;
}
export function Providers({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="dark"
      enableSystem={false}
      storageKey="fjw.theme"
    >
      <SWRConfig value={{ revalidateOnFocus: false, errorRetryCount: 1 }}>
        <AppProvider>{children}</AppProvider>
      </SWRConfig>
    </ThemeProvider>
  );
}
function readJSON<T>(key: string, fallback: T): T {
  try {
    return JSON.parse(localStorage.getItem(key) || "null") ?? fallback;
  } catch {
    return fallback;
  }
}
function AppProvider({ children }: { children: ReactNode }) {
  const [nsfw, setNsfw] = useState(false),
    [unblur, setUnblurState] = useState(false),
    [ageGate, setAgeGate] = useState(false),
    [revealed, setRevealed] = useState(new Set<number>()),
    [clientId, setClientId] = useState(""),
    [ready, setReady] = useState(false);
  const [prefs, setPrefs] = useState<Preferences>({
      dailyView: "grid",
      libraryView: "grid",
    }),
    [searchOpen, setSearchOpen] = useState(false),
    [settingsOpen, setSettingsOpen] = useState(false),
    [favorites, setFavorites] = useState<number[]>([]),
    [history, setHistory] = useState<number[]>([]),
    [reminders, setReminders] = useState<number[]>([]),
    [notice, setNotice] = useState("");
  useEffect(() => {
    setNsfw(readJSON(STORAGE.nsfw, false));
    setUnblurState(readJSON(STORAGE.unblur, false));
    setClientId(getClientId());
    setPrefs(
      readJSON(STORAGE.prefs, { dailyView: "grid", libraryView: "grid" }),
    );
    setFavorites(readJSON(STORAGE.favorites, []));
    setHistory(readJSON(STORAGE.history, []));
    setReminders(readJSON(STORAGE.reminders, []));
    setReady(true);
  }, []);
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(""), 3500);
    return () => clearTimeout(timer);
  }, [notice]);
  const requestNsfw = useCallback((value: boolean) => {
    if (value && !readJSON(STORAGE.age, false)) {
      setAgeGate(true);
      return;
    }
    setNsfw(value);
    localStorage.setItem(STORAGE.nsfw, JSON.stringify(value));
    if (!value) setRevealed(new Set());
  }, []);
  const setUnblur = (v: boolean) => {
    setUnblurState(v);
    localStorage.setItem(STORAGE.unblur, JSON.stringify(v));
  };
  const setPref = (key: keyof Preferences, value: string) =>
    setPrefs((p) => {
      const next = { ...p, [key]: value };
      localStorage.setItem(STORAGE.prefs, JSON.stringify(next));
      return next;
    });
  const toggle = (
    key: string,
    setter: React.Dispatch<React.SetStateAction<number[]>>,
    id: number,
  ) =>
    setter((old) => {
      const next = old.includes(id)
        ? old.filter((x) => x !== id)
        : [...old, id];
      localStorage.setItem(key, JSON.stringify(next));
      return next;
    });
  const recordHistory = useCallback(
    (id: number) =>
      setHistory((old) => {
        const next = [id, ...old.filter((x) => x !== id)].slice(0, 100);
        localStorage.setItem(STORAGE.history, JSON.stringify(next));
        return next;
      }),
    [],
  );
  return (
    <Context.Provider
      value={{
        nsfw,
        unblur,
        requestNsfw,
        setUnblur,
        revealed,
        reveal: (id) => setRevealed((p) => new Set(p).add(id)),
        clientId,
        prefs,
        setPref,
        searchOpen,
        setSearchOpen,
        settingsOpen,
        setSettingsOpen,
        favorites,
        toggleFavorite: (id) => toggle(STORAGE.favorites, setFavorites, id),
        history,
        recordHistory,
        reminders,
        toggleReminder: (id) => toggle(STORAGE.reminders, setReminders, id),
        toast: setNotice,
        ready,
      }}
    >
      {children}
      <Dialog open={ageGate} onOpenChange={setAgeGate}>
        <DialogContent className="max-w-[400px] p-6" hideClose>
          <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-red-500/10 text-red-400">
            <ShieldAlert size={28} />
          </div>
          <DialogTitle className="mt-4 text-center text-lg font-semibold">
            年龄确认
          </DialogTitle>
          <DialogDescription className="mt-2 text-center text-[13px] leading-relaxed text-mut">
            开启后将显示可能包含成人或敏感内容的作品。请确认你已年满 18
            周岁。相关封面默认模糊，可单独点击查看。
          </DialogDescription>
          <div className="mt-6 grid grid-cols-2 gap-3">
            <button onClick={() => setAgeGate(false)} className="btn-secondary">
              我未满 18 岁
            </button>
            <button
              onClick={() => {
                localStorage.setItem(STORAGE.age, "true");
                requestNsfw(true);
                setAgeGate(false);
              }}
              className="btn-primary"
            >
              我已满 18 岁
            </button>
          </div>
        </DialogContent>
      </Dialog>
      {notice && (
        <div
          role="status"
          className="fixed bottom-24 left-1/2 z-[100] w-max max-w-[90vw] -translate-x-1/2 rounded-xl border border-line bg-card px-5 py-3 text-sm shadow-2xl md:bottom-8"
        >
          {notice}
        </div>
      )}
    </Context.Provider>
  );
}
