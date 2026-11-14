// Bots: a body the raycaster can hit, a small state machine, and routes through the
// waypoint graph. Attackers push a bomb site; defenders hold ground near the sites
// and mid. A bot that sees an enemy stops, aims with error, and fires in bursts;
// a bot that hears a shot nearby turns toward it. The bomb carrier walks to the
// nearest site and plants when it arrives.
import * as THREE from 'three';
import { PALETTE } from './palette.js';
import { createMover, wishFromYaw } from './mover.js';
import { WAYPOINTS, WAYPOINT_EDGES } from './world.js';
import { mulberry32 } from './rng.js';

const HEALTH = 100;
const BOT_SPEED = 3.4;
const BOT_HEIGHT = 1.72;
const EYE = 1.55;
const SEE_RANGE = 38;
const SEE_FOV = 1.9; // radians of half-angle the bot can notice a target in
const ENGAGE_RANGE = 32;
const SHOT_GAP = 0.34;
const BURST = 3;
const BURST_PAUSE = 0.9;

const NAMES_VANGUARD = ['Ash', 'Bram', 'Kito'];
const NAMES_RUSTJACK = ['Vex', 'Rook', 'Mara', 'Juno'];

const waypointById = new Map(WAYPOINTS.map((w) => [w.id, w]));
const adjacency = new Map();
for (const [a, b] of WAYPOINT_EDGES) {
  if (!adjacency.has(a)) adjacency.set(a, []);
  if (!adjacency.has(b)) adjacency.set(b, []);
  adjacency.get(a).push(b);
  adjacency.get(b).push(a);
}

function nearestWaypoint(x, z) {
  let best = WAYPOINTS[0];
  let bestD = Infinity;
  for (const w of WAYPOINTS) {
    const d = (w.x - x) ** 2 + (w.z - z) ** 2;
    if (d < bestD) {
      bestD = d;
      best = w;
    }
  }
  return best.id;
}

// Breadth-first route over the waypoint graph.
function route(fromId, toId) {
  if (fromId === toId) return [toId];
  const prev = new Map([[fromId, null]]);
  const queue = [fromId];
  while (queue.length) {
    const current = queue.shift();
    for (const next of adjacency.get(current) ?? []) {
      if (prev.has(next)) continue;
      prev.set(next, current);
      if (next === toId) {
        const path = [toId];
        let node = toId;
        while (prev.get(node) !== null) {
          node = prev.get(node);
          path.unshift(node);
        }
        return path;
      }
      queue.push(next);
    }
  }
  return [toId];
}

