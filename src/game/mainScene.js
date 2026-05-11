import Phaser from "phaser";

/**
 * @class MainScene
 * @extends Phaser.Scene
 * Handles the core "Chicken Ninja" mechanics with pro-level juice,
 * object pooling for performance, and dynamic tapered swipe trails.
 */
export default class MainScene extends Phaser.Scene {
  constructor() {
    super("MainScene");
    
    // Configuration constants
    this.TRAIL_MAX_POINTS = 15; // Increased slightly for a smoother, longer polygon tail
    this.TRAIL_COLOR = 0xff0000; // Red for realistic bloodshed slash
    this.SPAWN_INTERVAL = 1000;
    this.spawnIndex = 0;
    
    // Health system
    this.maxHealth = 5;
    this.currentHealth = 5;
    this.hearts = [];
  }

  preload() {
    // Load the available images from assets
    this.load.image("chicken", "/assets/chickenNinja.jpg");
    this.load.image("manokpula", "/assets/rooster_transparent.png");
    this.load.image("talisay", "/assets/rooster_clean.png");
    this.load.image("manokSword", "/assets/manokSword.png");
    this.load.image("drumstick", "/assets/drumsticknobg.png");
  }

  create() {
    // Add full-screen background image
    this.add.image(0, 0, 'chicken').setOrigin(0, 0).setDisplaySize(this.cameras.main.width, this.cameras.main.height).setDepth(-1);

    // 🚀 PRO FEATURE: Object Pooling for Objects
    this.objects = this.physics.add.group({
      classType: Phaser.Physics.Arcade.Sprite,
      maxSize: 20,
      runChildUpdate: true
    });

    // Group to manage the sliced pieces for easy cleanup
    this.halves = this.physics.add.group();

    // Group to manage thrown blades
    this.blades = this.physics.add.group();

    /** @type {Phaser.Math.Vector2[]} */
    this.swipePoints = [];

    /** @type {Phaser.GameObjects.Graphics} */
    this.graphics = this.add.graphics();

    // Initialize chicken spawning loop
    this.time.addEvent({
      delay: this.SPAWN_INTERVAL,
      callback: this.spawnChicken,
      callbackScope: this,
      loop: true,
    });

    // Initialize health display
    this.drawHearts();

    this.setupInputHandlers();
  }

  /**
   * Configures pointer events for swiping logic.
   */
  setupInputHandlers() {
    this.input.on("pointerdown", () => {
      this.swipePoints = [];
      this.graphics.clear();
    });

    this.input.on("pointermove", (pointer) => {
      if (!pointer.isDown) return;

      const point = new Phaser.Math.Vector2(pointer.x, pointer.y);
      this.swipePoints.push(point);

      if (this.swipePoints.length > this.TRAIL_MAX_POINTS) {
        this.swipePoints.shift();
      }

      // Add blade spark effects
      if (this.swipePoints.length % 3 === 0) {
        this.add.particles(pointer.x, pointer.y, null, {
          speed: { min: 20, max: 50 },
          angle: { min: -45, max: 45 },
          scale: { start: 0.03, end: 0 },
          color: 0xff0000, // Red for bloodshed effect
          alpha: { start: 1, end: 0 },
          lifespan: 400,
          quantity: 3,
          emitting: false
        }).explode();
      }

      this.drawSwipeTrail();
      this.checkSlice();
    });

    this.input.on("pointerup", () => {
      this.swipePoints = [];
      this.graphics.clear();
    });
  }

