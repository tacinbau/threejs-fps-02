// The armoury: four guns and a grenade, each with its own price, damage, fire rate,
// magazine and spread behaviour. Accuracy counts more than speed: every weapon's
// spread grows while its owner moves, and headshots multiply damage.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

export const WEAPONS = {
  pistol: {
    id: 'pistol', name: 'P9 Sidearm', price: 0, damage: 26, headMult: 2.5,
    mag: 12, reserve: 48, fireGap: 0.16, reloadTime: 1.2,
    spreadStill: 0.003, spreadMoving: 0.02, auto: false, kind: 'pistol',
  },
  rifle: {
    id: 'rifle', name: 'VK-7 Carbine', price: 2700, damage: 34, headMult: 2.9,
    mag: 30, reserve: 90, fireGap: 0.096, reloadTime: 1.9,
    spreadStill: 0.0022, spreadMoving: 0.028, auto: true, kind: 'rifle',
  },
  smg: {
    id: 'smg', name: 'Kestrel-9 SMG', price: 1500, damage: 22, headMult: 2.5,
    mag: 28, reserve: 112, fireGap: 0.068, reloadTime: 1.6,
    spreadStill: 0.004, spreadMoving: 0.032, auto: true, kind: 'smg',
  },
  dmr: {
    id: 'dmr', name: 'Longbow DMR', price: 4000, damage: 80, headMult: 2.5,
    mag: 8, reserve: 24, fireGap: 0.9, reloadTime: 2.6,
    spreadStill: 0.0006, spreadMoving: 0.05, auto: false, kind: 'dmr',
  },
};
export const GRENADE_PRICE = 300;
export const WEAPON_ORDER = ['pistol', 'rifle', 'smg', 'dmr'];

const MUZZLE_TIME = 0.06;

export function createWeapon(camera) {
  const grip = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.hairline), roughness: 0.7, metalness: 0.2 });
  const body = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.ink), roughness: 0.5, metalness: 0.35 });
  const dark = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.surface), roughness: 0.6, metalness: 0.4 });

  const model = new THREE.Group();
  let receiver;
  let barrel;
  let stock;
  let sight;
  function buildModel(def) {
    while (model.children.length) model.remove(model.children[0]);
    const long = def.kind === 'dmr' ? 1.5 : def.kind === 'rifle' ? 1.25 : def.kind === 'smg' ? 0.9 : 0.55;
    receiver = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.1, 0.42 * long), body);
    barrel = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.045, 0.4 * long), grip);
    barrel.position.set(0, 0.025, -0.38 * long);
    stock = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.08, 0.22), grip);
    stock.position.set(0, -0.02, 0.3);
    model.add(receiver, barrel, stock);
    if (def.kind === 'dmr' || def.kind === 'rifle') {
      sight = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.06, 0.16), dark);
      sight.position.set(0, 0.09, -0.05);
      model.add(sight);
    }
    if (def.kind === 'smg') {
      const mag = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.18, 0.08), dark);
      mag.position.set(0, -0.12, 0.05);
      model.add(mag);
    }
  }
  model.position.set(0.24, -0.2, -0.42);
  camera.add(model);

  const flash = new THREE.Mesh(
    new THREE.PlaneGeometry(0.24, 0.24),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.accent), transparent: true, opacity: 0.9, depthWrite: false, side: THREE.DoubleSide }),
  );
  flash.position.set(0.24, -0.18, -0.95);
  flash.visible = false;
  camera.add(flash);

  const flashLight = new THREE.PointLight(new THREE.Color(PALETTE.accent), 0, 5);
  flashLight.position.set(0.24, -0.16, -0.6);
  camera.add(flashLight);

  let def = WEAPONS.rifle;
  buildModel(def);
  const state = {
    weaponId: 'rifle', mag: def.mag, reserve: def.reserve,
    cooldown: 0, reloadLeft: 0, flash: 0, kick: 0,
  };

  function step(dt) {
    state.cooldown = Math.max(0, state.cooldown - dt);
    state.flash = Math.max(0, state.flash - dt);
    state.kick += (0 - state.kick) * Math.min(1, dt * 14);
    model.position.z = -0.42 + state.kick;
    model.rotation.x = state.kick * 2.2;
    flash.visible = state.flash > 0;
    flash.rotation.z = state.flash * 30;
    flashLight.intensity = state.flash > 0 ? 18 : 0;
    if (state.reloadLeft > 0) {
      state.reloadLeft = Math.max(0, state.reloadLeft - dt);
      model.rotation.x = -0.55 * Math.min(1, (def.reloadTime - state.reloadLeft) * 2);
      if (state.reloadLeft === 0) {
        const need = def.mag - state.mag;
        const take = Math.min(need, state.reserve);
        state.mag += take;
        state.reserve -= take;
      }
    }
  }

  return {
    state,
    def() { return def; },
    step,
    ready() {
      return state.mag > 0 && state.cooldown === 0 && state.reloadLeft === 0;
    },
    pullTrigger() {
      state.cooldown = def.fireGap;
      state.flash = MUZZLE_TIME;
      state.kick = def.kind === 'dmr' ? 0.11 : 0.055;
    },
    takeRound() {
      if (state.mag <= 0) return false;
      state.mag -= 1;
      return true;
    },
    reload() {
      if (state.reloadLeft > 0 || state.mag === def.mag || state.reserve === 0) return;
      state.reloadLeft = def.reloadTime;
    },
    spread(speed, movingReference = 5.2) {
      return def.spreadStill + Math.min(1, speed / movingReference) * def.spreadMoving;
    },
    equip(weaponId, keepAmmo = false) {
      def = WEAPONS[weaponId];
      buildModel(def);
      state.weaponId = weaponId;
      state.cooldown = 0;
      state.reloadLeft = 0;
      state.flash = 0;
      state.kick = 0;
      if (!keepAmmo) {
        state.mag = def.mag;
        state.reserve = def.reserve;
      }
    },
    refill() {
      state.mag = def.mag;
      state.reserve = def.reserve;
      state.cooldown = 0;
      state.reloadLeft = 0;
      state.flash = 0;
      state.kick = 0;
    },
  };
}
