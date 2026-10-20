// 页面 2：动画库
const LIB_DEFAULT = { type: '全部', source: '全部', genres: [], region: '日本', year: '全部', season: 0 };
const YEARS = Array.from({ length: 2026 - 1960 + 1 }, (_, i) => 2026 - i);
const PAGE_SIZE = 18;

function applyFilters(list, f, q, skip) {
  return list.filter(a => {
    if (q && !matchAnime(a, q)) return false;
    if (skip !== 'type' && f.type !== '全部' && a.type !== f.type) return false;
    if (skip !== 'source' && f.source !== '全部' && a.source !== f.source) return false;
    if (skip !== 'region' && f.region !== '全部' && a.region !== f.region) return false;
    if (skip !== 'year' && f.year !== '全部' && a.year !== Number(f.year)) return false;
    if (skip !== 'season' && f.season && a.season !== f.season) return false;
    if (skip !== 'genres' && f.genres.length && !f.genres.every(g => a.genres.includes(g))) return false;
    return true;
  });
}

function LibraryPage() {
  const { visibleList, route, go, nsfw, requestNsfw } = useApp();
  const [q, setQ] = useState(route.params.q || '');
  const [input, setInput] = useState(route.params.q || '');
  const [f, setF] = useState(LIB_DEFAULT);
  const [sort, setSort] = useState('综合');
  const [view, setView] = useState('grid');
  const [page, setPage] = useState(1);
  const [collapsed, setCollapsed] = useState(false);
  const [drawer, setDrawer] = useState(false);
  const [suggest, setSuggest] = useState(false);
  const [sIdx, setSIdx] = useState(-1);
  const boxRef = useRef(null);
  const topRef = useRef(null);

  useEffect(() => { if (route.params.q != null) { setQ(route.params.q); setInput(route.params.q); } }, [route.params.q]);
  useEffect(() => setPage(1), [q, f, sort, nsfw]);
  useEffect(() => {
    const h = (e) => { if (boxRef.current && !boxRef.current.contains(e.target)) setSuggest(false); };
    document.addEventListener('mousedown', h); return () => document.removeEventListener('mousedown', h);
  }, []);

  const loading = useDelayedLoading([q, f, sort, view, page, nsfw], 300);
  const results = useMemo(() => {
    const r = applyFilters(visibleList, f, q);
    const s = {
      '综合': (a, b) => (b.score * 0.6 + Math.log10(b.heat) * 0.8) - (a.score * 0.6 + Math.log10(a.heat) * 0.8),
      '评分': (a, b) => b.score - a.score,
      '热度': (a, b) => b.heat - a.heat,
      '最新': (a, b) => b.startDate - a.startDate,
    }[sort];
    return r.sort(s);
  }, [visibleList, f, q, sort]);
  const facet = (key, getter) => {
    const base = applyFilters(visibleList, f, q, key);
    return (val) => val === '全部' ? base.length : base.filter(a => getter(a, val)).length;
  };
  const cType = facet('type', (a, v) => a.type === v);
  const cSource = facet('source', (a, v) => a.source === v);
  const cRegion = facet('region', (a, v) => a.region === v);
  const cSeason = facet('season', (a, v) => a.season === v);
  const genreBase = applyFilters(visibleList, f, q, 'genres');
  const cGenre = (g) => genreBase.filter(a => a.genres.includes(g) && f.genres.every(x => a.genres.includes(x))).length;

  const suggestions = useMemo(() => input.trim()
    ? visibleList.map(a => ({ a, m: matchAnime(a, input) })).filter(x => x.m).sort((x, y) => y.a.heat - x.a.heat).slice(0, 6) : [], [input, visibleList]);

  const set = (k, v) => setF(p => ({ ...p, [k]: v }));
  const toggleGenre = (g) => setF(p => ({ ...p, genres: p.genres.includes(g) ? p.genres.filter(x => x !== g) : [...p.genres, g] }));

  const selected = [];
  if (q) selected.push({ label: `搜索：${q}`, clear: () => { setQ(''); setInput(''); } });
  if (f.type !== '全部') selected.push({ label: f.type, clear: () => set('type', '全部') });
  if (f.source !== '全部') selected.push({ label: f.source, clear: () => set('source', '全部') });
  f.genres.forEach(g => selected.push({ label: g, clear: () => toggleGenre(g) }));
  if (f.region !== '全部') selected.push({ label: f.region, clear: () => set('region', '全部') });
  if (f.year !== '全部') selected.push({ label: `${f.year} 年`, clear: () => set('year', '全部') });
  if (f.season) selected.push({ label: `${DATA.SEASON_NAME[f.season]}季（${f.season}月）`, clear: () => set('season', 0) });
  const clearAll = () => { setF({ ...LIB_DEFAULT, region: '全部' }); setQ(''); setInput(''); };

  const pages = Math.max(1, Math.ceil(results.length / PAGE_SIZE));
  const shown = results.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const submit = (val) => { setQ(val.trim()); setSuggest(false); };
  const gotoPage = (p) => { setPage(p); const el = topRef.current; if (el) window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - 80, behavior: 'smooth' }); };

  const filterBody = (
    <FilterPanel f={f} set={set} toggleGenre={toggleGenre} cType={cType} cSource={cSource} cRegion={cRegion} cSeason={cSeason} cGenre={cGenre} nsfw={nsfw} requestNsfw={requestNsfw} />
  );

  return (
    <div className="mx-auto max-w-[1440px] px-4 md:px-6 lg:px-8">
      {/* 搜索 */}
      <section className="relative pt-8 pb-6 md:pt-12">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-48 lib-grad" />
        <div className="relative">
          <h1 className="text-[26px] font-semibold md:text-[32px]">动画库</h1>
          <p className="mt-1 text-sm text-mut">收录 {visibleList.length} 部作品 · 按季度、类型、来源精确检索</p>
          <div ref={boxRef} className="relative mt-5 max-w-[760px]">
            <div className={cx('flex h-14 items-center gap-3 rounded-2xl border bg-card px-4 shadow-card transition-all duration-200', suggest && suggestions.length ? 'border-sakura/60 rounded-b-none' : 'border-line focus-within:border-sakura/60')}>
              <Icon name="Search" size={20} className="text-mut" />
              <input value={input} onChange={e => { setInput(e.target.value); setSuggest(true); setSIdx(-1); }} onFocus={() => setSuggest(true)}
                onKeyDown={e => {
                  if (e.key === 'ArrowDown') { e.preventDefault(); setSIdx(i => Math.min(i + 1, suggestions.length - 1)); }
                  if (e.key === 'ArrowUp') { e.preventDefault(); setSIdx(i => Math.max(i - 1, -1)); }
                  if (e.key === 'Enter') { if (sIdx >= 0 && suggestions[sIdx]) go('detail', { id: suggestions[sIdx].a.id }); else submit(input); }
                  if (e.key === 'Escape') setSuggest(false);
                }}
                placeholder="搜索中文名、日文原名或别名，如「星屑」「ねこ」「Band」"
                className="h-full flex-1 bg-transparent text-[15px] outline-none placeholder:text-mut" />
              {input && <button onClick={() => { setInput(''); setQ(''); }} className="grid h-7 w-7 place-items-center rounded-full text-mut hover:bg-elev"><Icon name="X" size={15} /></button>}
              <button onClick={() => submit(input)} className="hidden h-10 rounded-xl bg-sakura px-5 text-sm font-semibold text-white transition hover:brightness-110 sm:block">搜索</button>
            </div>
            {suggest && suggestions.length > 0 && (
              <div className="absolute inset-x-0 top-full z-40 rounded-b-2xl border border-t-0 border-sakura/60 bg-card p-1.5 shadow-2xl">
                {suggestions.map(({ a, m }, i) => (
                  <button key={a.id} onMouseEnter={() => setSIdx(i)} onClick={() => go('detail', { id: a.id })}
                    className={cx('flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left', sIdx === i && 'bg-elev')}>
                    <Icon name="Search" size={14} className="text-mut" />
                    <span className="truncate text-sm"><Highlight text={a.cn} q={m.field === 'cn' ? input : ''} /></span>
                    <span className="truncate text-xs text-mut">{m.field === 'alias' ? <>别名 <Highlight text={m.text} q={input} /></> : <Highlight text={a.jp} q={m.field === 'jp' ? input : ''} />}</span>
                    <span className="ml-auto shrink-0 text-xs text-mut">{a.year}</span>
                  </button>
                ))}
                <button onClick={() => submit(input)} className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs text-mut hover:bg-elev">
                  <Icon name="CornerDownLeft" size={13} />按回车查看全部「{input}」的结果
                </button>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* 筛选：桌面 */}
      <section className="hidden rounded-2xl border border-line bg-card md:block">
        <div className="flex items-center justify-between px-5 py-3">
          <div className="flex items-center gap-2 text-sm font-semibold"><Icon name="SlidersHorizontal" size={16} className="text-sakura" />筛选</div>
          <button onClick={() => setCollapsed(!collapsed)} className="flex items-center gap-1 text-xs text-mut hover:text-fg">
            {collapsed ? '展开' : '收起'}<Icon name="ChevronDown" size={14} className={cx('transition-transform duration-200', !collapsed && 'rotate-180')} />
          </button>
        </div>
        <div className={cx('grid transition-all duration-300', collapsed ? 'grid-rows-[0fr]' : 'grid-rows-[1fr]')}>
          <div className="overflow-hidden"><div className="border-t border-line px-5 pb-4 pt-2">{filterBody}</div></div>
        </div>
        {collapsed && <SeasonQuick f={f} set={set} cSeason={cSeason} />}
      </section>

      {/* 已选条件 */}
      <div ref={topRef} className="mt-5 flex flex-wrap items-center gap-2">
        <button onClick={() => setDrawer(true)} className="inline-flex h-8 items-center gap-1.5 rounded-full border border-line bg-card px-3 text-[13px] md:hidden">
          <Icon name="SlidersHorizontal" size={14} />筛选{selected.length > 0 && <span className="grid h-4 min-w-4 place-items-center rounded-full bg-sakura px-1 text-[10px] text-white">{selected.length}</span>}
        </button>
        {selected.length > 0 && <span className="hidden text-xs text-mut md:inline">已选：</span>}
        {selected.map((s, i) => (
          <span key={i} className="inline-flex h-7 items-center gap-1 rounded-full border border-sakura/35 bg-sakura/10 pl-2.5 pr-1 text-xs text-sakura fade-in">
            {s.label}
            <button onClick={s.clear} className="grid h-5 w-5 place-items-center rounded-full hover:bg-sakura/20"><Icon name="X" size={12} /></button>
          </span>
        ))}
        {selected.length > 0 && <button onClick={clearAll} className="ml-1 inline-flex items-center gap-1 text-xs text-mut hover:text-sakura"><Icon name="RotateCcw" size={12} />清空全部</button>}
      </div>

      {/* 结果栏 */}
      <div className="mt-5 flex flex-wrap items-center gap-3">
        <div className="text-sm">共 <span className="font-semibold text-sakura tabular-nums">{results.length}</span> 部</div>
        <div className="flex-1" />
        <Segmented size="sm" value={sort} onChange={setSort} options={['综合', '评分', '热度', '最新'].map(s => ({ value: s, label: s }))} />
        <Segmented size="sm" value={view} onChange={setView} options={[{ value: 'grid', icon: 'LayoutGrid', title: '网格' }, { value: 'list', icon: 'List', title: '列表' }]} />
      </div>

      <div className="mt-5 min-h-[400px]">
        {loading ? (
          view === 'grid'
            ? <div className="grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-6">{Array.from({ length: 12 }).map((_, i) => <CardSkeleton key={i} />)}</div>
            : <div className="space-y-3">{Array.from({ length: 5 }).map((_, i) => <div key={i} className="skel h-[132px] rounded-xl" />)}</div>
        ) : results.length === 0 ? (
          <EmptyState onReset={clearAll} q={q} />
        ) : view === 'grid' ? (
          <div className="grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-6">
            {shown.map(a => <AnimeCard key={a.id} a={a} showEp={false} extra={<span className="text-[11px] text-mut">{a.year} {DATA.SEASON_NAME[a.season]}</span>} />)}
          </div>
        ) : (
          <div className="space-y-3">{shown.map(a => <ListRow key={a.id} a={a} />)}</div>
        )}
      </div>

      {!loading && pages > 1 && (
        <div className="mt-10 flex items-center justify-center gap-1.5">
          <button disabled={page === 1} onClick={() => gotoPage(page - 1)} className="grid h-9 w-9 place-items-center rounded-lg bg-elev disabled:opacity-40"><Icon name="ChevronLeft" size={16} /></button>
          {Array.from({ length: pages }).map((_, i) => (
            <button key={i} onClick={() => gotoPage(i + 1)} className={cx('h-9 min-w-9 rounded-lg px-3 text-sm tabular-nums transition-colors', page === i + 1 ? 'bg-sakura text-white font-semibold' : 'bg-elev hover:bg-elev2')}>{i + 1}</button>
          ))}
          <button disabled={page === pages} onClick={() => gotoPage(page + 1)} className="grid h-9 w-9 place-items-center rounded-lg bg-elev disabled:opacity-40"><Icon name="ChevronRight" size={16} /></button>
        </div>
      )}

      <Drawer open={drawer} onClose={() => setDrawer(false)} title="筛选">
        <div className="flex-1 overflow-y-auto px-5 pb-4">{filterBody}</div>
        <div className="flex gap-3 border-t border-line p-4">
          <button onClick={clearAll} className="h-11 flex-1 rounded-xl bg-elev text-sm">重置</button>
          <button onClick={() => setDrawer(false)} className="h-11 flex-[2] rounded-xl bg-sakura text-sm font-semibold text-white">查看 {results.length} 部结果</button>
        </div>
      </Drawer>
    </div>
  );
}

