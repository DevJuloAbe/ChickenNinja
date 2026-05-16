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
      3: { name: "FAST", maxScore: 1000, bombChance: 0.3, speed: 1.18, spawnDelay: 820 },
      4: { name: "SUPERFAST", maxScore:1500, bombChance: 0.35, speed: 1.38, spawnDelay: 820 },
      5: { name: "HARDCORE", maxScore: null, bombChance: 0.5, speed: 1.38, spawnDelay: 720 },
    };
    this.scoreText = null;
    this.collectedDrumsticks = [];
    this.collectionBg = null;
    this.backgroundText = null;
    this.skillDefinitions = [
      {
        id: "dashSlash",
        name: "Dash Slash",
        label: "Dash",
        description: "Chicken dashes forward and cuts enemies",
        cooldown: 6200,
        keyCode: Phaser.Input.Keyboard.KeyCodes.ONE,
        keyLabel: "1",
        color: 0xffd166,
      },
      {
        id: "featherShuriken",
        name: "Feather Shuriken",
        label: "Feather",
        description: "Throws sharp feathers like ninja stars",
        cooldown: 5200,
        keyCode: Phaser.Input.Keyboard.KeyCodes.TWO,
        keyLabel: "2",
        color: 0xb7f7ff,
      },
      {
        id: "eggBomb",
        name: "Egg Bomb",
        label: "Egg",
        description: "Drops explosive eggs",
        cooldown: 7200,
        keyCode: Phaser.Input.Keyboard.KeyCodes.THREE,
        keyLabel: "3",
        color: 0xf7f0d4,
      },
      {
        id: "jumpKick",
        name: "Chicken Jump Kick",
        label: "Kick",
        description: "High jump attack",
        cooldown: 5800,
        keyCode: Phaser.Input.Keyboard.KeyCodes.FOUR,
        keyLabel: "4",
        color: 0xff9866,
      },
      {
        id: "shadowClone",
        name: "Shadow Clone",
        label: "Clone",
        description: "Creates fake chickens to confuse enemies",
        cooldown: 10500,
        keyCode: Phaser.Input.Keyboard.KeyCodes.FIVE,
        keyLabel: "5",
        color: 0x9fb2ff,
      },
    ];
    this.skills = this.skillDefinitions.reduce((skills, skill) => {
      skills[skill.id] = { ...skill, nextReadyAt: 0 };
      return skills;
    }, {});
    this.skillButtons = [];
    this.skillKeyHandlers = [];
    this.skillTooltip = null;
    this.skillProjectiles = null;
    this.lastPointerPosition = null;
    this.shadowCloneCharges = 0;
    this.shadowCloneSprites = [];
    this.shadowCloneTimer = null;
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
    this.createBackgroundText();

    this.createParticleTexture();
    this.createShurikenTexture();
    this.createBeerTexture();
    this.createSisigTexture();
    this.createBombTexture();
    this.createFeatherTexture();
    this.createEggBombTexture();

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

    // Group to manage sisig plate throws that travel with beer.
    this.sisigs = this.physics.add.group();

    // Group to manage bomb hazards
    this.bombs = this.physics.add.group();

    // Group to manage player skill projectiles.
    this.skillProjectiles = this.physics.add.group();

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
    this.drawSkillBar();

    this.resizeWorld();
    this.scale.on("resize", this.resizeWorld, this);

    this.setupInputHandlers();
    this.setupSkillKeys();
  }

  /**
   * Configures pointer events for swiping logic.
   */
  setupInputHandlers() {
    this.input.on("pointerdown", (pointer) => {
      if (this.isGameOver || this.isLevelTransitioning) return;

      this.lastPointerPosition = { x: pointer.x, y: pointer.y };
      this.swipePoints = [];
      this.graphics.clear();
    });

    this.input.on("pointermove", (pointer) => {
      if (this.isGameOver || this.isLevelTransitioning || !pointer.isDown) return;

      this.lastPointerPosition = { x: pointer.x, y: pointer.y };
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
   * Maps number keys to the skill bar.
   */
  setupSkillKeys() {
    if (!this.input.keyboard) return;

    this.skillDefinitions.forEach((skill) => {
      const key = this.input.keyboard.addKey(skill.keyCode);
      key.on("down", () => this.activateSkill(skill.id));
      this.skillKeyHandlers.push(key);
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

    // Check collision with bonus sisig plates
    this.sisigs.children.iterate((sisig) => {
      if (!sisig || !sisig.active) return;

      const bounds = sisig.getBounds();

      if (Phaser.Geom.Intersects.LineToRectangle(line, bounds)) {
        this.sliceSisig(sisig);
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
    this.tweens.killTweensOf(shuriken);

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
    this.addCollectedItem("beer", beer.x, beer.y, 0.09, 0.06, 0.12);
    beer.setActive(false).setVisible(false);
    beer.body.stop();
  }

  /**
   * Slices a sisig plate bonus for extra points.
   */
  sliceSisig(sisig) {
    if (this.isGameOver || this.isLevelTransitioning) return;

    const bonus = Phaser.Utils.Array.GetRandom([8, 12, 18, 25]);
    this.cameras.main.shake(100, 0.004);

    const sizzleEmitter = this.add.particles(sisig.x, sisig.y, "particle", {
      speed: { min: 70, max: 240 },
      angle: { min: 0, max: 360 },
      scale: { start: 0.09, end: 0 },
      color: [0xffd27a, 0xc76c2f, 0xf4f0d5, 0x58b368],
      alpha: { start: 0.95, end: 0 },
      lifespan: 700,
      gravityY: 470,
      quantity: 28,
      emitting: false
    });
    sizzleEmitter.explode();

    this.addPoints(bonus, sisig.x, sisig.y);
    this.showPowerUpText("SISIG!", sisig.x, sisig.y);
    this.addCollectedItem("sisig", sisig.x, sisig.y, 0.32, 0.22, 0.4);
    sisig.setActive(false).setVisible(false);
    sisig.body.stop();
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

  getResponsiveScale(baseScale, minScale = 0.18, maxScale = 0.55) {
    const size = Math.min(this.scale.width, this.scale.height);
    const factor = Phaser.Math.Clamp(size / 1000, 0.65, 1.0);
    return Phaser.Math.Clamp(baseScale * factor, minScale, maxScale);
  }

  isMobileLayout() {
    return this.scale.width <= 760 || this.scale.height <= 660;
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
      object.setScale(this.getResponsiveScale(0.32, 0.22, 0.42));
      object.setCircle(Math.max(object.displayWidth, object.displayHeight) / 2);
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
        this.throwBeerWithSisig(Phaser.Math.Between(width * 0.14, width * 0.86), height + 40);
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
      powerUp.setScale(this.getResponsiveScale(0.44, 0.32, 0.52));
      powerUp.clearTint();
      powerUp.setAlpha(1);
      powerUp.setBlendMode(Phaser.BlendModes.NORMAL);
      powerUp.setCircle(Math.max(powerUp.displayWidth, powerUp.displayHeight) / 2);
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
    chicken.setScale(this.getResponsiveScale(0.26, 0.18, 0.34));
    chicken.setCircle(Math.max(chicken.displayWidth, chicken.displayHeight) / 2);
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
   * Throws a shuriken projectile toward the screen.
   */
  throwShuriken(fromX, fromY) {
    if (this.isGameOver) return;

    const shuriken = this.shuriken.create(fromX, fromY, "shuriken");
    
    if (shuriken) {
      const width = this.scale.width;
      const height = this.scale.height;
      const speed = this.getLevelSettings().speed;
      const targetX = Phaser.Math.Between(width * 0.16, width * 0.84);
      const targetY = Phaser.Math.Between(height * 0.18, height * 0.56);
      const startScale = this.getResponsiveScale(0.54, 0.38, 0.7);
      const impactScale = this.getResponsiveScale(1.58, 1.16, 2.05);
      const duration = Phaser.Math.Clamp(1180 / speed, 720, 1280);

      shuriken.setActive(true).setVisible(true);
      shuriken.clearTint();
      shuriken.setAlpha(0.95);
      shuriken.setDepth(125);
      shuriken.setPosition(
        Phaser.Math.Clamp(fromX, width * 0.1, width * 0.9),
        fromY
      );
      shuriken.setScale(startScale);
      shuriken.setRotation(Math.random() * Math.PI * 2);
      shuriken.setCircle(Math.max(shuriken.displayWidth, shuriken.displayHeight) / 2);
      shuriken.setVelocity(0, 0);
      shuriken.setAngularVelocity(0);
      shuriken.setGravityY(0);
      shuriken.body.setAllowGravity(false);

      this.tweens.add({
        targets: shuriken,
        x: targetX,
        y: targetY,
        scaleX: impactScale,
        scaleY: impactScale,
        angle: shuriken.angle + Phaser.Math.Between(900, 1320),
        alpha: 1,
        duration,
        ease: "Quad.In",
        onComplete: () => this.handleShurikenScreenHit(shuriken)
      });
    }
  }

  /**
   * Throws a beer bottle bonus item.
   */
  throwBeer(fromX, fromY, launch = null) {
    if (this.isGameOver) return;

    const beer = this.beers.create(fromX, fromY, "beer");

    if (beer) {
      const throwLaunch = launch || this.getBonusThrowLaunch();

      beer.setActive(true).setVisible(true);
      beer.setScale(this.getResponsiveScale(0.13, 0.085, 0.16));
      beer.setCircle(Math.max(beer.displayWidth, beer.displayHeight) / 2);
      beer.setRotation(Phaser.Math.FloatBetween(-0.3, 0.3));
      beer.setVelocity(throwLaunch.velocityX, throwLaunch.velocityY);
      beer.setAngularVelocity(throwLaunch.angularVelocity);
      beer.setGravityY(throwLaunch.gravityY);
    }
  }

  /**
   * Throws beer and a sisig plate as a paired bonus.
   */
  throwBeerWithSisig(fromX, fromY) {
    if (this.isGameOver) return;

    const launch = this.getBonusThrowLaunch();
    const sisigOffset = launch.velocityX > 0 ? -92 : 92;
    const sisigX = Phaser.Math.Clamp(
      fromX + sisigOffset,
      this.scale.width * 0.1,
      this.scale.width * 0.9
    );

    this.throwBeer(fromX, fromY, launch);
    this.throwSisig(sisigX, fromY + 26, {
      ...launch,
      velocityX: launch.velocityX * Phaser.Math.FloatBetween(0.92, 1.06),
      velocityY: launch.velocityY * Phaser.Math.FloatBetween(0.97, 1.04),
      gravityY: launch.gravityY * 0.98,
      angularVelocity: Phaser.Math.Between(-240, 240)
    });
  }

  /**
   * Throws a sisig plate bonus item.
   */
  throwSisig(fromX, fromY, launch = null) {
    if (this.isGameOver) return;

    const sisig = this.sisigs.create(fromX, fromY, "sisig");

    if (sisig) {
      const throwLaunch = launch || this.getBonusThrowLaunch();

      sisig.setActive(true).setVisible(true);
      sisig.setScale(this.getResponsiveScale(0.7, 0.5, 0.86));
      sisig.setCircle(Math.max(sisig.displayWidth, sisig.displayHeight) / 2);
      sisig.setRotation(Phaser.Math.FloatBetween(-0.28, 0.28));
      sisig.setVelocity(throwLaunch.velocityX, throwLaunch.velocityY);
      sisig.setAngularVelocity(throwLaunch.angularVelocity);
      sisig.setGravityY(throwLaunch.gravityY);
    }
  }

  getBonusThrowLaunch() {
    const width = this.scale.width;
    const height = this.scale.height;
    const speed = this.getLevelSettings().speed;
    const direction = Math.random() < 0.5 ? -1 : 1;

    return {
      velocityX: direction * Phaser.Math.Between(width * 0.08 * speed, width * 0.22 * speed),
      velocityY: Phaser.Math.Between(-height * 1.5 * speed, -height * 1.2 * speed),
      gravityY: height * 1.22 * speed,
      angularVelocity: Phaser.Math.Between(-320, 320)
    };
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
      bomb.setScale(this.getResponsiveScale(0.96, 0.78, 1.05));
      bomb.setCircle(Math.max(bomb.displayWidth, bomb.displayHeight) / 2);
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
    this.addCollectedItem("drumstick", fromX, fromY, 0.08, 0.05, 0.1);
  }

  /**
   * Adds sliced bonus items to the bottom collection display.
   */
  addCollectedItem(textureKey, fromX, fromY, baseScale, minScale, maxScale) {
    const collected = this.physics.add.image(fromX, fromY, textureKey);
    const landing = this.getRandomTrayPoint();

    collected.setDepth(95);
    collected.setScale(this.getResponsiveScale(baseScale, minScale, maxScale));
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
    const mobile = this.isMobileLayout();
    const fontSize = mobile ? "18px" : "24px";
    const x = mobile ? 32 : this.scale.width - 32;
    const y = mobile ? 96 : 28;
    const origin = mobile ? 0 : 1;
    const align = mobile ? "left" : "right";

    this.scoreText = this.add.text(
      x,
      y,
      `LEVEL ${this.currentLevel} ${level.name}\nPOINTS ${this.score}${level.maxScore ? ` / ${level.maxScore}` : ""}`,
      {
      fontFamily: "system-ui, Segoe UI, sans-serif",
      fontSize,
      fontStyle: "900",
      color: "#fff3c4",
      stroke: "#111111",
      strokeThickness: 5,
      align
      }
    ).setOrigin(origin, 0).setDepth(110);
  }

  /**
   * Draws touch-friendly skill buttons inside the game canvas.
   */
  drawSkillBar() {
    this.hideSkillTooltip();
    this.skillButtons.forEach(({ container }) => container.destroy(true));
    this.skillButtons = [];

    const width = this.scale.width;
    const height = this.scale.height;
    const mobile = this.isMobileLayout();
    const gap = mobile ? 6 : 10;
    const trayHeight = Math.min(100, Math.max(72, height * 0.13));
    const buttonWidth = mobile
      ? Phaser.Math.Clamp((width - 42 - gap * (this.skillDefinitions.length - 1)) / this.skillDefinitions.length, 54, 74)
      : 92;
    const buttonHeight = mobile ? 52 : 58;
    const totalWidth = this.skillDefinitions.length * buttonWidth + (this.skillDefinitions.length - 1) * gap;
    const startX = width / 2 - totalWidth / 2 + buttonWidth / 2;
    const y = Phaser.Math.Clamp(
      height - trayHeight - (mobile ? 44 : 52),
      mobile ? 126 : 96,
      height - trayHeight - 26
    );

    this.skillDefinitions.forEach((definition, index) => {
      const skill = this.skills[definition.id];
      const x = startX + index * (buttonWidth + gap);
      const container = this.add.container(x, y).setDepth(150);
      const background = this.add.graphics();
      const keyText = this.add.text(-buttonWidth / 2 + 7, -buttonHeight / 2 + 5, skill.keyLabel, {
        fontFamily: "system-ui, Segoe UI, sans-serif",
        fontSize: mobile ? "10px" : "11px",
        fontStyle: "900",
        color: "#ffe6a4",
      }).setOrigin(0, 0);
      const label = this.add.text(0, mobile ? 2 : 4, skill.label.toUpperCase(), {
        fontFamily: "system-ui, Segoe UI, sans-serif",
        fontSize: mobile ? "11px" : "13px",
        fontStyle: "900",
        color: "#fff8e5",
        align: "center",
      }).setOrigin(0.5);
      const cooldownText = this.add.text(0, -buttonHeight / 2 + 15, "", {
        fontFamily: "system-ui, Segoe UI, sans-serif",
        fontSize: mobile ? "18px" : "20px",
        fontStyle: "900",
        color: "#ffffff",
        stroke: "#0b1012",
        strokeThickness: 4,
      }).setOrigin(0.5);

      container.add([background, keyText, label, cooldownText]);
      container.setSize(buttonWidth, buttonHeight);
      container.setInteractive(
        new Phaser.Geom.Rectangle(-buttonWidth / 2, -buttonHeight / 2, buttonWidth, buttonHeight),
        Phaser.Geom.Rectangle.Contains
      );
      container.on("pointerdown", (pointer, localX, localY, event) => {
        event?.stopPropagation();
        this.activateSkill(skill.id);
      });
      container.on("pointerover", () => this.showSkillTooltip(skill, x, y - buttonHeight / 2 - 12));
      container.on("pointerout", () => this.hideSkillTooltip());

      this.skillButtons.push({
        skill,
        container,
        background,
        keyText,
        label,
        cooldownText,
        width: buttonWidth,
        height: buttonHeight,
      });
    });

    this.refreshSkillButtons();
  }

  refreshSkillButtons() {
    if (!this.skillButtons.length) return;

    this.skillButtons.forEach((button) => {
      const remaining = Math.max(0, button.skill.nextReadyAt - this.time.now);
      const ready = remaining <= 0 && !this.isGameOver && !this.isLevelTransitioning;
      const fillColor = ready ? button.skill.color : 0x11181a;
      const fillAlpha = ready ? 0.88 : 0.78;
      const lineColor = ready ? 0xfff1b8 : 0x526066;

      button.background.clear();
      button.background.fillStyle(fillColor, fillAlpha);
      button.background.fillRect(-button.width / 2, -button.height / 2, button.width, button.height);
      button.background.lineStyle(2, lineColor, ready ? 0.95 : 0.55);
      button.background.strokeRect(-button.width / 2, -button.height / 2, button.width, button.height);

      button.label.setColor(ready ? "#111111" : "#d8dddc");
      button.keyText.setColor(ready ? "#111111" : "#ffe6a4");
      button.cooldownText.setText(remaining > 0 ? String(Math.ceil(remaining / 1000)) : "");
    });
  }

  showSkillTooltip(skill, x, y) {
    if (this.isMobileLayout()) return;

    this.hideSkillTooltip();

    const paddingX = 12;
    const paddingY = 9;
    const title = this.add.text(0, 0, skill.name, {
      fontFamily: "system-ui, Segoe UI, sans-serif",
      fontSize: "14px",
      fontStyle: "900",
      color: "#ffd66b",
    });
    const body = this.add.text(0, 20, skill.description, {
      fontFamily: "system-ui, Segoe UI, sans-serif",
      fontSize: "12px",
      color: "#fff8e5",
    });
    const tooltipWidth = Math.max(title.width, body.width) + paddingX * 2;
    const tooltipHeight = 48;
    const tooltipX = Phaser.Math.Clamp(x, tooltipWidth / 2 + 14, this.scale.width - tooltipWidth / 2 - 14);
    const tooltipY = Phaser.Math.Clamp(y - tooltipHeight / 2, tooltipHeight / 2 + 14, this.scale.height - tooltipHeight / 2 - 14);
    const background = this.add.graphics();

    background.fillStyle(0x070a0c, 0.92);
    background.fillRect(-tooltipWidth / 2, -tooltipHeight / 2, tooltipWidth, tooltipHeight);
    background.lineStyle(1, 0xffd66b, 0.8);
    background.strokeRect(-tooltipWidth / 2, -tooltipHeight / 2, tooltipWidth, tooltipHeight);
    title.setPosition(-tooltipWidth / 2 + paddingX, -tooltipHeight / 2 + paddingY);
    body.setPosition(-tooltipWidth / 2 + paddingX, -tooltipHeight / 2 + paddingY + 20);

    this.skillTooltip = this.add.container(tooltipX, tooltipY, [background, title, body]).setDepth(210);
  }

  hideSkillTooltip() {
    if (!this.skillTooltip) return;

    this.skillTooltip.destroy(true);
    this.skillTooltip = null;
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
    const groups = [this.objects, this.powerUps, this.shuriken, this.beers, this.sisigs, this.bombs];

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
    const textSize = this.isMobileLayout() ? "26px" : "34px";
    const text = this.add.text(x, y - 44, message, {
      fontFamily: "system-ui, Segoe UI, sans-serif",
      fontSize: textSize,
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

  showBloodyScreenEffect(hitX = this.scale.width / 2) {
    const width = this.scale.width;
    const height = this.scale.height;
    const blood = this.add.graphics();
    const centerX = Phaser.Math.Clamp(hitX, width * 0.08, width * 0.92);

    blood.setDepth(190);
    blood.fillStyle(0x8f0000, 0.24);
    blood.fillRect(0, 0, width, height);

    blood.fillStyle(0x5d0000, 0.72);
    for (let i = 0; i < 20; i++) {
      const x = Phaser.Math.Clamp(
        centerX + Phaser.Math.Between(-width * 0.2, width * 0.2),
        12,
        width - 12
      );
      const y = Phaser.Math.Between(height * 0.08, height * 0.58);
      const radius = Phaser.Math.Between(8, 30);

      blood.fillCircle(x, y, radius);
    }

    blood.lineStyle(5, 0x6b0000, 0.78);
    for (let i = 0; i < 9; i++) {
      const x = Phaser.Math.Clamp(
        centerX + Phaser.Math.Between(-width * 0.18, width * 0.18),
        18,
        width - 18
      );
      const y = Phaser.Math.Between(height * 0.06, height * 0.3);
      const dripLength = Phaser.Math.Between(height * 0.08, height * 0.28);

      blood.beginPath();
      blood.moveTo(x, y);
      blood.lineTo(x + Phaser.Math.Between(-12, 12), y + dripLength);
      blood.strokePath();
    }

    blood.fillStyle(0x2b0000, 0.5);
    blood.fillRect(0, 0, width, 18);
    blood.fillRect(0, height - 18, width, 18);
    blood.fillRect(0, 0, 18, height);
    blood.fillRect(width - 18, 0, 18, height);

    this.tweens.add({
      targets: blood,
      alpha: 0,
      duration: 720,
      ease: "Quad.Out",
      onComplete: () => blood.destroy()
    });
  }

  handleShurikenScreenHit(shuriken) {
    if (this.isGameOver || this.isLevelTransitioning || !shuriken.active) return;

    const hitX = shuriken.x;
    const hitY = shuriken.y;

    this.tweens.killTweensOf(shuriken);
    shuriken.setActive(false).setVisible(false);
    shuriken.body.stop();

    this.currentHealth = Math.max(0, this.currentHealth - 1);
    this.drawHearts();
    this.cameras.main.shake(280, 0.014);
    this.showBloodyScreenEffect(hitX);
    this.showScreenBreakSliceEffect(hitX, hitY);
    this.showPowerUpText("-1 LIFE", hitX, hitY + 86);

    if (this.currentHealth <= 0) {
      this.gameOver();
    }
  }

  showScreenBreakSliceEffect(hitX, hitY) {
    const width = this.scale.width;
    const height = this.scale.height;
    const x = Phaser.Math.Clamp(hitX, width * 0.08, width * 0.92);
    const y = Phaser.Math.Clamp(hitY, height * 0.12, height * 0.72);
    const cracks = this.add.graphics();
    const slashAngle = Phaser.Math.FloatBetween(-0.62, 0.62);
    const slashLength = Math.min(width, height) * 0.7;
    const dx = Math.cos(slashAngle) * slashLength;
    const dy = Math.sin(slashAngle) * slashLength;

    cracks.setDepth(195);
    cracks.fillStyle(0xffffff, 0.09);
    cracks.fillRect(0, 0, width, height);

    cracks.lineStyle(12, 0x2b0000, 0.62);
    cracks.beginPath();
    cracks.moveTo(x - dx * 0.46, y - dy * 0.46);
    cracks.lineTo(x + dx * 0.46, y + dy * 0.46);
    cracks.strokePath();

    cracks.lineStyle(6, 0xf4fbff, 0.96);
    cracks.beginPath();
    cracks.moveTo(x - dx * 0.5, y - dy * 0.5);
    cracks.lineTo(x + dx * 0.5, y + dy * 0.5);
    cracks.strokePath();

    cracks.lineStyle(3, 0xff3c3c, 0.82);
    cracks.beginPath();
    cracks.moveTo(x - dx * 0.38, y - dy * 0.38 + 8);
    cracks.lineTo(x + dx * 0.38, y + dy * 0.38 + 8);
    cracks.strokePath();

    cracks.lineStyle(3, 0xecf7ff, 0.9);
    for (let i = 0; i < 13; i++) {
      const angle = Phaser.Math.FloatBetween(0, Math.PI * 2);
      const length = Phaser.Math.Between(42, Math.min(width, height) * 0.26);
      const endX = Phaser.Math.Clamp(x + Math.cos(angle) * length, 8, width - 8);
      const endY = Phaser.Math.Clamp(y + Math.sin(angle) * length, 8, height - 8);
      const branchAngle = angle + Phaser.Math.FloatBetween(-0.9, 0.9);
      const branchStartX = x + Math.cos(angle) * length * 0.52;
      const branchStartY = y + Math.sin(angle) * length * 0.52;
      const branchLength = length * Phaser.Math.FloatBetween(0.18, 0.34);

      cracks.beginPath();
      cracks.moveTo(x, y);
      cracks.lineTo(endX, endY);
      cracks.strokePath();

      cracks.beginPath();
      cracks.moveTo(branchStartX, branchStartY);
      cracks.lineTo(
        branchStartX + Math.cos(branchAngle) * branchLength,
        branchStartY + Math.sin(branchAngle) * branchLength
      );
      cracks.strokePath();
    }

    cracks.fillStyle(0xdff7ff, 0.14);
    for (let i = 0; i < 8; i++) {
      const angle = Phaser.Math.FloatBetween(0, Math.PI * 2);
      const distance = Phaser.Math.Between(28, Math.min(width, height) * 0.2);
      const shardX = x + Math.cos(angle) * distance;
      const shardY = y + Math.sin(angle) * distance;
      const shardSize = Phaser.Math.Between(12, 32);

      cracks.fillTriangle(
        shardX,
        shardY,
        shardX + Math.cos(angle + 1.7) * shardSize,
        shardY + Math.sin(angle + 1.7) * shardSize,
        shardX + Math.cos(angle - 1.5) * shardSize * 0.8,
        shardY + Math.sin(angle - 1.5) * shardSize * 0.8
      );
    }

    this.tweens.add({
      targets: cracks,
      alpha: 0,
      duration: 980,
      ease: "Quad.Out",
      onComplete: () => cracks.destroy()
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

    // Fallback cleanup if a shuriken leaves the world unexpectedly.
    this.shuriken.children.iterate((shuriken) => {
      if (shuriken && shuriken.active && shuriken.y > offscreenY) {
        this.handleShurikenScreenHit(shuriken);
      }
    });

    this.beers.children.iterate((beer) => {
      if (beer && beer.active && beer.y > offscreenY) {
        beer.setActive(false).setVisible(false);
        beer.body.stop();
      }
    });

    this.sisigs.children.iterate((sisig) => {
      if (sisig && sisig.active && sisig.y > offscreenY) {
        sisig.setActive(false).setVisible(false);
        sisig.body.stop();
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

    this.sisigs.children.iterate((sisig) => {
      if (!sisig) return;

      sisig.setActive(false).setVisible(false);
      sisig.body?.stop();
    });

    this.bombs.children.iterate((bomb) => {
      if (!bomb) return;

      bomb.setActive(false).setVisible(false);
      bomb.body?.stop();
    });

    this.physics.pause();
    const gameOverSize = this.isMobileLayout() ? "42px" : "60px";
    this.add.text(
      this.cameras.main.width / 2,
      this.cameras.main.height / 2,
      `GAME OVER\nPOINTS ${this.score}`,
      {
        fontFamily: "system-ui, Segoe UI, sans-serif",
        fontSize: gameOverSize,
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
  createBackgroundText() {
    this.backgroundText = this.add.text(0, 0, "4,300 JM sa sunod na sahod", {
      fontFamily: "Trebuchet MS, Segoe UI, system-ui, sans-serif",
      fontSize: "64px",
      fontStyle: "900",
      color: "#fff1a8",
      stroke: "#140d05",
      strokeThickness: 8,
      align: "center",
    }).setOrigin(0.5).setDepth(-0.5).setAlpha(0.48);
  }

  layoutBackgroundText() {
    if (!this.backgroundText) return;

    const width = this.scale.width;
    const height = this.scale.height;
    const fontSize = Phaser.Math.Clamp(Math.min(width * 0.09, height * 0.11), 28, 76);

    this.backgroundText
      .setPosition(width / 2, height * 0.42)
      .setFontSize(`${fontSize}px`)
      .setWordWrapWidth(width * 0.82);
  }

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

    this.layoutBackgroundText();
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
   * Creates a sisig plate bonus texture.
   */
  createSisigTexture() {
    if (this.textures.exists("sisig")) return;

    const graphics = this.make.graphics({ x: 0, y: 0, add: false });
    const meatChunks = [
      [60, 58, 13, 9, 0x8b4a24],
      [80, 52, 12, 8, 0xb4622c],
      [103, 58, 14, 9, 0x6f371c],
      [54, 73, 12, 8, 0xc57a35],
      [76, 76, 15, 10, 0x7c3f21],
      [98, 78, 13, 9, 0xb8642e],
      [118, 72, 11, 8, 0x5b2d19],
      [66, 88, 12, 8, 0xb4622c],
      [88, 91, 14, 9, 0x7c3f21],
      [111, 89, 13, 8, 0xc57a35],
    ];

    graphics.fillStyle(0xe9ddbd, 1);
    graphics.fillEllipse(88, 76, 162, 102);
    graphics.lineStyle(7, 0xb99a5a, 1);
    graphics.strokeEllipse(88, 76, 162, 102);
    graphics.fillStyle(0x24201c, 1);
    graphics.fillEllipse(88, 76, 132, 76);
    graphics.lineStyle(4, 0x0f0d0c, 1);
    graphics.strokeEllipse(88, 76, 132, 76);

    meatChunks.forEach(([x, y, width, height, color]) => {
      graphics.fillStyle(color, 1);
      graphics.fillEllipse(x, y, width, height);
    });

    graphics.fillStyle(0xf5f0df, 1);
    graphics.fillCircle(86, 70, 20);
    graphics.fillStyle(0xf5b935, 1);
    graphics.fillCircle(91, 70, 9);

    graphics.lineStyle(4, 0x65b84d, 1);
    graphics.beginPath();
    graphics.moveTo(49, 64);
    graphics.lineTo(69, 53);
    graphics.strokePath();
    graphics.beginPath();
    graphics.moveTo(107, 51);
    graphics.lineTo(131, 60);
    graphics.strokePath();

    graphics.lineStyle(4, 0xd5452f, 1);
    graphics.beginPath();
    graphics.moveTo(42, 81);
    graphics.lineTo(61, 91);
    graphics.strokePath();
    graphics.beginPath();
    graphics.moveTo(115, 91);
    graphics.lineTo(137, 82);
    graphics.strokePath();

    graphics.fillStyle(0xf6eee1, 0.95);
    graphics.fillCircle(61, 67, 4);
    graphics.fillCircle(121, 73, 4);
    graphics.fillCircle(75, 95, 3);

    graphics.generateTexture("sisig", 176, 134);
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
