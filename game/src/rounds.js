// Rounds and the economy: buy phase, live round, bomb plant and defuse, round end,
// and the match. Vanguard attacks and plants; Rustjackals defend. A round is won by
// eliminating the other team, by the bomb exploding, by defusing it, or by the clock
// running out with no plant. Money is earned per kill and per round, and spent in
// the buy menu between rounds. First to 5 rounds takes the match.
import { SITES } from './world.js';

export const BUY_SECONDS = 12;
export const ROUND_SECONDS = 100;
export const PLANT_SECONDS = 40;
export const WIN_ROUNDS = 5;
export const KILL_REWARD = 300;
export const WIN_REWARD = 3250;
export const LOSS_REWARD = 1900;
export const PLANT_REWARD = 300;

export function createRounds(events) {
  const state = {
    phase: 'buy', // buy | live | over
    round: 1,
    roundTime: BUY_SECONDS,
    scoreV: 0,
    scoreR: 0,
    money: 800,
    bomb: { carriedBy: null, planted: false, x: 0, z: 0, site: null, timer: 0, progress: 0 },
    matchOver: false,
    winner: null,
    reason: '',
    kills: 0,
    deaths: 0,
  };

  function startRound() {
    state.phase = 'buy';
    state.roundTime = BUY_SECONDS;
    state.bomb = { carriedBy: null, planted: false, x: 0, z: 0, site: null, timer: 0, progress: 0 };
    events.onRoundStart(state.round);
  }

  function startLive() {
    state.phase = 'live';
    state.roundTime = ROUND_SECONDS;
    events.onLiveStart();
  }

  function endRound(winner, reason) {
    if (state.phase === 'over') return;
    state.phase = 'over';
    state.reason = reason;
    if (winner === 'vanguard') {
      state.scoreV += 1;
      state.money += WIN_REWARD;
    } else {
      state.scoreR += 1;
      state.money += LOSS_REWARD;
    }
    if (state.scoreV >= WIN_ROUNDS || state.scoreR >= WIN_ROUNDS) {
      state.matchOver = true;
      state.winner = state.scoreV >= WIN_ROUNDS ? 'vanguard' : 'rustjack';
    }
    events.onRoundEnd(winner, reason, state);
  }

  function plant(siteKey) {
    const site = SITES[siteKey];
    state.bomb.planted = true;
    state.bomb.x = site.x;
    state.bomb.z = site.z;
    state.bomb.site = siteKey;
    state.bomb.timer = PLANT_SECONDS;
    state.bomb.progress = 0;
    state.money += PLANT_REWARD;
    events.onPlanted(siteKey);
  }

  function defuse() {
    state.bomb.planted = false;
    state.bomb.progress = 0;
    endRound('rustjack', 'Bomb defused');
  }

  function explode() {
    state.bomb.planted = false;
    endRound('vanguard', 'Bomb detonated');
  }

  function step(dt, alive) {
    if (state.phase === 'buy') {
      state.roundTime -= dt;
      if (state.roundTime <= 0) startLive();
      return;
    }
    if (state.phase !== 'live') return;
    state.roundTime -= dt;
    if (state.bomb.planted) {
      state.bomb.timer -= dt;
      if (state.bomb.timer <= 0) {
        explode();
        return;
      }
    } else if (state.roundTime <= 0) {
      endRound('rustjack', 'Time expired — site held');
      return;
    }
    if (alive.vanguard === 0 && alive.rustjack > 0) {
      endRound('rustjack', 'Vanguard eliminated');
    } else if (alive.rustjack === 0 && alive.vanguard > 0) {
      endRound('vanguard', 'Rustjackals eliminated');
    } else if (alive.vanguard === 0 && alive.rustjack === 0) {
      endRound('rustjack', 'Both teams down — defenders hold');
    }
  }

  function nextRound() {
    state.round += 1;
    startRound();
  }

  return {
    state,
    startRound,
    startLive,
    endRound,
    plant,
    defuse,
    explode,
    step,
    nextRound,
  };
}
