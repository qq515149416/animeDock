// 页面 3：番剧详情
function DetailPage() {
  const { route, go, nsfw, revealed, reveal } = useApp();
  const a = DATA.byId[route.params.id];
  const [expand, setExpand] = useState(false);
  const [fav, setFav] = useState(false);
  const loading = useDelayedLoading([route.params.id], 350);
  if (!a) return <div className="py-40 text-center text-mut">作品不存在</div>;
  if (a.nsfw && !nsfw) return (
    <div className="mx-auto max-w-md py-32 text-center">
      <Icon name="ShieldAlert" size={36} className="mx-auto text-red-400" />
      <h2 className="mt-4 text-lg font-semibold">该作品为 NSFW 内容</h2>
      <p className="mt-1 text-sm text-mut">请在头像菜单中开启「显示 NSFW 内容」后查看</p>
    </div>
  );
  const hiddenBg = a.nsfw && !revealed.has(a.id);
  const ep = DATA.curEpisode(a);
  const sd = a.startDate;
  const tags = [...a.genres, a.source, a.type, a.studio, ...(a.airing ? ['连载中'] : ['已完结']), ...(a.score >= 8.5 ? ['神作'] : []), ...(a.eps === 12 ? ['一季度'] : []), a.region === '日本' ? '日本动画' : `${a.region}动画`];
  const tagSize = (i) => ['text-[15px] font-semibold', 'text-sm', 'text-[13px]', 'text-xs'][i % 4];
  const related = a.related.map(([id, rel]) => ({ x: DATA.byId[id], rel })).filter(r => r.x && (!r.x.nsfw || nsfw));
  const similar = DATA.list.filter(x => x.id !== a.id && (!x.nsfw || nsfw) && x.genres.some(g => a.genres.includes(g))).sort((x, y) => y.genres.filter(g => a.genres.includes(g)).length - x.genres.filter(g => a.genres.includes(g)).length || y.score - x.score).slice(0, 6);
  const info = [
    ['放送日期', `${sd.getFullYear()}-${String(sd.getMonth() + 1).padStart(2, '0')}-${String(sd.getDate()).padStart(2, '0')}`],
    ['季度', `${a.year} 年${DATA.SEASON_NAME[a.season]}季（${a.season}月）`],
    ['集数', a.type === '剧场版' ? '剧场版 · 1 部' : `全 ${a.eps} 话${a.airing ? ` · 更新至第 ${ep} 话` : ''}`],
    ['放送时间', a.airing ? `每${DATA.WEEK_FULL[a.weekday - 1]} ${a.time}` : '已完结'],
    ['分类', a.type], ['来源', a.source], ['地区', a.region],
    ['制作公司', a.studio], ['导演', a.director],
  ];

  return (
    <div key={a.id} className="fade-in">
      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className={cx('absolute inset-0 scale-125 blur-3xl opacity-70', hiddenBg && 'opacity-30')}><CoverArt a={a} /></div>
        <div className="absolute inset-0 bg-gradient-to-b from-bg/40 via-bg/70 to-bg" />
        <div className="relative mx-auto max-w-[1440px] px-4 pb-8 pt-6 md:px-6 lg:px-8">
          <button onClick={() => history.length > 1 ? history.back() : go('daily')} className="mb-5 inline-flex items-center gap-1 text-sm text-fg/75 hover:text-fg">
            <Icon name="ChevronLeft" size={16} />返回
          </button>
          <div className="flex flex-col gap-6 sm:flex-row md:gap-10">
            <div className="relative mx-auto w-[180px] shrink-0 rounded-xl shadow-[0_24px_60px_-20px_rgba(0,0,0,.6)] sm:mx-0 md:w-[240px]">
              {loading ? <div className="skel rounded-xl" style={{ aspectRatio: '5/7' }} /> : <Cover a={a} titleScale={1.5} />}
              <KindBadge kind={a.kind} />
            </div>
            <div className="min-w-0 flex-1 sm:pt-2">
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span className="rounded-md bg-fg/10 px-2 py-0.5">{a.type}</span>
                <span className="rounded-md bg-fg/10 px-2 py-0.5">{a.year} {DATA.SEASON_NAME[a.season]}</span>
                {a.airing && <span className="inline-flex items-center gap-1 rounded-md bg-sakura/15 px-2 py-0.5 text-sakura"><span className="h-1.5 w-1.5 rounded-full bg-sakura pulse-dot" />连载中</span>}
                {a.nsfw && <span className="rounded-md bg-red-500/90 px-2 py-0.5 font-bold text-white">R18</span>}
              </div>
              <h1 className="mt-3 text-[26px] font-semibold leading-tight md:text-[38px]">{a.cn}</h1>
              <p className="mt-1.5 text-[15px] text-fg/65">{a.jp}</p>
              {a.alias.length > 0 && <p className="mt-1 text-xs text-mut">别名：{a.alias.join(' / ')}</p>}
              <div className="mt-6 flex flex-wrap items-stretch gap-3">
                <Stat big label="Bangumi 评分"><span className="flex items-center gap-1.5"><Icon name="Star" size={22} fill="#FF6B9D" strokeWidth={0} />{a.score.toFixed(1)}</span></Stat>
                <Stat label="排名">#{a.rank}</Stat>
                <Stat label="收藏人数">{DATA.fmtFav(a.fav + (fav ? 1 : 0))}</Stat>
                {a.airing && <Stat label="更新至">第 {ep} 话</Stat>}
              </div>
              <div className="mt-6 flex flex-wrap gap-3">
                <button onClick={() => setFav(!fav)} className={cx('inline-flex h-11 items-center gap-2 rounded-xl px-5 text-sm font-semibold transition-all duration-200', fav ? 'bg-fg/10 text-sakura' : 'bg-sakura text-white hover:brightness-110')}>
                  <Icon name="Heart" size={17} fill={fav ? '#FF6B9D' : 'none'} />{fav ? '已收藏' : '收藏追番'}
                </button>
                <button className="inline-flex h-11 items-center gap-2 rounded-xl bg-fg/10 px-5 text-sm font-medium hover:bg-fg/15"><Icon name="Bell" size={16} />更新提醒</button>
                <button className="grid h-11 w-11 place-items-center rounded-xl bg-fg/10 hover:bg-fg/15"><Icon name="Share2" size={16} /></button>
              </div>
            </div>
          </div>
        </div>
      </section>

      <div className="mx-auto grid max-w-[1440px] gap-8 px-4 md:px-6 lg:grid-cols-[1fr_320px] lg:px-8">
        <div className="min-w-0 space-y-10">
          <Section title="剧情简介">
            <div className="relative">
              <p className={cx('text-[15px] leading-[1.9] text-fg/85', !expand && 'line-clamp-3')}>
                {a.desc} {a.desc.length < 90 && '在看似平静的日常之下，每个角色都背负着各自的秘密。随着故事推进，那些被刻意遗忘的过去将一点点浮出水面——而他们必须在真相与羁绊之间作出选择。本作以细腻的分镜与配乐著称，被众多观众评价为「本季最值得一看的作品之一」。'}
              </p>
              <button onClick={() => setExpand(!expand)} className="mt-2 inline-flex items-center gap-1 text-sm text-sakura">
                {expand ? '收起' : '展开全部'}<Icon name="ChevronDown" size={14} className={cx('transition-transform', expand && 'rotate-180')} />
              </button>
            </div>
          </Section>

          <Section title="角色与声优" extra={<span className="text-xs text-mut">{a.chars.length} 位</span>}>
            <div className="no-scrollbar -mx-4 flex gap-3 overflow-x-auto px-4 pb-2 md:mx-0 md:px-0">
              {a.chars.map((c, i) => (
                <div key={i} className="w-[148px] shrink-0 rounded-xl border border-line bg-card p-3 transition-colors hover:border-sakura/40">
                  <div className="relative aspect-square overflow-hidden rounded-lg" style={{ background: `linear-gradient(150deg, oklch(0.72 0.11 ${(a.h1 + i * 50) % 360}), oklch(0.42 0.1 ${(a.h2 + i * 40) % 360}))` }}>
                    <span className="absolute inset-0 grid place-items-center text-[34px] font-semibold text-white/85">{c.name.replace(/\s/g, '').slice(-1)}</span>
                    <span className={cx('absolute left-1.5 top-1.5 rounded px-1.5 py-px text-[10px] font-semibold text-white', c.role === '主角' ? 'bg-sakura' : 'bg-black/40')}>{c.role}</span>
                  </div>
                  <div className="mt-2.5 truncate text-[13px] font-semibold">{c.name}</div>
                  <div className="mt-0.5 flex items-center gap-1 truncate text-xs text-mut"><Icon name="Mic" size={11} />CV：{c.cv}</div>
                </div>
              ))}
            </div>
          </Section>

          {related.length > 0 && (
            <Section title="关联作品">
              <div className="grid gap-3 sm:grid-cols-2">
                {related.map(({ x, rel }) => (
                  <div key={x.id} role="button" onClick={() => go('detail', { id: x.id })} className="group flex cursor-pointer items-center gap-3 rounded-xl border border-line bg-card p-2.5 transition-all hover:border-sakura/40">
                    <Cover a={x} className="w-14 shrink-0" rounded="rounded-lg" titleScale={0.4} />
                    <div className="min-w-0 flex-1">
                      <span className="rounded bg-ind/15 px-1.5 py-0.5 text-[11px] font-medium text-ind">{rel}</span>
                      <div className="mt-1 truncate text-sm font-semibold group-hover:text-sakura">{x.cn}</div>
                      <div className="text-xs text-mut">{x.year} · {x.type} · <Score v={x.score} /></div>
                    </div>
                    <Icon name="ChevronRight" size={16} className="text-mut" />
                  </div>
                ))}
              </div>
            </Section>
          )}

          <Section title="相似推荐">
            <div className="grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-3 xl:grid-cols-6">
              {similar.map(x => <AnimeCard key={x.id} a={x} showEp={false} />)}
            </div>
          </Section>
        </div>

        <aside className="space-y-6 lg:pt-0">
          <div className="rounded-2xl border border-line bg-card p-5 lg:sticky lg:top-24">
            <h3 className="text-sm font-semibold">作品信息</h3>
            <dl className="mt-3 divide-y divide-line/60 text-[13px]">
              {info.map(([k, v]) => (
                <div key={k} className="flex justify-between gap-4 py-2.5"><dt className="shrink-0 text-mut">{k}</dt><dd className="text-right font-medium">{v}</dd></div>
              ))}
            </dl>
            <h3 className="mt-5 text-sm font-semibold">标签</h3>
            <div className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-2">
              {tags.map((t, i) => (
                <span key={i} className={cx('rounded-lg px-2 py-1 transition-colors hover:text-sakura cursor-default', tagSize(i), i < 3 ? 'bg-sakura/10 text-sakura' : 'bg-elev text-fg/75')}>{t}</span>
              ))}
            </div>
          </div>
        </aside>
      </div>

      <button onClick={() => go('ai', { prompt: `给我讲讲《${a.cn}》，值得看吗？`, about: a.id })}
        className="fixed bottom-24 right-4 z-40 inline-flex h-12 items-center gap-2 rounded-full bg-gradient-to-r from-sakura to-ind pl-4 pr-5 text-sm font-semibold text-white shadow-[0_12px_32px_-8px_rgba(255,107,157,.65)] transition-transform duration-200 hover:-translate-y-0.5 md:bottom-8 md:right-8">
        <Icon name="Sparkles" size={18} />问问 AI 关于这部番
      </button>
    </div>
  );
}

function Stat({ label, children, big }) {
  return (
    <div className={cx('rounded-xl bg-fg/[.07] px-4 py-2.5 backdrop-blur-sm', big && 'pr-6')}>
      <div className="text-[11px] text-fg/55">{label}</div>
      <div className={cx('mt-0.5 font-semibold tabular-nums', big ? 'text-[26px] leading-tight text-sakura' : 'text-lg')}>{children}</div>
    </div>
  );
}

function Section({ title, extra, children }) {
  return (
    <section>
      <div className="mb-4 flex items-center gap-2.5">
        <span className="h-4 w-1 rounded-full bg-sakura" />
        <h2 className="text-lg font-semibold">{title}</h2>
        {extra}
      </div>
      {children}
    </section>
  );
}

window.DetailPage = DetailPage;
