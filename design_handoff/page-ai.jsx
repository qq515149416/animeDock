// 页面 4：AI 番剧助手
const AI_SUGGEST = [
  { icon: 'Trophy', text: '推荐几部 2025 年评分最高的漫画改番' },
  { icon: 'Droplets', text: '有没有类似 CLANNAD 那样催泪的番？' },
  { icon: 'CalendarCheck', text: '今天更新了哪些番？' },
  { icon: 'Flame', text: '帮我讲讲这季度最火的新番' },
];

const blockLen = (b) => b.t === 'cards' ? 12 : b.v.length;

function mkAI(prompt, opts) {
  const r = AIEngine.reply(prompt, opts);
  return { role: 'ai', ...r, total: r.blocks.reduce((s, b) => s + blockLen(b), 0) };
}

const DEMO_SESSIONS = () => {
  const q = '有没有类似 CLANNAD 那样催泪的番？';
  const ai = mkAI(q, {});
  return [
    { id: 's-demo', title: '类似 CLANNAD 的催泪番', time: '刚刚', msgs: [{ role: 'user', text: q }, { ...ai, progress: ai.total, toolStep: ai.tools.length, done: true }] },
    { id: 's2', title: '2025 年评分最高的漫画改', time: '昨天', msgs: null, seed: '推荐几部 2025 年评分最高的漫画改番' },
    { id: 's3', title: '这季度最火的新番', time: '3 天前', msgs: null, seed: '帮我讲讲这季度最火的新番' },
    { id: 's4', title: '治愈系日常推荐', time: '上周', msgs: null, seed: '推荐一些治愈的番' },
  ];
};

