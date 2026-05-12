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
    this.bottomPadding = 180;
    this.isGameOver = false;
    this.spawnTimer = null;
    this.isChickenRainActive = false;
    this.isLevelTransitioning = false;
    
    // Health system
    this.maxHealth = 5;
    this.currentHealth = 5;
    this.hearts = [];
    this.score = 0;
    this.currentLevel = 1;
    this.levelConfig = {
      1: { name: "SLOW", maxScore: 300, bombChance: 0.08, speed: 0.72, spawnDelay: 1300 },
      2: { name: "MODERATE FAST", maxScore: 500, bombChance: 0.18, speed: 0.95, spawnDelay: 1050 },
      3: { name: "FAST", maxScore: null, bombChance: 0.3, speed: 1.18, spawnDelay: 820 },
    };
    this.scoreText = null;
    this.collectedDrumsticks = [];
    this.collectionBg = null;
  }

  preload() {
    // Load the available images from assets
    this.load.image("chicken", "/assets/chickenNinja.png");
    this.load.image("manokpula", "/assets/rooster_transparent.png");
    this.load.image("talisay", "/assets/rooster_no_bg.png");
    this.load.image("drumstick", "/assets/drumsticknobg.png");
    this.load.image("beer", "/assets/redhorse.png");
    this.load.image("bonusChicken", "/assets/chicken_ninja_man.png");
  }

  create() {
    // Add full-screen background image
    this.background = this.add.image(0, 0, "chicken").setOrigin(0.5).setDepth(-1);

    this.createParticleTexture();
    this.createShurikenTexture();
    this.createBeerTexture();
    this.createBombTexture();

    // 🚀 PRO FEATURE: Object Pooling for Objects
    this.objects = this.physics.add.group({
      classType: Phaser.Physics.Arcade.Sprite,
      maxSize: 80,
      runChildUpdate: true
    });

    // Group to manage chicken rain power-ups
    this.powerUps = this.physics.add.group();

    // Group to manage thrown shuriken
    this.shuriken = this.physics.add.group();

    // Group to manage bonus beer throws
    this.beers = this.physics.add.group();

    // Group to manage bomb hazards
    this.bombs = this.physics.add.group();

    /** @type {Phaser.Math.Vector2[]} */
    this.swipePoints = [];

    /** @type {Phaser.GameObjects.Graphics} */
    this.graphics = this.add.graphics();

    // Initialize chicken spawning loop
    this.spawnTimer = this.time.addEvent({
      delay: this.getLevelSettings().spawnDelay,
      callback: this.spawnChicken,
      callbackScope: this,
      loop: true,
    });

    // Initialize health display
    this.drawHearts();
    this.drawScore();
    this.drawCollectionTray();

    this.resizeWorld();
    this.scale.on("resize", this.resizeWorld, this);

    this.setupInputHandlers();
  }

  /**
   * Configures pointer events for swiping logic.
   */
  setupInputHandlers() {
    this.input.on("pointerdown", () => {
      if (this.isGameOver || this.isLevelTransitioning) return;

      this.swipePoints = [];
      this.graphics.clear();
    });

    this.input.on("pointermove", (pointer) => {
      if (this.isGameOver || this.isLevelTransitioning || !pointer.isDown) return;

      const point = new Phaser.Math.Vector2(pointer.x, pointer.y);
      this.swipePoints.push(point);

      if (this.swipePoints.length > this.TRAIL_MAX_POINTS) {
        this.swipePoints.shift();
      }

      // Add blade spark effects
      if (this.swipePoints.length % 3 === 0) {
        this.add.particles(pointer.x, pointer.y, "particle", {
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
      if (this.isGameOver || this.isLevelTransitioning) return;

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
    if (this.isGameOver || this.isLevelTransitioning || this.swipePoints.length < 2) return;

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

    // Check collision with chicken rain power-ups
    this.powerUps.children.iterate((powerUp) => {
      if (!powerUp || !powerUp.active) return;

      const bounds = powerUp.getBounds();

      if (Phaser.Geom.Intersects.LineToRectangle(line, bounds)) {
        this.sliceChickenPowerUp(powerUp);
      }
    });

    // Check collision with shuriken
    this.shuriken.children.iterate((shuriken) => {
      if (!shuriken || !shuriken.active) return;

      const bounds = shuriken.getBounds();

      if (Phaser.Geom.Intersects.LineToRectangle(line, bounds)) {
        this.sliceShuriken(shuriken);
      }
    });

    // Check collision with bonus beers
    this.beers.children.iterate((beer) => {
      if (!beer || !beer.active) return;

      const bounds = beer.getBounds();

      if (Phaser.Geom.Intersects.LineToRectangle(line, bounds)) {
        this.sliceBeer(beer);
      }
    });

    // Check collision with bombs
    this.bombs.children.iterate((bomb) => {
      if (!bomb || !bomb.active) return;

      const bounds = bomb.getBounds();

      if (Phaser.Geom.Intersects.LineToRectangle(line, bounds)) {
        this.sliceBomb(bomb);
      }
    });
  }

  /**
   * 🚀 PRO FEATURE: Juicy Splitting & Particles
   * Handles the destruction of object, juice bursting, and dropping fried chicken.
   * @param {Phaser.Physics.Arcade.Sprite} object 
   * @param {Phaser.Geom.Line} sliceLine
   */
  sliceChicken(object, sliceLine) {
    if (this.isGameOver || this.isLevelTransitioning) return;

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
    const bloodEmitter = this.add.particles(object.x, object.y, "particle", {
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
    const impactEmitter = this.add.particles(object.x, object.y, "particle", {
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

    // 4. Normal chickens become fried chicken; rain chickens are bonus-only.
    if (!object.getData("rainChicken")) {
      this.addCollectedDrumstick(object.x - 15, object.y);
      this.addCollectedDrumstick(object.x + 15, object.y);
    }
    this.addPoints(2, object.x, object.y);

    // 5. Deactivate Original Object (Object Pooling)
    object.setActive(false).setVisible(false);
    object.body.stop();
  }

  /**
   * Handles shuriken slicing effect.
   */
  sliceShuriken(shuriken) {
    if (this.isGameOver || this.isLevelTransitioning) return;

    // Camera shake for shuriken impact
    this.cameras.main.shake(100, 0.005);

    // Shuriken destruction spark effect
    const sparkEmitter = this.add.particles(shuriken.x, shuriken.y, "particle", {
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

    shuriken.setActive(false).setVisible(false);
    shuriken.body.stop();
  }

  /**
   * Breaks a beer bottle and awards a random bonus.
   */
  sliceBeer(beer) {
    if (this.isGameOver || this.isLevelTransitioning) return;

    const bonus = Phaser.Utils.Array.GetRandom([5, 10, 15, 20]);
    this.cameras.main.shake(90, 0.004);

    const foamEmitter = this.add.particles(beer.x, beer.y, "particle", {
      speed: { min: 80, max: 260 },
      angle: { min: 0, max: 360 },
      scale: { start: 0.08, end: 0 },
      color: [0xfff5c2, 0xf5c04a, 0xffffff],
      alpha: { start: 0.95, end: 0 },
      lifespan: 650,
      gravityY: 500,
      quantity: 24,
      emitting: false
    });
    foamEmitter.explode();

    this.currentHealth = Math.min(this.maxHealth, this.currentHealth + 1);
    this.drawHearts();
    this.addPoints(bonus, beer.x, beer.y);
    beer.setActive(false).setVisible(false);
    beer.body.stop();
  }

  /**
   * Explodes a sliced bomb and removes one life.
   */
  sliceBomb(bomb) {
    if (this.isGameOver || this.isLevelTransitioning) return;

    this.cameras.main.shake(280, 0.018);

    const explosion = this.add.particles(bomb.x, bomb.y, "particle", {
      speed: { min: 180, max: 520 },
      angle: { min: 0, max: 360 },
      scale: { start: 0.18, end: 0 },
      color: [0xfff1a1, 0xff8c1a, 0xd91c1c, 0x111111],
      alpha: { start: 1, end: 0 },
      lifespan: 900,
      gravityY: 360,
      quantity: 55,
      emitting: false
    });
    explosion.explode();

    const flash = this.add.graphics();
    flash.setDepth(180);
    flash.fillStyle(0xffd166, 0.32);
    flash.fillCircle(bomb.x, bomb.y, 120);
    this.tweens.add({
      targets: flash,
      alpha: 0,
      duration: 180,
      onComplete: () => flash.destroy()
    });

    this.currentHealth = Math.max(0, this.currentHealth - 1);
    this.drawHearts();
    this.showPowerUpText("-1 LIFE", bomb.x, bomb.y);

    bomb.setActive(false).setVisible(false);
    bomb.body.stop();

    if (this.currentHealth <= 0) {
      this.gameOver();
    }
  }

  /**
   * Triggers the chicken rain power-up.
   */
  sliceChickenPowerUp(powerUp) {
    if (this.isGameOver || this.isLevelTransitioning) return;

    this.cameras.main.shake(220, 0.01);

    const burst = this.add.particles(powerUp.x, powerUp.y, "particle", {
      speed: { min: 160, max: 420 },
      angle: { min: 0, max: 360 },
      scale: { start: 0.12, end: 0 },
      color: [0xfff0a3, 0xffd447, 0xffffff],
      alpha: { start: 1, end: 0 },
      lifespan: 850,
      quantity: 50,
      emitting: false
    });
    burst.explode();

    this.addPoints(10, powerUp.x, powerUp.y);
    this.showPowerUpText(this.getBonusGreeting(), powerUp.x, powerUp.y);
    this.time.delayedCall(260, () => {
      if (!this.isGameOver && !this.isLevelTransitioning) {
        this.showPowerUpText("CHICKEN RAIN!", powerUp.x, powerUp.y);
      }
    });
    this.tweens.killTweensOf(powerUp);
    powerUp.setActive(false).setVisible(false);
    powerUp.clearTint();
    powerUp.setAlpha(1);
    powerUp.body.stop();
    this.triggerChickenRain();
  }

  /**
   * Builds a launch arc by choosing a random peak height on the screen.
   */
  getRandomLaunchArc(fromY, kind = "chicken") {
    const height = this.scale.height;
    const speed = this.getLevelSettings().speed;
    const roll = Math.random();
    const bands = kind === "bonus"
      ? [
          { limit: 0.5, min: 0.04, max: 0.16 },
          { limit: 0.82, min: 0.17, max: 0.32 },
          { limit: 1, min: 0.33, max: 0.48 },
        ]
      : [
          { limit: 0.42, min: 0.06, max: 0.2 },
          { limit: 0.78, min: 0.22, max: 0.4 },
          { limit: 1, min: 0.42, max: 0.58 },
        ];
    const band = bands.find((candidate) => roll <= candidate.limit) || bands[0];
    const peakY = Phaser.Math.Between(height * band.min, height * band.max);
    const gravityY = height * Phaser.Math.FloatBetween(1.08, 1.34) * speed;
    const travelHeight = Math.max(80, fromY - peakY);
    const velocityY = -Math.sqrt(2 * gravityY * travelHeight);

    return { velocityY, gravityY };
  }

  /**
   * Instantiates a new object from the object pool.
   */
  spawnChicken() {
    if (this.isGameOver || this.isLevelTransitioning) return;

    const width = this.scale.width;
    const height = this.scale.height;
    const speed = this.getLevelSettings().speed;
    const x = Phaser.Math.Between(width * 0.12, width * 0.88);
    const keys = ["manokpula", "talisay"];
    const key = keys[Math.floor(Math.random() * keys.length)];
    
    // Grab from the pool instead of creating a new object
    const startY = height + Phaser.Math.Between(70, 120);
    const object = this.objects.get(x, startY, key);

    if (object) {
      const arc = this.getRandomLaunchArc(startY, "chicken");

      object.setActive(true).setVisible(true);
      object.clearTint();
      object.setAlpha(1);
      object.setBlendMode(Phaser.BlendModes.NORMAL);
      object.setData("noLifePenalty", false);
      object.setData("rainChicken", false);
      object.setScale(0.3);
      object.setCircle(Math.max(object.width, object.height) / 2);
      object.setVelocity(
        Phaser.Math.Between(-width * 0.22 * speed, width * 0.22 * speed),
        arc.velocityY
      );
      object.setGravityY(arc.gravityY);
      
      // 30% chance to throw a shuriken attack
      if (Math.random() < 0.3) {
        this.throwShuriken(x, height + 20);
      }

      // Bonus beer throws can be sliced for random points.
      if (Math.random() < 0.35) {
        this.throwBeer(Phaser.Math.Between(width * 0.14, width * 0.86), height + 40);
      }

      if (Math.random() < this.getLevelSettings().bombChance) {
        this.throwBomb(Phaser.Math.Between(width * 0.14, width * 0.86), height + 40);
      }

      if (!this.isChickenRainActive && Math.random() < 0.12) {
        this.throwChickenPowerUp(Phaser.Math.Between(width * 0.16, width * 0.84), height + 30);
      }
    }
  }

  /**
   * Throws the chicken rain power-up target.
   */
  throwChickenPowerUp(fromX, fromY) {
    if (this.isGameOver) return;

    const startY = fromY + Phaser.Math.Between(10, 55);
    const powerUp = this.powerUps.create(fromX, startY, "bonusChicken");

    if (powerUp) {
      const width = this.scale.width;
      const speed = this.getLevelSettings().speed;
      const direction = Math.random() < 0.5 ? -1 : 1;
      const arc = this.getRandomLaunchArc(startY, "bonus");

      powerUp.setActive(true).setVisible(true);
      powerUp.setScale(0.42);
      powerUp.clearTint();
      powerUp.setAlpha(1);
      powerUp.setBlendMode(Phaser.BlendModes.NORMAL);
      powerUp.setCircle(Math.max(powerUp.width, powerUp.height) / 2);
      powerUp.setVelocity(
        direction * Phaser.Math.Between(width * 0.09 * speed, width * 0.24 * speed),
        arc.velocityY
      );
      powerUp.setAngularVelocity(Phaser.Math.Between(-220, 220));
      powerUp.setGravityY(arc.gravityY);
    }
  }

  /**
   * Creates a fast bonus wave of chickens from above.
   */
  triggerChickenRain() {
    if (this.isGameOver || this.isChickenRainActive) return;

    this.isChickenRainActive = true;

    for (let i = 0; i < 26; i++) {
      this.time.delayedCall(i * 85, () => {
        if (this.isGameOver) return;

        this.spawnRainChicken();
        this.drawFastSlashEffect();
      });
    }

    this.time.delayedCall(2600, () => {
      this.isChickenRainActive = false;
    });
  }

  /**
   * Drops one fast chicken during the chicken rain event.
   */
  spawnRainChicken() {
    const width = this.scale.width;
    const height = this.scale.height;
    const speed = this.getLevelSettings().speed;
    const key = Phaser.Utils.Array.GetRandom(["manokpula", "talisay"]);
    const chicken = this.objects.get(
      Phaser.Math.Between(width * 0.08, width * 0.92),
      Phaser.Math.Between(-180, -60),
      key
    );

    if (!chicken) return;

    chicken.setActive(true).setVisible(true);
    chicken.clearTint();
    chicken.setAlpha(1);
    chicken.setBlendMode(Phaser.BlendModes.NORMAL);
    chicken.setScale(0.24);
    chicken.setCircle(Math.max(chicken.width, chicken.height) / 2);
    chicken.setData("noLifePenalty", true);
    chicken.setData("rainChicken", true);
    chicken.setVelocity(
      Phaser.Math.Between(-width * 0.18 * speed, width * 0.18 * speed),
      Phaser.Math.Between(height * 0.95 * speed, height * 1.35 * speed)
    );
    chicken.setGravityY(height * 0.18 * speed);
    chicken.setAngularVelocity(Phaser.Math.Between(-520, 520));
  }

  /**
   * Throws a shuriken projectile that damages the player if it escapes.
   */
  throwShuriken(fromX, fromY) {
    if (this.isGameOver) return;

    const shuriken = this.shuriken.create(fromX, fromY, "shuriken");
    
    if (shuriken) {
      const width = this.scale.width;
      const height = this.scale.height;
      const speed = this.getLevelSettings().speed;
      shuriken.setScale(1.15);
      shuriken.setRotation(Math.random() * Math.PI * 2);
      shuriken.setCircle(58);
      
      // Throw shuriken upward-left or upward-right with speed.
      const direction = Math.random() < 0.5 ? -1 : 1;
      shuriken.setVelocity(
        direction * Phaser.Math.Between(width * 0.12 * speed, width * 0.28 * speed),
        Phaser.Math.Between(-height * 1.45 * speed, -height * 1.18 * speed)
      );
      shuriken.setAngularVelocity(Phaser.Math.Between(720, 1080));
      shuriken.setGravityY(height * 1.02 * speed);
      shuriken.setActive(true).setVisible(true);
    }
  }

  /**
   * Throws a beer bottle bonus item.
   */
  throwBeer(fromX, fromY) {
    if (this.isGameOver) return;

    const beer = this.beers.create(fromX, fromY, "beer");

    if (beer) {
      const width = this.scale.width;
      const height = this.scale.height;
      const speed = this.getLevelSettings().speed;
      const direction = Math.random() < 0.5 ? -1 : 1;

      beer.setActive(true).setVisible(true);
      beer.setScale(0.075);
      beer.setCircle(38);
      beer.setRotation(Phaser.Math.FloatBetween(-0.3, 0.3));
      beer.setVelocity(
        direction * Phaser.Math.Between(width * 0.08 * speed, width * 0.22 * speed),
        Phaser.Math.Between(-height * 1.35 * speed, -height * 1.05 * speed)
      );
      beer.setAngularVelocity(Phaser.Math.Between(-320, 320));
      beer.setGravityY(height * 1.25 * speed);
    }
  }

  /**
   * Throws a bomb hazard. Slicing it costs one life.
   */
  throwBomb(fromX, fromY) {
    if (this.isGameOver) return;

    const bomb = this.bombs.create(fromX, fromY, "bomb");

    if (bomb) {
      const width = this.scale.width;
      const height = this.scale.height;
      const speed = this.getLevelSettings().speed;
      const direction = Math.random() < 0.5 ? -1 : 1;

      bomb.setActive(true).setVisible(true);
      bomb.setScale(0.95);
      bomb.setCircle(42);
      bomb.setRotation(Phaser.Math.FloatBetween(-0.4, 0.4));
      bomb.setVelocity(
        direction * Phaser.Math.Between(width * 0.1 * speed, width * 0.24 * speed),
        Phaser.Math.Between(-height * 1.3 * speed, -height * 1.02 * speed)
      );
      bomb.setAngularVelocity(Phaser.Math.Between(-360, 360));
      bomb.setGravityY(height * 1.18 * speed);
    }
  }

  /**
   * Draws the bottom area where sliced chickens are collected.
   */
  drawCollectionTray() {
    if (this.collectionBg) {
      this.collectionBg.destroy();
    }

    const width = this.scale.width;
    const height = this.scale.height;
    const trayHeight = Math.min(100, Math.max(72, height * 0.13));

    this.collectionBg = this.add.graphics();
    this.collectionBg.setDepth(80);
    this.collectionBg.fillStyle(0x080909, 0.58);
    this.collectionBg.fillRect(16, height - trayHeight - 16, width - 32, trayHeight);
    this.collectionBg.lineStyle(2, 0xf2c35b, 0.75);
    this.collectionBg.strokeRect(16, height - trayHeight - 16, width - 32, trayHeight);

    this.layoutCollectedDrumsticks();
  }

  /**
   * Adds fried chicken to the bottom collection display.
   */
  addCollectedDrumstick(fromX, fromY) {
    const collected = this.physics.add.image(fromX, fromY, "drumstick");
    const landing = this.getRandomTrayPoint();

    collected.setDepth(95);
    collected.setScale(0.08);
    collected.setRotation(Phaser.Math.FloatBetween(-0.5, 0.5));
    collected.body.stop();
    collected.body.enable = false;

    this.collectedDrumsticks.push(collected);

    this.tweens.add({
      targets: collected,
      x: landing.x,
      y: landing.y,
      duration: Phaser.Math.Between(520, 760),
      ease: "Sine.InOut",
      onComplete: () => {
        if (!collected.active) return;

        collected.setPosition(landing.x, landing.y);
      }
    });
  }

  /**
   * Repositions collected drumsticks so they stay visible at the bottom.
   */
  layoutCollectedDrumsticks() {
    const count = this.collectedDrumsticks.length;
    if (!count) return;

    this.collectedDrumsticks.forEach((drumstick) => {
      if (drumstick.body?.enable) return;

      const point = this.getRandomTrayPoint();
      drumstick.setPosition(point.x, point.y);
    });
  }

  getRandomTrayPoint() {
    const width = this.scale.width;
    const height = this.scale.height;
    const trayHeight = Math.min(100, Math.max(72, height * 0.13));

    return {
      x: Phaser.Math.Between(42, Math.max(42, width - 42)),
      y: Phaser.Math.Between(height - trayHeight + 12, height - 34),
    };
  }

  /**
   * Draws a ninja-themed health bar at the top of the screen.
   */
  drawHearts() {
    this.hearts.forEach(heart => heart.destroy());
    this.hearts = [];

    const bladeWidth = 44;
    const bladeHeight = 16;
    const spacing = 10;
    const startX = 32;
    const startY = 30;
    const containerPadding = 14;
    const containerWidth = this.maxHealth * (bladeWidth + spacing) + containerPadding * 2 - spacing;
    const containerHeight = 56;
    const containerGraphics = this.add.graphics();

    containerGraphics.setDepth(99);
    containerGraphics.fillStyle(0x080909, 0.78);
    containerGraphics.fillRect(startX - containerPadding, startY - 22, containerWidth, containerHeight);
    containerGraphics.lineStyle(2, 0xd6d8d9, 0.85);
    containerGraphics.strokeRect(startX - containerPadding, startY - 22, containerWidth, containerHeight);
    containerGraphics.fillStyle(0x151515, 0.9);
    containerGraphics.fillRect(startX - containerPadding, startY + 8, containerWidth, 4);

    const label = this.add.text(startX - 4, startY - 16, "NINJA LIFE", {
      fontFamily: "system-ui, Segoe UI, sans-serif",
      fontSize: "13px",
      fontStyle: "bold",
      color: "#f4f1e4"
    }).setDepth(100);

    this.hearts.push(containerGraphics);
    this.hearts.push(label);

    for (let i = 0; i < this.maxHealth; i++) {
      const isAlive = i < this.currentHealth;
      const bladeGraphics = this.add.graphics();
      const x = startX + i * (bladeWidth + spacing);
      const y = startY + 8;

      bladeGraphics.setDepth(100);
      bladeGraphics.fillStyle(isAlive ? 0xe8edf0 : 0x34383c, 1);
      bladeGraphics.fillTriangle(x, y, x + bladeWidth - 8, y - bladeHeight / 2, x + bladeWidth, y);
      bladeGraphics.fillTriangle(x, y, x + bladeWidth - 8, y + bladeHeight / 2, x + bladeWidth, y);
      bladeGraphics.fillStyle(isAlive ? 0x2a2d30 : 0x191b1e, 1);
      bladeGraphics.fillRect(x - 7, y - 6, 10, 12);

      this.hearts.push(bladeGraphics);
    }
  }

  drawScore() {
    if (this.scoreText) {
      this.scoreText.destroy();
    }

    window.dispatchEvent(new CustomEvent("chicken-ninja-score", {
      detail: { score: this.score, level: this.currentLevel }
    }));

    const level = this.getLevelSettings();
    this.scoreText = this.add.text(
      this.scale.width - 32,
      28,
      `LEVEL ${this.currentLevel} ${level.name}\nPOINTS ${this.score}${level.maxScore ? ` / ${level.maxScore}` : ""}`,
      {
      fontFamily: "system-ui, Segoe UI, sans-serif",
      fontSize: "24px",
      fontStyle: "900",
      color: "#fff3c4",
      stroke: "#111111",
      strokeThickness: 5,
      align: "right"
      }
    ).setOrigin(1, 0).setDepth(110);
  }

  addPoints(amount, x, y) {
    this.score += amount;
    this.drawScore();
    this.checkLevelGoal();

    const popup = this.add.text(x, y, `+${amount}`, {
      fontFamily: "system-ui, Segoe UI, sans-serif",
      fontSize: "26px",
      fontStyle: "bold",
      color: "#ffe66d",
      stroke: "#1b1200",
      strokeThickness: 4
    }).setOrigin(0.5).setDepth(160);

    this.tweens.add({
      targets: popup,
      y: y - 54,
      alpha: 0,
      duration: 650,
      ease: "Quad.Out",
      onComplete: () => popup.destroy()
    });
  }

  checkLevelGoal() {
    const level = this.getLevelSettings();

    if (!level.maxScore || this.score < level.maxScore || this.isLevelTransitioning) return;

    this.startLevelTransition(this.currentLevel + 1);
  }

  getLevelSettings() {
    return this.levelConfig[this.currentLevel] || this.levelConfig[1];
  }

  startLevelTransition(nextLevel) {
    if (this.isGameOver || !this.levelConfig[nextLevel]) return;

    this.isLevelTransitioning = true;
    this.swipePoints = [];
    this.graphics.clear();

    if (this.spawnTimer) {
      this.spawnTimer.remove(false);
      this.spawnTimer = null;
    }

    this.stopActiveThrowables();

    const next = this.levelConfig[nextLevel];
    const text = this.add.text(
      this.scale.width / 2,
      this.scale.height / 2,
      `GREAT JOB!\nGET READY FOR LEVEL ${nextLevel}\n${next.name}`,
      {
        fontFamily: "system-ui, Segoe UI, sans-serif",
        fontSize: "46px",
        fontStyle: "900",
        color: "#fff3a3",
        align: "center",
        stroke: "#241200",
        strokeThickness: 7
      }
    ).setOrigin(0.5).setDepth(220);

    this.time.delayedCall(2200, () => {
      text.destroy();
      this.currentLevel = nextLevel;
      this.isLevelTransitioning = false;
      this.drawScore();
      this.resetSpawnTimer();
      this.showPowerUpText(`LEVEL ${nextLevel}`, this.scale.width / 2, this.scale.height * 0.28);
    });
  }

  stopActiveThrowables() {
    const groups = [this.objects, this.powerUps, this.shuriken, this.beers, this.bombs];

    groups.forEach((group) => {
      group.children.iterate((item) => {
        if (!item) return;

        this.tweens.killTweensOf(item);
        item.setActive(false).setVisible(false);
        item.clearTint?.();
        item.setAlpha?.(1);
        item.setBlendMode?.(Phaser.BlendModes.NORMAL);
        item.body?.stop();
      });
    });
  }

  resetSpawnTimer() {
    if (this.spawnTimer) {
      this.spawnTimer.remove(false);
    }

    this.spawnTimer = this.time.addEvent({
      delay: this.getLevelSettings().spawnDelay,
      callback: this.spawnChicken,
      callbackScope: this,
      loop: true,
    });
  }

  getBonusGreeting() {
    return Phaser.Utils.Array.GetRandom([
      "NICE SLICE!",
      "HELLO, NINJA!",
      "BONUS HIT!",
      "GREAT CUT!",
      "CHICKEN MASTER!"
    ]);
  }

  showPowerUpText(message, x, y) {
    const text = this.add.text(x, y - 44, message, {
      fontFamily: "system-ui, Segoe UI, sans-serif",
      fontSize: "34px",
      fontStyle: "900",
      color: "#fff0a8",
      stroke: "#2b1700",
      strokeThickness: 6
    }).setOrigin(0.5).setDepth(170);

    this.tweens.add({
      targets: text,
      y: y - 116,
      scaleX: 1.18,
      scaleY: 1.18,
      alpha: 0,
      duration: 900,
      ease: "Back.Out",
      onComplete: () => text.destroy()
    });
  }

  drawFastSlashEffect() {
    const width = this.scale.width;
    const height = this.scale.height;
    const x = Phaser.Math.Between(width * 0.12, width * 0.88);
    const y = Phaser.Math.Between(height * 0.18, height * 0.78);
    const slash = this.add.graphics();
    const length = Phaser.Math.Between(110, 190);
    const angle = Phaser.Math.FloatBetween(-0.8, 0.8);
    const dx = Math.cos(angle) * length;
    const dy = Math.sin(angle) * length;

    slash.setDepth(145);
    slash.lineStyle(5, 0xfff2b0, 0.9);
    slash.beginPath();
    slash.moveTo(x - dx / 2, y - dy / 2);
    slash.lineTo(x + dx / 2, y + dy / 2);
    slash.strokePath();

    this.tweens.add({
      targets: slash,
      alpha: 0,
      duration: 160,
      onComplete: () => slash.destroy()
    });
  }

  update() {
    if (this.isGameOver) return;

    const offscreenY = this.scale.height + this.bottomPadding;

    // Cleanup whole objects that fall off the bottom of the screen (return to pool)
    this.objects.children.iterate((object) => {
      if (object && object.active && object.y > offscreenY) {
        object.setActive(false).setVisible(false);
        object.body.stop();
        
        if (!object.getData("noLifePenalty")) {
          this.currentHealth = Math.max(0, this.currentHealth - 1);
          this.drawHearts();
          
          if (this.currentHealth <= 0) {
            this.gameOver();
          }
        }
      }
    });

    this.powerUps.children.iterate((powerUp) => {
      if (powerUp && powerUp.active && powerUp.y > offscreenY) {
        this.tweens.killTweensOf(powerUp);
        powerUp.setActive(false).setVisible(false);
        powerUp.clearTint();
        powerUp.setAlpha(1);
        powerUp.setBlendMode(Phaser.BlendModes.NORMAL);
        powerUp.body.stop();
      }
    });

    // Check if shuriken escape and damage health
    this.shuriken.children.iterate((shuriken) => {
      if (shuriken && shuriken.active && shuriken.y > offscreenY) {
        shuriken.setActive(false).setVisible(false);
        shuriken.body.stop();
        
        // Lose a heart when a shuriken escapes
        this.currentHealth = Math.max(0, this.currentHealth - 1);
        this.drawHearts();
        
        // Game over condition
        if (this.currentHealth <= 0) {
          this.gameOver();
        }
      }
    });

    this.beers.children.iterate((beer) => {
      if (beer && beer.active && beer.y > offscreenY) {
        beer.setActive(false).setVisible(false);
        beer.body.stop();
      }
    });

    this.bombs.children.iterate((bomb) => {
      if (bomb && bomb.active && bomb.y > offscreenY) {
        bomb.setActive(false).setVisible(false);
        bomb.body.stop();
      }
    });
  }

  /**
   * Handles game over state.
   */
  gameOver() {
    if (this.isGameOver) return;

    this.isGameOver = true;
    this.swipePoints = [];
    this.graphics.clear();
    this.input.enabled = false;

    if (this.spawnTimer) {
      this.spawnTimer.remove(false);
      this.spawnTimer = null;
    }

    this.objects.children.iterate((object) => {
      if (!object) return;

      object.setActive(false).setVisible(false);
      object.body?.stop();
    });

    this.powerUps.children.iterate((powerUp) => {
      if (!powerUp) return;

      this.tweens.killTweensOf(powerUp);
      powerUp.setActive(false).setVisible(false);
      powerUp.clearTint();
      powerUp.setAlpha(1);
      powerUp.setBlendMode(Phaser.BlendModes.NORMAL);
      powerUp.body?.stop();
    });

    this.shuriken.children.iterate((shuriken) => {
      if (!shuriken) return;

      shuriken.setActive(false).setVisible(false);
      shuriken.body?.stop();
    });

    this.beers.children.iterate((beer) => {
      if (!beer) return;

      beer.setActive(false).setVisible(false);
      beer.body?.stop();
    });

    this.bombs.children.iterate((bomb) => {
      if (!bomb) return;

      bomb.setActive(false).setVisible(false);
      bomb.body?.stop();
    });

    this.physics.pause();
    this.add.text(
      this.cameras.main.width / 2,
      this.cameras.main.height / 2,
      `GAME OVER\nPOINTS ${this.score}`,
      {
        fontFamily: "system-ui, Segoe UI, sans-serif",
        fontSize: "60px",
        fill: "#ff3333",
        fontStyle: "bold",
        align: "center",
        stroke: "#111111",
        strokeThickness: 6
      }
    ).setOrigin(0.5).setDepth(200);

    window.dispatchEvent(new CustomEvent("chicken-ninja-game-over", {
      detail: { score: this.score, level: this.currentLevel }
    }));
  }

  /**
   * Keeps the camera, physics world, and background matched to the browser.
   */
  resizeWorld() {
    const width = this.scale.width;
    const height = this.scale.height;

    this.cameras.main.setSize(width, height);
    this.physics.world.setBounds(0, 0, width, height + this.bottomPadding);

    if (this.background) {
      const coverScale = Math.max(width / this.background.width, height / this.background.height);
      this.background
        .setPosition(width / 2, height / 2)
        .setScale(coverScale);
    }

    this.drawCollectionTray();
    this.drawScore();
  }

  /**
   * Creates a tiny texture used by all particle effects.
   */
  createParticleTexture() {
    if (this.textures.exists("particle")) return;

    const graphics = this.make.graphics({ x: 0, y: 0, add: false });
    graphics.fillStyle(0xffffff, 1);
    graphics.fillCircle(4, 4, 4);
    graphics.generateTexture("particle", 8, 8);
    graphics.destroy();
  }

  /**
   * Creates a larger white shuriken projectile.
   */
  createShurikenTexture() {
    if (this.textures.exists("shuriken")) return;

    const graphics = this.make.graphics({ x: 0, y: 0, add: false });
    const center = new Phaser.Math.Vector2(80, 80);
    const rotate = (x, y, angle) => {
      const cos = Math.cos(angle);
      const sin = Math.sin(angle);
      const dx = x - center.x;
      const dy = y - center.y;

      return new Phaser.Math.Vector2(
        center.x + dx * cos - dy * sin,
        center.y + dx * sin + dy * cos
      );
    };

    graphics.fillStyle(0xf8f8f0, 1);
    graphics.lineStyle(5, 0x7d8894, 1);

    for (let i = 0; i < 4; i++) {
      const angle = i * Phaser.Math.DegToRad(90);
      const blade = [
        rotate(80, 10, angle),
        rotate(107, 66, angle),
        rotate(86, 82, angle),
        rotate(67, 66, angle),
      ];

      graphics.fillPoints(blade, true);
    }

    graphics.fillStyle(0xdce3e8, 1);
    graphics.fillCircle(80, 80, 28);
    graphics.fillStyle(0x11151c, 1);
    graphics.fillCircle(80, 80, 11);
    graphics.generateTexture("shuriken", 160, 160);
    graphics.destroy();
  }

  /**
   * Creates a bonus beer bottle texture for score throws.
   */
  createBeerTexture() {
    if (this.textures.exists("beer")) return;

    const graphics = this.make.graphics({ x: 0, y: 0, add: false });

    graphics.fillStyle(0x1f6b3a, 1);
    graphics.fillRect(42, 22, 26, 42);
    graphics.fillRect(30, 58, 50, 74);
    graphics.fillStyle(0x2f9a55, 0.75);
    graphics.fillRect(39, 62, 12, 60);
    graphics.lineStyle(4, 0xd5f1c9, 1);
    graphics.strokeRect(30, 58, 50, 74);
    graphics.strokeRect(42, 22, 26, 42);

    graphics.fillStyle(0xf6cf5a, 1);
    graphics.fillRect(36, 78, 38, 30);
    graphics.lineStyle(2, 0x8c5b16, 1);
    graphics.strokeRect(36, 78, 38, 30);

    graphics.fillStyle(0xf8f2d3, 1);
    graphics.fillCircle(55, 44, 13);
    graphics.fillCircle(45, 50, 8);
    graphics.fillCircle(65, 51, 7);
    graphics.fillStyle(0xd9a42a, 1);
    graphics.fillRect(47, 32, 16, 8);

    graphics.generateTexture("beer", 112, 150);
    graphics.destroy();
  }

  /**
   * Creates a bomb hazard texture.
   */
  createBombTexture() {
    if (this.textures.exists("bomb")) return;

    const graphics = this.make.graphics({ x: 0, y: 0, add: false });

    graphics.fillStyle(0x18191c, 1);
    graphics.fillCircle(72, 82, 46);
    graphics.fillStyle(0x303238, 1);
    graphics.fillCircle(57, 64, 18);
    graphics.lineStyle(5, 0x080809, 1);
    graphics.strokeCircle(72, 82, 46);

    graphics.fillStyle(0x3b2c21, 1);
    graphics.fillRect(85, 28, 34, 16);
    graphics.lineStyle(4, 0x111111, 1);
    graphics.strokeRect(85, 28, 34, 16);

    graphics.lineStyle(5, 0x5b432b, 1);
    graphics.beginPath();
    graphics.moveTo(96, 32);
    graphics.lineTo(106, 18);
    graphics.lineTo(128, 16);
    graphics.strokePath();

    graphics.fillStyle(0xffd247, 1);
    graphics.fillCircle(132, 16, 8);
    graphics.fillStyle(0xff5c1a, 1);
    graphics.fillCircle(136, 13, 5);
    graphics.fillStyle(0xfff1a1, 1);
    graphics.fillCircle(127, 11, 4);

    graphics.generateTexture("bomb", 150, 140);
    graphics.destroy();
  }
}
