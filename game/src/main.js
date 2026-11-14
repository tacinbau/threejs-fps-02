// Ferro Yard — boot and the one loop: a fixed 60 Hz simulation feeding a render at
// the display's rate. Vanguard (the player + 3 bots) attacks; Rustjackals (4 bots)
// defend. Rounds end on elimination, a bomb explosion, a defuse, or the clock.
// ?shot=start|play|buy|end with &seed=N sets up a deterministic frame for a capture,
// renders it twice, then freezes it and sets window.__shotReady.
import * as THREE from 'three';
import { PALETTE } from './palette.js';
import { mulberry32 } from './rng.js';
import { createWorld, SPAWNS, SITES } from './world.js';
import { createInput } from './input.js';
import { createPlayer } from './player.js';
import { WEAPONS, WEAPON_ORDER, GRENADE_PRICE, createWeapon } from './weapons.js';
import { createBots } from './bots.js';
import { createRounds, BUY_SECONDS } from './rounds.js';
import { createHud } from './hud.js';
import { createAudio } from './audio.js';

const FIXED_STEP = 1 / 60;
const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seed = Number.parseInt(params.get('seed') ?? '1', 10) || 1;
const random = mulberry32(seed * 7919 + 13);

window.addEventListener('error', (event) => {
  document.body.setAttribute('data-error', String(event.message));
});

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.getElementById('game').appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(PALETTE.canvas);
scene.fog = new THREE.Fog(new THREE.Color(PALETTE.canvas), 22, 60);
const camera = new THREE.PerspectiveCamera(74, window.innerWidth / window.innerHeight, 0.05, 140);
scene.add(camera);

const world = createWorld(scene);
const audio = createAudio();
const hud = createHud();
const player = createPlayer(world.colliders, SPAWNS.vanguard[0]);
const weapon = createWeapon(camera);
const input = createInput(renderer.domElement, onLockChange);
const raycaster = new THREE.Raycaster();
raycaster.far = 90;
const bots = createBots(scene, world.colliders, world.shootables, raycaster);

const shootables = world.shootables.concat(bots.hitMeshes);
const direction = new THREE.Vector3();
const tracerPool = [];
let playerHealth = 100;
let playerAlive = true;
let money = 800;
let owned = { pistol: true, rifle: true };
let grenades = 0;
let equipped = 'rifle';
let bombCarrier = 'player'; // 'player' | bot | null
let planting = 0;
let defusing = 0;
let roundOverShown = false;
let started = false;
let frozen = false;
let elapsed = 0;
let accumulator = 0;
let lastTime = performance.now();
let deathYaw = 0;

const playerBody = {
  position: player.state.position,
  alive: true,
  get health() { return playerHealth; },
};
Object.defineProperty(playerBody, 'alive', { get: () => playerAlive });

const rounds = createRounds({
  onRoundStart(round) {
    roundOverShown = false;
    hud.showBanner(`Round ${round}`, 'Buy phase — press B to buy', 2200);
    hud.setBomb('');
    hud.plantProgress('', 0);
    if (!shot) audio.roundStart();
  },
  onLiveStart() {
    hud.showBanner('Go!', 'Plant the charge at A or B', 1600);
    // The bomb starts with the player; if the player is dead it rides with a bot.
    bombCarrier = playerAlive ? 'player' : pickCarrierBot();
    if (bombCarrier !== 'player' && bombCarrier) bombCarrier.hasBomb = true;
  },
  onRoundEnd(winner, reason) {
    const won = winner === 'vanguard';
    hud.showBanner(won ? 'Round won' : 'Round lost', reason, 3200);
    if (!shot) {
      if (won) audio.roundWin();
      else audio.roundLose();
    }
    money = rounds.state.money;
    const detail = `${reason}. Score ${rounds.state.scoreV} — ${rounds.state.scoreR}.`;
    if (rounds.state.matchOver) {
      hud.showOverlay('match', `${rounds.state.winner === 'vanguard' ? 'Vanguard' : 'Rustjackals'} take the match ${rounds.state.scoreV} — ${rounds.state.scoreR}. ${reason}`);
    } else {
      hud.showOverlay('end', detail);
    }
    if (document.pointerLockElement) document.exitPointerLock();
  },
  onPlanted(siteKey) {
    hud.showBanner('Charge planted!', `Site ${siteKey} — defend it for 40 seconds`, 2600);
    audio.plant();
  },
});

