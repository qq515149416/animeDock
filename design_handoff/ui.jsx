// 基础组件
const { useState, useEffect, useRef, useMemo, useCallback, useLayoutEffect, createContext, useContext } = React;

const AppCtx = createContext(null);
const useApp = () => useContext(AppCtx);

function cx(...a) { return a.filter(Boolean).join(' '); }

// lucide 图标（UMD 数据 → React）
function Icon({ name, size = 18, className = '', strokeWidth = 2, fill = 'none', style }) {
  const node = window.lucide && window.lucide.icons && window.lucide.icons[name];
  if (!node) return <span style={{ width: size, height: size, display: 'inline-block' }} />;
  const children = typeof node[0] === 'string' ? node[2] : node;
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill={fill}
      stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round"
      className={cx('shrink-0', className)} style={style} aria-hidden="true">
      {children.map(([tag, attrs], i) => React.createElement(tag, { key: i, ...attrs }))}
    </svg>
  );
}

// 封面占位：按作品色相生成的海报式封面（5:7）
function CoverArt({ a, className = '', titleScale = 1 }) {
  const bg = `radial-gradient(120% 80% at 80% 0%, oklch(0.78 0.12 ${a.h1} / .9), transparent 60%),
              linear-gradient(165deg, oklch(0.6 0.13 ${a.h1}), oklch(0.3 0.09 ${a.h2}))`;
  const orb = `radial-gradient(circle at 35% 35%, oklch(0.95 0.05 ${a.h1}), oklch(0.75 0.13 ${a.h2}) 70%)`;
  return (
    <div className={cx('absolute inset-0 overflow-hidden', className)} style={{ background: bg }}>
      <div className="absolute rounded-full opacity-80" style={{ width: '62%', aspectRatio: '1', left: `${10 + (a.id * 13) % 30}%`, top: `${14 + (a.id * 7) % 22}%`, background: orb, filter: 'blur(.3px)' }} />
      <div className="absolute inset-x-0 bottom-0 h-1/2" style={{ background: `linear-gradient(to top, oklch(0.18 0.05 ${a.h2} / .85), transparent)` }} />
      <div className="absolute inset-0 cover-grain" />
      <div className="absolute right-[7%] top-[6%] text-white/85 font-semibold tracking-[.18em] leading-none select-none"
        style={{ writingMode: 'vertical-rl', fontSize: `${11 * titleScale}px`, textShadow: '0 1px 6px rgba(0,0,0,.25)', maxHeight: '60%', overflow: 'hidden' }}>
        {a.jp}
      </div>
      <div className="absolute left-[8%] bottom-[6%] right-[8%] text-white font-semibold leading-tight select-none"
        style={{ fontSize: `${13 * titleScale}px`, textShadow: '0 1px 8px rgba(0,0,0,.35)' }}>
        <div className="line-clamp-2">{a.cn}</div>
        <div className="mt-1 h-px w-6 bg-white/60" />
      </div>
    </div>
  );
}

function Cover({ a, className = '', imgClass = '', titleScale = 1, rounded = 'rounded-xl', allowReveal = true }) {
  const { nsfw, revealed, reveal } = useApp();
  const hidden = a.nsfw && !revealed.has(a.id);
  return (
    <div className={cx('relative overflow-hidden bg-elev', rounded, className)} style={{ aspectRatio: '5 / 7' }}>
      <CoverArt a={a} titleScale={titleScale} className={cx('transition-[transform,filter] duration-300', imgClass, hidden && 'blur-xl scale-110')} />
      {a.nsfw && (
        <span className="absolute top-2 right-2 z-10 rounded-md bg-red-500/90 px-1.5 py-0.5 text-[10px] font-bold text-white tracking-wide">R18</span>
      )}
      {hidden && allowReveal && (
        <div role="button" onClick={(e) => { e.stopPropagation(); reveal(a.id); }}
          className="absolute inset-0 z-[5] flex flex-col items-center justify-center gap-1.5 bg-black/30 text-white/90 cursor-pointer">
          <Icon name="EyeOff" size={20} />
          <span className="text-[11px]">点击显示</span>
        </div>
      )}
    </div>
  );
}