function FilterRow({ label, children, accent }) {
  return (
    <div className={cx('flex flex-col gap-2 py-2.5 md:flex-row md:items-start md:gap-4', accent && 'relative')}>
      <div className={cx('w-16 shrink-0 pt-1.5 text-[13px] font-medium', accent ? 'text-sakura' : 'text-mut')}>{label}</div>
      <div className="flex flex-1 flex-wrap gap-2">{children}</div>
    </div>
  );
}

function SeasonButtons({ f, set, cSeason, big }) {
  const opts = [[0, '全部', ''], [1, '冬', '1月'], [4, '春', '4月'], [7, '夏', '7月'], [10, '秋', '10月']];
  const icon = { 1: 'Snowflake', 4: 'Flower2', 7: 'Sun', 10: 'Leaf' };
  return (
    <div className="inline-flex rounded-xl border border-line bg-elev p-1">
      {opts.map(([v, n, m]) => {
        const on = f.season === v;
        return (
          <button key={v} onClick={() => set('season', v)}
            className={cx('inline-flex items-center gap-1.5 rounded-lg transition-all duration-200', big ? 'h-9 px-3.5 text-[13px]' : 'h-8 px-3 text-[13px]',
              on ? 'bg-sakura text-white shadow-[0_4px_14px_-4px_rgba(255,107,157,.7)]' : 'text-fg/75 hover:text-fg')}>
            {v !== 0 && <Icon name={icon[v]} size={14} />}
            <span className="font-medium">{n}</span>
            {m && <span className={cx('text-[11px]', on ? 'text-white/80' : 'text-mut')}>({m})</span>}
            <span className={cx('text-[11px] tabular-nums', on ? 'text-white/80' : 'text-mut')}>{cSeason(v === 0 ? '全部' : v)}</span>
          </button>
        );
      })}
    </div>
  );
}