export function createBots(scene, colliders, shootables, raycaster) {
  const mover = createMover(colliders);
  const bots = [];
  const hitMeshes = [];
  const tmp = new THREE.Vector3();
  const tmpDir = new THREE.Vector3();

  function makeBodyMesh(team, name) {
    const group = new THREE.Group();
    const teamColor = team === 'vanguard' ? PALETTE.vanguard : PALETTE.rustjack;
    const suit = new THREE.MeshStandardMaterial({ color: new THREE.Color(teamColor), roughness: 0.65, metalness: 0.1 });
    const dark = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.surface), roughness: 0.8 });
    const visor = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.ink), roughness: 0.3, metalness: 0.4 });
    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.78, 0.3), suit);
    torso.position.y = 1.0;
    torso.userData.part = 'torso';
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.16, 16, 12), visor);
    head.position.y = 1.55;
    head.userData.part = 'head';
    const legs = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.55, 0.26), dark);
    legs.position.y = 0.28;
    const gun = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.09, 0.62), dark);
    gun.position.set(0.28, 1.15, -0.2);
    group.add(torso, head, legs, gun);
    group.traverse((mesh) => {
      if (mesh.isMesh) {
        mesh.castShadow = true;
        mesh.receiveShadow = true;
      }
    });
    scene.add(group);
    return { group, torso, head };
  }

  function spawnBot(team, index, spawn, seed) {
    const random = mulberry32(seed);
    const name = team === 'vanguard' ? NAMES_VANGUARD[index] : NAMES_RUSTJACK[index];
    const meshes = makeBodyMesh(team, name);
    const bot = {
      team,
      name,
      index,
      random,
      meshes,
      position: new THREE.Vector3(spawn.x, 0, spawn.z),
      velocity: new THREE.Vector3(),
      yaw: spawn.yaw ?? 0,
      height: BOT_HEIGHT,
      onGround: true,
      health: HEALTH,
      alive: true,
      state: 'idle', // idle | route | hold | engage | plant | defuse
      path: [],
      pathIndex: 0,
      holdUntil: 0,
      target: null,
      burstLeft: 0,
      shotCooldown: 0,
      burstPause: 0,
      aimError: 0,
      scanCooldown: 0,
      strafeDir: 1,
      strafeUntil: 0,
      hasBomb: false,
      planting: 0,
      defusing: 0,
      siteTarget: null,
      heardAt: null,
      flashUntil: 0,
    };
    meshes.torso.userData.bot = bot;
    meshes.head.userData.bot = bot;
    hitMeshes.push(meshes.torso, meshes.head);
    bots.push(bot);
    return bot;
  }

  function setRoute(bot, toId) {
    const from = nearestWaypoint(bot.position.x, bot.position.z);
    bot.path = route(from, toId);
    bot.pathIndex = 0;
    bot.state = 'route';
  }

  function faceToward(bot, x, z, dt, rate = 6) {
    const want = Math.atan2(-(x - bot.position.x), -(z - bot.position.z));
    let diff = want - bot.yaw;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    bot.yaw += Math.max(-rate * dt, Math.min(rate * dt, diff));
    return Math.abs(diff);
  }

  function canSee(bot, targetPos) {
    tmp.copy(targetPos);
    tmp.y = 1.2;
    tmpDir.copy(tmp).sub(new THREE.Vector3(bot.position.x, bot.position.y + EYE, bot.position.z));
    const distance = tmpDir.length();
    if (distance > SEE_RANGE) return false;
    const facing = new THREE.Vector3(-Math.sin(bot.yaw), 0, -Math.cos(bot.yaw));
    const flat = tmpDir.clone();
    flat.y = 0;
    flat.normalize();
    if (flat.dot(facing) < Math.cos(SEE_FOV) && distance > 4) return false;
    tmpDir.normalize();
    raycaster.set(new THREE.Vector3(bot.position.x, bot.position.y + EYE, bot.position.z), tmpDir);
    raycaster.far = distance;
    const hit = raycaster.intersectObjects(shootables, false)[0];
    return !hit;
  }

  // The one public scan: main.js passes the list of living enemies (bots + player).
  function scan(bot, enemies, now) {
    bot.scanCooldown -= 1 / 60;
    if (bot.scanCooldown > 0) return;
    bot.scanCooldown = 0.15;
    let best = null;
    let bestD = ENGAGE_RANGE;
    for (const enemy of enemies) {
      if (!enemy.alive) continue;
      const dx = enemy.position.x - bot.position.x;
      const dz = enemy.position.z - bot.position.z;
      const d = Math.hypot(dx, dz);
      if (d > bestD) continue;
      if (!canSee(bot, enemy.position)) continue;
      best = enemy;
      bestD = d;
    }
    if (best) {
      bot.target = best;
      bot.state = 'engage';
      bot.aimError = 0.35 + bot.random() * 0.5;
      bot.burstLeft = BURST;
    } else if (bot.state === 'engage') {
      bot.target = null;
      bot.state = 'route';
      if (bot.pathIndex >= bot.path.length) pickObjective(bot, now);
    }
  }

  function pickObjective(bot, now) {
    if (bot.team === 'vanguard') {
      const site = bot.siteTarget ?? (bot.random() < 0.5 ? 'siteA' : 'siteB');
      bot.siteTarget = site;
      setRoute(bot, site);
    } else {
      const hold = bot.random() < 0.5 ? (bot.random() < 0.5 ? 'westN' : 'eastN') : (bot.random() < 0.5 ? 'mid' : 'midN');
      setRoute(bot, hold);
      bot.state = 'hold';
      bot.holdUntil = now + 4 + bot.random() * 4;
    }
  }

  function damage(bot, amount) {
    if (!bot.alive) return false;
    bot.health -= amount;
    if (bot.health > 0) return false;
    bot.alive = false;
    bot.health = 0;
    bot.meshes.group.visible = false;
    return true;
  }

  function reset(bot, spawn) {
    bot.position.set(spawn.x, 0, spawn.z);
    bot.velocity.set(0, 0, 0);
    bot.yaw = spawn.yaw ?? 0;
    bot.health = HEALTH;
    bot.alive = true;
    bot.state = 'idle';
    bot.path = [];
    bot.pathIndex = 0;
    bot.target = null;
    bot.hasBomb = false;
    bot.planting = 0;
    bot.defusing = 0;
    bot.siteTarget = null;
    bot.meshes.group.visible = true;
    bot.meshes.group.position.copy(bot.position);
    bot.meshes.group.rotation.y = bot.yaw;
  }

  function step(bot, dt, now, hooks) {
    if (!bot.alive) return;
    const { player, enemies, bomb, roundActive } = hooks;
    if (!roundActive) {
      bot.meshes.group.position.copy(bot.position);
      bot.meshes.group.rotation.y = bot.yaw;
      return;
    }

    // Hearing: a nearby shot turns the bot toward the noise.
    if (bot.heardAt && bot.state !== 'engage') {
      faceToward(bot, bot.heardAt.x, bot.heardAt.z, dt, 8);
      bot.heardAt = null;
    }

    scan(bot, enemies, now);

    if (bot.state === 'engage' && bot.target) {
      const t = bot.target;
      if (!t.alive) {
        bot.target = null;
        bot.state = 'route';
        pickObjective(bot, now);
      } else {
        const dx = t.position.x - bot.position.x;
        const dz = t.position.z - bot.position.z;
        const dist = Math.hypot(dx, dz);
        faceToward(bot, t.position.x, t.position.z, dt, 7);
        // Strafe while firing, and close distance when far away.
        if (now > bot.strafeUntil) {
          bot.strafeDir = bot.random() < 0.5 ? -1 : 1;
          bot.strafeUntil = now + 0.7 + bot.random() * 0.8;
        }
        const forward = dist > 14 ? 1 : 0;
        const wish = wishFromYaw(bot.yaw, forward, bot.strafeDir * 0.7);
        mover.move(bot, dt, wish, BOT_SPEED * 0.7, 30, 8);
        mover.settleVertical(bot, dt, 20);
        bot.shotCooldown -= dt;
        if (bot.shotCooldown <= 0 && bot.burstLeft > 0) {
          bot.shotCooldown = SHOT_GAP;
          bot.burstLeft -= 1;
          hooks.botShoot(bot, t, bot.aimError);
          if (bot.burstLeft === 0) {
            bot.burstPause = BURST_PAUSE + bot.random() * 0.5;
          }
        } else if (bot.burstLeft === 0) {
          bot.burstPause -= dt;
          if (bot.burstPause <= 0) bot.burstLeft = BURST;
        }
      }
    } else if (bot.state === 'route' && bot.path.length) {
      const node = waypointById.get(bot.path[bot.pathIndex]);
      const dx = node.x - bot.position.x;
      const dz = node.z - bot.position.z;
      const dist = Math.hypot(dx, dz);
      if (dist < 0.6) {
        bot.pathIndex += 1;
        if (bot.pathIndex >= bot.path.length) {
          if (bot.team === 'vanguard' && bot.hasBomb) {
            bot.state = 'plant';
            bot.planting = 0;
          } else if (bot.team === 'vanguard') {
            bot.state = 'hold';
            bot.holdUntil = now + 2 + bot.random() * 3;
          } else {
            bot.state = 'hold';
            bot.holdUntil = now + 4 + bot.random() * 4;
          }
        }
      } else {
        faceToward(bot, node.x, node.z, dt, 6);
        const wish = wishFromYaw(bot.yaw, 1, 0);
        mover.move(bot, dt, wish, BOT_SPEED, 30, 8);
        mover.settleVertical(bot, dt, 20);
      }
    } else if (bot.state === 'hold') {
      mover.move(bot, dt, new THREE.Vector3(), 0, 30, 8);
      if (now > bot.holdUntil) pickObjective(bot, now);
    } else if (bot.state === 'plant') {
      bot.planting += dt;
      hooks.botPlanting(bot, bot.planting);
      if (bot.planting >= 3) {
        bot.planting = 0;
        bot.state = 'hold';
        hooks.botPlanted(bot);
      }
    } else if (bot.state === 'defuse') {
      bot.defusing += dt;
      hooks.botDefusing(bot, bot.defusing);
      if (bot.defusing >= 5) {
        bot.defusing = 0;
        bot.state = 'hold';
        hooks.botDefused(bot);
      }
    } else {
      // idle: pick an objective and go.
      pickObjective(bot, now);
    }

    // A defender that sees a planted bomb walks to it and defuses.
    if (bot.team === 'rustjack' && bomb.planted && bot.state !== 'engage' && bot.state !== 'defuse') {
      const d = Math.hypot(bomb.x - bot.position.x, bomb.z - bot.position.z);
      if (d < 2.2) {
        bot.state = 'defuse';
        bot.defusing = 0;
      } else if (bot.state === 'hold' || bot.state === 'route') {
        setRoute(bot, nearestWaypoint(bomb.x, bomb.z));
      }
    }

    bot.meshes.group.position.copy(bot.position);
    bot.meshes.group.rotation.y = bot.yaw;
  }

  return {
    bots,
    hitMeshes,
    spawnBot,
    damage,
    reset,
    step,
    setRoute,
    pickObjective,
    canSee,
  };
}