function pickCarrierBot() {
  const alive = bots.bots.filter((b) => b.team === 'vanguard' && b.alive);
  return alive.length ? alive[Math.floor(random() * alive.length)] : null;
}

function resetPositions() {
  player.reset(SPAWNS.vanguard[0]);
  playerHealth = 100;
  playerAlive = true;
  weapon.equip(equipped);
  weapon.refill();
  bots.bots.forEach((bot, i) => {
    const spawn = bot.team === 'vanguard' ? SPAWNS.vanguard[i + 1] : SPAWNS.rustjack[i % 4];
    bots.reset(bot, spawn);
  });
  for (const bot of bots.bots) {
    if (bot.team === 'vanguard') bots.pickObjective(bot, elapsed);
    else bots.pickObjective(bot, elapsed);
  }
  grenades = grenades; // grenades persist across rounds; bought ones stay
}

// Spawn the two teams: 3 Vanguard bots, 4 Rustjackal bots.
bots.spawnBot('vanguard', 0, SPAWNS.vanguard[1], seed + 101);
bots.spawnBot('vanguard', 1, SPAWNS.vanguard[2], seed + 102);
bots.spawnBot('vanguard', 2, SPAWNS.vanguard[3], seed + 103);
bots.spawnBot('rustjack', 0, SPAWNS.rustjack[0], seed + 201);
bots.spawnBot('rustjack', 1, SPAWNS.rustjack[1], seed + 202);
bots.spawnBot('rustjack', 2, SPAWNS.rustjack[2], seed + 203);
bots.spawnBot('rustjack', 3, SPAWNS.rustjack[3], seed + 204);
resetPositions();
rounds.startRound();

hud.setHealth(playerHealth);
hud.setAmmo(weapon.state.mag, weapon.state.reserve);
hud.setWeapon(weapon.def().name);
hud.setMoney(money);
hud.setGrenades(grenades);
hud.setScore(0, 0);
hud.setTimer(BUY_SECONDS, false);
hud.setAlive(4, 4);
hud.onPlay(() => {
  if (shot) return;
  audio.unlock();
  if (rounds.state.matchOver) {
    restartMatch();
    return;
  }
  if (rounds.state.phase === 'over') {
    rounds.nextRound();
    resetPositions();
    rounds.startRound();
  }
  if (!playerAlive) return; // dead: spectate until the round ends
  input.requestLock();
});

function restartMatch() {
  rounds.state.scoreV = 0;
  rounds.state.scoreR = 0;
  rounds.state.round = 1;
  rounds.state.matchOver = false;
  rounds.state.winner = null;
  money = 800;
  owned = { pistol: true, rifle: true };
  grenades = 0;
  equipped = 'rifle';
  rounds.startRound();
  resetPositions();
  hud.setScore(0, 0);
  hud.setMoney(money);
  input.requestLock();
}

function onLockChange(locked) {
  if (shot) return;
  if (locked) {
    started = true;
    hud.hideOverlay();
    hud.hideBuy();
  } else if (rounds.state.phase === 'over') {
    // overlay already shown by onRoundEnd
  } else if (!playerAlive) {
    // dead: spectating, no overlay
  } else if (!started) {
    hud.showOverlay('start');
  } else {
    hud.showOverlay('paused');
  }
}

