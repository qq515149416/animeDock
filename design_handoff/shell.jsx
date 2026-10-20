// 外壳：顶部导航、搜索、用户菜单、底部 Tab、页脚
const NAV = [
  { key: 'daily', label: '每日放送', icon: 'CalendarDays' },
  { key: 'library', label: '动画库', icon: 'LibraryBig' },
  { key: 'ai', label: 'AI 助手', icon: 'Sparkles' },
];

function Logo({ onClick }) {
  return (
    <button onClick={onClick} className="flex items-center gap-2 shrink-0">
      <span className="relative grid h-8 w-8 place-items-center rounded-[10px] bg-gradient-to-br from-sakura to-ind text-white shadow-[0_6px_18px_-6px_rgba(255,107,157,.7)]">
        <Icon name="Tv" size={17} strokeWidth={2.2} />
        <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full bg-white ring-2 ring-sakura" />
      </span>
      <span className="text-[17px] font-semibold tracking-wide">{DATA.SITE_NAME}</span>
    </button>
  );
}

function TopNav() {
  const { route, go, theme, setTheme, openSearch } = useApp();
  const active = route.page === 'detail' ? null : route.page;
  return (
    <header className="sticky top-0 z-50 border-b border-line glass">
      <div className="mx-auto flex h-16 max-w-[1440px] items-center gap-4 px-4 md:px-6 lg:px-8">
        <Logo onClick={() => go('daily')} />
        <nav className="ml-6 hidden md:block">
          <SlideTabs items={NAV.map(n => ({ key: n.key, label: <span className="flex items-center gap-1.5"><Icon name={n.icon} size={16} />{n.label}</span> }))}
            value={active || '__none'} onChange={(k) => go(k)} itemClass="h-16 px-4 text-[14px] font-medium" />
        </nav>
        <div className="flex-1" />
        <button onClick={openSearch}
          className="group hidden sm:flex h-9 w-[240px] lg:w-[280px] items-center gap-2 rounded-lg border border-line bg-elev/70 px-3 text-[13px] text-mut transition-colors duration-200 hover:border-sakura/50 hover:text-fg">
          <Icon name="Search" size={16} />
          <span className="flex-1 text-left">搜索番剧、原名、别名</span>
          <kbd className="grid h-5 min-w-5 place-items-center rounded border border-line bg-card px-1 font-mono text-[11px]">/</kbd>
        </button>
        <button onClick={openSearch} className="sm:hidden grid h-9 w-9 place-items-center rounded-lg hover:bg-elev" aria-label="搜索"><Icon name="Search" size={19} /></button>
        <button onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')} aria-label="切换深浅色"
          className="grid h-9 w-9 place-items-center rounded-lg text-fg/80 transition-colors duration-200 hover:bg-elev hover:text-fg">
          <Icon name={theme === 'dark' ? 'Sun' : 'Moon'} size={18} />
        </button>
        <UserMenu />
      </div>
    </header>
  );
}

function UserMenu() {
  const { nsfw, requestNsfw, theme, setTheme } = useApp();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return;
    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [open]);
  return (
    <div className="relative" ref={ref}>
      <button onClick={() => setOpen(!open)} className={cx('grid h-9 w-9 place-items-center rounded-full ring-2 transition-all duration-200', open ? 'ring-sakura' : 'ring-transparent hover:ring-line')}>
        <span className="grid h-8 w-8 place-items-center rounded-full bg-gradient-to-br from-[#FFB3CB] to-[#8C98FF] text-[13px] font-semibold text-white">栞</span>
      </button>
      {open && (
        <div className="absolute right-0 top-12 w-[264px] rounded-xl border border-line bg-card p-1.5 shadow-2xl pop-in">
          <div className="flex items-center gap-3 px-3 py-3">
            <span className="grid h-10 w-10 place-items-center rounded-full bg-gradient-to-br from-[#FFB3CB] to-[#8C98FF] font-semibold text-white">栞</span>
            <div className="min-w-0">
              <div className="text-sm font-semibold">雨宫栞</div>
              <div className="text-xs text-mut">追番 47 部 · 看过 312 部</div>
            </div>
          </div>
          <div className="my-1 h-px bg-line" />
          {[['Heart', '我的收藏'], ['History', '观看记录'], ['Bell', '更新提醒']].map(([ic, t]) => (
            <button key={t} className="flex h-9 w-full items-center gap-2.5 rounded-lg px-3 text-[13px] text-fg/85 hover:bg-elev"><Icon name={ic} size={16} className="text-mut" />{t}</button>
          ))}
          <div className="my-1 h-px bg-line" />
          <div className="flex h-11 items-center gap-2.5 rounded-lg px-3 text-[13px] hover:bg-elev cursor-pointer" onClick={() => requestNsfw(!nsfw)}>
            <Icon name="ShieldAlert" size={16} className="text-mut" />
            <span className="flex-1">显示 NSFW 内容</span>
            <Switch on={nsfw} onChange={requestNsfw} />
          </div>
          <div className="flex h-11 items-center gap-2.5 rounded-lg px-3 text-[13px] hover:bg-elev cursor-pointer" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}>
            <Icon name="Moon" size={16} className="text-mut" />
            <span className="flex-1">深色模式</span>
            <Switch on={theme === 'dark'} onChange={(v) => setTheme(v ? 'dark' : 'light')} />
          </div>
          <div className="my-1 h-px bg-line" />
          <button className="flex h-9 w-full items-center gap-2.5 rounded-lg px-3 text-[13px] text-fg/85 hover:bg-elev"><Icon name="LogOut" size={16} className="text-mut" />退出登录</button>
        </div>
      )}
    </div>
  );
}

