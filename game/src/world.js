// Ferro Yard: an original industrial container yard, 44 x 30 m, built from boxes.
// Two bomb sites (A west, B east), three lanes from the south Vanguard spawn to the
// north Rustjackal spawn, and a waypoint graph the bots walk. Every box is a collider
// for bodies and a surface a bullet stops on. Plain geometry only, no models.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

// Waypoints the bots route through. Edges are hand-listed so a route never crosses a wall.
export const WAYPOINTS = [
  { id: 'spawnV', x: 0, z: 13 },
  { id: 'midS', x: 0, z: 8 },
  { id: 'mid', x: 0, z: 0 },
  { id: 'midN', x: 0, z: -6 },
  { id: 'westS', x: -16, z: 8 },
  { id: 'westM', x: -16, z: 0 },
  { id: 'westN', x: -16, z: -6 },
  { id: 'eastS', x: 16, z: 8 },
  { id: 'eastM', x: 16, z: 0 },
  { id: 'eastN', x: 16, z: -6 },
  { id: 'siteA', x: -16, z: -11 },
  { id: 'siteB', x: 16, z: -11 },
  { id: 'linkW', x: -8, z: 4 },
  { id: 'linkE', x: 8, z: 4 },
  { id: 'linkWN', x: -8, z: -4 },
  { id: 'linkEN', x: 8, z: -4 },
  { id: 'spawnR', x: 0, z: -13 },
];
export const WAYPOINT_EDGES = [
  ['spawnV', 'midS'], ['spawnV', 'westS'], ['spawnV', 'eastS'],
  ['midS', 'mid'], ['midS', 'linkW'], ['midS', 'linkE'],
  ['mid', 'midN'], ['mid', 'linkW'], ['mid', 'linkE'],
  ['midN', 'linkWN'], ['midN', 'linkEN'], ['midN', 'spawnR'],
  ['westS', 'westM'], ['westS', 'linkW'],
  ['westM', 'westN'], ['westM', 'linkWN'],
  ['westN', 'siteA'], ['westN', 'linkWN'],
  ['eastS', 'eastM'], ['eastS', 'linkE'],
  ['eastM', 'eastN'], ['eastM', 'linkEN'],
  ['eastN', 'siteB'], ['eastN', 'linkEN'],
  ['linkW', 'linkWN'], ['linkE', 'linkEN'],
  ['linkWN', 'spawnR'], ['linkEN', 'spawnR'],
  ['siteA', 'spawnR'], ['siteB', 'spawnR'],
];

export const SITES = {
  A: { x: -16, z: -11, radius: 3.4, color: PALETTE.siteA, label: 'A' },
  B: { x: 16, z: -11, radius: 3.4, color: PALETTE.siteB, label: 'B' },
};

export const SPAWNS = {
  vanguard: [
    { x: -3, z: 13, yaw: 0 },
    { x: 0, z: 13.5, yaw: 0 },
    { x: 3, z: 13, yaw: 0 },
    { x: -1.5, z: 11.5, yaw: 0 },
  ],
  rustjack: [
    { x: -3, z: -13, yaw: Math.PI },
    { x: 0, z: -13.5, yaw: Math.PI },
    { x: 3, z: -13, yaw: Math.PI },
    { x: 1.5, z: -11.5, yaw: Math.PI },
  ],
};