function syncCamera() {
  if (!playerAlive) {
    camera.position.set(player.state.position.x, player.state.position.y + 1.0, player.state.position.z);
    camera.rotation.set(-0.3, deathYaw, 0, 'YXZ');
    return;
  }
  camera.position.set(player.state.position.x, player.state.position.y + player.state.eye, player.state.position.z);
  camera.rotation.set(player.state.pitch, player.state.yaw, 0, 'YXZ');
}

function aimAt(point) {
  const body = player.state;
  const dx = point.x - body.position.x;
  const dy = point.y - (body.position.y + body.eye);
  const dz = point.z - body.position.z;
  const length = Math.hypot(dx, dy, dz) || 1;
  body.yaw = Math.atan2(-dx, -dz);
  body.pitch = Math.asin(Math.max(-1, Math.min(1, dy / length)));
  syncCamera();
}

// ---- Tracers and grenades -------------------------------------------------
function spawnTracer(from, to, color = 0xf0a830) {
  const geometry = new THREE.BufferGeometry().setFromPoints([from.clone(), to.clone()]);
  const material = new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.85 });
  const line = new THREE.Line(geometry, material);
  scene.add(line);
  tracerPool.push({ line, life: 0.09 });
}

function stepTracers(dt) {
  for (let i = tracerPool.length - 1; i >= 0; i -= 1) {
    const tracer = tracerPool[i];
    tracer.life -= dt;
    tracer.line.material.opacity = Math.max(0, tracer.life / 0.09) * 0.85;
    if (tracer.life <= 0) {
      scene.remove(tracer.line);
      tracer.line.geometry.dispose();
      tracer.line.material.dispose();
      tracerPool.splice(i, 1);
    }
  }
}

const grenadeList = [];
const grenadeGeo = new THREE.SphereGeometry(0.09, 10, 8);
const grenadeMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.hazard), roughness: 0.5, metalness: 0.4 });
function throwGrenade() {
  if (grenades <= 0 || !playerAlive) return;
  grenades -= 1;
  hud.setGrenades(grenades);
  const mesh = new THREE.Mesh(grenadeGeo, grenadeMat);
  camera.getWorldDirection(direction);
  mesh.position.copy(camera.position).addScaledVector(direction, 0.4);
  scene.add(mesh);
  grenadeList.push({
    mesh,
    velocity: direction.clone().multiplyScalar(15).add(new THREE.Vector3(0, 3.5, 0)),
    fuse: 1.4,
  });
  audio.shot('smg');
}

function explodeGrenade(g) {
  scene.remove(g.mesh);
  const flash = new THREE.PointLight(new THREE.Color(PALETTE.accent), 60, 14);
  flash.position.copy(g.mesh.position);
  scene.add(flash);
  setTimeout(() => scene.remove(flash), 120);
  const blast = new THREE.Mesh(
    new THREE.SphereGeometry(1, 16, 12),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.accent), transparent: true, opacity: 0.5, depthWrite: false }),
  );
  blast.position.copy(g.mesh.position);
  scene.add(blast);
  setTimeout(() => scene.remove(blast), 180);
  audio.explosion();
  const victims = [...bots.bots];
  for (const bot of victims) {
    if (!bot.alive) continue;
    const d = Math.hypot(bot.position.x - g.mesh.position.x, bot.position.z - g.mesh.position.z);
    if (d < 6) {
      const damage = Math.round(120 * (1 - d / 6) + 10);
      const killed = bots.damage(bot, damage);
      if (killed) onBotKilled(bot, 'You', false);
      else if (bot.team === 'rustjack') bot.heardAt = { x: g.mesh.position.x, z: g.mesh.position.z };
    }
  }
  if (playerAlive) {
    const d = Math.hypot(player.state.position.x - g.mesh.position.x, player.state.position.z - g.mesh.position.z);
    if (d < 6) hurtPlayer(Math.round(90 * (1 - d / 6) + 5), 'grenade');
  }
  // Everyone nearby hears it.
  for (const bot of bots.bots) {
    if (bot.alive) bot.heardAt = { x: g.mesh.position.x, z: g.mesh.position.z };
  }
}