function YearSelect({ f, set }) {
  return (
    <div className="relative">
      <select value={f.year} onChange={e => set('year', e.target.value)}
        className="h-11 appearance-none rounded-xl border border-line bg-elev pl-4 pr-10 text-[14px] font-semibold outline-none transition-colors hover:border-sakura/50 focus:border-sakura">
        <option value="全部">全部年份</option>
        {YEARS.map(y => <option key={y} value={y}>{y} 年</option>)}
      </select>
      <Icon name="ChevronDown" size={16} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-mut" />
    </div>
  );
}

function SeasonQuick({ f, set, cSeason }) {
  return (
    <div className="flex flex-wrap items-center gap-3 border-t border-line px-5 py-3">
      <span className="text-[13px] font-medium text-sakura">时间</span>
      <YearSelect f={f} set={set} />
      <SeasonButtons f={f} set={set} cSeason={cSeason} />
    </div>
  );
}

function FilterPanel({ f, set, toggleGenre, cType, cSource, cRegion, cSeason, cGenre, nsfw, requestNsfw }) {
  return (
    <div className="divide-y divide-line/60">
      {/* 时间：重点 */}
      <div className="my-2 rounded-xl border border-sakura/25 bg-gradient-to-r from-sakura/[.08] via-ind/[.05] to-transparent p-3.5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
          <div className="flex items-center gap-2 text-[13px] font-semibold text-sakura"><Icon name="CalendarRange" size={16} />放送时间</div>
          <div className="flex flex-wrap items-center gap-3">
            <YearSelect f={f} set={set} />
            <SeasonButtons f={f} set={set} cSeason={cSeason} big />
          </div>
        </div>
      </div>
      <FilterRow label="分类">
        {['全部', ...DATA.TYPES].map(t => <Chip key={t} active={f.type === t} count={cType(t)} onClick={() => set('type', t)}>{t}</Chip>)}
      </FilterRow>
      <FilterRow label="来源">
        {['全部', ...DATA.SOURCES].map(t => <Chip key={t} active={f.source === t} count={cSource(t)} onClick={() => set('source', t)}>{t}</Chip>)}
      </FilterRow>
      <FilterRow label={<span>类型<span className="ml-1 text-[11px] font-normal">多选</span></span>}>
        {DATA.GENRES.map(g => <Chip key={g} active={f.genres.includes(g)} count={cGenre(g)} onClick={() => toggleGenre(g)}>{f.genres.includes(g) && <Icon name="Check" size={13} />}{g}</Chip>)}
      </FilterRow>
      <FilterRow label="地区">
        {['全部', ...DATA.REGIONS].map(t => <Chip key={t} active={f.region === t} count={cRegion(t)} onClick={() => set('region', t)}>{t}</Chip>)}
      </FilterRow>
      <FilterRow label="分级">
        <label className="flex h-8 cursor-pointer items-center gap-2.5 text-[13px]" onClick={() => requestNsfw(!nsfw)}>
          <Switch on={nsfw} onChange={requestNsfw} />
          显示 NSFW 内容
          <span className="text-xs text-mut">开启后 R18 封面默认模糊，点击单张解除</span>
        </label>
      </FilterRow>
    </div>
  );
}

