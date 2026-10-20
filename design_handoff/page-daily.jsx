// 页面 1：每日放送
function DailyPage() {
  const { visibleList, prefs, setPref } = useApp();
  const now = new Date();
  const today = DATA.todayWeekday(now);
  const [day, setDay] = useState(today);
  const view = prefs.dailyView || 'grid';
  const season = DATA.currentSeason(now);
  const loading = useDelayedLoading([day, view], 380);

  const airing = useMemo(() => visibleList.filter(a => a.airing), [visibleList]);
  const counts = useMemo(() => { const c = {}; airing.forEach(a => (c[a.weekday] = (c[a.weekday] || 0) + 1)); return c; }, [airing]);
  const items = useMemo(() => airing.filter(a => a.weekday === day).sort((a, b) => DATA.timeKey(a.time) - DATA.timeKey(b.time)), [airing, day]);
  const todayCount = counts[today] || 0;

  const dateOf = (w) => { const d = new Date(now); d.setDate(d.getDate() + (w - today)); return d; };
  const featured = useMemo(() => [...airing].filter(a => a.weekday === today).sort((a, b) => b.score - a.score).slice(0, 3), [airing, today]);

  return (
    <div>
      {/* Hero */}
      <section className="relative overflow-hidden border-b border-line">
        <div className="absolute inset-0 hero-grad" />
        <div className="absolute inset-0 hero-dots opacity-60" />
        <div className="relative mx-auto grid max-w-[1440px] items-end gap-8 px-4 pb-8 pt-10 md:grid-cols-[1fr_auto] md:px-6 md:pb-10 md:pt-14 lg:px-8">
          <div>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-sakura/30 bg-sakura/10 px-3 py-1 text-xs font-semibold text-sakura">
              <Icon name="Leaf" size={13} />{season.label}
            </span>
            <h1 className="mt-4 text-[30px] font-semibold leading-tight tracking-tight md:text-[44px]">
              {now.getMonth() + 1} 月 {now.getDate()} 日 <span className="text-mut font-normal">·</span> {DATA.WEEK_FULL[today - 1]}
            </h1>
            <p className="mt-2 text-[15px] text-mut md:text-base">
              今日更新 <span className="mx-0.5 text-2xl font-semibold text-sakura tabular-nums">{todayCount}</span> 部 · 本季共 {airing.length} 部新番/续作在播
            </p>
          </div>
          <div className="hidden lg:flex items-end gap-3">
            {featured.map((a, i) => (
              <div key={a.id} className="w-[104px] rounded-xl shadow-cardh" style={{ transform: `translateY(${[-10, 0, 10][i]}px) rotate(${[-4, 0, 4][i]}deg)` }}>
                <Cover a={a} titleScale={0.75} allowReveal={false} />
              </div>
            ))}
          </div>
        </div>
      </section>

      <div className="mx-auto max-w-[1440px] px-4 md:px-6 lg:px-8">
        {/* 星期 Tab + 视图切换 */}
        <div className="sticky top-16 z-30 -mx-4 mb-6 flex items-center gap-3 border-b border-line bg-bg/85 px-4 backdrop-blur-md md:-mx-6 md:px-6 lg:-mx-8 lg:px-8">
          <div className="no-scrollbar -mb-px flex-1 overflow-x-auto">
            <SlideTabs value={day} onChange={setDay} itemClass="h-[60px] min-w-[64px] px-3 md:min-w-[84px]"
              items={[1, 2, 3, 4, 5, 6, 7].map(w => ({
                key: w,
                label: (
                  <span className="flex flex-col items-center leading-tight">
                    <span className="flex items-center gap-1 text-[14px] font-semibold">
                      {DATA.WEEK[w - 1]}
                      {w === today && <span className="rounded bg-sakura px-1 py-px text-[10px] font-semibold leading-none text-white">今天</span>}
                    </span>
                    <span className="mt-1 text-[11px] font-normal text-mut tabular-nums">{dateOf(w).getMonth() + 1}/{dateOf(w).getDate()} · {counts[w] || 0} 部</span>
                  </span>
                ),
              }))} />
          </div>
          <Segmented value={view} onChange={(v) => setPref('dailyView', v)} options={[
            { value: 'grid', icon: 'LayoutGrid', label: '网格' },
            { value: 'timeline', icon: 'Clock3', label: '时间轴' },
          ]} />
        </div>

        <div className="mb-4 flex items-baseline justify-between">
          <h2 className="text-lg font-semibold">{DATA.WEEK_FULL[day - 1]}放送 <span className="ml-1 text-sm font-normal text-mut">{items.length} 部</span></h2>
          <span className="text-xs text-mut">时间为北京时间 · 深夜档按 24 时制计入当天</span>
        </div>

        {loading ? (
          view === 'grid'
            ? <div className="grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-6">{Array.from({ length: 6 }).map((_, i) => <CardSkeleton key={i} />)}</div>
            : <TimelineSkeleton />
        ) : items.length === 0 ? (
          <div className="py-24 text-center text-mut">这一天暂时没有番剧更新</div>
        ) : view === 'grid' ? (
          <div className="grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-6">
            {items.map(a => <AnimeCard key={a.id} a={a} extra={<span className="text-[11px] text-mut tabular-nums">{a.time}</span>} />)}
          </div>
        ) : (
          <Timeline items={items} isToday={day === today} now={now} />
        )}
      </div>
    </div>
  );
}