function KindBadge({ kind }) {
  if (!kind) return null;
  return (
    <span className={cx('absolute left-2 top-2 z-10 rounded-md px-1.5 py-0.5 text-[10px] font-semibold text-white shadow-sm',
      kind === '新番' ? 'bg-sakura' : 'bg-ind')}>{kind}</span>
  );
}

function Score({ v, size = 'sm', className = '' }) {
  return (
    <span className={cx('inline-flex items-center gap-1 font-semibold tabular-nums', size === 'sm' ? 'text-xs' : 'text-sm', className)}>
      <Icon name="Star" size={size === 'sm' ? 12 : 14} fill="#FF6B9D" className="text-sakura" strokeWidth={0} />
      {v.toFixed(1)}
    </span>
  );
}

function AnimeCard({ a, showEp = true, extra }) {
  const { go } = useApp();
  const ep = DATA.curEpisode(a);
  return (
    <div role="button" tabIndex={0} onClick={() => go('detail', { id: a.id })}
      onKeyDown={(e) => e.key === 'Enter' && go('detail', { id: a.id })}
      className="group cursor-pointer text-left outline-none fade-in">
      <div className="relative rounded-xl shadow-card transition-all duration-200 group-hover:-translate-y-1 group-hover:shadow-cardh group-focus-visible:ring-2 ring-sakura">
        <Cover a={a} imgClass="group-hover:scale-[1.06]" />
        <KindBadge kind={a.kind} />
        {a.airing && showEp && ep > 0 && (
          <span className="absolute bottom-2 right-2 z-10 rounded-md bg-black/55 px-1.5 py-0.5 text-[10px] font-medium text-white backdrop-blur-sm">
            更新至第 {ep} 话
          </span>
        )}
      </div>
      <div className="mt-2.5 px-0.5">
        <h3 className="text-[14px] font-semibold leading-snug line-clamp-2 min-h-[2.5em] group-hover:text-sakura transition-colors duration-200">{a.cn}</h3>
        <p className="mt-0.5 truncate text-xs text-mut">{a.jp}</p>
        <div className="mt-1.5 flex items-center justify-between gap-2">
          <Score v={a.score} />
          {extra}
        </div>
      </div>
    </div>
  );
}

function CardSkeleton() {
  return (
    <div>
      <div className="skel rounded-xl" style={{ aspectRatio: '5 / 7' }} />
      <div className="skel mt-3 h-3.5 w-[85%] rounded" />
      <div className="skel mt-2 h-3 w-[60%] rounded" />
      <div className="skel mt-2 h-3 w-8 rounded" />
    </div>
  );
}

function Chip({ active, children, count, onClick, className = '' }) {
  return (
    <button onClick={onClick}
      className={cx('inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-[13px] transition-all duration-200 whitespace-nowrap',
        active ? 'bg-sakura text-white shadow-[0_4px_14px_-4px_rgba(255,107,157,.6)]' : 'bg-elev text-fg/80 hover:text-fg hover:bg-elev2',
        count === 0 && !active && 'opacity-45', className)}>
      {children}
      {count != null && <span className={cx('text-[11px] tabular-nums', active ? 'text-white/80' : 'text-mut')}>{count}</span>}
    </button>
  );
}

// 分段控件
function Segmented({ value, onChange, options, size = 'md' }) {
  return (
    <div className="inline-flex rounded-lg bg-elev p-0.5">
      {options.map(o => (
        <button key={o.value} onClick={() => onChange(o.value)} title={o.title || o.label}
          className={cx('inline-flex items-center gap-1.5 rounded-md transition-all duration-200',
            size === 'sm' ? 'h-7 px-2 text-xs' : 'h-8 px-3 text-[13px]',
            value === o.value ? 'bg-card text-fg shadow-sm' : 'text-mut hover:text-fg')}>
          {o.icon && <Icon name={o.icon} size={15} />}
          {o.label && <span className={o.icon ? 'hidden sm:inline' : ''}>{o.label}</span>}
        </button>
      ))}
    </div>
  );
}