function stepGrenades(dt) {
  for (let i = grenadeList.length - 1; i >= 0; i -= 1) {
    const g = grenadeList[i];
    g.velocity.y -= 14 * dt;
    g.mesh.position.addScaledVector(g.velocity, dt);
    if (g.mesh.position.y < 0.1) {
      g.mesh.position.y = 0.1;
      g.velocity.y = Math.abs(g.velocity.y) * 0.35;
      g.velocity.x *= 0.6;
      g.velocity.z *= 0.6;
    }
    g.fuse -= dt;
    if (g.fuse <= 0) {
      explodeGrenade(g);
      grenadeList.splice(i, 1);
    }
  }
}

// ---- Combat ----------------------------------------------------------------
function hurtPlayer(damage, source) {
  if (!playerAlive) return;
  playerHealth -= damage;
  hud.setHealth(playerHealth);
  hud.damage();
  audio.hurt();
  if (playerHealth <= 0) {
    playerHealth = 0;
    playerAlive = false;
    deathYaw = player.state.yaw;
    hud.setHealth(0);
    hud.killfeed(source, 'You', false);
    hud.showBanner('Eliminated', 'Your team fights on — spectating until the round ends.', 4000);
    if (bombCarrier === 'player') {
      const next = pickCarrierBot();
      bombCarrier = next;
      if (next) {
        next.hasBomb = true;
        bots.setRoute(next, next.siteTarget ?? 'siteA');
      }
    }
    if (document.pointerLockElement) document.exitPointerLock();
  }
}

function onBotKilled(bot, killerName, headshot) {
  hud.killfeed(killerName, bot.name, headshot);
  if (bot.team === 'rustjack' && killerName === 'You') {
    money += 300;
    rounds.state.money = money;
    hud.setMoney(money);
    audio.kill();
  }
  if (bot.hasBomb) {
    bot.hasBomb = false;
    const next = pickCarrierBot();
    bombCarrier = next;
    if (next) {
      next.hasBomb = true;
      bots.setRoute(next, next.siteTarget ?? 'siteA');
    }
  }
}

function shoot(spread) {
  if (!playerAlive || !weapon.takeRound()) {
    if (weapon.state.mag === 0) audio.dryFire();
    return false;
  }
  camera.getWorldDirection(direction);
  direction.x += (random() * 2 - 1) * spread;
  direction.y += (random() * 2 - 1) * spread;
  direction.z += (random() * 2 - 1) * spread;
  direction.normalize();
  scene.updateMatrixWorld(true);
  raycaster.set(camera.position, direction);
  const hit = raycaster.intersectObjects(shootables, false)[0];
  const end = hit ? hit.point : camera.position.clone().addScaledVector(direction, 80);
  spawnTracer(camera.position.clone().addScaledVector(direction, 0.5), end);
  if (hit && hit.object.userData.bot) {
    const bot = hit.object.userData.bot;
    const head = hit.object.userData.part === 'head';
    const def = weapon.def();
    const killed = bots.damage(bot, Math.round(def.damage * (head ? def.headMult : 1)));
    hud.hitMarker(killed, shot ? 4000 : 90);
    audio.hit();
    if (killed) onBotKilled(bot, 'You', head);
  }
  weapon.pullTrigger();
  audio.shot(weapon.def().kind);
  player.recoil(0.009 + random() * 0.004, (random() * 2 - 1) * 0.004);
  hud.setAmmo(weapon.state.mag, weapon.state.reserve);
  // Nearby bots hear the shot.
  for (const bot of bots.bots) {
    if (!bot.alive) continue;
    const d = Math.hypot(bot.position.x - player.state.position.x, bot.position.z - player.state.position.z);
    if (d < 26) bot.heardAt = { x: player.state.position.x, z: player.state.position.z };
  }
  return true;
}