function AIPage() {
  const { route, nsfw } = useApp();
  const [sessions, setSessions] = useState(DEMO_SESSIONS);
  const [cur, setCur] = useState('s-demo');
  const [side, setSide] = useState(() => window.innerWidth >= 1024);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const timer = useRef(null);
  const scroller = useRef(null);
  const ta = useRef(null);
  const stick = useRef(true);
  const session = sessions.find(s => s.id === cur);
  const msgs = (session && session.msgs) || [];

  const patchLast = (fn) => setSessions(ss => ss.map(s => s.id !== curRef.current ? s : { ...s, msgs: s.msgs.map((m, i) => i === s.msgs.length - 1 ? fn(m) : m) }));
  const curRef = useRef(cur); curRef.current = cur;

  const stop = () => { clearTimeout(timer.current); clearInterval(timer.current); setBusy(false); patchLast(m => ({ ...m, done: true, stopped: m.progress < m.total })); };

  const send = (text, opts = {}) => {
    const t = (text ?? input).trim();
    if (!t || busy) return;
    setInput('');
    stick.current = true;
    const ai = mkAI(t, { nsfw, about: opts.about });
    let sid = curRef.current;
    const msg = { ...ai, progress: 0, toolStep: 0, done: false };
    if (opts.newSession || !session || !session.msgs || session.msgs.length === 0) {
      sid = 's' + Date.now();
      setSessions(ss => [{ id: sid, title: t.slice(0, 18), time: '刚刚', msgs: [{ role: 'user', text: t }, msg] }, ...ss.filter(s => s.msgs && s.msgs.length || s.seed)]);
      setCur(sid); curRef.current = sid;
    } else {
      setSessions(ss => ss.map(s => s.id === sid ? { ...s, msgs: [...s.msgs, { role: 'user', text: t }, msg] } : s));
    }
    setBusy(true);
    // 工具调用阶段
    let step = 0;
    const runTool = () => {
      timer.current = setTimeout(() => {
        step++;
        patchLast(m => ({ ...m, toolStep: step }));
        if (step < ai.tools.length) runTool(); else startStream();
      }, 900 + Math.random() * 400);
    };
    const startStream = () => {
      timer.current = setInterval(() => {
        let fin = false;
        patchLast(m => { const p = Math.min(m.total, m.progress + 3); if (p >= m.total) fin = true; return { ...m, progress: p, done: p >= m.total }; });
        if (fin) { clearInterval(timer.current); setBusy(false); }
      }, 22);
    };
    runTool();
  };

  // 从其他页面带入的问题
  const handled = useRef(null);
  useEffect(() => {
    const pr = route.params.prompt;
    if (pr && handled.current !== route.key) { handled.current = route.key; setTimeout(() => send(pr, { newSession: true, about: route.params.about }), 200); }
    else if (route.params.prompt === '' && handled.current !== route.key) { handled.current = route.key; newChat(); }
  }, [route.key]);
  useEffect(() => () => { clearTimeout(timer.current); clearInterval(timer.current); }, []);

  useEffect(() => {
    const el = scroller.current;
    if (el && stick.current) el.scrollTop = el.scrollHeight;
  });
  useEffect(() => {
    const el = ta.current; if (!el) return;
    el.style.height = 'auto'; el.style.height = Math.min(el.scrollHeight, 180) + 'px';
  }, [input]);

  const newChat = () => {
    if (busy) stop();
    const id = 's' + Date.now();
    setSessions(ss => [{ id, title: '新对话', time: '刚刚', msgs: [] }, ...ss.filter(s => (s.msgs && s.msgs.length) || s.seed)]);
    setCur(id);
    if (window.innerWidth < 1024) setSide(false);
  };
  const openSession = (s) => {
    if (busy) stop();
    if (!s.msgs && s.seed) {
      const ai = mkAI(s.seed, { nsfw });
      setSessions(ss => ss.map(x => x.id === s.id ? { ...x, msgs: [{ role: 'user', text: s.seed }, { ...ai, progress: ai.total, toolStep: ai.tools.length, done: true }] } : x));
    }
    setCur(s.id); stick.current = true;
    if (window.innerWidth < 1024) setSide(false);
  };
  const delSession = (id) => {
    setSessions(ss => { const n = ss.filter(s => s.id !== id); if (id === cur) setCur(n[0] ? n[0].id : null); return n; });
  };

  const empty = msgs.length === 0;

  return (
    <div className="relative flex h-[calc(100dvh-64px-64px)] md:h-[calc(100dvh-64px)] overflow-hidden">
      <div className="pointer-events-none absolute inset-0 ai-grad" />
      {/* 侧栏 */}
      {side && <div className="absolute inset-0 z-20 bg-black/40 lg:hidden" onClick={() => setSide(false)} />}
      <aside className={cx('absolute inset-y-0 left-0 z-30 flex w-[272px] flex-col border-r border-line bg-card/95 backdrop-blur-xl transition-transform duration-200 lg:relative lg:bg-card/60',
        side ? 'translate-x-0' : '-translate-x-full lg:hidden')}>
        <div className="flex items-center gap-2 p-3">
          <button onClick={newChat} className="flex h-10 flex-1 items-center gap-2 rounded-xl border border-line bg-elev px-3 text-sm font-medium transition-colors hover:border-sakura/50">
            <Icon name="SquarePen" size={16} className="text-sakura" />新对话
          </button>
          <button onClick={() => setSide(false)} className="grid h-10 w-10 place-items-center rounded-xl text-mut hover:bg-elev hover:text-fg" title="收起侧栏"><Icon name="PanelLeftClose" size={18} /></button>
        </div>
        <div className="px-4 pb-1 pt-2 text-[11px] font-medium text-mut">历史会话</div>
        <div className="flex-1 overflow-y-auto px-2 pb-3">
          {sessions.filter(s => (s.msgs && s.msgs.length) || s.seed || s.id === cur).map(s => (
            <div key={s.id} onClick={() => openSession(s)}
              className={cx('group flex cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-2.5 transition-colors', s.id === cur ? 'bg-sakura/12 text-fg' : 'text-fg/80 hover:bg-elev')}>
              <Icon name="MessageSquare" size={15} className={s.id === cur ? 'text-sakura' : 'text-mut'} />
              <div className="min-w-0 flex-1">
                <div className="truncate text-[13px]">{s.title}</div>
                <div className="text-[11px] text-mut">{s.time}</div>
              </div>
              <button onClick={(e) => { e.stopPropagation(); delSession(s.id); }} className="hidden h-6 w-6 place-items-center rounded text-mut hover:text-red-400 group-hover:grid"><Icon name="Trash2" size={13} /></button>
            </div>
          ))}
        </div>
        <div className="border-t border-line p-3 text-[11px] leading-relaxed text-mut">AI 回复基于站内数据与网络搜索生成，可能存在误差，仅供参考。</div>
      </aside>

      {/* 对话区 */}
      <div className="relative flex min-w-0 flex-1 flex-col">
        <div className="flex h-12 shrink-0 items-center gap-2 px-3">
          {!side && <button onClick={() => setSide(true)} className="grid h-9 w-9 place-items-center rounded-lg text-mut hover:bg-elev hover:text-fg" title="展开侧栏"><Icon name="PanelLeftOpen" size={18} /></button>}
          <span className="truncate text-sm font-medium text-fg/80">{empty ? 'AI 番剧助手' : session && session.title}</span>
          <span className="rounded bg-ind/15 px-1.5 py-0.5 text-[10px] font-semibold text-ind">BETA</span>
        </div>

        <div ref={scroller} onScroll={(e) => { const el = e.currentTarget; stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80; }} className="flex-1 overflow-y-auto">
          {empty ? <AIWelcome onPick={(t) => send(t)} /> : (
            <div className="mx-auto max-w-[820px] space-y-8 px-4 pb-10 pt-4 md:px-6">
              {msgs.map((m, i) => m.role === 'user'
                ? <UserBubble key={i} text={m.text} />
                : <AIMessage key={i} m={m} />)}
            </div>
          )}
        </div>

        {/* 输入框 */}
        <div className="shrink-0 px-3 pb-3 md:px-6 md:pb-5">
          <div className="mx-auto max-w-[820px]">
            <div className="flex items-end gap-2 rounded-2xl border border-line bg-card/90 p-2 pl-4 shadow-cardh backdrop-blur-xl transition-colors focus-within:border-sakura/50">
              <textarea ref={ta} rows={1} value={input} onChange={e => setInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); send(); } }}
                placeholder="问我任何关于番剧的问题…（Enter 发送，Shift+Enter 换行）"
                className="max-h-[180px] min-h-[40px] flex-1 resize-none bg-transparent py-2.5 text-[15px] leading-relaxed outline-none placeholder:text-mut" />
              {busy ? (
                <button onClick={stop} className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-fg text-bg transition hover:opacity-85" title="停止生成">
                  <span className="h-3 w-3 rounded-[3px] bg-current" />
                </button>
              ) : (
                <button onClick={() => send()} disabled={!input.trim()} title="发送"
                  className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-sakura text-white transition hover:brightness-110 disabled:bg-elev2 disabled:text-mut">
                  <Icon name="ArrowUp" size={19} strokeWidth={2.4} />
                </button>
              )}
            </div>
            <p className="mt-2 text-center text-[11px] text-mut">番剧坞 AI 可能会出错，涉及剧透的内容会自动折叠</p>
          </div>
        </div>
      </div>
    </div>
  );
}

