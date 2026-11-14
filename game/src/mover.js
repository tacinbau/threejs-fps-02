// Shared body movement: an axis-aligned box resolved against the world's colliders
// one axis at a time, so a wall never swallows a body and sliding along it works.
// Both the player and the bots move through this one function.
import * as THREE from 'three';

const RADIUS = 0.34;

export function createMover(colliders) {
  const probe = new THREE.Box3();

  function overlaps(x, y, z, height, lift) {
    probe.min.set(x - RADIUS, y + lift, z - RADIUS);
    probe.max.set(x + RADIUS, y + height - lift, z + RADIUS);
    for (const collider of colliders) {
      if (probe.intersectsBox(collider)) return collider;
    }
    return null;
  }

  // body: { position: Vector3, velocity: Vector3, height, onGround }
  // wish: normalised horizontal direction (or zero), speed: m/s, dt: seconds.
  // gravity and jumping are the caller's job for the player; bots stay grounded.
  function move(body, dt, wish, speed, accel, friction) {
    const blend = Math.min(1, (accel * dt) / Math.max(speed, 0.01));
    body.velocity.x += (wish.x * speed - body.velocity.x) * blend;
    body.velocity.z += (wish.z * speed - body.velocity.z) * blend;
    if (body.onGround && wish.lengthSq() === 0) {
      const damp = Math.max(0, 1 - friction * dt);
      body.velocity.x *= damp;
      body.velocity.z *= damp;
    }
    const nextX = body.position.x + body.velocity.x * dt;
    if (!overlaps(nextX, body.position.y, body.position.z, body.height, 0.04)) {
      body.position.x = nextX;
    } else {
      body.velocity.x = 0;
    }
    const nextZ = body.position.z + body.velocity.z * dt;
    if (!overlaps(body.position.x, body.position.y, nextZ, body.height, 0.04)) {
      body.position.z = nextZ;
    } else {
      body.velocity.z = 0;
    }
  }

  function settleVertical(body, dt, gravity) {
    body.velocity.y -= gravity * dt;
    body.position.y += body.velocity.y * dt;
    body.onGround = false;
    const hit = overlaps(body.position.x, body.position.y, body.position.z, body.height, 0);
    if (hit && body.velocity.y <= 0) {
      body.position.y = hit.max.y;
      body.velocity.y = 0;
      body.onGround = true;
    } else if (hit) {
      body.position.y = hit.min.y - body.height;
      body.velocity.y = 0;
    }
    if (body.position.y < 0) {
      body.position.y = 0;
      body.velocity.y = 0;
      body.onGround = true;
    }
    body.velocity.y = Math.max(-30, body.velocity.y);
  }

  return { move, settleVertical, overlaps };
}

export function wishFromYaw(yaw, forward, strafe) {
  const sin = Math.sin(yaw);
  const cos = Math.cos(yaw);
  const out = new THREE.Vector3(
    -sin * forward + cos * strafe,
    0,
    -cos * forward - sin * strafe,
  );
  if (out.lengthSq() > 0) out.normalize();
  return out;
}