function botShoot(bot, target, aimError) {
  const dx = target.position.x - bot.position.x;
  const dz = target.position.z - bot.position.z;
  const dist = Math.hypot(dx, dz);
  const hitChance = Math.max(0.08, Math.min(0.55, 0.5 - dist * 0.008 - aimError * 0.25));
  const from = new THREE.Vector3(bot.position.x, bot.position.y + 1.35, bot.position.z);
  const hit = bot.random() < hitChance;
  const targetPos = new THREE.Vector3(target.position.x, target.position.y + 1.2, target.position.z);
  if (!hit) {
    targetPos.x += (bot.random() * 2 - 1) * 1.6;
    targetPos.y += (bot.random() * 2 - 1) * 1.2;
    targetPos.z += (bot.random() * 2 - 1) * 1.6;
  }
  spawnTracer(from, targetPos, bot.team === 'vanguard' ? 0xf0a830 : 0xd6543c);
  if (!hit) return;
  if (target === playerBody) {
    hurtPlayer(12, bot.name);
  } else {
    const head = bot.random() < 0.15;
    const killed = bots.damage(target, head ? 100 : 34);
    if (killed) {
      hud.killfeed(bot.name, target.name, head);
      if (target.hasBomb) onBotKilled(target, bot.name, head);
    }
  }
}

// ---- Buy menu ---------------------------------------------------------------
function openBuy() {
  if (rounds.state.phase !== 'buy') return;
  const items = WEAPON_ORDER.map((id) => {
    const def = WEAPONS[id];
    return { id, name: def.name, price: def.price, owned: !!owned[id], afford: money >= def.price };
  });
  items.push({ id: 'grenade', name: 'Spark Grenade', price: GRENADE_PRICE, owned: false, afford: money >= GRENADE_PRICE });
  hud.showBuy(items, money, (id) => {
    if (id === 'grenade') {
      if (money < GRENADE_PRICE) return;
      money -= GRENADE_PRICE;
      grenades += 1;
      hud.setGrenades(grenades);
    } else {
      const def = WEAPONS[id];
      if (owned[id] || money < def.price) return;
      money -= def.price;
      owned[id] = true;
      equipped = id;
      weapon.equip(id);
      hud.setWeapon(def.name);
      hud.setAmmo(weapon.state.mag, weapon.state.reserve);
    }
    rounds.state.money = money;
    hud.setMoney(money);
    audio.buy();
    openBuy();
  });
}

// ---- Plant / defuse ---------------------------------------------------------
function siteNear(x, z) {
  for (const [key, site] of Object.entries(SITES)) {
    if (Math.hypot(x - site.x, z - site.z) < site.radius) return key;
  }
  return null;
}

function stepInteract(dt) {
  const bomb = rounds.state.bomb;
  if (rounds.state.phase !== 'live' || !playerAlive) {
    planting = 0;
    defusing = 0;
    hud.plantProgress('', 0);
    return;
  }
  const keys = input.state.keys;
  if (!keys.has('KeyE')) {
    planting = 0;
    defusing = 0;
    hud.plantProgress('', 0);
    return;
  }
  if (!bomb.planted && bombCarrier === 'player') {
    const site = siteNear(player.state.position.x, player.state.position.z);
    if (site) {
      planting += dt;
      hud.plantProgress(`Planting charge at site ${site}…`, planting / 3);
      if (planting >= 3) {
        rounds.plant(site);
        bombCarrier = null;
        hud.plantProgress('', 0);
      }
      return;
    }
  }
  if (bomb.planted) {
    const d = Math.hypot(player.state.position.x - bomb.x, player.state.position.z - bomb.z);
    if (d < 2.2) {
      defusing += dt;
      hud.plantProgress('Defusing charge…', defusing / 5);
      if (defusing >= 5) {
        rounds.defuse();
        hud.plantProgress('', 0);
      }
      return;
    }
  }
  hud.plantProgress('', 0);
}

