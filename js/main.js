/* ------------------------------------------------------------------
   main.js — boot, the front screens, results, and the attract-mode
   estate that sits behind the menus.

   Two ways in from the front door. PLAY hands over to `Show`, which
   runs a whole night and owns the screen until it is finished.
   MISSIONS is the practice flow that was here before and is untouched
   by any of it: same briefing, same results, same permanent pot.

   The results screen is the one place they meet. It is the mission's
   own scoreboard either way; in a run its buttons collapse to a single
   Continue, because "race again" is not on offer when there is a round
   table waiting for you.
------------------------------------------------------------------ */
const Game = (() => {

  let attract = null;

  /* ---------------- attract mode ---------------- */

  /* The menu shares the estate's daylight geography and materials, with
     a bounded camera and lighter scenery around the castle. */
  const ATTRACT_COND = { time: 'dusk', sea: 'slight', wind: 0.85 };

  function buildAttract() {
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(58, 1, 0.5, 20000);

    // must run before `Sky.build`: the haze is baked into the vertices
    const hour = Conditions.apply(ATTRACT_COND);
    Estate.atmosphere(false);
    scene.fog = new THREE.Fog(Sky.PALETTE.fog, hour.time.fog.near, hour.time.fog.far);
    scene.add(Conditions.lights(ATTRACT_COND));

    Sky.build(scene, U.makeRng(4242));
    const estate=Estate.build(scene,{seed:4242,lightweight:true});
    let elapsed=0;
    function frame(dt,t){
      elapsed+=dt;
      const move=GameState.data.settings.reducedMotion?0:Math.sin(elapsed*.035)*5;
      camera.position.set(62+move,43,68);camera.lookAt(-30,35,-12);
      estate.update(dt,camera.position,t);Sky.update(dt,camera.position,t);Input.endFrame();
    }

    return { view: { scene, camera }, frame, scene };
  }

  function showAttract() {
    if (!attract) attract = buildAttract();
    /* The water is one module shared with every mission, so whichever
       channel was last raced left its own palette and sea state in it.
       The sky does not need this — its colours were baked into the
       dome when the scene was built — but the sea does, every time. */
    else Estate.atmosphere(false);
    Engine.setView(attract.view, attract.frame);
  }

  function disposeAttract() {
    if (!attract) return;
    Engine.disposeObject(attract.scene);
    attract = null;
    // the preset is global; hand it back the way the missions do
    Sky.resetPreset();
  }

  /* ---------------- pre-race setup ----------------
     The briefing panel is where a run is *chosen*: which channel, which
     mode, which modifier. Everything it shows comes from the mission's own
     `preview()`, so this module never has to know what a sea state is. */

  let setup = null;          // the live setup for whichever mission is briefed
  let setupDef = null;
  // which of the Descent's folded briefing sections are open; every
  // setup change re-renders the panel, so this outlives the elements
  const skiOpen = { options: false, mastery: false };

  // Each mission remembers its own setup: a mode id only means something to
  // the mission that defined it, so one shared blob would leak a shootout
  // mode into the boat race the moment you briefed it.
  function setupStore() {
    if (!GameState.settings.setups) GameState.settings.setups = {};
    return GameState.settings.setups;
  }

  function defaultSetup(def) {
    const saved = (def && setupStore()[def.id]) || {};
    const modes = def && def.modes ? Object.keys(def.modes) : [];
    return {
      seed: Number.isFinite(saved.seed) ? saved.seed : U.dailySeed(),
      mode: modes.includes(saved.mode) ? saved.mode : (modes[0] || 'prize'),
      tod: saved.tod || 'auto',
      modId: saved.modId || null,
      ghost: saved.ghost !== false,
      ...(def.id === 'ski' ? { section: saved.section || null, quality: saved.quality || 'medium', reducedMotion: saved.reducedMotion !== false, motion: saved.motion || null } : {}),
    };
  }

  function saveSetup() {
    if (!setupDef) return;
    setupStore()[setupDef.id] = Object.assign({}, setup);
    GameState.save();
  }

  function setSetup(patch, opts = {}) {
    if (setupDef && setupDef.id === 'ski' && (patch.seed !== undefined || patch.tod !== undefined || patch.modId !== undefined)) delete setup.conditions;
    Object.assign(setup, patch);
    saveSetup();
    if (!opts.quiet) AudioBus.play('ui-click');
    renderSetup();
  }

  function renderSetup() {
    const panel = document.getElementById('brief-setup');
    if (!setupDef || !setupDef.setup) { panel.style.display = 'none'; return; }
    panel.style.display = '';
    let p = setupDef.preview(setup);

    // The hand is dealt from the seed, so a new channel deals new cards and a
    // modifier you were holding may simply not be on the table any more. This
    // has to be checked on every render, not just when the seed box changes:
    // the daily seed rolls over on its own while a choice sits in the save.
    if (setup.modId && !p.hand.some(m => m.id === setup.modId)) {
      setup.modId = null;
      saveSetup();
      p = setupDef.preview(setup);
    }

    // --- mode ---
    const modeWrap = document.getElementById('setup-mode');
    modeWrap.innerHTML = '';
    for (const m of Object.values(setupDef.modes)) {
      const b = document.createElement('button');
      b.className = 'seg-btn' + (m.id === setup.mode ? ' on' : '');
      b.textContent = m.name;
      b.onclick = () => setSetup({ mode: m.id });
      modeWrap.appendChild(b);
    }
    document.getElementById('setup-mode-note').textContent = p.mode.blurb;
    for (const id of ['ski-setup-extra', 'ski-setup-section', 'ski-fav']) {
      const old = document.getElementById(id); if (old) old.remove();
    }
    /* The Descent has more to set than any other mission, and it used to
       say all of it at once as a column of bare dropdowns. It now uses
       the briefing's own parts: the one choice practice needs sits under
       the mode, the star sits with the seed it saves, and the settings
       you set once fold away under the rest. */
    if (setupDef.id === 'ski') {
      const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
      const chip = (parent, label, on, fn) => {
        const b = el('button', 'chip' + (on ? ' on' : ''), label);
        b.setAttribute('aria-pressed', String(!!on)); b.onclick = fn; parent.appendChild(b); return b;
      };
      const field = (parent, label, wide) => {
        const f = el('div', 'sx-field' + (wide ? ' sx-wide' : ''));
        if (label) f.appendChild(el('span', 'dr-label', label));
        parent.appendChild(f); return f;
      };
      const select = (parent, label, entries, value, change, showLabel = true) => {
        const input = el('select', 'dr-select'); input.setAttribute('aria-label', label);
        for (const [id, name] of entries) { const option = el('option', null, name); option.value = id; input.appendChild(option); }
        input.value = value; input.onchange = () => change(input.value);
        field(parent, showLabel ? label : null).appendChild(input);
      };
      const progress = SkiProgression.read();

      if (setup.mode === 'practice') {
        const section = el('div', 'setup-block'); section.id = 'ski-setup-section';
        section.appendChild(el('div', 'setup-head', 'Section'));
        select(section, 'Practice section', [['', 'Full mountain'], ...SkiCourse.catalog.map(s => [s.id, s.name])],
          setup.section || '', v => setSetup({ section: v || null }), false);
        modeWrap.parentElement.after(section);
      }

      const seed = Number(p.opts.seed);
      const saved = progress.favourites.includes(seed);
      const fav = chip(document.querySelector('#brief-setup .channel-seed'), saved ? '★' : '☆', saved,
        () => { SkiProgression.favourite(seed); setSetup({}); });
      fav.id = 'ski-fav';
      fav.title = saved ? 'In your favourite mountains' : 'Save this mountain to your favourites';
      fav.setAttribute('aria-label', fav.title);

      const extra = el('div'); extra.id = 'ski-setup-extra';
      // a daily is a scored run, which is exactly what practice is not
      if (setup.mode !== 'practice') {
        const daily = el('div', 'setup-block');
        daily.appendChild(el('div', 'setup-head', 'Today\'s runs'));
        const row = el('div', 'sx-row');
        for (const d of SkiProgression.daily()) {
          chip(row, SkiMission.MODES[d.mode].name, !!setup.daily && setup.mode === d.mode && seed === d.seed, () => setSetup(d));
        }
        daily.appendChild(row); extra.appendChild(daily);
      }

      const fold = (key, head, sub, build) => {
        const toggle = el('button', 'sx-toggle');
        toggle.append(el('span', 'setup-head', head), el('span', 'setup-sub', sub));
        const body = el('div', 'sx-body'); build(body);
        const paint = () => { body.hidden = !skiOpen[key]; toggle.setAttribute('aria-expanded', String(skiOpen[key])); };
        toggle.onclick = () => { skiOpen[key] = !skiOpen[key]; paint(); AudioBus.play('ui-click'); UINav.scan(); };
        paint(); extra.append(toggle, body);
      };

      fold('options', 'Options', 'graphics · motion · look', body => {
        const grid = el('div', 'sx-grid');
        const seg = (label, entries, value, change) => {
          const s = el('div', 'seg');
          for (const [id, name] of entries) { const b = el('button', 'seg-btn' + (id === value ? ' on' : ''), name); b.onclick = () => change(id); s.appendChild(b); }
          field(grid, label).appendChild(s);
        };
        seg('Graphics', [['low', 'Low'], ['medium', 'Med'], ['high', 'High']], setup.quality || 'medium', quality => setSetup({ quality }));
        seg('Motion', [['reduced', 'Reduced'], ['full', 'Full']], setup.reducedMotion === false ? 'full' : 'reduced',
          v => setSetup({ reducedMotion: v !== 'full', motion: null }));
        const motion = setup.motion || Object.fromEntries(['shake', 'roll', 'speed', 'flashes'].map(k => [k, setup.reducedMotion === false]));
        const effects = el('div', 'sx-row');
        for (const [key, label] of [['shake', 'Shake'], ['roll', 'Roll'], ['speed', 'Speed lines'], ['flashes', 'Flashes']]) {
          chip(effects, label, motion[key], () => setSetup({ motion: { ...motion, [key]: !motion[key] } }));
        }
        field(grid, 'Camera effects', true).appendChild(effects);
        const unlocked = SkiProgression.rewards.map((name, i) => [String(i), name]).filter((_, i) => SkiProgression.challenges.filter(c => c.reward === i).every(c => progress.done.includes(c.id)));
        select(grid, 'Look', [['-1', 'Original look'], ...unlocked], String(progress.equipped), v => { progress.equipped = Number(v); SkiProgression.save(progress); });
        if (progress.favourites.length) {
          select(grid, 'Favourites', [...(saved ? [] : [['', 'Pick a mountain']]), ...progress.favourites.map(n => [String(n), U.courseName(n)])],
            saved ? String(seed) : '', v => { if (v) setSetup({ seed: Number(v) }); });
        }
        body.appendChild(grid);
      });

      fold('mastery', 'Mastery', progress.done.length + '/' + SkiProgression.challenges.length, body => {
        const list = el('ul', 'sx-mastery');
        for (const c of SkiProgression.challenges) {
          const li = el('li', progress.done.includes(c.id) ? 'done' : null, c.name);
          li.appendChild(el('i', null, String(c.target))); list.appendChild(li);
        }
        body.appendChild(list);
      });

      document.getElementById('brief-setup').appendChild(extra);
    }


    // --- the place you are about to play ---
    const labels = setupDef.setupLabels || {};
    document.getElementById('setup-course-head').textContent = labels.course || 'Channel';
    document.getElementById('setup-mod-head').innerHTML =
      (labels.modifier || 'Modifier') + ' <span class="setup-sub">keep one, or none</span>';
    document.getElementById('setup-name').textContent = p.name;
    document.getElementById('setup-cond').innerHTML =
      `<span>${p.conditionText}</span>` + (p.opts.daily ? '<b class="tag-today">TODAY</b>' : '');
    /* One optional line of the mission's own, under the conditions. The
       descent uses it for the running order of the mountain — which is
       the single most useful thing a briefing can show, because the
       difference between two mountains is not the weather, it is
       whether the glades come before or after the cliffs. Any mission
       that has nothing to add simply does not set it. */
    const shape = document.getElementById('setup-shape');
    if (shape) {
      shape.innerHTML = p.shape || '';
      shape.classList.toggle('show', !!p.shape);
    }
    const seedInput = document.getElementById('setup-seed');
    if (document.activeElement !== seedInput) seedInput.value = String(p.opts.seed);
    document.getElementById('setup-daily').classList.toggle('on', p.opts.daily);

    // --- time of day, for a mission that has an opinion about the hour ---
    const todRow = document.getElementById('setup-tod-row');
    const todNote = document.getElementById('setup-tod-note');
    const tods = setupDef.todOptions;
    todRow.style.display = tods ? '' : 'none';
    todNote.style.display = tods ? '' : 'none';
    if (tods) {
      const wrap = document.getElementById('setup-tod');
      wrap.innerHTML = '';
      // the preview is the authority on what was actually chosen: `auto`
      // resolves to an hour the mission keeps, not to one the panel knows
      const cur = p.opts.tod;
      for (const t of tods) {
        const b = document.createElement('button');
        b.className = 'chip' + (t.id === cur ? ' on' : '');
        b.textContent = t.name;
        b.title = t.blurb || '';
        b.onclick = () => setSetup({ tod: t.id });
        wrap.appendChild(b);
      }
      const chosen = tods.find(t => t.id === cur);
      todNote.textContent = chosen ? chosen.blurb : '';
    }

    // --- the hand ---
    const hand = document.getElementById('setup-mods');
    hand.innerHTML = '';
    for (const m of p.hand) {
      const card = document.createElement('button');
      const on = setup.modId === m.id;
      card.className = 'mod-card' + (on ? ' on' : '');
      card.innerHTML = `
        <div class="mod-icon">${m.icon}</div>
        <div class="mod-body">
          <div class="mod-name">${m.name}<span class="mod-pay">×${m.payout.toFixed(2)}</span></div>
          <div class="mod-blurb">${m.blurb}</div>
        </div>`;
      card.onmouseenter = () => AudioBus.play('ui-hover');
      // clicking the card you already hold puts it back down
      card.onclick = () => setSetup({ modId: on ? null : m.id });
      hand.appendChild(card);
    }

    // --- ghost + record ---
    const ghostBox = document.getElementById('setup-ghost');
    ghostBox.checked = !!setup.ghost;
    ghostBox.disabled = !p.hasGhost;
    document.getElementById('setup-ghost-label').textContent =
      p.hasGhost ? 'Race my ghost' : 'No ghost on this setup yet';

    const best = p.record && p.record.best;
    const medal = p.record && p.record.medal ? setupDef.medals[p.record.medal] : null;
    // only the mission knows whether its record is a time or a purse
    const bestText = best ? (p.bestText || U.money(best.earned || 0)) : null;
    document.getElementById('setup-best').innerHTML = bestText
      ? `<span class="sb-lbl">Your best here</span><b>${bestText}</b>`
        + (medal ? `<i class="sb-medal" style="--mc:${medal.color}">${medal.name}</i>` : '')
      : '<span class="sb-lbl">No run on this setup yet</span>';

    document.getElementById('brief-mult').textContent =
      Math.abs(p.payout - 1) > 0.03 ? '×' + p.payout.toFixed(2) : '';
  }

  function openBrief(def, opts) {
    setupDef = def;
    setup = Object.assign(defaultSetup(def), opts || {});
    Screens.show('brief', def);
  }

  /* ---------------- title screen ---------------- */

  /* The missions screen is also the mission party's front door: each
     implemented mission has its own invitation button, so there is no
     separate menu that makes you choose the mission twice. */

  function renderMissionList() {
    const note = document.getElementById('mission-note');
    if (note) {
      note.textContent = 'Solo practice, or hit INVITE and play one with two friends.';
    }
    const list = document.getElementById('mission-list');
    list.className = 'mission-list';
    list.innerHTML = '';
    for (const m of Missions.all()) {
      const rec = GameState.data.missions[m.id];
      const row = document.createElement('div');
      row.className = 'mission-card-row';
      const card = document.createElement('button');
      card.className = 'mission-card' + (m.locked ? ' locked' : '');
      card.disabled = !!m.locked;
      const best = rec && rec.best ? U.money(rec.best.earned) : '—';
      card.innerHTML = `
        <div class="mc-icon">${m.icon}</div>
        <div class="mc-body">
          <div class="mc-title">${m.name}${m.locked ? '<span class="mc-lock">LOCKED</span>' : ''}</div>
          <div class="mc-tagline">${m.tagline}</div>
          <div class="mc-meta">
            <span>${m.players}</span><span>${m.duration}</span>
            <span>Up to ${U.money(m.maxPrize)}</span>
          </div>
        </div>
        <div class="mc-best"><span class="lbl">BEST</span><span class="val">${best}</span></div>`;
      if (!m.locked) {
        card.addEventListener('mouseenter', () => AudioBus.play('ui-hover'));
        card.addEventListener('click', () => {
          AudioBus.resume(); AudioBus.play('ui-click');
          startMission(m.id);
        });
      }
      row.appendChild(card);

      if (!m.locked) {
        const side = document.createElement('div');
        side.className = 'mission-side';

        if (m.quickStart) {
          const quick = document.createElement('button');
          quick.className = 'mission-quick';
          quick.innerHTML = `<span class="mq-icon">${m.quickStart.icon || '◆'}</span>`
                          + `<span>${m.quickStart.label}</span>`;
          quick.title = m.quickStart.title || m.quickStart.label;
          quick.addEventListener('mouseenter', () => AudioBus.play('ui-hover'));
          quick.addEventListener('click', () => {
            AudioBus.resume(); AudioBus.play('ui-click');
            const opts = Object.assign(defaultSetup(m), m.quickStart.opts || {});
            launch(m.id, opts);
          });
          side.appendChild(quick);
        }

        /* One button, one room, one link. It does not ask which mission
           — you pressed it on the mission. */
        const invite = document.createElement('button');
        invite.className = 'mission-invite';
        invite.title = 'Open a room for ' + m.name + ' and get a link to send';
        invite.innerHTML = '<span class="mi-icon">⌾</span><span>Invite</span>';
        invite.addEventListener('mouseenter', () => AudioBus.play('ui-hover'));
        invite.addEventListener('click', () => {
          AudioBus.resume(); AudioBus.play('ui-click');
          Screens.transition(() => MissionParty.openFor(m.id), 320);
        });
        side.appendChild(invite);

        row.appendChild(side);
      }
      list.appendChild(row);
    }
    document.getElementById('pot-value').textContent = U.money(GameState.prizePot);
  }

  function startMission(id) {
    openBrief(Missions.get(id));
  }

  function launch(id, opts) {
    Screens.transition(() => {
      disposeAttract();
      Missions.end();
      Screens.hideAll();
      Missions.launch(id, opts);
    });
  }

  /* Leaving mid-mission means two different things. In practice it is
     "back to the list"; in a run it is walking out on the night, so the
     run is ended and the save with it — coming back to a half-finished
     evening you have already abandoned would be worse than losing it. */
  function toMenu() {
    if (typeof Show !== 'undefined' && Show.running) {
      Show.end({ abandon: true });
      toPlay();
      return;
    }
    Screens.transition(() => {
      Missions.end();
      Engine.setPaused(false);
      showAttract();
      renderMissionList();
      Screens.show('title');
    });
  }

  /* The missions list offers solo play and an invite beside each mission. */
  function toMissions() {
    AudioBus.resume();
    AudioBus.play('ui-click');
    Screens.transition(() => {
      Missions.end();
      Engine.setPaused(false);
      showAttract();
      renderMissionList();
      Screens.show('title');
    }, 320);
  }

  /* ---------------- results ---------------- */

  /* What this client sends the host about its own run. A mission that
     wants a say in the board provides `report(result)`; anything that
     does not still turns up on it with a name and a number, because a
     player missing from the board reads as a bug rather than a mission
     that has not been taught to fill one in. */
  function reportFor(def, r) {
    /* The name travels with the report. A night could look one up in
       the session; a mission party has no session, and a board of three
       rows all called "—" was what that cost. */
    const base = {
      name: Look.getName() || 'Player',
      earned: Math.max(0, Math.round(r.earned || 0)),
      completed: !!r.completed,
      place: r.place || null,
      columns: [], cells: [], stats: {},
    };
    if (!def || typeof def.report !== 'function') return base;
    try { return Object.assign(base, def.report(r) || {}); }
    catch (e) { console.warn('mission report failed:', e); return base; }
  }

  /* The task, marked, at the bottom of the mission's own scoreboard.

     Nobody but the Traitor ever has a card, so nobody but the Traitor
     ever sees this block — `Session.myAgenda()` is null for everybody
     else.

     The deck is voice: there is no check here, and there is none on the
     host either. What this does is close the book. Reading the card's
     state with `final` latches the marking window shut for good, so
     this panel is also the moment the decision stops being available —
     and it prints, in words, which of the two things you chose. A
     Traitor who marked it walks into the fire; a Traitor who did not
     walks into an exposure and does not know it yet. */
  function paintTask(def, r) {
    const box = document.getElementById('result-task');
    if (!box) return;
    box.hidden = true;
    box.innerHTML = '';
    if (typeof Session === 'undefined' || !Session.myAgenda
        || typeof Agendas === 'undefined') return;
    const card = Session.myAgenda();
    if (!card) return;
    const st = Agendas.state(card.id, null, true);
    if (!st) return;
    const esc = (v) => String(v === undefined || v === null ? '' : v)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    box.className = 'result-task ' + (st.done ? 'done' : 'failed');
    box.innerHTML =
        '<div class="rt-head">Your task</div>'
      + '<div class="rt-text">' + esc(card.text || st.task) + '</div>'
      + '<div class="rt-state">'
      + (st.done ? 'MARKED — you said you said it'
                 : 'NOT MARKED — you left it undone')
      + '</div>';
    box.hidden = false;
  }

  function showResults({ def, opts, result, isBest }) {
    const r = result;
    // the scoreboard is the mission's own language — gates and knots mean
    // nothing to a bow — so the mission writes its own rows
    const rows = (def.resultRows ? def.resultRows(r) : []).filter(x => x !== undefined);

    document.getElementById('result-title').textContent =
      r.completed ? 'MISSION COMPLETE' : (r.reason || 'MISSION FAILED');
    document.getElementById('result-title').className =
      'result-title ' + (r.completed ? 'win' : 'lose');
    document.getElementById('result-sub').textContent = def.name;

    // which channel this was, so a good one can be written down
    const course = document.getElementById('result-course');
    if (r.courseName) {
      const ghost = r.ghostDelta === null || r.ghostDelta === undefined ? ''
        : `<span class="rc-ghost ${r.ghostDelta <= 0 ? 'ahead' : 'behind'}">${
            r.ghostDelta <= 0 ? '−' : '+'}${Math.abs(r.ghostDelta).toFixed(2)}s vs ghost</span>`;
      course.innerHTML = `<b>${r.courseName}</b><span>${r.modeName} · ${r.conditionText}${
        r.modName ? ' · ' + r.modName : ''}</span><span class="rc-seed">seed ${r.seed}</span>${ghost}`;
    } else course.innerHTML = '';

    const medalEl = document.getElementById('result-medal');
    const medal = def.medals && r.medal ? def.medals[r.medal] : null;
    medalEl.className = 'result-medal' + (medal ? ' show' : '');
    if (medal) {
      medalEl.textContent = medal.name.toUpperCase();
      medalEl.style.setProperty('--mc', medal.color);
    }

    const tbl = document.getElementById('result-rows');
    tbl.innerHTML = rows.map(row => row === null
      ? '<div class="rr-sep"></div>'
      : `<div class="rr"><span>${row[0]}</span><b>${row[1]}</b></div>`).join('');

    // "best" here means best on this exact channel, which is the only
    // comparison that means anything now that channels differ
    document.getElementById('result-best').classList.toggle('show', !!r.courseBest);

    paintTask(def, r);

    /* In a run there is nowhere to go but onward, so the three practice
       buttons collapse to one. The mission engine does not know the
       difference and should not have to. */
    const inRun = typeof Show !== 'undefined' && Show.running;
    /* A mission party is neither of the two cases this screen was
       built for. There is nothing onward to go to — no table, no fire —
       but "race again" would silently drop the other two, so it gets
       the run's single button pointed back at the room they are all
       still sitting in. */
    const inParty = !inRun && typeof MissionParty !== 'undefined' && MissionParty.running;

    /* -------- the money, counted into the right pot --------

       There are two pots and this screen used to know about one of
       them. Practice and a mission party bank straight into the
       permanent pot, and `Missions.complete` has already done it by
       the time this runs — so "before" is what is there now, less what
       you just won.

       A night does not touch that pot at all. `Show` swaps the sink
       for a hole and the night's takings go into `Session.state.pot`,
       which is only banked if the night is survived. Reading
       `GameState.prizePot` in a run therefore counted from your
       lifetime total minus tonight's mission up to your lifetime total
       — which on a first night is a negative number counting up to
       zero, and reads, correctly, as nothing having been added.

       The other half is *whose* money. A night's pot is what the three
       of you managed between you, so the number that goes in is the
       board's total and not your own row. The board arrives a moment
       later than this screen does, so the count starts on your own
       figure and is re-run when the real one lands. */
    const earnedEl = document.getElementById('result-earned');
    const potEl = document.getElementById('result-pot');
    const sessionPot = inRun && Session.state ? Session.state.pot : 0;
    /* Three pots, not two. Practice has already banked your winnings
       by the time this runs, so "before" is what is there now less what
       you just made. A night banks nothing here at all. And a mission
       party holds its sink shut until the board lands and then pays the
       room's total, so nothing has gone in yet and the pot on screen is
       simply the pot. */
    const potBefore = inRun ? sessionPot
                    : (inParty ? GameState.prizePot : GameState.prizePot - r.earned);
    const countMoney = (target) => {
      let shown = 0, i = 0;
      clearInterval(showResults._t);
      earnedEl.textContent = U.money(0);
      potEl.textContent = U.money(potBefore);
      if (target <= 0) { earnedEl.textContent = U.money(0); return; }
      showResults._t = setInterval(() => {
        i++;
        shown = Math.min(target, shown + Math.max(1, Math.ceil(target / 34)));
        earnedEl.textContent = U.money(shown);
        potEl.textContent = U.money(potBefore + shown);
        AudioBus.play('money', { index: i });
        if (shown >= target) clearInterval(showResults._t);
      }, 45);
    };
    countMoney(Math.max(0, Math.round(r.earned || 0)));

    /* Two buttons and two quiet links: going again and going back are
       the choices nearly everyone makes, so only those are buttons. */
    for (const id of ['result-retry', 'result-menu', 'result-more']) {
      document.getElementById(id).hidden = inRun || inParty;
    }
    // practice earns nothing, so it says nothing about the pot either
    const practising = def.id === 'ski' && r.mode === 'practice';
    document.getElementById('result-retry').textContent = practising ? 'Practice again' : 'Race again';
    earnedEl.parentElement.hidden = potEl.parentElement.hidden = practising;
    const practiceButton = document.getElementById('result-practice-ski');
    practiceButton.hidden = def.id !== 'ski' || practising;
    practiceButton.onclick = () => {
      AudioBus.play('ui-click');
      const section = r.routeSplits && r.routeSplits.length ? r.routeSplits[r.routeSplits.length - 1].id : null;
      Screens.transition(() => { Missions.end(); Screens.hideAll(); Missions.launch('ski', { ...opts, mode: 'practice', section }); });
    };
    const cont = document.getElementById('result-continue');
    const boardEl = document.getElementById('result-board');
    cont.hidden = !inRun && !inParty;
    boardEl.hidden = true;

    if (inParty) {
      /* Handed over before anything is waited on, so a tab closed in
         the middle of the wait still pays for the run it played. */
      MissionParty.owe(r.earned);
      const arm = (board) => {
        /* The room's money, banked once, here — and the same figure on
           all three machines, because it is the board's total rather
           than whichever row happens to be yours. The counter started
           on your own score a moment ago because that is all this
           machine knew; now that the room has reported, it counts the
           room. */
        const total = MissionParty.bank(board, r.earned);
        if (total !== Math.max(0, Math.round(r.earned || 0))) countMoney(total);
        if (board) {
          boardEl.style.setProperty('--bd-cols', String(RoomUI.boardCols(board)));
          boardEl.innerHTML = '<div class="rb-head">Everybody\'s run</div>'
                            + '<div class="board-grid">' + RoomUI.boardHTML(board) + '</div>';
          boardEl.hidden = false;
        }
        cont.textContent = 'Back to the room';
        cont.disabled = false;
        cont.onclick = () => {
          AudioBus.play('ui-click');
          cont.disabled = true;
          MissionParty.backToRoom();
        };
        UINav.scan();
      };
      if (MissionNet.live) {
        cont.textContent = 'Waiting for the others…';
        cont.disabled = true;
        cont.onclick = null;
        /* The host is the one that collects the board and it has its
           own patience for a straggler. Nothing collects it if the
           host itself walked out mid-mission, though, and a button
           that says "waiting" forever is worse than a scoreboard with
           only your own name on it. */
        let done = false;
        const once = (board) => { if (done) return; done = true; arm(board); };
        MissionNet.report(reportFor(def, r)).then(once);
        setTimeout(() => once(null), MissionNet.BOARD_WAIT);
      } else {
        arm(null);
      }
    }

    if (inRun) {
      const arm = (board) => {
        const run = Show.resultsAction(r, board);
        if (!run) return;
        if (board) {
          /* The pot is the three of you, so it is the board's total
             that goes in — and now that it is here, it is what the
             counter should have been showing. Only re-run it if it
             actually disagrees: restarting an identical count is a
             flicker with nothing behind it. */
          const total = Math.max(0, Math.round(board.earned || 0));
          if (total !== Math.max(0, Math.round(r.earned || 0))) countMoney(total);
          boardEl.style.setProperty('--bd-cols', String(RoomUI.boardCols(board)));
          boardEl.innerHTML = '<div class="rb-head">Everybody\'s night</div>'
                            + '<div class="board-grid">' + RoomUI.boardHTML(board) + '</div>';
          boardEl.hidden = false;
        }
        cont.textContent = run.label;
        cont.onclick = () => {
          AudioBus.play('ui-click');
          cont.disabled = true;
          cont.textContent = 'Waiting for everybody…';
          run.go();
        };
        cont.disabled = false;
        UINav.scan();
      };

      /* Three people played that mission, so the pot is not known until
         all three have reported. Until then there is nothing to press:
         a Continue that banked only your own share would be wrong on
         two machines out of three. */
      if (MissionNet.live) {
        cont.textContent = 'Waiting for the others…';
        cont.disabled = true;
        cont.onclick = null;
        /* Same guard as the mission party above, and for the same
           reason: nothing collects a board if the host walked out
           mid-mission, and a night that can never be continued is a
           night that ends here. The solo fallback in
           `Show.resultsAction` banks your own run instead. */
        let done = false;
        const once = (board) => { if (done) return; done = true; arm(board); };
        MissionNet.report(reportFor(def, r)).then(once);
        setTimeout(() => once(null), MissionNet.BOARD_WAIT);
      } else {
        /* A rehearsal night has nobody else in the mission, so nothing
           publishes a board — but the round table it is walking towards
           is an argument about one. `Bots` draws the other two rows
           around your own so the room it opens has something in it. */
        arm(typeof Bots !== 'undefined' && Bots.running
            ? Bots.board(reportFor(def, r)) : null);
      }
    }

    Screens.show('results', { def });
    showResults._def = def;
    showResults._opts = opts;
  }

  /* ---------------- the front door ---------------- */

  function renderPlay() {
    document.getElementById('play-pot').textContent = U.money(GameState.prizePot);
    const you = document.getElementById('play-you');
    if (you) you.textContent = Look.getName() || 'You';

    syncMuteChip();
    voicesDrawn = 0;
    renderVoices();
  }

  function syncMuteChip() {
    const b = document.getElementById('play-mute');
    if (b) {
      b.textContent = AudioBus.muted ? 'Sound off' : 'Sound on';
      b.classList.toggle('on', !AudioBus.muted);
    }
  }

  /* Claudia's voice used to be a dropdown on the front door, and it was
     the wrong thing to put there: a list of forty system voices with
     names like `Microsoft David Desktop` is not a choice anybody wants
     to make before a game, and it was the only control on the screen
     that could not be understood at a glance.

     `voice.js` still picks the best one it can find, and a saved
     preference is still honoured — this is only the picker going away.
     The list is still nudged into loading, because Chrome hands back
     an empty one until something asks. */
  let voicesDrawn = 0;
  function renderVoices() {
    if (!Voice.supported) return;
    if (!Voice.list().length && voicesDrawn++ < 6) setTimeout(renderVoices, 400);
  }

  function toPlay() {
    Screens.transition(() => {
      if (typeof Show !== 'undefined' && Show.running) Show.end();
      Engine.setPaused(false);
      Missions.end();
      showAttract();
      Screens.show('play');
    });
  }

  /* The front door goes to the lobby now, not into a night. There is
     nobody to play with until three people are in a room, so PLAY is a
     door rather than a start button.

     It used to take a mode and open a room on the way through when
     that mode was `host`, which is how the front door came to have a
     CREATE ROOM on it. It does not take one any more: opening a room
     is a thing you do in the lobby by pressing the button that says
     so, and there is now exactly one way to do it. */
  function toLobby() {
    AudioBus.resume();
    Voice.unlock();
    AudioBus.play('ui-click');
    Screens.transition(() => {
      if (typeof Show !== 'undefined' && Show.running) Show.end({ abandon: true });
      Missions.end();
      showAttract();
      Screens.show('lobby');
    }, 320);
  }

  function toDressing() {
    AudioBus.resume();
    AudioBus.play('ui-click');
    Screens.transition(() => Screens.show('dressing', { from: 'play' }), 320);
  }

  /* ---------------- somebody left ----------------
     A room is three people. There is no fourth waiting to be dealt in,
     no rejoining a night halfway through and no sensible way to run a
     round table with an empty chair — so when one of the three goes,
     the room goes with them, for everybody, immediately.

     Doing anything else was worse than it sounds. The night carried on
     around a player who could not vote, the host kept broadcasting
     phases to a peer that was not there, and the two who were left
     found out at the round table rather than at the moment it
     happened. Ending it is the honest answer and it is also the only
     one the rest of the code can act on.

     Peers that were never seated do not count: a fourth turned away at
     the door, or a guest that gave up knocking on the wrong code, has
     no seat to leave. `party.js` hands the seat over with the peer id
     precisely so this can tell the difference. */
  function roomClosed(why) {
    if (!Party.connected) return;
    /* A mission party does not die when one of three leaves. Every
       mission here plays with one, two or three, the world is a pure
       function of the seed, and the two who are left are still in a
       room together — so it says so and carries on. */
    if (typeof MissionParty !== 'undefined' && MissionParty.armed) return;
    if (typeof Show !== 'undefined' && Show.running) Show.end({ abandon: true });
    // `Lobby.leave` and not `Party.leave`: the lobby holds two latches
    // about being in a room, and they have to come down with it
    Lobby.leave();
    Engine.setPaused(false);
    Screens.transition(() => {
      Missions.end();
      showAttract();
      Screens.show('lobby');
      Lobby.paint();
      Lobby.say(why, 'bad');
    }, 320);
  }

  /* Called by `Lobby` once three people are in and the host has said
     go. Everything before this point is a menu; everything after it
     belongs to `Show`. */
  function enterShow() {
    disposeAttract();
    Missions.end();
    Screens.hideAll();
  }

  /* ---------------- boot ---------------- */

  // a mission may bring its own HUD; the default one is the boat race's
  function hudScreen() {
    const def = Missions.activeDef;
    return (def && def.hudScreen) || 'hud';
  }

  function boot() {
    GameState.load();
    // setups used to be a single shared blob; move an old save across once
    if (GameState.settings.setup && !GameState.settings.setups) {
      GameState.settings.setups = { 'boat-race': GameState.settings.setup };
      delete GameState.settings.setup;
      GameState.save();
    }
    Look.load();
    Engine.init(document.getElementById('gl'));
    Input.init();
    Voice.init();
    UINav.init();
    Tutorial.init();
    Lobby.init();
    MissionParty.init();
    Dressing.init();
    RoomUI.init();

    /* Above every screen, because a room can be lost from any of
       them — the lobby, a mission, the middle of a vote.

       Deferred by a tick: this arrives from inside the transport's own
       peer-left callback, and the first thing it does is tear the room
       down underneath it. Two people leaving at once queue two of
       these, and the second finds itself already out. */
    Party.on('closed', message => {
      if (typeof MissionParty !== 'undefined' && MissionParty.armed) {
        MissionParty.leave();
        toMenu();
        Lobby.say(message, 'bad');
      } else roomClosed(message);
    });
    Party.on('left', (peerId, seat) => {
      if (!seat) return;
      if (typeof MissionParty !== 'undefined' && MissionParty.peerLeft(seat)) return;
      const who = seat.name || 'Somebody';
      const departedRoom = Party.room;
      setTimeout(() => {
        if (Party.room === departedRoom) roomClosed(who + ' left. The room is closed.');
      }, 0);
    });

    // audio can only start after a real user gesture, and so can speech
    const kick = () => {
      AudioBus.init(); AudioBus.resume();
      AudioBus.setMuted(GameState.settings.muted);
      Voice.setMuted(GameState.settings.muted);
      Voice.refresh();
      renderVoices();
    };
    window.addEventListener('pointerdown', kick, { once: true });
    window.addEventListener('keydown', kick, { once: true });

    /* screens */
    Screens.register('play', { enter: () => renderPlay() });
    Screens.register('title', {
      enter: () => renderMissionList(),
    });

    Screens.register('brief', {
      enter: (def) => {
        if (!def) return;
        // a setup belongs to the mission that defined it
        if (!setup || setupDef !== def) setup = defaultSetup(def);
        setupDef = def;
        document.getElementById('brief-title').textContent = def.name;
        document.getElementById('brief-tagline').textContent = def.tagline;
        // Mission copy is authored alongside the already-rich tips and
        // key guide. Render it the same way so inline <kbd> controls do
        // not appear as literal markup in the briefing.
        document.getElementById('brief-desc').innerHTML = def.description;
        document.getElementById('brief-tips').innerHTML =
          (def.tips || []).map(t => `<li>${t}</li>`).join('');
        document.getElementById('brief-keys').innerHTML =
          (def.keys || []).map(k => `<span>${k}</span>`).join('');
        document.getElementById('brief-go').onclick = () => {
          AudioBus.play('ui-click'); launch(def.id, def.setup ? setup : null);
        };
        /* Ticked means "teach me": it is simply whether this mission's
           tour has been seen, so a first visit arrives ticked and a
           player who wants it again only has to tick it. */
        const tut = document.getElementById('brief-tut');
        tut.checked = !Tutorial.off && !Tutorial.seen('mission:' + def.id);
        tut.onchange = () => {
          AudioBus.play('ui-click');
          if (tut.checked) { if (Tutorial.off) Tutorial.setOff(false); Tutorial.forget('mission:' + def.id); }
          else Tutorial.markSeen('mission:' + def.id);
        };
        renderSetup();
      },
    });

    /* ---- setup controls ---- */
    const seedInput = document.getElementById('setup-seed');
    const commitSeed = () => {
      const n = parseInt(String(seedInput.value).replace(/[^0-9]/g, ''), 10);
      if (Number.isFinite(n) && n > 0 && n !== setup.seed) setSetup({ seed: n });
      else renderSetup();
    };
    seedInput.addEventListener('change', commitSeed);
    seedInput.addEventListener('blur', commitSeed);
    seedInput.addEventListener('keydown', (e) => {
      // Enter in the seed box means "use this channel", not "start the race"
      if (e.code === 'Enter') { e.stopPropagation(); seedInput.blur(); }
    });
    document.getElementById('setup-daily').onclick = () => setSetup({ seed: U.dailySeed() });
    document.getElementById('setup-random').onclick = () => setSetup({ seed: U.randomSeed() });
    document.getElementById('setup-ghost').onchange = (e) =>
      setSetup({ ghost: !!e.target.checked }, { quiet: true });

    Screens.register('results', {});
    Screens.register('hud', {});
    Screens.register('hud-shoot', {});
    Screens.register('hud-dive', {});
    Screens.register('pause', {});
    Screens.register('vote', {});
    Screens.register('verdict', {});

    /* ---- the front door ---- */
    /* One door. PLAY opens the lobby and nothing else — no room is
       created on the way through it, because a code you did not ask
       for is a code you have to explain to two other people. The
       lobby's own CREATE ROOM is the only thing in the game that
       opens one. */
    document.getElementById('play-go').onclick = () => toLobby();
    document.getElementById('play-dressing').onclick = toDressing;
    document.getElementById('play-missions').onclick = () => toMissions();
    document.getElementById('title-back').onclick = () => {
      AudioBus.play('ui-click');
      Screens.show('play');
      renderPlay();
    };
    const motion=document.getElementById('estate-motion'),quality=document.getElementById('estate-quality');
    if(GameState.settings.reducedMotion===undefined)GameState.settings.reducedMotion=window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    motion.checked=!!GameState.settings.reducedMotion;quality.value=GameState.settings.quality||'medium';
    motion.onchange=()=>{GameState.settings.reducedMotion=motion.checked;GameState.save();};
    quality.onchange=()=>{GameState.settings.quality=quality.value;GameState.save();Engine.resize();disposeAttract();showAttract();};
    document.getElementById('play-mute').onclick = () => {
      const m = AudioBus.toggleMute();
      GameState.settings.muted = m; GameState.save();
      Voice.setMuted(m);
      syncMute(m); syncMuteChip();
    };

    /* ---- the verdict ---- */
    document.getElementById('verdict-menu').onclick = () => {
      AudioBus.play('ui-click');
      Show.end({ abandon: true });
      toPlay();
    };
    /* Another night is the same three people, so it goes back to the
       room they are already standing in rather than the front door. */
    document.getElementById('verdict-again').onclick = () => {
      AudioBus.play('ui-click');
      Show.end({ abandon: true });
      toLobby();
    };

    document.getElementById('brief-back').onclick = () => {
      AudioBus.play('ui-click'); Screens.show('title');
    };
    document.getElementById('result-retry').onclick = () => {
      AudioBus.play('ui-click');
      const id = showResults._def.id;
      const opts = showResults._opts;
      Screens.transition(() => { Missions.end(); Screens.hideAll(); Missions.launch(id, opts); });
    };
    // a fresh channel deals a fresh hand, so this goes back to the briefing
    // rather than straight into a run you did not get to choose
    document.getElementById('result-new').onclick = () => {
      AudioBus.play('ui-click');
      const def = showResults._def;
      Screens.transition(() => {
        Missions.end();
        Engine.setPaused(false);
        showAttract();
        renderMissionList();
        openBrief(def, { seed: U.randomSeed(), modId: null });
      });
    };
    document.getElementById('result-menu').onclick = () => { AudioBus.play('ui-click'); toMenu(); };

    document.getElementById('pause-resume').onclick = resume;
    document.getElementById('pause-restart').onclick = () => {
      if (Missions.active && Missions.active.party) return;
      Engine.setPaused(false);
      Screens.show(hudScreen());
      if (Missions.active && Missions.active.restart) Missions.active.restart();
    };
    document.getElementById('pause-quit').onclick = () => { Engine.setPaused(false); toMenu(); };
    // with the mouse captured the card's own Skip cannot be clicked, so
    // the pause menu carries one while a tour is running
    document.getElementById('pause-skip-tut').onclick = () => {
      Tutorial.skip();
      resume();
    };
    Screens.onShow((id) => {
      if (id === 'pause') {
        const cur = Tutorial.current;
        document.getElementById('pause-skip-tut').hidden = !(cur && cur.kind === 'mission');
      }
    });
    /* Every tour again, from the welcome card, right now. */
    document.getElementById('play-howto').onclick = () => {
      AudioBus.play('ui-click');
      Tutorial.reset();
      Tutorial.onScreen('play');
    };

    const muteBtn = document.getElementById('mute-btn');
    const syncMute = (m) => muteBtn.classList.toggle('muted', m);
    muteBtn.onclick = () => {
      const m = AudioBus.toggleMute();
      GameState.settings.muted = m; GameState.save();
      // the browser will not let speech through the audio graph, so it
      // has to be muted by hand or Claudia talks over a muted game
      Voice.setMuted(m);
      syncMute(m); syncMuteChip();
    };
    syncMute(GameState.settings.muted);

    function resume() {
      AudioBus.play('ui-click');
      Engine.setPaused(false);
      Screens.show(hudScreen());
    }

    window.addEventListener('keydown', (e) => {
      if (Screens.current === 'pause' && (e.code === 'Escape' || e.code === 'KeyP')) resume();
      else if (Screens.current === 'brief' && e.code === 'Enter'
               && e.target.tagName !== 'INPUT') {
        if (setupDef) launch(setupDef.id, setupDef.setup ? setup : null);
      }
      else if (Screens.current === 'brief' && e.code === 'Escape') Screens.show('title');
    });

    Missions.on('complete', showResults);

    showAttract();
    EstateMaterials.preload();
    Screens.show('play');
    /* A `#p=CODE&m=mission` in the address bar is somebody's invitation.
       It is read here rather than earlier so the mission registry is
       already full and the screen can say the mission's name. */
    MissionParty.openFromLink();
    /* And the door nothing on any screen mentions: `?bots=…` seats you
       with two of them and plays whichever parts of the night you named.
       Read after the registry is full, because the run plan draws its
       two missions out of it. */
    Bots.openFromLink();
    Engine.start();

    document.getElementById('boot').classList.add('gone');
  }

  return { boot, toMenu, toMissions, toPlay, toLobby, enterShow, showAttract,
           launch, showResults, renderPlay, renderMissionList };
})();

window.addEventListener('DOMContentLoaded', () => {
  try { Game.boot(); }
  catch (err) {
    console.error(err);
    document.getElementById('boot').innerHTML =
      '<div class="boot-err">Something went wrong starting the game.<br><code>' +
      String(err && err.message || err) + '</code></div>';
  }
});
