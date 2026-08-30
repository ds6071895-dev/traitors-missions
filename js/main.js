/* ------------------------------------------------------------------
   main.js — boot, the front screens, results, and the attract-mode
   ocean that sits behind the menus.

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

  function buildAttract() {
    const scene = new THREE.Scene();
    scene.fog = new THREE.Fog(Sky.PALETTE.fog, 500, 3200);
    const camera = new THREE.PerspectiveCamera(58, 1, 0.5, 20000);

    const sun = new THREE.DirectionalLight('#fff6de', 1.55);
    sun.position.copy(Sky.SUN_DIR).multiplyScalar(300);
    scene.add(sun, new THREE.HemisphereLight('#d6f2ff', '#4e9fb4', 1.15));

    Sky.build(scene, U.makeRng(4242));
    Water.build(scene);
    Water.setFog(320, 3400, Sky.PALETTE.fog);

    const state = { t: 0, x: 0, z: 0 };
    const look = new THREE.Vector3();

    function frame(dt, t) {
      state.t += dt;
      Water.update(dt);
      // a slow drift across open water
      state.z += dt * 9;
      state.x = Math.sin(state.t * 0.06) * 60;
      const y = Water.sampleHeight(state.x, state.z);
      camera.position.set(state.x, y + 7.5 + Math.sin(state.t * 0.4) * 0.6, state.z);
      look.set(state.x + Math.sin(state.t * 0.09) * 40, y + 5.5, state.z + 60);
      camera.lookAt(look);
      camera.rotateZ(Math.sin(state.t * 0.13) * 0.02);
      Water.follow(camera.position.x, camera.position.z);
      Sky.update(dt, camera.position, state.t);
      Input.endFrame();
    }

    return { view: { scene, camera }, frame, scene };
  }

  function showAttract() {
    if (!attract) attract = buildAttract();
    Engine.setView(attract.view, attract.frame);
  }

  function disposeAttract() {
    if (!attract) return;
    Engine.disposeObject(attract.scene);
    attract = null;
  }

  /* ---------------- pre-race setup ----------------
     The briefing panel is where a run is *chosen*: which channel, which
     mode, which modifier. Everything it shows comes from the mission's own
     `preview()`, so this module never has to know what a sea state is. */

  let setup = null;          // the live setup for whichever mission is briefed
  let setupDef = null;

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
    };
  }

  function saveSetup() {
    if (!setupDef) return;
    setupStore()[setupDef.id] = Object.assign({}, setup);
    GameState.save();
  }

  function setSetup(patch, opts = {}) {
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

    // --- the place you are about to play ---
    const labels = setupDef.setupLabels || {};
    document.getElementById('setup-course-head').textContent = labels.course || 'Channel';
    document.getElementById('setup-mod-head').innerHTML =
      (labels.modifier || 'Modifier') + ' <span class="setup-sub">keep one, or none</span>';
    document.getElementById('setup-name').textContent = p.name;
    document.getElementById('setup-cond').innerHTML =
      `<span>${p.conditionText}</span>` + (p.opts.daily ? '<b class="tag-today">TODAY</b>' : '');
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

  function renderMissionList() {
    const list = document.getElementById('mission-list');
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
      if (!m.locked && m.quickStart) {
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
        row.appendChild(quick);
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

  /* ---------------- results ---------------- */

  /* What this client sends the host about its own run. A mission that
     wants a say in the board provides `report(result)`; anything that
     does not still turns up on it with a name and a number, because a
     player missing from the board reads as a bug rather than a mission
     that has not been taught to fill one in. */
  function reportFor(def, r) {
    const base = {
      earned: Math.max(0, Math.round(r.earned || 0)),
      completed: !!r.completed,
      place: r.place || null,
      columns: [], cells: [], stats: {},
    };
    if (!def || typeof def.report !== 'function') return base;
    try { return Object.assign(base, def.report(r) || {}); }
    catch (e) { console.warn('mission report failed:', e); return base; }
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

    // count the money up into the pot
    const earnedEl = document.getElementById('result-earned');
    const potEl = document.getElementById('result-pot');
    const target = r.earned;
    const potBefore = GameState.prizePot - r.earned;
    let shown = 0, i = 0;
    clearInterval(showResults._t);
    earnedEl.textContent = U.money(0);
    potEl.textContent = U.money(potBefore);
    showResults._t = setInterval(() => {
      i++;
      shown = Math.min(target, shown + Math.max(1, Math.ceil(target / 34)));
      earnedEl.textContent = U.money(shown);
      potEl.textContent = U.money(potBefore + shown);
      AudioBus.play('money', { index: i });
      if (shown >= target) clearInterval(showResults._t);
    }, 45);

    /* In a run there is nowhere to go but onward, so the three practice
       buttons collapse to one. The mission engine does not know the
       difference and should not have to. */
    const inRun = typeof Show !== 'undefined' && Show.running;
    for (const id of ['result-retry', 'result-new', 'result-menu']) {
      document.getElementById(id).hidden = inRun;
    }
    const cont = document.getElementById('result-continue');
    const boardEl = document.getElementById('result-board');
    cont.hidden = !inRun;
    boardEl.hidden = true;

    if (inRun) {
      const arm = (board) => {
        const run = Show.resultsAction(r, board);
        if (!run) return;
        if (board) {
          boardEl.style.setProperty('--bd-cols', String(RoomUI.boardCols(board)));
          boardEl.innerHTML = '<div class="rb-head">Everybody\'s night</div>'
                            + '<div class="board-grid">' + RoomUI.boardHTML(board) + '</div>';
          boardEl.hidden = false;
        }
        cont.textContent = run.label;
        cont.onclick = () => { AudioBus.play('ui-click'); cont.disabled = true; run.go(); };
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
        MissionNet.report(reportFor(def, r)).then(arm);
      } else {
        arm(null);
      }
    }

    Screens.show('results', { def });
    showResults._def = def;
    showResults._opts = opts;
  }

  /* ---------------- the front door ---------------- */

  function renderPlay() {
    document.getElementById('play-pot').textContent = U.money(GameState.prizePot);

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

  /* The OS voice list is wildly different from machine to machine and
     the best one is often not the default, so this is a real setting
     rather than a hidden preference. It is refreshed on entry because
     Chrome hands back an empty list until it feels like it. */
  let voicesDrawn = 0;
  function renderVoices() {
    const sel = document.getElementById('voice-select');
    if (!sel) return;
    const list = Voice.supported ? Voice.list() : [];
    if (!list.length) {
      sel.innerHTML = '<option>Subtitles only</option>';
      sel.disabled = true;
      // it usually arrives a moment later
      if (voicesDrawn++ < 6) setTimeout(renderVoices, 400);
      return;
    }
    sel.disabled = false;
    const chosen = GameState.settings.voiceURI || (Voice.current && Voice.current.uri);
    sel.innerHTML = list.map(v =>
      `<option value="${v.uri}"${v.uri === chosen ? ' selected' : ''}>${v.name} — ${v.lang}</option>`
    ).join('');
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
     door rather than a start button. */
  function toLobby(mode) {
    AudioBus.resume();
    Voice.unlock();
    AudioBus.play('ui-click');
    Screens.transition(() => {
      if (typeof Show !== 'undefined' && Show.running) Show.end({ abandon: true });
      Missions.end();
      showAttract();
      Screens.show('lobby', { mode });
    }, 320);
  }

  function toDressing() {
    AudioBus.resume();
    AudioBus.play('ui-click');
    Screens.transition(() => Screens.show('dressing', { from: 'play' }), 320);
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
    Lobby.init();
    Dressing.init();
    RoomUI.init();

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
        document.getElementById('brief-desc').textContent = def.description;
        document.getElementById('brief-tips').innerHTML =
          (def.tips || []).map(t => `<li>${t}</li>`).join('');
        document.getElementById('brief-keys').innerHTML =
          (def.keys || []).map(k => `<span>${k}</span>`).join('');
        document.getElementById('brief-go').onclick = () => {
          AudioBus.play('ui-click'); launch(def.id, def.setup ? setup : null);
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
    Screens.register('pause', {});
    Screens.register('vote', {});
    Screens.register('verdict', {});

    /* ---- the front door ---- */
    document.getElementById('play-go').onclick = () => toLobby(null);
    document.getElementById('play-create').onclick = () => toLobby('host');
    document.getElementById('play-join').onclick = () => toLobby('join');
    document.getElementById('play-dressing').onclick = toDressing;
    document.getElementById('play-missions').onclick = () => {
      AudioBus.resume(); AudioBus.play('ui-click');
      Screens.transition(() => { renderMissionList(); Screens.show('title'); });
    };
    document.getElementById('title-back').onclick = () => {
      AudioBus.play('ui-click'); Screens.show('play'); renderPlay();
    };
    document.getElementById('play-mute').onclick = () => {
      const m = AudioBus.toggleMute();
      GameState.settings.muted = m; GameState.save();
      Voice.setMuted(m);
      syncMute(m); syncMuteChip();
    };
    document.getElementById('voice-select').onchange = (e) => {
      Voice.setVoice(e.target.value);
      AudioBus.play('ui-click');
      Voice.say('There you are.', { speaker: 'Claudia' });
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
      toLobby(null);
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
      Engine.setPaused(false);
      Screens.show(hudScreen());
      if (Missions.active && Missions.active.restart) Missions.active.restart();
    };
    document.getElementById('pause-quit').onclick = () => { Engine.setPaused(false); toMenu(); };

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
    Screens.show('play');
    Engine.start();

    document.getElementById('boot').classList.add('gone');
  }

  return { boot, toMenu, toPlay, toLobby, enterShow, showAttract, launch,
           showResults, renderPlay };
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