function ListRow({ a }) {
  const { go } = useApp();
  return (
    <div role="button" onClick={() => go('detail', { id: a.id })}
      className="group flex cursor-pointer gap-4 rounded-xl border border-line bg-card p-3 transition-all duration-200 hover:-translate-y-0.5 hover:border-sakura/40 hover:shadow-cardh fade-in md:gap-5">
      <div className="relative w-[78px] shrink-0 md:w-[88px]">
        <Cover a={a} titleScale={0.55} rounded="rounded-lg" imgClass="group-hover:scale-[1.06]" />
        <KindBadge kind={a.kind} />
      </div>
      <div className="min-w-0 flex-1 py-0.5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="truncate text-[15px] font-semibold group-hover:text-sakura transition-colors">{a.cn}</h3>
            <p className="truncate text-xs text-mut">{a.jp}</p>
          </div>
          <div className="shrink-0 text-right">
            <div className="flex items-center gap-1 text-lg font-semibold tabular-nums"><Icon name="Star" size={15} fill="#FF6B9D" strokeWidth={0} />{a.score.toFixed(1)}</div>
            <div className="text-[11px] text-mut">#{a.rank}</div>
          </div>
        </div>
        <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-fg/75">
          <span>{a.year} 年 {DATA.SEASON_NAME[a.season]}季</span><span className="text-line">|</span>
          <span>{a.type}</span><span className="text-line">|</span>
          <span>{a.source}</span><span className="text-line">|</span>
          <span>{a.region}</span>
          <span className="hidden gap-1.5 sm:ml-2 sm:inline-flex">{a.genres.map(g => <span key={g} className="rounded bg-elev px-1.5 py-0.5 text-[11px] text-mut">{g}</span>)}</span>
        </div>
        <p className="mt-2 line-clamp-2 text-[13px] leading-relaxed text-mut">{a.desc}</p>
      </div>
    </div>
  );
}