// ---- Simulation step --------------------------------------------------------
function aliveCounts() {
  const vanguard = (playerAlive ? 1 : 0) + bots.bots.filter((b) => b.team === 'vanguard' && b.alive).length;
  const rustjack = bots.bots.filter((b) => b.team === 'rustjack' && b.alive).length;
  return { vanguard, rustjack };
}

function step(dt) {
  elapsed += dt;
  const roundActive = rounds.state.phase === 'live' || rounds.state.phase === 'buy';
  if (playerAlive && roundActive) player.step(dt, input.state.keys);
  weapon.step(dt);
  stepTracers(dt);
  stepGrenades(dt);
  stepInteract(dt);

  const enemiesForBots = bots.bots.filter((b) => b.alive);
  const hooks = {
    player: playerBody,
    roundActive: rounds.state.phase === 'live',
    bomb: rounds.state.bomb,
    botShoot,
    botPlanting(bot, progress) {
      hud.plantProgress(`${bot.name} is planting…`, progress / 3);
    },
    botPlanted(bot) {
      rounds.plant(bot.siteTarget ?? 'siteA');
      bot.hasBomb = false;
      bombCarrier = null;
    },
    botDefusing(bot, progress) {
      hud.plantProgress(`${bot.name} is defusing…`, progress / 5);
    },
    botDefused() {
      rounds.defuse();
    },
  };
  for (const bot of bots.bots) {
    const enemies = bot.team === 'vanguard'
      ? bots.bots.filter((b) => b.team === 'rustjack' && b.alive)
      : [...bots.bots.filter((b) => b.team === 'vanguard' && b.alive), playerBody];
    bots.step(bot, dt, elapsed, { ...hooks, enemies });
  }

  const counts = aliveCounts();
  rounds.step(dt, counts);
  hud.setTimer(rounds.state.roundTime, rounds.state.bomb.planted);
  hud.setScore(rounds.state.scoreV, rounds.state.scoreR);
  hud.setAlive(counts.vanguard, counts.rustjack);
  hud.setBomb(rounds.state.bomb.planted
    ? `CHARGE PLANTED — SITE ${rounds.state.bomb.site} — ${Math.max(0, Math.ceil(rounds.state.bomb.timer))}s`
    : (bombCarrier === 'player' && rounds.state.phase === 'live' ? 'YOU CARRY THE CHARGE — plant at A or B (hold E)' : ''));
  if (rounds.state.phase === 'buy') {
    hud.setTimer(rounds.state.roundTime, false);
  }
}

function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min((now - lastTime) / 1000, 0.1);
  lastTime = now;
  if (!frozen) {
    const look = input.takeLook();
    if (playerAlive) player.look(look.x, look.y);
    // Number keys switch owned weapons; B buys; G throws a grenade.
    if (input.wasPressed('KeyB') && !hud.buyVisible()) openBuy();
    else if (input.wasPressed('KeyB') && hud.buyVisible()) hud.hideBuy();
    if (input.wasPressed('KeyG')) throwGrenade();
    for (let i = 0; i < WEAPON_ORDER.length; i += 1) {
      const code = `Digit${i + 1}`;
      if (input.wasPressed(code) && owned[WEAPON_ORDER[i]]) {
        equipped = WEAPON_ORDER[i];
        weapon.equip(equipped);
        hud.setWeapon(weapon.def().name);
        hud.setAmmo(weapon.state.mag, weapon.state.reserve);
      }
    }
    if (input.state.firing && weapon.ready() && weapon.def().auto) {
      shoot(shot ? 0 : weapon.spread(player.groundSpeed()));
    } else if (input.state.firing && weapon.ready() && !weapon.def().auto) {
      // Semi-auto: fire once per press.
      if (input.wasPressed('MouseLeft')) shoot(weapon.spread(player.groundSpeed()));
    }
    if (input.state.keys.has('KeyR')) weapon.reload();
    accumulator += dt;
    let steps = 0;
    while (accumulator >= FIXED_STEP && steps < 5) {
      step(FIXED_STEP);
      accumulator -= FIXED_STEP;
      steps += 1;
    }
    if (accumulator > FIXED_STEP * 5) accumulator = 0;
    syncCamera();
    input.endFrame();
  }
  renderer.render(scene, camera);
}

