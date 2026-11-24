/* ------------------------------------------------------------------
   ai-strategy.js — the AIs' playbook.

   Every AI has a way it likes to play (its signature strategy, fixed
   for the game from the seed, so two AIs at the same table do not play
   alike), and every moment has the moves that suit it: a Traitor whose
   partner is being piled on needs a different play from one nobody is
   looking at, and a Faithful on a revote is not one on day one. So:

     signature(ctx)   the strategy this AI favours all game
     situational(ctx) the two moves that fit this moment best, scored
                      from what is actually happening (and varied by
                      day, so a long game does not repeat itself)
     promptText(ctx)  the lines for the system prompt
     cue(ctx)         one short tactical nudge for the turn
     voteBias(ctx, o) a nudge to the vote ranking, so a strategy is
                      something an AI does and not only something it says

   `ctx` is built by `AIDirector` from the public record and the AI's
   own private view only: what it may know, never anybody else's role.
------------------------------------------------------------------ */
const AIStrategy = (() => {

  /* Each entry: id, a short name, how it is played (for the prompt),
     a one-line cue (for the turn), and `fit(c)` — how well it suits the
     moment, 0 for not at all. `vote(c, o)` (optional) nudges the score
     of one ballot option `o` = { id, n (room lean), score (read),
     partner, ally }. */
  const FAITHFUL = [
    { id: 'vote-detective', name: 'Follow the votes',
      how: 'Treat the ballot record as the best evidence in the game. When somebody is revealed Faithful, look at who pushed them out; when a Traitor is caught, look at who never voted for them. Quote the votes back by name and day.',
      cue: 'Bring up who voted for whom, by name and day, and ask one of them to explain it.',
      fit: c => (c.banishedFaithful ? 3 : 0.5) + (c.caughtTraitor ? 2 : 0) + (c.day > 0 ? 1 : 0),
      vote: (c, o) => (o.score > 0 ? o.score * 0.4 : 0) },
    { id: 'alibi-check', name: 'Check the alibis',
      how: 'Ask people exactly where they were and who they were with when the poison must have gone in, then check their answer against what you saw and against what they said earlier. A story that changes is worth more than a story that is vague.',
      cue: 'Ask one person precisely where they were and with whom, then check it against what you saw.',
      fit: c => (c.phase === 'breakfast' || c.phase === 'table' ? 2.5 : 0.5) + (c.murderToday ? 1.5 : 0) },
    { id: 'pressure-test', name: 'Pressure test',
      how: 'Pick your suspect and ask them short, direct questions one after another. Liars over-explain, change details or turn it round too fast; watch for that and name it out loud.',
      cue: 'Ask your top suspect one short, direct question and do not let them dodge it.',
      fit: c => (c.topSuspectScore >= 2 ? 3 : 0.4) + (c.phase === 'table' ? 1 : 0) },
    { id: 'quiet-observer', name: 'Watch, then strike',
      how: 'Say little early on and listen hard. Note who changes their story, who rushes to agree and who stays vague. Then, late in the debate, lay out one tight case with three facts.',
      cue: 'Stay brief and note who is deflecting; save your case for when it will land.',
      fit: c => (c.myHeat ? 0 : 1.5) + (c.day === 0 ? 1 : 0) },
    { id: 'bloc', name: 'Build a voting bloc',
      how: 'A split Faithful vote is how Traitors survive. Get two or three people you trust to agree out loud on one name before the vote, and hold them to it.',
      cue: 'Get the people you trust to agree on one name before the vote — say the name and ask who is with you.',
      fit: c => (c.phase === 'table' ? 2 : 0.3) + (c.allies ? 1.5 : 0) + (c.alive <= 6 ? 1 : 0),
      vote: (c, o) => (o.score >= 0 ? o.n * 0.8 : 0) },
    { id: 'shield-play', name: 'Win the shield',
      how: 'Work hard for the shield by day so the poison cannot kill you, and notice who keeps hanging about you instead of doing their jobs — a poisoner needs to get close.',
      cue: 'Mention the shield race and ask who has been near you while you worked.',
      fit: c => (c.phase === 'tasks' ? 3 : 0) },
    { id: 'plant-a-detail', name: 'The planted detail',
      how: 'Tell one person something small and true in private and see whether it comes back to you from someone else. Whoever passes your private words around is not as trustworthy as they seem.',
      cue: 'Test one person: ask them who they told what you said to them in private.',
      fit: c => (c.privateWords ? 2 : 0.2) + (c.phase === 'tasks' ? 0.8 : 0) },
    { id: 'guard-the-cleared', name: 'Guard the cleared',
      how: 'When the room piles on somebody the record clears, slow it down: ask what the evidence is, and point out that a wrong banishment is exactly what the Traitors want.',
      cue: 'If the room is piling onto somebody without evidence, ask for the evidence out loud.',
      fit: c => (c.pileOnCleared ? 4 : 0) + (c.banishedFaithful ? 1 : 0),
      vote: (c, o) => (o.score < 0 ? -2 : 0) },
    { id: 'partner-hunt', name: 'Hunt the partner',
      how: 'A caught Traitor had a partner. Look at who defended them, who voted with them, who never named them and who was close to them by day — that is where the next Traitor is.',
      cue: 'A Traitor is gone: ask who defended them and who always voted the same way as them.',
      fit: c => (c.caughtTraitor ? 4 : 0) },
    { id: 'murder-logic', name: 'Read the murders',
      how: 'The Traitors poison the people who threaten them. Ask why this victim, who benefits, and who the victim had been suspecting or questioning — the victim\'s suspects are leads.',
      cue: 'Ask the table why the Traitors chose this victim, and who the victim had been suspecting.',
      fit: c => (c.murderToday ? 3 : 0) + (c.phase === 'breakfast' ? 1.5 : 0) },
    { id: 'swing-reader', name: 'Read the swings',
      how: 'On a revote, the people who change their vote are telling you something: a Traitor saving a partner moves to the Faithful in the tie. Ask every swing voter why.',
      cue: 'On this revote, ask whoever changed their vote what changed their mind.',
      fit: c => (c.revote ? 5 : 0) },
    { id: 'count-traitors', name: 'Do the maths',
      how: 'Count out loud: how many Traitors there could be, how many are caught, how many players are left. Near the end, never vote to END unless the count closes, and say why.',
      cue: 'Count out loud how many Traitors could still be here, and what that means for the vote.',
      fit: c => (c.atFire ? 5 : 0) + (c.alive <= 5 ? 2 : 0) },
    { id: 'quiet-target', name: 'Draw out the quiet one',
      how: 'Somebody who never names anybody and agrees with everybody is hiding. Ask them straight who they suspect and why, and remember the answer.',
      cue: 'Ask the quietest person straight out who they suspect and why.',
      fit: c => (c.quietOne ? 2.5 : 0) + (c.phase === 'table' ? 0.5 : 0) },
    { id: 'consistency', name: 'Hold them to their words',
      how: 'Remember exactly what each person said earlier — where they were, who they trusted, who they would vote for — and when it changes, quote the old words back to them.',
      cue: 'Quote back something a person said earlier that does not fit what they say now.',
      fit: c => 1 + (c.day > 0 ? 1 : 0) },
  ];

  const TRAITOR = [
    { id: 'model-faithful', name: 'The model Faithful',
      how: 'Be the most convincing Faithful in the castle: reason out loud from real evidence, vote with the majority when it lands on a Faithful, and be the first to praise a good deduction. Nobody banishes the player who sounds most like them.',
      cue: 'Sound like the most reasonable Faithful here: one real piece of evidence, calmly.',
      fit: c => 1.5 + (c.myHeat ? 0 : 1),
      vote: (c, o) => (!o.partner ? o.n * 0.6 : 0) },
    { id: 'bus', name: 'Throw them under the bus',
      how: 'If the room has decided on your partner and nothing will save them, be part of it — vote with the room and make a show of it. Nobody suspects the Traitor who banished their own partner.',
      cue: 'Your partner is lost: join the case against them, with a reason, and get the credit.',
      fit: c => (c.partnerDoomed ? 6 : 0),
      vote: (c, o) => (o.partner && c.partnerDoomed ? 6 : 0) },
    { id: 'split', name: 'Split the vote',
      how: 'When the room is closing in on your partner but not settled, put a second, believable Faithful name in play so the votes divide. A tie or a narrow miss buys a day.',
      cue: 'Give the table a fresh, believable doubt about a Faithful so the votes split away from your partner.',
      fit: c => (c.partnerHeat && !c.partnerDoomed ? 5 : 0),
      vote: (c, o) => (!o.partner && o.n >= 1 && c.partnerHeat && !c.partnerDoomed ? 3 + o.n : 0) },
    { id: 'puppet', name: 'Pull the strings',
      how: 'Never lead an accusation yourself. Plant a doubt with one trusting Faithful — a question, a detail — and let them make the case out loud. Then agree, reluctantly.',
      cue: 'Ask a leading question that gets somebody else to make the accusation for you.',
      fit: c => 1.5 + (c.allies ? 1.5 : 0) + (c.myHeat ? -1 : 0) },
    { id: 'alibi-builder', name: 'Build the alibi',
      how: 'By day be seen: do jobs where people pass, talk to everybody, and mention it later. Keep your story about where you were simple and the same every time.',
      cue: 'Mention, casually, who saw you working today — keep your story simple.',
      fit: c => (c.phase === 'tasks' ? 3 : 0) + (c.phase === 'breakfast' ? 1 : 0) },
    { id: 'counter', name: 'Turn it round',
      how: 'When accused, do not get defensive. Stay calm, answer with specifics, then point out one real inconsistency in your accuser\'s own story and ask them about it.',
      cue: 'You are under fire: answer with one calm specific, then ask your accuser about a hole in their own story.',
      fit: c => (c.myHeat ? 5 : 0) },
    { id: 'bandwagon', name: 'Ride the wave',
      how: 'When the room leans on a Faithful, join it — late, never first, and with a reason of your own so it sounds like your own conclusion.',
      cue: 'The room is leaning on a Faithful: agree with it late, with a reason of your own.',
      fit: c => (c.leanOnFaithful ? 4 : 0),
      vote: (c, o) => (!o.partner ? o.n * 1.2 : 0) },
    { id: 'kingmaker', name: 'Befriend the leader',
      how: 'Get close to the Faithful everybody listens to. Offer them an alliance, feed them your "reads", and let their trust in you shield you at the table.',
      cue: 'Back the most trusted Faithful\'s point warmly, and offer to work together.',
      fit: c => (c.allies ? 0.5 : 2.5) + (c.phase === 'tasks' ? 1 : 0) },
    { id: 'false-trail', name: 'The false trail',
      how: 'After a murder, quietly point to whoever was last seen near the victim, or handed them something — a letter looks exactly like poison from across the room.',
      cue: 'Wonder aloud who was last near the victim and what they handed over.',
      fit: c => (c.murderToday ? 3.5 : 0) },
    { id: 'wounded', name: 'The wounded Faithful',
      how: 'Play the hurt, frightened Faithful: you trusted someone who turned out wrong, you could be next. Sympathy is cover. Do not overdo it.',
      cue: 'Show a flash of real-sounding worry about being next, then ask for help finding the Traitors.',
      fit: c => (c.banishedFaithful ? 1.5 : 0.3) + (c.myHeat ? 1.5 : 0) },
    { id: 'sleeper', name: 'The sleeper',
      how: 'Keep a low profile: agree with sensible points, make few accusations of your own, never stand out. The quiet middle survives.',
      cue: 'Keep it short and agreeable; do not stand out today.',
      fit: c => (c.myHeat ? 0 : 1.5) + (c.alive >= 7 ? 1 : 0) },
    { id: 'close-it', name: 'Close the game',
      how: 'Near the end, sound certain every Traitor is gone: go over the "evidence" for who was caught, praise the group, and push for END with confidence and warmth.',
      cue: 'Sound sure the Traitors are all gone, and gently make the case for ending it.',
      fit: c => (c.atFire ? 6 : 0) + (c.alive <= 5 ? 1 : 0) },
    { id: 'revote-push', name: 'Win the revote',
      how: 'On a revote between two, there is one name to push: the Faithful of the pair. Do it with the most believable reason you have, and ask the swing voters to think again.',
      cue: 'On the revote, give the swing voters one good reason to pick the Faithful in the tie.',
      fit: c => (c.revote ? 6 : 0) },
    { id: 'scapegoat', name: 'Pin it on the quiet one',
      how: 'The player who says little is easy to doubt. Ask why they never name anyone and suggest, without accusing, that it is what a Traitor would do.',
      cue: 'Ask why the quietest player never names anybody — and let the table wonder.',
      fit: c => (c.quietOne ? 3 : 0) },
  ];

  const LIST = { faithful: FAITHFUL, traitor: TRAITOR };
  const byId = {};
  FAITHFUL.concat(TRAITOR).forEach(s => { byId[s.id] = s; });

  function strHash(s) {
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }
  const side = (c) => (c && c.traitor ? 'traitor' : 'faithful');

  // the AI's own way of playing, for the whole game
  function signature(c) {
    const list = LIST[side(c)];
    return list[strHash((c.seed | 0) + ':' + c.botId + ':' + side(c)) % list.length];
  }

  /* The moves that fit now: scored, with a little seeded wobble per day
     and phase so equal fits do not always fall the same way. */
  function situational(c, n = 2) {
    const list = LIST[side(c)];
    const sig = signature(c);
    return list.map(s => {
      let f = 0;
      try { f = +s.fit(c) || 0; } catch (e) { f = 0; }
      const wob = (strHash(c.botId + ':' + s.id + ':' + c.day + ':' + c.phase) % 1000) / 1000;
      return { s, f: f + (f > 0 ? wob * 0.9 : 0) + (s === sig ? 0.6 : 0) };
    }).filter(x => x.f > 0.25).sort((a, b) => b.f - a.f).slice(0, n).map(x => x.s);
  }

  function promptText(c) {
    if (!c) return '';
    const sig = signature(c);
    const now = situational(c, 2).filter(s => s !== sig);
    const rest = LIST[side(c)].filter(s => s !== sig && now.indexOf(s) < 0).map(s => s.name);
    return ['YOUR PLAYBOOK (' + (c.traitor ? 'Traitor' : 'Faithful') + '):',
      'Your signature strategy — "' + sig.name + '": ' + sig.how,
      now.length ? 'Right now, also: ' + now.map(s => '"' + s.name + '": ' + s.how).join(' ') : '',
      'Other plays you know and can switch to when the moment calls for it: ' + rest.join(', ') + '.',
      'Mix your plays — a player who does the same thing every day is easy to read. Never name a strategy out loud.',
    ].filter(Boolean).join('\n');
  }

  // one tactical line for this turn: the best fit right now
  function cue(c) {
    if (!c) return '';
    const top = situational(c, 1)[0] || signature(c);
    return ' Play now: ' + top.cue;
  }

  // the ballot, nudged by the plays this AI is using
  function voteBias(c, o) {
    if (!c) return 0;
    const using = situational(c, 2);
    const sig = signature(c);
    if (using.indexOf(sig) < 0) using.push(sig);
    let d = 0;
    for (const s of using) if (s.vote) { try { d += +s.vote(c, o) || 0; } catch (e) {} }
    return d;
  }

  return { FAITHFUL, TRAITOR, byId, signature, situational, promptText, cue, voteBias };
})();
