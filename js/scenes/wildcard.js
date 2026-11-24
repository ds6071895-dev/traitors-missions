/* ------------------------------------------------------------------
   wildcard.js — the moment the game turned on a coin.

   Most banishments are the table's will. Some are not: the Wise One
   overturns a clear majority, a heavy slate's extra vote is the whole
   margin, a change of heart on the revote is what tipped it, or a name
   goes by one single vote. Those are the moments a game is remembered
   by, and they used to pass like any other count. So after the slates,
   and before the banished stand up, the result is checked:

     detect(state)   pure — the wild card in the tally just made, or
                     null. Every screen has the same state, so every
                     screen finds the same one (the test reads it).
     play(scene, w)  staged like a vote: the band builds, the bars come
                     in, WILD CARD lands on a hit, then the camera finds
                     whoever turned it and Claudia says what happened.

   A castle's draw (`f.lot`) is its own ceremony (tie-draw.js) and is
   not played twice. Shared by the round table and the fire.
------------------------------------------------------------------ */
const Wildcard = (() => {

  const nm = (p) => (!p ? 'somebody' : p.local ? 'you' : p.name);
  const NM = (p) => (!p ? '' : p.local ? 'YOU' : p.name.toUpperCase());

  function ranked(counts) {
    return Object.keys(counts || {}).map(id => [id, counts[id]]).sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1));
  }
  // the winner of a count, or null for a tie
  function winner(counts) {
    const r = ranked(counts);
    if (!r.length) return null;
    return r.length > 1 && r[0][1] === r[1][1] ? null : r[0][0];
  }

  function detect(s) {
    const f = s && s.finale;
    const t = f && f.lastTally;
    if (!f || !t || t.stage !== 'name' || f.stage !== 'reveal' || !f.pending || f.lot) return null;
    const by = (id) => (s.players || []).find(p => p.id === id) || null;
    const target = by(f.pending);
    if (!target) return null;
    const counts = t.counts || {};
    const order = ranked(counts);
    const votes = order.reduce((a, x) => a + x[1], 0);

    /* The Wise One, against the room: the table had a clear favourite
       and it was not the name on the overruling slate. */
    if (t.overrule) {
      const top = order[0];
      if (top && top[0] !== f.pending && top[1] >= 2) {
        return { kind: 'overturned', heat: 3, target: f.pending, by: t.overrule, other: top[0],
                 title: 'OVERTURNED',
                 sub: top[1] + ' slates said ' + nm(by(top[0])) + '. One said ' + nm(target) + '.',
                 line: 'The table chose ' + nm(by(top[0])) + '. The Wise One has thrown that out — and ' + nm(target) + ' is going instead.' };
      }
      return null;
    }

    // the heavy slate: take its extra vote away and the result changes
    if (f.heavy && !f.sealed && f.names && f.names[f.heavy] === f.pending) {
      const without = Object.assign({}, counts);
      without[f.pending] = (without[f.pending] || 0) - 1;
      if (winner(without) !== f.pending) {
        return { kind: 'heavy', heat: 3, target: f.pending, by: f.heavy,
                 title: 'THE HEAVY SLATE',
                 sub: nm(by(f.heavy)) + '’s slate counted twice — and it was the difference.',
                 line: 'Without the shield’s double vote, that was ' + (winner(without) ? nm(by(winner(without))) : 'a tie') + '. ' + (by(f.heavy) && by(f.heavy).local ? 'Your' : nm(by(f.heavy)) + '’s') + ' heavy slate decided it.' };
      }
    }

    /* The revote: put back what the swing voters wrote the first time
       (where that name was still on the slate) and see whether the
       answer survives. If it does not, the change of heart decided it. */
    if ((f.nameRound | 0) > 0 && f.prevNames && f.names && !f.sealed) {
      const swung = [];
      const back = Object.assign({}, counts);
      for (const id in f.names) {
        const was = f.prevNames[id], now = f.names[id];
        // only a name that was still on the revote's slate could have been written again
        if (!was || !now || was === now || (f.tied && f.tied.indexOf(was) < 0)) continue;
        swung.push(id);
        back[now] = (back[now] || 0) - 1;
        back[was] = (back[was] || 0) + 1;
      }
      if (swung.length && winner(back) !== f.pending) {
        const names = swung.map(id => nm(by(id)));
        const list = names.length > 1 ? names.slice(0, -1).join(', ') + ' and ' + names[names.length - 1] : names[0];
        return { kind: 'swing', heat: 3, target: f.pending, by: swung[swung.length - 1],
                 title: 'A CHANGE OF HEART',
                 sub: list + (swung.length > 1 ? ' changed their votes' : ' changed their vote') + ' — and that decided it.',
                 line: 'Had ' + list + ' held firm, ' + (winner(back) ? nm(by(winner(back))) + ' would be going' : 'we would be tied again') + '. A change of heart has decided this.' };
      }
    }

    // one vote in it, with a table big enough for that to mean something
    if (order.length > 1 && votes >= 4 && order[0][0] === f.pending && order[0][1] - order[1][1] === 1) {
      return { kind: 'knife', heat: 2, target: f.pending, by: null, other: order[1][0],
               title: 'BY ONE VOTE',
               sub: order[0][1] + ' against ' + order[1][1] + '. ' + nm(by(order[1][0])) + ' survives by a single slate.',
               line: 'One vote. That is all it was. One slate the other way, and it would be ' + nm(by(order[1][0])) + '.' };
    }
    return null;
  }

  async function play(scene, w) {
    if (!w || !scene || !scene._alive) return;
    const s = Session.state;
    const st = scene.stage, music = scene.music;
    const f = s.finale;
    const key = 'wild-' + s.phase + '-' + s.day + '-' + (f.round || 0) + '-' + (f.nameRound || 0);
    const alive = () => scene._alive && Session.state.finale && Session.state.finale.pending === w.target;
    const target = Session.playerById(w.target);
    const turner = w.by ? Session.playerById(w.by) : null;
    const other = w.other ? Session.playerById(w.other) : null;

    // the room stops: bars, edges, a build under Claudia's face
    const t0 = Date.now();
    const build = Scenes.Drama.build(st, music, 'twist', { shot: 'claudia', speed: 0.6, cut: true, ramp: 2.6 });
    Scenes.Cine.card({ kicker: 'Wait', title: '· · ·', tone: 'slate', cls: 'heat-2', sub: 'Something has just happened.' });
    await Scenes.Drama.peak(build, { since: t0, min: 2.0, max: 4.5 });
    if (!alive()) { build.cancel(); return; }
    await Scenes.barrier(key);
    if (!alive()) { build.cancel(); return; }
    const wait = build.release('tie');
    if (wait) await Scenes.wait(wait);
    if (!alive()) return;
    Scenes.Drama.hit(st, null, null, { shake: 0.85, flash: 'rgba(255,190,60,.75)', haptic: 110 });
    Scenes.Cine.card({ kicker: 'WILD CARD', title: w.title, tone: 'bad', cls: 'last heat-3', sub: w.sub });
    if (st && st.act && target) st.act(target.id, 'gasp');
    await Scenes.wait(2.2);
    if (!alive()) return;

    // whoever turned it, then whoever it spared, then the name it fell on
    if (turner && !turner.local) Scenes.Drama.shot(st, 'on:' + turner.id, { cut: true, push: 0.16, speed: 0.4 });
    else if (other && !other.local) Scenes.Drama.shot(st, 'on:' + other.id, { cut: true, push: 0.16, speed: 0.4 });
    await Scenes.run([{ line: { text: w.line }, hold: 0.4 }], scene);
    if (!alive()) return;
    if (other && st && st.setMood) st.setMood(other.id, 'relief');
    if (target && !target.local) Scenes.Drama.shot(st, 'on:' + target.id, { cut: true, push: 0.2, speed: 0.35 });
    if (target && st && st.setMood) st.setMood(target.id, 'nervous');
    await Scenes.wait(1.4);
    Scenes.Cine.card(null);
    Scenes.Drama.end(st, music);
  }

  return { detect, play, winner };
})();