function AgeGate() {
  const { ageGate, confirmAge, cancelAge } = useApp();
  return (
    <Modal open={ageGate} onClose={cancelAge} className="max-w-[400px] p-6">
      <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-red-500/12 text-red-400"><Icon name="ShieldAlert" size={28} /></div>
      <h3 className="mt-4 text-center text-lg font-semibold">年龄确认</h3>
      <p className="mt-2 text-center text-[13px] leading-relaxed text-mut">
        你即将开启 NSFW 内容显示。相关作品可能包含成人向内容，仅适合 18 岁及以上用户浏览。开启后，相关封面仍会默认模糊，需单独点击查看。
      </p>
      <div className="mt-6 grid grid-cols-2 gap-3">
        <button onClick={cancelAge} className="h-11 rounded-xl bg-elev text-sm font-medium hover:bg-elev2">我未满 18 岁</button>
        <button onClick={confirmAge} className="h-11 rounded-xl bg-sakura text-sm font-semibold text-white hover:brightness-110">我已满 18 岁</button>
      </div>
    </Modal>
  );
}

function SearchPalette() {
  const { searchOpen, closeSearch, go, visibleList } = useApp();
  const [q, setQ] = useState('');
  const [idx, setIdx] = useState(0);
  const inp = useRef(null);
  useEffect(() => { if (searchOpen) { setQ(''); setIdx(0); setTimeout(() => inp.current && inp.current.focus(), 30); } }, [searchOpen]);
  const res = useMemo(() => {
    if (!q.trim()) return [];
    return visibleList.map(a => ({ a, m: matchAnime(a, q) })).filter(x => x.m).sort((x, y) => y.a.heat - x.a.heat).slice(0, 7);
  }, [q, visibleList]);
  const hot = useMemo(() => [...visibleList].filter(a => a.airing).sort((a, b) => b.heat - a.heat).slice(0, 6), [visibleList]);
  const pick = (a) => { closeSearch(); go('detail', { id: a.id }); };
  const onKey = (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setIdx(i => Math.min(i + 1, res.length)); }
    if (e.key === 'ArrowUp') { e.preventDefault(); setIdx(i => Math.max(i - 1, 0)); }
    if (e.key === 'Enter') {
      if (res[idx]) pick(res[idx].a);
      else if (q.trim()) { closeSearch(); go('library', { q: q.trim() }); }
    }
  };
  return (
    <Modal open={searchOpen} onClose={closeSearch} align="top" className="max-w-[620px] overflow-hidden">
      <div className="flex h-14 items-center gap-3 border-b border-line px-4">
        <Icon name="Search" size={19} className="text-mut" />
        <input ref={inp} value={q} onChange={e => { setQ(e.target.value); setIdx(0); }} onKeyDown={onKey}
          placeholder="搜索中文名 / 日文原名 / 别名" className="h-full flex-1 bg-transparent text-[15px] outline-none placeholder:text-mut" />
        <kbd className="rounded border border-line px-1.5 py-0.5 font-mono text-[11px] text-mut">Esc</kbd>
      </div>
      <div className="max-h-[58vh] overflow-y-auto p-2">
        {!q.trim() && (
          <div className="p-2">
            <div className="mb-2 text-xs font-medium text-mut">本季热门</div>
            <div className="flex flex-wrap gap-2">
              {hot.map(a => <Chip key={a.id} onClick={() => pick(a)}>{a.cn}</Chip>)}
            </div>
          </div>
        )}
        {res.map(({ a, m }, i) => (
          <button key={a.id} onMouseEnter={() => setIdx(i)} onClick={() => pick(a)}
            className={cx('flex w-full items-center gap-3 rounded-lg p-2 text-left transition-colors', idx === i ? 'bg-elev' : '')}>
            <Cover a={a} className="w-9 shrink-0" rounded="rounded-md" titleScale={0.4} allowReveal={false} />
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium"><Highlight text={a.cn} q={m.field === 'cn' ? q : ''} /></div>
              <div className="truncate text-xs text-mut">
                {m.field === 'alias' ? <>别名：<Highlight text={m.text} q={q} /></> : <Highlight text={a.jp} q={m.field === 'jp' ? q : ''} />}
              </div>
            </div>
            <span className="text-xs text-mut">{a.year} · {a.type}</span>
            <Score v={a.score} />
          </button>
        ))}
        {q.trim() && (
          <button onMouseEnter={() => setIdx(res.length)} onClick={() => { closeSearch(); go('library', { q: q.trim() }); }}
            className={cx('flex w-full items-center gap-3 rounded-lg px-3 py-3 text-left text-sm', idx === res.length ? 'bg-elev' : '')}>
            <Icon name="LibraryBig" size={17} className="text-sakura" />在动画库中搜索「<span className="text-sakura">{q}</span>」
            <Icon name="CornerDownLeft" size={14} className="ml-auto text-mut" />
          </button>
        )}
        {q.trim() && res.length === 0 && <div className="px-3 pb-2 text-xs text-mut">没有直接匹配的番剧，可以去动画库或 AI 助手试试</div>}
      </div>
    </Modal>
  );
}

