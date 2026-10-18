import * as THREE from '/vendor/three/three.module.js';

/**
 * High-performance, zero-allocation Particle and FX system.
 * Uses object pooling and static lights to prevent WebGL shader recompilations and GC stalls,
 * ensuring smooth 60 FPS performance on mobile devices.
 */
export class ParticleSystem {
  constructor(scene) {
    this.scene = scene;

    // 1. Static pre-allocated muzzle flash light (prevents shader recompilation)
    this.muzzleLight = new THREE.PointLight(0xffe680, 0, 10);
    this.scene.add(this.muzzleLight);
    this.muzzleTimer = 0;

    // 2. Pre-allocated Bullet Tracer Pool
    this.MAX_TRACERS = 16;
    this.tracers = [];
    this.tracerMat = new THREE.LineBasicMaterial({
      color: 0x00ffff,
      transparent: true,
      opacity: 0.95
    });

    for (let i = 0; i < this.MAX_TRACERS; i++) {
      const positions = new Float32Array(6); // 2 vertices x 3
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
      const line = new THREE.Line(geo, this.tracerMat);
      line.visible = false;
      this.scene.add(line);

      this.tracers.push({
        mesh: line,
        geo,
        positions,
        active: false,
        life: 0.08,
        age: 0
      });
    }

    // 3. Pre-allocated Sparks Pool
    this.MAX_SPARK_BURSTS = 6;
    this.sparks = [];
    this.sparkMat = new THREE.PointsMaterial({
      color: 0xffaa00,
      size: 0.08,
      transparent: true,
      opacity: 1.0,
      blending: THREE.AdditiveBlending
    });

    for (let i = 0; i < this.MAX_SPARK_BURSTS; i++) {
      const count = 8;
      const positions = new Float32Array(count * 3);
      const velocities = new Float32Array(count * 3);
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
      const pts = new THREE.Points(geo, this.sparkMat);
      pts.visible = false;
      this.scene.add(pts);

      this.sparks.push({
        mesh: pts,
        geo,
        positions,
        velocities,
        count,
        active: false,
        life: 0.25,
        age: 0
      });
    }
  }

  createMuzzleFlash(position) {
    this.muzzleLight.position.copy(position);
    this.muzzleLight.intensity = 3.5;
    this.muzzleTimer = 0.045; // 45ms flash
  }

  createBulletTracer(start, end) {
    // Find first inactive tracer in pool
    let tracer = this.tracers.find(t => !t.active);
    if (!tracer) {
      // Steal oldest
      tracer = this.tracers[0];
    }

    const pos = tracer.positions;
    pos[0] = start.x;
    pos[1] = start.y;
    pos[2] = start.z;
    pos[3] = end.x;
    pos[4] = end.y;
    pos[5] = end.z;

    tracer.geo.attributes.position.needsUpdate = true;
    tracer.mesh.visible = true;
    tracer.active = true;
    tracer.age = 0;
  }

  createImpactSparks(position, normal) {
    let burst = this.sparks.find(s => !s.active);
    if (!burst) burst = this.sparks[0];

    const count = burst.count;
    for (let i = 0; i < count; i++) {
      const idx = i * 3;
      burst.positions[idx] = position.x;
      burst.positions[idx + 1] = position.y;
      burst.positions[idx + 2] = position.z;

      const speed = 2.0 + Math.random() * 3.5;
      burst.velocities[idx] = normal.x * speed + (Math.random() - 0.5) * 2;
      burst.velocities[idx + 1] = normal.y * speed + Math.random() * 2;
      burst.velocities[idx + 2] = normal.z * speed + (Math.random() - 0.5) * 2;
    }

    burst.geo.attributes.position.needsUpdate = true;
    burst.mesh.visible = true;
    burst.active = true;
    burst.age = 0;
  }

  update(delta) {
    // 1. Decay Muzzle Flash Light
    if (this.muzzleTimer > 0) {
      this.muzzleTimer -= delta;
      if (this.muzzleTimer <= 0) {
        this.muzzleLight.intensity = 0;
      }
    }

    // 2. Update Tracers
    for (let i = 0; i < this.MAX_TRACERS; i++) {
      const t = this.tracers[i];
      if (!t.active) continue;

      t.age += delta;
      if (t.age >= t.life) {
        t.active = false;
        t.mesh.visible = false;
      }
    }

    // 3. Update Sparks
    for (let i = 0; i < this.MAX_SPARK_BURSTS; i++) {
      const s = this.sparks[i];
      if (!s.active) continue;

      s.age += delta;
      const count = s.count;
      for (let j = 0; j < count; j++) {
        const idx = j * 3;
        s.positions[idx] += s.velocities[idx] * delta;
        s.positions[idx + 1] += (s.velocities[idx + 1] - 9.8 * delta) * delta;
        s.positions[idx + 2] += s.velocities[idx + 2] * delta;
      }
      s.geo.attributes.position.needsUpdate = true;

      if (s.age >= s.life) {
        s.active = false;
        s.mesh.visible = false;
      }
    }
  }
}
