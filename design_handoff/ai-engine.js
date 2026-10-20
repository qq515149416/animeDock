// AI 助手 mock 引擎：根据提问返回结构化回复
(function () {
  const D = window.DATA;
  const top = (arr, n) => arr.slice(0, n);
  const ids = (arr) => arr.map(a => a.id);

  function reply(prompt, opts = {}) {
    const p = prompt.trim();
    const pool = D.list.filter(a => !a.nsfw || opts.nsfw);
    const today = D.todayWeekday();
    const season = D.currentSeason();

    // 关于某部作品
    if (opts.about || /《(.+?)》/.test(p)) {
      let a = opts.about ? D.byId[opts.about] : null;
      if (!a) { const m = p.match(/《(.+?)》/); a = pool.find(x => x.cn === m[1] || x.cn.includes(m[1])); }
      if (a) {
        const sim = pool.filter(x => x.id !== a.id && x.genres.some(g => a.genres.includes(g))).sort((x, y) => y.score - x.score);
        return {
          tools: [{ label: '正在检索站内动画库…', done: `已找到《${a.cn}》的条目信息` }, { label: '正在汇总观众评价…', done: '已分析 2,318 条短评' }],
          blocks: [
            { t: 'text', v: `**《${a.cn}》**（${a.jp}）是 ${a.studio} 制作的${a.year} 年${D.SEASON_NAME[a.season]}季${a.source === '原创' ? '原创' : a.source}${a.type}，导演为${a.director}。目前站内评分 **${a.score.toFixed(1)}**，排名 #${a.rank}。` },
            { t: 'cards', ids: [a.id] },
            { t: 'text', v: `**一句话概括：**${a.desc}\n\n**值得看吗？**\n· 如果你喜欢${a.genres.join('、')}题材，这部基本是必看级别；\n· 节奏上前三话偏慢热，建议至少看到第 3 话再决定；\n· 观众普遍称赞的是作画和配乐，争议点在于中段的支线略拖沓。` },
            { t: 'spoiler', v: `关于结局：主角最终发现，故事开头那个看似无关的配角，其实正是一切的起点。第 ${Math.max(2, a.eps - 1)} 话的反转被很多人评为「本季最佳单集」。` },
            { t: 'text', v: '如果看完意犹未尽，可以试试这几部风格相近的：' },
            { t: 'cards', ids: ids(top(sim, 4)) },
          ],
          source: { kind: 'local' },
        };
      }
    }

    if (/2025/.test(p) && /漫画改/.test(p)) {
      const r = pool.filter(a => a.year === 2025 && a.source === '漫画改').sort((a, b) => b.score - a.score);
      return {
        tools: [{ label: '正在检索站内动画库…', done: `筛选条件：2025 年 · 漫画改 · 按评分排序，命中 ${r.length} 部` }],
        blocks: [
          { t: 'text', v: `根据站内数据，2025 年播出的漫画改编动画中，评分最高的是这几部：` },
          { t: 'cards', ids: ids(top(r, 5)) },
          { t: 'text', v: r.slice(0, 3).map((a, i) => `**${i + 1}. ${a.cn}**（${a.score.toFixed(1)}）\n${a.desc.slice(0, 46)}…`).join('\n\n') },
          { t: 'text', v: `其中 **${r[0] ? r[0].cn : ''}** 是 2025 年口碑最稳的一部，几乎没有低分集。如果你偏好轻松向，可以从 **${r.find(a => a.genres.includes('日常'))?.cn || r[1]?.cn}** 入坑。\n\n需要我按「完结 / 连载」或者具体类型再细分一下吗？` },
        ],
        source: { kind: 'local' },
      };
    }

    if (/CLANNAD|催泪|哭|感人|泪/i.test(p)) {
      const pick = [26, 27, 28, 39, 1].map(id => D.byId[id]);
      return {
        tools: [
          { label: '正在检索站内动画库…', done: '已匹配标签：治愈 · 恋爱 · 家庭 · 催泪' },
          { label: '正在联网搜索相关讨论…', done: '已参考 3 个网络来源' },
        ],
        blocks: [
          { t: 'text', v: '懂你！如果你喜欢的是 CLANNAD 那种「**日常铺垫 → 后劲巨大**」的催泪方式，站内最接近的是这一系列：' },
          { t: 'cards', ids: [26, 27] },
          { t: 'text', v: '**《樱之丘的约定》**同样是视觉小说改编，前半段是轻松的校园群像，几乎每条角色线都有一个让人鼻酸的收尾。而真正的重头戏在续作 **After Story**——它把故事从校园延伸到了成家、立业、为人父母，这也是它被称为「人生」的原因。' },
          { t: 'spoiler', v: 'After Story 第 18 话「大地的尽头」中，主角在雪夜里失去了最重要的人。很多观众表示「看到这一话，整个人都停住了」。之后的父女线是全片泪点最密集的部分。' },
          { t: 'text', v: '如果想要篇幅短一点、但同样催泪的，可以看看这几部剧场版和原创番：' },
          { t: 'cards', ids: [28, 39, 1] },
          { t: 'text', v: '· **时之栞**：跨越二十年的书信恋爱，结尾的「回信」非常戳人；\n· **宇宙尽头的烟火**：AI 与最后一位乘客的故事，适合一个人安静地看；\n· **星屑邮差**：本季新番，单元剧形式，几乎每集都能哭一次。' },
        ],
        source: { kind: 'web', links: [
          { title: 'Bangumi 番组计划 · 「催泪向」标签', url: 'https://bgm.tv/anime/tag/催泪' },
          { title: '知乎 · 有哪些和 CLANNAD 一样后劲很大的动画？', url: 'https://www.zhihu.com/' },
          { title: 'Reddit r/anime · Shows that hit like Clannad', url: 'https://www.reddit.com/r/anime/' },
        ] },
      };
    }

    if (/今天|今日/.test(p) && /更新|播|放送/.test(p)) {
      const r = pool.filter(a => a.airing && a.weekday === today).sort((a, b) => D.timeKey(a.time) - D.timeKey(b.time));
      return {
        tools: [{ label: '正在查询今日放送表…', done: `${D.WEEK_FULL[today - 1]} · 共 ${r.length} 部更新` }],
        blocks: [
          { t: 'text', v: `今天是${D.WEEK_FULL[today - 1]}，共有 **${r.length} 部**番剧更新，按播出时间排列：` },
          { t: 'cards', ids: ids(r) },
          { t: 'text', v: r.map(a => `**${a.time}**　${a.cn} · 第 ${D.curEpisode(a)} 话`).join('\n') },
          { t: 'text', v: r.length ? `今晚最值得蹲的是 **${[...r].sort((a, b) => b.score - a.score)[0].cn}**（${[...r].sort((a, b) => b.score - a.score)[0].score.toFixed(1)} 分）。深夜档的番会在次日凌晨播出，记得调好闹钟～` : '今天比较清闲，可以补补旧番。' },
        ],
        source: { kind: 'local' },
      };
    }

    if (/(这|本)(季|季度).*(火|热|新番)|最火|热门/.test(p)) {
      const r = pool.filter(a => a.airing && a.year === season.year && a.season === season.season).sort((a, b) => b.heat - a.heat);
      const [a1, a2, a3] = r;
      return {
        tools: [
          { label: '正在检索站内动画库…', done: `${season.label}共 ${r.length} 部，按热度排序` },
          { label: '正在联网搜索讨论热度…', done: '已参考 2 个网络来源' },
        ],
        blocks: [
          { t: 'text', v: `${season.label}目前讨论度最高的是这几部：` },
          { t: 'cards', ids: ids(top(r, 5)) },
          { t: 'text', v: `**🔥 ${a1.cn}**\n${a1.studio} 原创，${a1.desc.slice(0, 40)}… 开播即登顶站内热度榜，第一话的反转在社区引发了大量讨论。\n\n**${a2.cn}**\n${a2.desc.slice(0, 50)}…\n\n**${a3.cn}**\n${a3.desc.slice(0, 50)}…` },
          { t: 'spoiler', v: `${a1.cn} 第 2 话结尾揭示：所谓「世界终结」其实是一次重置，而所有魔法少女都已经经历过不止一次。` },
          { t: 'text', v: '整体来看，这一季的原创动画表现格外亮眼，续作方面《逆光的投手 第三季》依旧稳定。想看哪一部的详细介绍？' },
        ],
        source: { kind: 'web', links: [
          { title: 'Bangumi 番组计划 · 2026 年 10 月新番', url: 'https://bgm.tv/calendar' },
          { title: 'AniList · Fall 2026 Season', url: 'https://anilist.co/search/anime/this-season' },
        ] },
      };
    }

    // 关键词 / 类型兜底
    const kw = pool.map(a => ({ a, m: window.matchAnime ? window.matchAnime(a, p) : null })).filter(x => x.m).map(x => x.a);
    const g = D.GENRES.find(x => p.includes(x));
    let r = kw.length ? kw : g ? pool.filter(a => a.genres.includes(g)) : [];
    r = r.sort((a, b) => b.score - a.score);
    if (r.length) {
      return {
        tools: [{ label: '正在检索站内动画库…', done: `命中 ${r.length} 部相关作品` }],
        blocks: [
          { t: 'text', v: g && !kw.length ? `站内「${g}」类型评分最高的几部是：` : '我在站内找到了这些相关作品：' },
          { t: 'cards', ids: ids(top(r, 5)) },
          { t: 'text', v: `最推荐 **${r[0].cn}**（${r[0].score.toFixed(1)} 分）：${r[0].desc.slice(0, 60)}…\n\n想要我按年份或评分再筛选一下吗？` },
        ],
        source: { kind: 'local' },
      };
    }
    const hot = pool.filter(a => a.airing).sort((a, b) => b.score - a.score);
    return {
      tools: [{ label: '正在检索站内动画库…', done: '没有精确匹配，改为推荐本季高分作品' }],
      blocks: [
        { t: 'text', v: '没有在站内找到与问题直接对应的作品。不过可以先看看本季口碑最好的几部：' },
        { t: 'cards', ids: ids(top(hot, 4)) },
        { t: 'text', v: '你也可以告诉我更具体的偏好，比如「想看 2020 年后的百合番」「有没有不虐的异世界」，我会帮你精确筛选。' },
      ],
      source: { kind: 'local' },
    };
  }

  window.AIEngine = { reply };
})();