function AIWelcome({ onPick }) {
  return (
    <div className="mx-auto flex min-h-full max-w-[760px] flex-col items-center justify-center px-4 py-10 text-center">
      <div className="relative">
        <div className="absolute inset-0 rounded-full bg-gradient-to-br from-sakura to-ind opacity-50 blur-2xl" />
        <div className="relative grid h-16 w-16 place-items-center rounded-2xl bg-gradient-to-br from-sakura to-ind text-white shadow-cardh"><Icon name="Sparkles" size={30} /></div>
      </div>
      <h1 className="mt-6 text-[24px] font-semibold md:text-[30px]">今天想看点什么？</h1>
      <p className="mt-2 max-w-md text-sm text-mut">我是番剧坞 AI 助手。可以帮你找番、查放送、讲剧情——基于站内 {DATA.list.length} 部作品数据，必要时联网搜索。</p>
      <div className="mt-8 grid w-full gap-3 sm:grid-cols-2">
        {AI_SUGGEST.map(s => (
          <button key={s.text} onClick={() => onPick(s.text)}
            className="group flex items-start gap-3 rounded-xl border border-line bg-card/80 p-4 text-left backdrop-blur transition-all duration-200 hover:-translate-y-0.5 hover:border-sakura/45 hover:shadow-cardh">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-sakura/10 text-sakura transition-colors group-hover:bg-sakura group-hover:text-white"><Icon name={s.icon} size={17} /></span>
            <span className="pt-1.5 text-[14px] leading-snug">{s.text}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function UserBubble({ text }) {
  return (
    <div className="flex justify-end fade-in">
      <div className="max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-md bg-sakura px-4 py-2.5 text-[15px] leading-relaxed text-white">{text}</div>
    </div>
  );
}

function RichText({ v }) {
  const lines = v.split('\n');
  return (
    <div className="space-y-1.5 text-[15px] leading-[1.85]">
      {lines.map((ln, i) => ln === '' ? <div key={i} className="h-1" /> : (
        <p key={i} className={ln.startsWith('·') ? 'pl-1' : ''}>
          {ln.split(/(\*\*[^*]+\*\*?)/g).map((seg, j) => seg.startsWith('**')
            ? <strong key={j} className="font-semibold text-fg">{seg.replace(/\*/g, '')}</strong>
            : <span key={j}>{seg}</span>)}
        </p>
      ))}
    </div>
  );
}

function Spoiler({ v, partial }) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative overflow-hidden rounded-xl border border-dashed border-sakura/40 bg-sakura/[.05]">
      <div className="flex items-center gap-1.5 px-4 pt-3 text-xs font-semibold text-sakura"><Icon name="TriangleAlert" size={13} />剧透内容</div>
      <div className={cx('px-4 pb-3 pt-1.5 text-[14px] leading-[1.8] transition-[filter] duration-300', !show && 'blur-[6px] select-none')}>{v}</div>
      {!show && !partial && (
        <button onClick={() => setShow(true)} className="absolute inset-0 top-8 flex items-center justify-center">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-card/90 px-3.5 py-1.5 text-xs font-medium shadow-card backdrop-blur hover:text-sakura"><Icon name="Eye" size={14} />点击显示剧透</span>
        </button>
      )}
    </div>
  );
}

function MiniCards({ ids }) {
  const { go, nsfw } = useApp();
  const list = ids.map(id => DATA.byId[id]).filter(a => a && (!a.nsfw || nsfw));
  return (
    <div className="no-scrollbar -mx-1 flex gap-2.5 overflow-x-auto px-1 py-1">
      {list.map((a, i) => (
        <button key={a.id} onClick={() => go('detail', { id: a.id })} style={{ animationDelay: `${i * 60}ms` }}
          className="group flex w-[232px] shrink-0 items-center gap-3 rounded-xl border border-line bg-card p-2 text-left transition-all duration-200 hover:-translate-y-0.5 hover:border-sakura/45 hover:shadow-cardh pop-in">
          <Cover a={a} className="w-12 shrink-0" rounded="rounded-lg" titleScale={0.35} allowReveal={false} />
          <div className="min-w-0 flex-1">
            <div className="truncate text-[13px] font-semibold group-hover:text-sakura">{a.cn}</div>
            <div className="mt-0.5 truncate text-[11px] text-mut">{a.year} · {a.type} · {a.source}</div>
            <div className="mt-1"><Score v={a.score} /></div>
          </div>
          <Icon name="ChevronRight" size={15} className="text-mut transition-transform group-hover:translate-x-0.5" />
        </button>
      ))}
    </div>
  );
}

function ToolStatus({ tools, step }) {
  return (
    <div className="space-y-1.5">
      {tools.map((t, i) => {
        if (i > step) return null;
        const done = i < step;
        return (
          <div key={i} className={cx('flex items-center gap-2 rounded-lg text-[13px] fade-in', done ? 'text-mut' : 'text-fg')}>
            {done
              ? <span className="grid h-5 w-5 place-items-center rounded-full bg-emerald-500/15 text-emerald-400"><Icon name="Check" size={12} strokeWidth={3} /></span>
              : <span className="relative grid h-5 w-5 place-items-center"><span className="absolute inset-0 rounded-full border-2 border-sakura/25 border-t-sakura spin" /></span>}
            {done ? <span>{t.done}</span> : <span className="shimmer-text">{t.label}</span>}
          </div>
        );
      })}
    </div>
  );
}

function AIMessage({ m }) {
  let left = m.progress;
  const streaming = !m.done;
  const rendered = [];
  for (let i = 0; i < m.blocks.length; i++) {
    if (left <= 0) break;
    const b = m.blocks[i];
    const L = blockLen(b);
    const take = Math.min(L, left);
    left -= take;
    const partial = take < L;
    if (b.t === 'text') rendered.push(<RichText key={i} v={b.v.slice(0, take)} />);
    if (b.t === 'cards') rendered.push(<MiniCards key={i} ids={b.ids} />);
    if (b.t === 'spoiler') rendered.push(<Spoiler key={i} v={b.v.slice(0, take)} partial={partial} />);
  }
  const toolsDone = m.toolStep >= m.tools.length;
  return (
    <div className="flex gap-3 fade-in">
      <div className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-gradient-to-br from-sakura to-ind text-white"><Icon name="Sparkles" size={16} /></div>
      <div className="min-w-0 flex-1 space-y-3.5 pt-0.5 text-fg/90">
        <ToolStatus tools={m.tools} step={m.toolStep} />
        {rendered}
        {streaming && toolsDone && <span className="caret" />}
        {m.stopped && <div className="text-xs text-mut">· 已停止生成</div>}
        {m.done && !m.stopped && <SourceTag source={m.source} />}
        {m.done && (
          <div className="flex gap-1 text-mut">
            {[['Copy', '复制'], ['RefreshCw', '重新生成'], ['ThumbsUp', '有帮助'], ['ThumbsDown', '没帮助']].map(([ic, t]) => (
              <button key={ic} title={t} className="grid h-8 w-8 place-items-center rounded-lg hover:bg-elev hover:text-fg"><Icon name={ic} size={15} /></button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function SourceTag({ source }) {
  if (source.kind === 'local') return (
    <div className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-elev/60 px-2.5 py-1.5 text-xs text-mut">📚 站内数据 <span className="text-line">|</span> 番剧坞动画库</div>
  );
  return (
    <div className="rounded-xl border border-line bg-elev/50 p-3">
      <div className="flex items-center gap-1.5 text-xs font-medium text-mut">🌐 网络搜索 <span className="text-line">·</span> 📚 站内数据</div>
      <div className="mt-2 space-y-1">
        {source.links.map((l, i) => (
          <a key={i} href={l.url} target="_blank" rel="noreferrer" className="flex items-center gap-2 rounded-md px-1 py-1 text-[13px] text-ind hover:bg-elev">
            <span className="grid h-4 w-4 place-items-center rounded bg-ind/15 text-[10px] font-semibold">{i + 1}</span>
            <span className="truncate">{l.title}</span>
            <Icon name="ExternalLink" size={12} className="shrink-0 opacity-70" />
          </a>
        ))}
      </div>
    </div>
  );
}

window.AIPage = AIPage;