function EmptyState({ onReset, q }) {
  const { go } = useApp();
  return (
    <div className="flex flex-col items-center py-16 text-center fade-in">
      <div className="relative h-40 w-56">
        <div className="absolute left-1/2 top-4 h-28 w-28 -translate-x-1/2 rounded-full bg-gradient-to-br from-sakura/25 to-ind/25 blur-2xl" />
        <div className="absolute left-[38px] top-6 h-[112px] w-20 -rotate-12 rounded-xl border border-line bg-card shadow-card" />
        <div className="absolute right-[38px] top-6 h-[112px] w-20 rotate-12 rounded-xl border border-line bg-card shadow-card" />
        <div className="absolute left-1/2 top-2 grid h-[120px] w-[86px] -translate-x-1/2 place-items-center rounded-xl border border-line bg-elev shadow-cardh">
          <Icon name="SearchX" size={30} className="text-sakura" />
        </div>
        <span className="absolute right-6 top-0 text-ind float-a"><Icon name="Sparkle" size={16} /></span>
        <span className="absolute left-8 bottom-6 text-sakura float-b"><Icon name="Sparkle" size={12} /></span>
      </div>
      <h3 className="mt-4 text-lg font-semibold">没有找到符合条件的番剧</h3>
      <p className="mt-1.5 max-w-sm text-sm text-mut">换个关键词，或者减少一些筛选条件。也可以直接描述你想看的番，让 AI 帮你找。</p>
      <div className="mt-6 flex gap-3">
        <button onClick={onReset} className="h-10 rounded-xl bg-elev px-4 text-sm hover:bg-elev2">清空筛选</button>
        <button onClick={() => go('ai', { prompt: q ? `帮我找找类似「${q}」的番` : '' })} className="inline-flex h-10 items-center gap-1.5 rounded-xl bg-gradient-to-r from-sakura to-ind px-4 text-sm font-semibold text-white hover:brightness-110">
          <Icon name="Sparkles" size={15} />试试问 AI 助手
        </button>
      </div>
    </div>
  );
}

window.LibraryPage = LibraryPage;