function MobileTabBar() {
  const { route, go } = useApp();
  return (
    <nav className="fixed inset-x-0 bottom-0 z-50 border-t border-line glass md:hidden" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
      <div className="grid h-16 grid-cols-3">
        {NAV.map(n => {
          const on = route.page === n.key;
          return (
            <button key={n.key} onClick={() => go(n.key)} className={cx('relative flex flex-col items-center justify-center gap-1 text-[11px] transition-colors', on ? 'text-sakura' : 'text-mut')}>
              {on && <span className="absolute top-0 h-[3px] w-8 rounded-b-full bg-sakura" />}
              <Icon name={n.icon} size={22} strokeWidth={on ? 2.3 : 1.8} />
              {n.label}
            </button>
          );
        })}
      </div>
    </nav>
  );
}

function Footer() {
  return (
    <footer className="mt-20 border-t border-line">
      <div className="mx-auto grid max-w-[1440px] gap-8 px-4 py-10 md:grid-cols-[1.4fr_1fr_1fr] md:px-6 lg:px-8">
        <div>
          <Logo onClick={() => {}} />
          <p className="mt-3 max-w-sm text-[13px] leading-relaxed text-mut">面向动画爱好者的番剧查询站。每日放送、动画库检索、AI 番剧助手，一站看全。</p>
          <p className="mt-4 inline-flex items-center gap-1.5 rounded-md bg-elev px-2.5 py-1 text-xs text-mut"><Icon name="Database" size={13} />数据来源：Bangumi 番组计划</p>
        </div>
        <div>
          <h4 className="text-sm font-semibold">关于</h4>
          <ul className="mt-3 space-y-2 text-[13px] text-mut">
            {['关于我们', '使用条款', '隐私政策', '意见反馈'].map(t => <li key={t}><a className="hover:text-sakura cursor-pointer">{t}</a></li>)}
          </ul>
        </div>
        <div>
          <h4 className="text-sm font-semibold">友情链接</h4>
          <ul className="mt-3 space-y-2 text-[13px] text-mut">
            {['Bangumi 番组计划', 'AniList', 'MyAnimeList', '萌娘百科'].map(t => <li key={t}><a className="hover:text-sakura cursor-pointer">{t}</a></li>)}
          </ul>
        </div>
      </div>
      <div className="border-t border-line py-5 text-center text-xs text-mut">© 2026 {DATA.SITE_NAME} · 原型演示，所有作品均为虚构示例</div>
    </footer>
  );
}

Object.assign(window, { TopNav, AgeGate, SearchPalette, MobileTabBar, Footer, Logo });
