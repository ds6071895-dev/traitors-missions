/* ------------------------------------------------------------------
   main.js — boot, the front screens, and the attract-mode estate that
   sits behind the menus.

   PLAY opens the lobby; the lobby hands over to `Show`, which runs a
   whole game and owns the screen until it is finished. The dressing
   room and a walk round the empty castle are the other two doors.
------------------------------------------------------------------ */
const Game = (() => {

  let attract = null;

  /* ---------------- attract mode ---------------- */

  /* The menu shares the estate's daylight geography and materials, with
     a bounded camera and lighter scenery around the castle — on a
     bright Highland afternoon. */
  const ATTRACT_COND = { time: 'noon', sea: 'slight', wind: 0.85 };

  function buildAttract() {
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(58, 1, 0.5, 20000);

    // must run before `Sky.build`: the haze is baked into the vertices
    const hour = Conditions.apply(ATTRACT_COND);
    Estate.atmosphere(false);
    scene.fog = new THREE.Fog(Sky.PALETTE.fog, hour.time.fog.near, hour.time.fog.far);
    scene.add(Conditions.lights(ATTRACT_COND));
    scene.add(new THREE.HemisphereLight('#fff9e6', '#8fc25e', 0.75));

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
    /* The water is one module shared with the hill and the fire, so
       whichever was last on screen left its own palette in it. The sky
       does not need this — its colours were baked into the dome when
       the scene was built — but the sea does, every time. */
    else Estate.atmosphere(false);
    Engine.setView(attract.view, attract.frame);
  }

  function disposeAttract() {
    if (!attract) return;
    Engine.disposeObject(attract.scene);
    attract = null;
    // the preset is global; hand it back
    Sky.resetPreset();
  }

  /* ---------------- the overture ----------------
     The front of house has a score. It runs across every menu screen
     — the door, the lobby and the dressing room — rather than one of them, because
     they are walls of the same room and a theme that restarted every
     time you pressed Back is a jingle, not a title.

     It opens on the theme alone and lifts into the full anthem one
     pass in, on a bar line, behind a reverse cymbal. Anything that is
     not a menu — the game itself — stops it, and whatever is down
     there starts its own.

     Nothing can begin before the browser has seen a gesture, so `kick`
     asks again once there is an audio context to ask with. */

  const MENU_SCREENS = new Set(['play', 'lobby', 'dressing']);
  /* Eight bars of `gate` at 132bpm is 14.5 seconds, which is one whole
     pass of the riff. Ask a bar early: the switch waits for the bar
     line either way, and the reverse cymbal needs that much runway
     to arrive on it. */
  const OVERTURE_LIFT = 12800;

  let overture = null, overtureLift = null;

  function stopOverture(fade = 0.9) {
    if (overtureLift) { clearTimeout(overtureLift); overtureLift = null; }
    if (!overture) return;
    overture.stop(fade);
    overture = null;
  }

  function startOverture() {
    // `Show.end` stops every live score; if ours went with it, let go
    if (overture && !Music.live.has(overture)) overture = null;
    if (overture || !AudioBus.ready) return;
    const score = Music.title();
    if (!score || !score.ok) return;
    overture = score;
    overtureLift = setTimeout(() => {
      overtureLift = null;
      if (overture === score) score.section('anthem', { at: 'bar', glide: 2.5, fill: true });
    }, OVERTURE_LIFT);
  }

  /* The one rule, and every screen change and every mute goes through
     it. Muting stops the band rather than turning it down: a sequencer
     booking forty notes a bar into a master gain at zero is the most
     expensive silence in the game. */
  function syncOverture(id = Screens.current) {
    if (MENU_SCREENS.has(id) && !AudioBus.muted) startOverture();
    else stopOverture();
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

  const MUSIC_LEVELS = { normal: 0.36, quiet: 0.16, off: 0 };
  const MUSIC_ORDER = ['normal', 'quiet', 'off'];
  function setMusic(level) {
    const m = MUSIC_LEVELS[level] != null ? level : 'normal';
    AudioBus.setVolume('music', MUSIC_LEVELS[m]);
    const b = document.getElementById('music-btn');
    if (b) {
      b.dataset.level = m;
      b.title = 'Music: ' + m + ' (M)';
      b.setAttribute('aria-label', b.title);
    }
    const chip = document.getElementById('play-music');
    if (chip) {
      chip.textContent = 'Music ' + m;
      chip.classList.toggle('on', m !== 'off');
    }
    return m;
  }
  function cycleMusic() {
    const now = MUSIC_ORDER.indexOf(GameState.settings.music);
    GameState.settings.music = setMusic(MUSIC_ORDER[(Math.max(0, now) + 1) % MUSIC_ORDER.length]);
    GameState.save();
    AudioBus.play('ui-click');
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
      showAttract();
      Screens.show('lobby');
    }, 320);
  }

  /* The castle, empty, for walking round. It is a scene like any other
     and leaves the way it came. */
  function toCastle() {
    AudioBus.resume();
    AudioBus.play('ui-click');
    Screens.transition(() => {
      disposeAttract();
      Screens.hideAll();
      Scenes.play(new ExploreScene({
        onLeave: () => Screens.transition(() => {
          Scenes.stop();
          showAttract();
          Screens.show('play');
        }, 320),
      }));
    }, 320);
  }

  function toDressing() {
    AudioBus.resume();
    AudioBus.play('ui-click');
    Dressing.open('play');
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
    if (typeof Show !== 'undefined' && Show.running) Show.end({ abandon: true });
    // `Lobby.leave` and not `Party.leave`: the lobby holds two latches
    // about being in a room, and they have to come down with it
    Lobby.leave();
    Engine.setPaused(false);
    Screens.transition(() => {
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
    Screens.hideAll();
  }

  /* ---------------- boot ---------------- */

  function boot() {
    GameState.load();
    Look.load();
    Engine.init(document.getElementById('gl'));
    Input.init();
    Voice.init();
    UINav.init();
    Tutorial.init();
    Lobby.init();
    Dressing.init();
    RoomUI.init();

    /* Above every screen, because a room can be lost from any of
       them — the lobby, the castle, the middle of a vote.

       Deferred by a tick: this arrives from inside the transport's own
       peer-left callback, and the first thing it does is tear the room
       down underneath it. Two people leaving at once queue two of
       these, and the second finds itself already out. */
    Party.on('closed', message => roomClosed(message));
    Party.on('left', (peerId, seat) => {
      if (!seat) return;
      const who = seat.name || 'Somebody';
      /* In the lobby a seat simply empties. In a night of five or more,
         somebody walking out is out of the game, exactly as if they had
         been banished — the castle goes on round the empty chair, and
         only the host leaving ends it for everybody. */
      if (typeof Show === 'undefined' || !Show.running) { Lobby.paint(); return; }
      const s = Session.state;
      if (s && s.players.length >= Session.MIN_PLAYERS) {
        if (Session.isHost) Net.send({ type: 'leave', playerId: peerId });
        Voice.show('', who + ' has left the castle.');
        setTimeout(() => Voice.clear(), 4000);
        return;
      }
      const departedRoom = Party.room;
      setTimeout(() => {
        if (Party.room === departedRoom) roomClosed(who + ' left. The room is closed.');
      }, 0);
    });

    // audio can only start after a real user gesture, and so can speech
    const kick = () => {
      AudioBus.init(); AudioBus.resume();
      AudioBus.setMuted(GameState.settings.muted);
      setMusic(GameState.settings.music);
      Voice.setMuted(GameState.settings.muted);
      Voice.refresh();
      renderVoices();
      // the first gesture is also the first moment the band may play
      syncOverture();
    };
    window.addEventListener('pointerdown', kick, { once: true });
    window.addEventListener('keydown', kick, { once: true });

    /* screens */
    Screens.onShow(syncOverture);
    Screens.register('play', { enter: () => renderPlay() });
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
    document.getElementById('play-castle').onclick = toCastle;
    const motion=document.getElementById('estate-motion'),quality=document.getElementById('estate-quality');
    if(GameState.settings.reducedMotion===undefined)GameState.settings.reducedMotion=window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    motion.checked=!!GameState.settings.reducedMotion;quality.value=GameState.settings.quality||'medium';
    motion.onchange=()=>{GameState.settings.reducedMotion=motion.checked;GameState.save();};
    quality.onchange=()=>{GameState.settings.quality=quality.value;GameState.save();Engine.resize();disposeAttract();showAttract();};
    document.getElementById('play-mute').onclick = () => {
      const m = AudioBus.toggleMute();
      GameState.settings.muted = m; GameState.save();
      Voice.setMuted(m);
      syncMute(m); syncMuteChip(); syncOverture();
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
      syncMute(m); syncMuteChip(); syncOverture();
    };
    syncMute(GameState.settings.muted);

    /* The band, on its own: a game is voices first, and how loud the
       music should sit under them depends on the room you play in. M,
       the button by the microphone, or the chip on the front door. */
    document.getElementById('music-btn').onclick = cycleMusic;
    document.getElementById('play-music').onclick = cycleMusic;
    Engine.addUpdater(() => { if (Input.pressed('mute')) cycleMusic(); });
    setMusic(GameState.settings.music);

    showAttract();
    EstateMaterials.preload();
    if (typeof CastleSurfaces !== 'undefined') CastleSurfaces.warm();
    Screens.show('play');
    /* The door nothing on any screen mentions: `?bots=…` seats you with
       a table of them and plays whichever parts of the night you named. */
    Bots.openFromLink();
    Engine.start();

    document.getElementById('boot').classList.add('gone');
  }

  return { boot, toPlay, toLobby, enterShow, showAttract, renderPlay };
})();

window.addEventListener('DOMContentLoaded', () => {
  try { Game.boot(); }
  catch (err) {
    console.error(err);
    document.querySelector('#boot .boot-inner').innerHTML =
      '<div class="boot-err">Something went wrong starting the game.<br><code>' +
      String(err && err.message || err) + '</code></div>';
  }
});