  /**
   * 🚀 PRO FEATURE: Dynamic Tapered Polygon Trail
   * Draws a trail that is thick at the pointer head and tapers to a point.
   */
  drawSwipeTrail() {
    this.graphics.clear();
    if (this.swipePoints.length < 2) return;

    const path = [];
    const maxTrailWidth = 18; // Increased for more realistic bloodshed slash

    // Build left side of the polygon
    for (let i = 0; i < this.swipePoints.length; i++) {
      const point = this.swipePoints[i];
      const width = maxTrailWidth * (i / this.swipePoints.length); // Taper calculation
      
      let next = this.swipePoints[i + 1] || point;
      let prev = this.swipePoints[i - 1] || point;
      let angle = Phaser.Math.Angle.Between(prev.x, prev.y, next.x, next.y);
      let perpAngle = angle - Math.PI / 2;
      
      path.push(new Phaser.Math.Vector2(
        point.x + Math.cos(perpAngle) * width,
        point.y + Math.sin(perpAngle) * width
      ));
    }

    // Build right side of the polygon (in reverse to close the shape loop)
    for (let i = this.swipePoints.length - 1; i >= 0; i--) {
      const point = this.swipePoints[i];
      const width = maxTrailWidth * (i / this.swipePoints.length);
      
      let next = this.swipePoints[i + 1] || point;
      let prev = this.swipePoints[i - 1] || point;
      let angle = Phaser.Math.Angle.Between(prev.x, prev.y, next.x, next.y);
      let perpAngle = angle + Math.PI / 2;

      path.push(new Phaser.Math.Vector2(
        point.x + Math.cos(perpAngle) * width,
        point.y + Math.sin(perpAngle) * width
      ));
    }

    this.graphics.fillStyle(this.TRAIL_COLOR, 0.9); // Higher opacity for more realistic bloodshed trail
    this.graphics.fillPoints(path, true);
  }

  /**
   * Checks for intersections between the swipe trail and chicken hitboxes.
   */
  checkSlice() {
    if (this.swipePoints.length < 2) return;

    const p1 = this.swipePoints[this.swipePoints.length - 2];
    const p2 = this.swipePoints[this.swipePoints.length - 1];
    const line = new Phaser.Geom.Line(p1.x, p1.y, p2.x, p2.y);

    // Check collision with objects (chickens)
    this.objects.children.iterate((object) => {
      // Must check if active due to object pooling
      if (!object || !object.active) return;

      const bounds = object.getBounds();

      if (Phaser.Geom.Intersects.LineToRectangle(line, bounds)) {
        this.sliceChicken(object, line); // Pass the line for angle calculations
      }
    });

    // Check collision with blades
    this.blades.children.iterate((blade) => {
      if (!blade || !blade.active) return;

      const bounds = blade.getBounds();

      if (Phaser.Geom.Intersects.LineToRectangle(line, bounds)) {
        this.sliceBlade(blade, line);
      }
    });
  }

  /**
   * 🚀 PRO FEATURE: Juicy Splitting & Particles
   * Handles the destruction of object, juice bursting, and spawning physics halves.
   * @param {Phaser.Physics.Arcade.Sprite} object 
   * @param {Phaser.Geom.Line} sliceLine
   */
  sliceChicken(object, sliceLine) {
    // 0. Camera shake for impact
    this.cameras.main.shake(150, 0.008);

    // 1. Screen flash effect
    const flashGraphics = this.add.graphics();
    flashGraphics.fillStyle(0xffffff, 0.3);
    flashGraphics.fillRect(0, 0, this.cameras.main.width, this.cameras.main.height);
    this.tweens.add({
      targets: flashGraphics,
      alpha: 0,
      duration: 150,
      onComplete: () => {
        flashGraphics.destroy();
      }
    });

    // 2. Pro-Style Bloodshed Particle Splash
    const bloodEmitter = this.add.particles(object.x, object.y, null, {
        speed: { min: 100, max: 400 },
        angle: { min: 0, max: 360 },
        scale: { start: 0.1, end: 0 },
        color: [0xff0000, 0x990000, 0x660000], // Varied red shades for realism
        alpha: { start: 1, end: 0 },
        lifespan: 1000,
        gravityY: 800,
        gravityX: { min: -200, max: 200 }, // Wind effect
        quantity: 30,
        emitting: false
    });
    bloodEmitter.explode();

    // 3. Impact burst - radial blood spray
    const impactEmitter = this.add.particles(object.x, object.y, null, {
        speed: { min: 200, max: 500 },
        angle: { min: 0, max: 360 },
        scale: { start: 0.08, end: 0 },
        color: [0xcc0000, 0xff0000],
        alpha: { start: 0.8, end: 0 },
        lifespan: 800,
        gravityY: 600,
        quantity: 40,
        emitting: false
    });
    impactEmitter.explode();

    // 4. Spawn drumstick halves when sliced
    const leftHalf = this.halves.create(object.x - 15, object.y, 'drumstick');
    const rightHalf = this.halves.create(object.x + 15, object.y, 'drumstick');

    if (leftHalf && rightHalf) {
      leftHalf.setScale(0.15);
      rightHalf.setScale(0.15);
      // Keep original drumstick color - no tint
      // Inherit the original object's velocity, but push them outward dynamically
      leftHalf.setVelocity(object.body.velocity.x - 200, object.body.velocity.y);
      rightHalf.setVelocity(object.body.velocity.x + 200, object.body.velocity.y);
      
      leftHalf.setGravityY(1200);
      rightHalf.setGravityY(1200);
      
      leftHalf.setAngularVelocity(-400);
      rightHalf.setAngularVelocity(400);

      // Add fade out effect for realism
      this.tweens.add({
        targets: [leftHalf, rightHalf],
        alpha: 0,
        duration: 2000,
        ease: 'Power2'
      });
    }

    // 5. Deactivate Original Object (Object Pooling)
    object.setActive(false).setVisible(false);
    object.body.stop();
  }