function settle(steps) {
  for (let index = 0; index < steps; index += 1) step(FIXED_STEP);
}

function runShot(name) {
  hud.hideOverlay();
  hud.hideBuy();
  money = 2450;
  hud.setMoney(money);
  grenades = 1;
  hud.setGrenades(grenades);
  if (name === 'start') {
    player.state.position.set(-1.5, 0, 12.5);
    player.state.yaw = 0;
    player.state.pitch = 0;
    settle(20);
    aimAt(new THREE.Vector3(0, 1.4, -6));
    hud.showOverlay('start');
  } else if (name === 'buy') {
    player.state.position.set(0, 0, 12);
    player.state.yaw = 0.4;
    settle(20);
    aimAt(new THREE.Vector3(-6, 1.5, -2));
    rounds.state.phase = 'buy';
    rounds.state.roundTime = 9;
    hud.setTimer(9, false);
    openBuy();
  } else if (name === 'play' || name === 'end') {
    // A live round, mid-fight. Let the sim run first, then place the actors on
    // open ground south of mid, so the crosshair bot is in plain sight.
    rounds.state.phase = 'live';
    rounds.state.roundTime = 62;
    rounds.state.scoreV = 2;
    rounds.state.scoreR = 1;
    settle(20);
    const enemy = bots.bots.find((b) => b.team === 'rustjack');
    const friend = bots.bots.find((b) => b.team === 'vanguard');
    const enemy2 = bots.bots.filter((b) => b.team === 'rustjack')[1];
    for (const bot of [enemy, friend, enemy2]) {
      if (!bot.alive) {
        bot.alive = true;
        bot.health = 100;
        bot.meshes.group.visible = true;
      }
    }
    enemy.position.set(-2.5, 0, 1.5);
    enemy.yaw = Math.PI * 0.85;
    enemy.meshes.group.position.copy(enemy.position);
    enemy.meshes.group.rotation.y = enemy.yaw;
    enemy2.position.set(6, 0, -9);
    enemy2.yaw = Math.PI * 0.8;
    enemy2.meshes.group.position.copy(enemy2.position);
    enemy2.meshes.group.rotation.y = enemy2.yaw;
    friend.position.set(-5, 0, 5);
    friend.yaw = -0.4;
    friend.meshes.group.position.copy(friend.position);
    friend.meshes.group.rotation.y = friend.yaw;
    player.state.position.set(1, 0, 8);
    player.state.yaw = 0;
    player.state.pitch = 0;
    if (name === 'play') {
      aimAt(new THREE.Vector3(enemy.position.x, 1.25, enemy.position.z));
      shoot(0);
    } else {
      rounds.state.scoreV = 3;
      rounds.endRound('vanguard', 'Rustjackals eliminated');
      hud.showOverlay('end', 'Rustjackals eliminated. Score 3 — 1.');
      hud.hideBanner();
      hud.setBomb('');
      player.state.position.set(1, 0, 8);
      aimAt(new THREE.Vector3(-2.5, 1.25, 1.5));
    }
  }
  hud.hideBanner();
  hud.setScore(rounds.state.scoreV, rounds.state.scoreR);
  hud.setAmmo(weapon.state.mag, weapon.state.reserve);
  hud.setHealth(playerHealth);
  hud.setAlive(aliveCounts().vanguard, aliveCounts().rustjack);
  paintTwiceThenReady();
}

function paintTwiceThenReady() {
  let painted = 0;
  function paint() {
    requestAnimationFrame(paint);
    syncCamera();
    renderer.render(scene, camera);
    painted += 1;
    if (painted === 2) {
      window.__shotReady = true;
      frozen = true;
    }
  }
  requestAnimationFrame(paint);
}

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

syncCamera();
if (shot) runShot(shot);
else requestAnimationFrame(frame);
