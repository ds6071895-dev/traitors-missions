/* ------------------------------------------------------------------
   main.js — boot, title screen, results, and the attract-mode ocean
   that sits behind the menus.
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

  function defaultSetup() {
    const saved = GameState.settings.setup || {};
    return {
      seed: Number.isFinite(saved.seed) ? saved.seed : U.dailySeed(),
      mode: saved.mode === 'trial' ? 'trial' : 'prize',
      modId: saved.modId || null,
      ghost: saved.ghost !== false,
    };
  }

  function saveSetup() {
    GameState.settings.setup = Object.assign({}, setup);
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

    // --- channel ---
    document.getElementById('setup-name').textContent = p.name;
    document.getElementById('setup-cond').innerHTML =
      `<span>${p.conditionText}</span>` + (p.opts.daily ? '<b class="tag-today">TODAY</b>' : '');
    const seedInput = document.getElementById('setup-seed');
    if (document.activeElement !== seedInput) seedInput.value = String(p.opts.seed);
    document.getElementById('setup-daily').classList.toggle('on', p.opts.daily);

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
    document.getElementById('setup-best').innerHTML = best
      ? `<span class="sb-lbl">Your best here</span><b>${
          setup.mode === 'trial' ? U.clockTime(best.finalTime || 0) : U.money(best.earned || 0)
        }</b>` + (medal ? `<i class="sb-medal" style="--mc:${medal.color}">${medal.name}</i>` : '')
      : '<span class="sb-lbl">No run on this setup yet</span>';

    document.getElementById('brief-mult').textContent =
      Math.abs(p.payout - 1) > 0.03 ? '×' + p.payout.toFixed(2) : '';
  }

  function openBrief(def, opts) {
    setupDef = def;
    setup = Object.assign(defaultSetup(), opts || {});
    Screens.show('brief', def);
  }

  /* ---------------- title screen ---------------- */

  function renderMissionList() {
    const list = document.getElementById('mission-list');
    list.innerHTML = '';
    for (const m of Missions.all()) {
      const rec = GameState.data.missions[m.id];
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
      list.appendChild(card);
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

  function toMenu() {
    Screens.transition(() => {
      Missions.end();
      Engine.setPaused(false);
      showAttract();
      renderMissionList();
      Screens.show('title');
    });
  }

  /* ---------------- results ---------------- */

  function showResults({ def, opts, result, isBest }) {
    const r = result;
    const trial = r.mode === 'trial';
    const rows = [
      ['Gates threaded', `${r.hoops}/${r.totalHoops}`],
      ['Perfect passes', String(r.perfects)],
    ];
    if (r.riskHits) rows.push(['Gold rings taken', String(r.riskHits)]);
    if (r.tricks) rows.push(['Rotations landed', String(r.tricks)]);
    rows.push(['Best multiplier', '×' + (1 + Math.floor(r.bestCombo / 2) * 0.5)]);
    if (trial) rows.push(['Final time', U.clockTime(r.finalTime || 0)],
                         ['Par for this channel', U.clockTime(r.par || 0)]);
    rows.push(null, ['Ring earnings', U.money(r.hoopMoney)]);
    if (r.trickMoney) rows.push(['Air tricks', U.money(r.trickMoney)]);
    if (r.grazeMoney) rows.push(['Close calls', U.money(r.grazeMoney)]);
    if (r.finishBonus) rows.push(['Finish bonus', U.money(r.finishBonus)]);
    if (r.timeBonus) {
      rows.push([trial ? 'Under par' : `Time bonus (${r.timeLeft.toFixed(1)}s)`,
                 U.money(r.timeBonus)]);
    }
    if (r.payout && Math.abs(r.payout - 1) > 0.005) {
      const why = [r.conditionText, r.modName].filter(Boolean).join(' · ');
      rows.push([`Conditions ×${r.payout.toFixed(2)}`, why]);
    }
    if (!r.completed) rows.push(['Did not finish', r.earned ? '½ earnings' : 'nothing banked']);

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

    Screens.show('results', { def });
    showResults._def = def;
    showResults._opts = opts;
  }

  /* ---------------- boot ---------------- */

  function boot() {
    GameState.load();
    Engine.init(document.getElementById('gl'));
    Input.init();

    // audio can only start after a real user gesture
    const kick = () => { AudioBus.init(); AudioBus.resume(); AudioBus.setMuted(GameState.settings.muted); };
    window.addEventListener('pointerdown', kick, { once: true });
    window.addEventListener('keydown', kick, { once: true });

    /* screens */
    Screens.register('title', {
      enter: () => renderMissionList(),
    });

    Screens.register('brief', {
      enter: (def) => {
        if (!def) return;
        setupDef = def;
        if (!setup) setup = defaultSetup();
        document.getElementById('brief-title').textContent = def.name;
        document.getElementById('brief-tagline').textContent = def.tagline;
        document.getElementById('brief-desc').textContent = def.description;
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
    Screens.register('pause', {});

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
      Screens.show('hud');
      if (Missions.active && Missions.active.restart) Missions.active.restart();
    };
    document.getElementById('pause-quit').onclick = () => { Engine.setPaused(false); toMenu(); };

    const muteBtn = document.getElementById('mute-btn');
    const syncMute = (m) => muteBtn.classList.toggle('muted', m);
    muteBtn.onclick = () => {
      const m = AudioBus.toggleMute();
      GameState.settings.muted = m; GameState.save();
      syncMute(m);
    };
    syncMute(GameState.settings.muted);

    function resume() {
      AudioBus.play('ui-click');
      Engine.setPaused(false);
      Screens.show('hud');
    }

    window.addEventListener('keydown', (e) => {
      if (Screens.current === 'pause' && (e.code === 'Escape' || e.code === 'KeyP')) resume();
      else if (Screens.current === 'brief' && e.code === 'Enter'
               && e.target.tagName !== 'INPUT') {
        launch(showBriefId(), setupDef && setupDef.setup ? setup : null);
      }
      else if (Screens.current === 'brief' && e.code === 'Escape') Screens.show('title');
    });

    let _briefId = null;
    const showBriefId = () => _briefId;
    const origShow = Screens.show;
    Screens.show = function (id, data) {
      if (id === 'brief' && data) _briefId = data.id;
      return origShow.call(Screens, id, data);
    };

    Missions.on('complete', showResults);

    showAttract();
    Screens.show('title');
    Engine.start();

    document.getElementById('boot').classList.add('gone');
  }

  return { boot, toMenu, launch };
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