  /**
   * Handles blade slicing effect.
   */
  sliceBlade(blade, sliceLine) {
    // Camera shake for blade impact
    this.cameras.main.shake(100, 0.005);

    // Blade destruction spark effect
    const sparkEmitter = this.add.particles(blade.x, blade.y, null, {
        speed: { min: 150, max: 300 },
        angle: { min: 0, max: 360 },
        scale: { start: 0.08, end: 0 },
        color: [0xffaa00, 0xffff00],
        alpha: { start: 0.8, end: 0 },
        lifespan: 600,
        gravityY: 500,
        quantity: 15,
        emitting: false
    });
    sparkEmitter.explode();

    blade.setActive(false).setVisible(false);
    blade.body.stop();
  }

  /**
   * Instantiates a new object from the object pool.
   */
  spawnChicken() {
    const x = Phaser.Math.Between(100, 700);
    const keys = ['manokpula', 'talisay'];
    const key = keys[Math.floor(Math.random() * keys.length)];
    
    // Grab from the pool instead of creating a new object
    const object = this.objects.get(x, 600, key);

    if (object) {
      object.setActive(true).setVisible(true);
      object.setCircle(object.width / 2); 
      object.setScale(0.3); // Make spawned objects smaller
      object.setVelocity(
        Phaser.Math.Between(-150, 150),
        Phaser.Math.Between(-700, -900)
      );
      object.setGravityY(1000);
      
      // 30% chance to throw a blade attack
      if (Math.random() < 0.3) {
        this.throwBlade(x, 550);
      }
    }
  }

  /**
   * Throws a blade projectile that damages the player if it escapes.
   */
  throwBlade(fromX, fromY) {
    const blade = this.blades.create(fromX, fromY, 'manokSword');
    
    if (blade) {
      blade.setScale(0.25);
      blade.setRotation(Math.random() * Math.PI * 2);
      
      // Throw blade downward-left or downward-right with speed
      const direction = Math.random() < 0.5 ? -1 : 1;
      blade.setVelocity(direction * Phaser.Math.Between(100, 250), Phaser.Math.Between(100, 250));
      blade.setAngularVelocity(Phaser.Math.Between(180, 360));
      blade.setGravityY(600);
      blade.setActive(true);
    }
  }