export function createWorld(scene) {
  const group = new THREE.Group();
  scene.add(group);

  const materials = {};
  for (const name of Object.keys(PALETTE)) {
    materials[name] = new THREE.MeshStandardMaterial({
      color: new THREE.Color(PALETTE[name]),
      roughness: name === 'accent' || name === 'ink' ? 0.55 : 0.92,
      metalness: name === 'container' || name === 'containerB' ? 0.25 : 0.03,
    });
  }
  const siteAMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.siteA), transparent: true, opacity: 0.5, side: THREE.DoubleSide });
  const siteBMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.siteB), transparent: true, opacity: 0.5, side: THREE.DoubleSide });

  const colliders = [];
  const shootables = [];

  function box(width, height, depth, x, y, z, material) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), materials[material]);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    colliders.push(new THREE.Box3().setFromObject(mesh));
    shootables.push(mesh);
    return mesh;
  }

  // Floor and perimeter, 44 x 30 m, 4.6 m walls, open to the sky.
  box(44.4, 0.4, 30.4, 0, -0.2, 0, 'concrete');
  box(0.4, 4.6, 30.4, -22.2, 2.3, 0, 'surface');
  box(0.4, 4.6, 30.4, 22.2, 2.3, 0, 'surface');
  box(44.4, 4.6, 0.4, 0, 2.3, -15.2, 'surface');
  box(44.4, 4.6, 0.4, 0, 2.3, 15.2, 'surface');

  // Mid: a stacked container crossroads that splits the yard into lanes.
  box(6.0, 2.6, 2.4, -4.5, 1.3, -1.5, 'container');
  box(6.0, 2.6, 2.4, 4.5, 1.3, 2.0, 'containerB');
  box(2.4, 2.6, 6.0, 0, 1.3, -4.0, 'container');
  box(2.4, 5.2, 2.4, -4.5, 2.6, -1.5, 'containerB'); // stacked, a sightline blocker
  box(1.2, 1.2, 1.2, -8.5, 0.6, 3.5, 'crate');
  box(1.2, 1.2, 1.2, 8.5, 0.6, -3.5, 'crate');
  box(1.2, 1.2, 1.2, 8.5, 0.6, -2.3, 'crate');

  // West lane: crates to crouch behind, a low wall for cover.
  box(3.6, 1.1, 1.2, -16, 0.55, 4.5, 'crate');
  box(1.2, 1.1, 3.6, -19.5, 0.55, 0, 'crate');
  box(1.2, 2.4, 1.2, -13.5, 1.2, -3.5, 'container');
  box(2.4, 0.9, 1.2, -16, 0.45, -7.5, 'crate');
  box(6.0, 2.6, 2.4, -19.5, 1.3, -10.5, 'containerB'); // site A back wall cover

  // East lane: mirrored cover, different heights so the lanes play differently.
  box(1.2, 1.1, 3.6, 19.5, 0.55, 4.5, 'crate');
  box(3.6, 1.1, 1.2, 16, 0.55, 0, 'crate');
  box(1.2, 2.4, 1.2, 13.5, 1.2, -3.5, 'containerB');
  box(2.4, 0.9, 1.2, 16, 0.45, -7.5, 'crate');
  box(6.0, 2.6, 2.4, 19.5, 1.3, -10.5, 'container');

  // North end: low barriers in front of each site, and spawn cover at both ends.
  box(4.0, 1.0, 1.0, -16, 0.5, -8.2, 'hazard');
  box(4.0, 1.0, 1.0, 16, 0.5, -8.2, 'hazard');
  box(2.4, 1.1, 1.2, -6, 0.55, 12.5, 'crate');
  box(2.4, 1.1, 1.2, 6, 0.55, 12.5, 'crate');
  box(2.4, 1.1, 1.2, -6, 0.55, -12.5, 'crate');
  box(2.4, 1.1, 1.2, 6, 0.55, -12.5, 'crate');

  // Site markers: flat rings on the floor and a light beacon pillar above each site.
  for (const [key, site] of Object.entries(SITES)) {
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(site.radius - 0.25, site.radius, 40),
      key === 'A' ? siteAMat : siteBMat,
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(site.x, 0.02, site.z);
    group.add(ring);
    const beacon = new THREE.Mesh(
      new THREE.CylinderGeometry(0.06, 0.06, 7, 8),
      new THREE.MeshBasicMaterial({
        color: new THREE.Color(site.color), transparent: true, opacity: 0.28, depthWrite: false,
      }),
    );
    beacon.position.set(site.x, 3.5, site.z);
    group.add(beacon);
  }

  // Light: a warm key from the front right, a cool fill from behind, and sky/ground.
  const sky = new THREE.HemisphereLight(new THREE.Color(PALETTE.surface), new THREE.Color(PALETTE.canvas), 1.7);
  scene.add(sky);
  const key = new THREE.DirectionalLight(new THREE.Color(PALETTE.ink), 2.8);
  key.position.set(14, 20, 10);
  key.target.position.set(0, 0, -4);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.camera.left = -26;
  key.shadow.camera.right = 26;
  key.shadow.camera.top = 20;
  key.shadow.camera.bottom = -20;
  key.shadow.camera.far = 60;
  key.shadow.bias = -0.0006;
  scene.add(key, key.target);
  const fill = new THREE.DirectionalLight(new THREE.Color(PALETTE.muted), 0.9);
  fill.position.set(-12, 12, 14);
  scene.add(fill);

  return { colliders, shootables, group };
}