function TimelineSkeleton() {
  return (
    <div className="space-y-6">
      {[0, 1, 2].map(i => (
        <div key={i} className="flex gap-6">
          <div className="skel h-5 w-14 rounded" />
          <div className="flex flex-1 gap-4">
            <div className="skel h-[112px] w-20 rounded-lg" />
            <div className="flex-1 space-y-2 pt-1"><div className="skel h-4 w-1/3 rounded" /><div className="skel h-3 w-1/4 rounded" /><div className="skel h-3 w-1/2 rounded" /></div>
          </div>
        </div>
      ))}
    </div>
  );
}

function Timeline({ items, isToday, now }) {
  const { go } = useApp();
  const nowKey = (now.getHours() < 5 ? now.getHours() + 24 : now.getHours()) * 60 + now.getMinutes();
  const groups = [];
  items.forEach(a => { const g = groups.find(x => x.time === a.time); g ? g.list.push(a) : groups.push({ time: a.time, list: [a] }); });
  const nextIdx = isToday ? groups.findIndex(g => DATA.timeKey(g.time) > nowKey) : -1;
  return (
    <div className="relative">
      <div className="absolute bottom-2 left-[68px] top-2 w-px bg-line md:left-[92px]" />
      {groups.map((g, gi) => {
        const aired = isToday && DATA.timeKey(g.time) <= nowKey;
        const isNext = gi === nextIdx;
        const [hh, mm] = g.time.split(':');
        return (
          <div key={g.time} className="relative flex gap-5 pb-7 md:gap-8 fade-in">
            <div className="w-[52px] shrink-0 pt-1 text-right md:w-[68px]">
              <div className={cx('text-lg font-semibold tabular-nums md:text-xl', isNext ? 'text-sakura' : aired ? 'text-mut' : '')}>{g.time}</div>
              {Number(hh) < 5 && <div className="text-[10px] text-mut">({Number(hh) + 24}:{mm})</div>}
            </div>
            <span className={cx('absolute left-[63px] top-2.5 h-[11px] w-[11px] rounded-full border-2 md:left-[87px]',
              isNext ? 'border-sakura bg-sakura pulse-dot' : aired ? 'border-mut/50 bg-card' : 'border-ind bg-card')} />
            <div className="flex-1 space-y-3">
              {isNext && <div className="text-xs font-semibold text-sakura">即将播出</div>}
              {g.list.map(a => (
                <div key={a.id} role="button" onClick={() => go('detail', { id: a.id })}
                  className={cx('group flex cursor-pointer gap-4 rounded-xl border border-line bg-card p-3 transition-all duration-200 hover:-translate-y-0.5 hover:border-sakura/40 hover:shadow-cardh', aired && 'opacity-75')}>
                  <div className="relative w-[72px] shrink-0 md:w-20">
                    <Cover a={a} titleScale={0.55} rounded="rounded-lg" imgClass="group-hover:scale-[1.06]" />
                  </div>
                  <div className="min-w-0 flex-1 py-0.5">
                    <div className="flex items-center gap-2">
                      {a.kind && <span className={cx('rounded px-1.5 py-px text-[10px] font-semibold text-white', a.kind === '新番' ? 'bg-sakura' : 'bg-ind')}>{a.kind}</span>}
                      <h3 className="truncate text-[15px] font-semibold group-hover:text-sakura transition-colors">{a.cn}</h3>
                    </div>
                    <p className="mt-0.5 truncate text-xs text-mut">{a.jp}</p>
                    <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-mut">
                      <Score v={a.score} className="text-fg" />
                      <span>第 {DATA.curEpisode(a, now)} 话{aired ? ' · 已更新' : ''}</span>
                      <span className="hidden sm:inline">{a.studio}</span>
                    </div>
                    <div className="mt-2 hidden flex-wrap gap-1.5 sm:flex">
                      {a.genres.map(g => <span key={g} className="rounded bg-elev px-1.5 py-0.5 text-[11px] text-mut">{g}</span>)}
                    </div>
                  </div>
                  <Icon name="ChevronRight" size={18} className="self-center text-mut transition-transform group-hover:translate-x-0.5" />
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

window.DailyPage = DailyPage;