// 下划线滑动 Tab
function SlideTabs({ items, value, onChange, className = '', itemClass = '' }) {
  const wrap = useRef(null);
  const [bar, setBar] = useState({ left: 0, width: 0 });
  const measure = useCallback(() => {
    const el = wrap.current && wrap.current.querySelector(`[data-k="${value}"]`);
    if (el) setBar({ left: el.offsetLeft, width: el.offsetWidth });
  }, [value]);
  useLayoutEffect(() => { measure(); }, [measure, items.length]);
  useEffect(() => {
    // 字体加载 / 子元素尺寸变化后重新测量，避免首屏位置偏移
    const ro = new ResizeObserver(() => measure());
    if (wrap.current) { ro.observe(wrap.current); wrap.current.querySelectorAll('[data-k]').forEach(el => ro.observe(el)); }
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(measure);
    const t = setTimeout(measure, 300);
    window.addEventListener('resize', measure);
    return () => { ro.disconnect(); clearTimeout(t); window.removeEventListener('resize', measure); };
  }, [measure]);
  return (
    <div ref={wrap} className={cx('relative flex', className)}>
      {items.map(it => (
        <button key={it.key} data-k={it.key} onClick={() => onChange(it.key)}
          className={cx('relative transition-colors duration-200', value === it.key ? 'text-fg' : 'text-mut hover:text-fg', itemClass)}>
          {it.label}
        </button>
      ))}
      <span className="absolute bottom-0 h-[3px] rounded-full bg-sakura transition-all duration-200 ease-out" style={{ left: bar.left + bar.width * 0.2, width: bar.width * 0.6 }} />
    </div>
  );
}

function Switch({ on, onChange }) {
  return (
    <button role="switch" aria-checked={on} onClick={(e) => { e.stopPropagation(); onChange(!on); }}
      className={cx('relative h-[22px] w-[38px] shrink-0 rounded-full transition-colors duration-200', on ? 'bg-sakura' : 'bg-elev2')}>
      <span className={cx('absolute top-[3px] h-4 w-4 rounded-full bg-white shadow transition-all duration-200', on ? 'left-[19px]' : 'left-[3px]')} />
    </button>
  );
}

function Modal({ open, onClose, children, className = '', align = 'center' }) {
  useEffect(() => {
    if (!open) return;
    const h = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className={cx('fixed inset-0 z-[80] flex justify-center px-4', align === 'top' ? 'items-start pt-[12vh]' : 'items-center')}>
      <div className="absolute inset-0 bg-black/55 backdrop-blur-sm fade-in" onClick={onClose} />
      <div className={cx('relative w-full rounded-2xl border border-line bg-card shadow-2xl pop-in', className)}>{children}</div>
    </div>
  );
}

function Drawer({ open, onClose, children, title }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[80]">
      <div className="absolute inset-0 bg-black/55 fade-in" onClick={onClose} />
      <div className="absolute inset-x-0 bottom-0 max-h-[86vh] flex flex-col rounded-t-2xl border-t border-line bg-card slide-up">
        <div className="mx-auto mt-2.5 h-1 w-10 rounded-full bg-elev2" />
        <div className="flex items-center justify-between px-5 pt-3 pb-2">
          <h3 className="text-base font-semibold">{title}</h3>
          <button onClick={onClose} className="grid h-9 w-9 place-items-center rounded-full hover:bg-elev"><Icon name="X" size={18} /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

function Highlight({ text, q }) {
  if (!q) return text;
  const i = text.toLowerCase().indexOf(q.toLowerCase());
  if (i < 0) return text;
  return <>{text.slice(0, i)}<mark className="bg-transparent text-sakura font-semibold">{text.slice(i, i + q.length)}</mark>{text.slice(i + q.length)}</>;
}

function matchAnime(a, q) {
  if (!q) return null;
  const s = q.trim().toLowerCase();
  if (!s) return null;
  if (a.cn.toLowerCase().includes(s)) return { field: 'cn', text: a.cn };
  if (a.jp.toLowerCase().includes(s)) return { field: 'jp', text: a.jp };
  const al = a.alias.find(x => x.toLowerCase().includes(s));
  if (al) return { field: 'alias', text: al };
  return null;
}

function useDelayedLoading(deps, ms = 320) {
  const [loading, setLoading] = useState(true);
  useEffect(() => { setLoading(true); const t = setTimeout(() => setLoading(false), ms); return () => clearTimeout(t); }, deps);
  return loading;
}

Object.assign(window, {
  AppCtx, useApp, cx, Icon, CoverArt, Cover, KindBadge, Score, AnimeCard, CardSkeleton, Chip, Segmented, SlideTabs,
  Switch, Modal, Drawer, Highlight, matchAnime, useDelayedLoading,
});