  /**
   * Draws enhanced heart-shaped health bar at the top of the screen.
   */
  drawHearts() {
    // Clear previous hearts
    this.hearts.forEach(heart => heart.destroy());
    this.hearts = [];

    const heartSize = 35;
    const spacing = 12;
    const startX = 30;
    const startY = 25;
    const containerPadding = 12;

    // Draw background container
    const containerGraphics = this.add.graphics();
    containerGraphics.setDepth(99);
    const containerWidth = this.maxHealth * (heartSize + spacing) + containerPadding * 2;
    const containerHeight = heartSize + containerPadding * 2;
    
    // Container background with gradient-like effect
    containerGraphics.fillStyle(0x1a1a1a, 0.8);
    containerGraphics.fillRoundedRect(startX - containerPadding, startY - containerPadding, containerWidth, containerHeight, 8);
    
    // Container border
    containerGraphics.lineStyle(3, 0x660000, 1);
    containerGraphics.strokeRoundedRect(startX - containerPadding, startY - containerPadding, containerWidth, containerHeight, 8);
    
    this.hearts.push(containerGraphics);

    // Draw individual hearts
    for (let i = 0; i < this.maxHealth; i++) {
      const isAlive = i < this.currentHealth;
      const heartGraphics = this.add.graphics();
      heartGraphics.setDepth(100);
      
      const x = startX + i * (heartSize + spacing) + heartSize / 2;
      const y = startY + heartSize / 2;

      // Draw heart shape
      this.drawHeart(heartGraphics, x, y, heartSize / 2.5, isAlive ? 0xff0000 : 0x333333, isAlive);
      this.hearts.push(heartGraphics);
      
      // Add pulse animation for full hearts
      if (isAlive && i === this.currentHealth - 1) {
        this.tweens.add({
          targets: heartGraphics,
          scaleX: 1.15,
          scaleY: 1.15,
          duration: 400,
          yoyo: true,
          loop: -1
        });
      }
    }
  }

  /**
   * Draws a professional heart shape with outlines and shading.
   */
  drawHeart(graphics, x, y, size, color, isAlive) {
    // Draw heart outline first (darker)
    graphics.lineStyle(2, 0x330000, 0.8);
    
    // Create heart path using curves
    const curve = new Phaser.Curves.Path();
    
    // Left top bump
    curve.ellipseTo(x - size * 0.6, y - size * 0.3, size * 0.35, size * 0.35, 0, 180, 0);
    // Right top bump
    curve.ellipseTo(x + size * 0.6, y - size * 0.3, size * 0.35, size * 0.35, 180, 0, 0);
    // Bottom point
    curve.lineTo(x, y + size * 1.2);
    // Back to start
    curve.lineTo(x - size * 0.6, y - size * 0.3);
    
    const points = curve.getPoints(60);
    
    // Fill the heart
    graphics.fillStyle(color, 1);
    graphics.fillPoints(points, true);
    
    // Draw outline
    graphics.lineStyle(1.5, isAlive ? 0xff6666 : 0x444444, 0.9);
    graphics.strokePoints(points, true);
    
    // Add shine effect for full hearts
    if (isAlive) {
      graphics.fillStyle(0xffaaaa, 0.4);
      graphics.fillCircle(x - size * 0.3, y - size * 0.2, size * 0.3);
    }
  }

  update() {
    // Cleanup whole objects that fall off the bottom of the screen (return to pool)
    this.objects.children.iterate((object) => {
      if (object && object.active && object.y > 800) {
        object.setActive(false).setVisible(false);
        object.body.stop();
        
        // Lose a heart when an object escapes
        this.currentHealth = Math.max(0, this.currentHealth - 1);
        this.drawHearts();
        
        // Game over condition
        if (this.currentHealth <= 0) {
          this.gameOver();
        }
      }
    });

    // Check if blades escape and damage health
    this.blades.children.iterate((blade) => {
      if (blade && blade.active && blade.y > 800) {
        blade.setActive(false).setVisible(false);
        blade.body.stop();
        
        // Lose a heart when a blade escapes
        this.currentHealth = Math.max(0, this.currentHealth - 1);
        this.drawHearts();
        
        // Game over condition
        if (this.currentHealth <= 0) {
          this.gameOver();
        }
      }
    });

    // Permanently destroy halves that fall off screen to clear memory
    this.halves.children.iterate((half) => {
      if (half && half.y > 800) {
        half.destroy();
      }
    });
  }

  /**
   * Handles game over state.
   */
  gameOver() {
    this.physics.pause();
    const gameOverText = this.add.text(
      this.cameras.main.width / 2,
      this.cameras.main.height / 2,
      'GAME OVER',
      { fontSize: '64px', fill: '#ff0000', fontStyle: 'bold' }
    ).setOrigin(0.5).setDepth(200);
  }
}