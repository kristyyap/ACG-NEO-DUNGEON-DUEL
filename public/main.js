//Version 1.0

import * as THREE from "three"; // via <script type="importmap">
import { FIXED_LAYOUT, spawnSpots } from "./layout.js";
import { PointerLockControls } from "https://unpkg.com/three@0.160.0/examples/jsm/controls/PointerLockControls.js";

// Added for 3D model
import { GLTFLoader } from "https://unpkg.com/three@0.160.0/examples/jsm/loaders/GLTFLoader.js";
import * as SkeletonUtils from "https://unpkg.com/three@0.160.0/examples/jsm/utils/SkeletonUtils.js";

// socket.io is injected in index.html
let socket;
let mySlotIndex = null;
let loadedAvatars = 0;

// ─────────────────────────────────────────────────────────
// 2) GLOBALS
// ─────────────────────────────────────────────────────────
let camera, scene, renderer, controls;
let raycaster = new THREE.Raycaster(); // still used for monster LOS
let spawnPos = new THREE.Vector3();
let treasureMesh;
let torch;
let avatarGLTF1 = null;
let avatarGLTF2 = null;
let avatarGLTF3 = null;
let avatarGLTF4 = null;
let myAvatar = null;

let avatarMixer = null;
let avatarClips1 = [];
let avatarClips2 = [];
let avatarClips3 = [];
let avatarClips4 = [];
const AVATAR_ANIM = "CINEMA_4D___";
const AVATAR_ANIM2 = "Take 001";
const AVATAR_ANIM3 = "Armature|mixamo.com|Layer0";
const AVATAR_ANIM4 = "mixamo.com";
let avatarAction;

const treasureSpots = [];
const monsterSpots = [];
const monsters = [];
const monsterClones = [];
const treasures = [];

const objects = []; // wall meshes  (for lighting / LOS)
const wallBoxes = []; // AABBs for capsule–wall collision                ★ NEW
const players = {}; // remote avatars

const MONSTER_SPEED = 2.0; // m · s-1  (walking pace)
const MONSTER_SIGHT = 18.0; // meters   (how far they can “see”)
const MONSTER_RADIUS = 0.4;

const SPEED = 5; // m·s-1
const playerHeight = 1.6; // eye height above floor
const PLAYER_RADIUS = 0.4; // ★ NEW

let moveForward = false,
  moveBackward = false,
  moveLeft = false,
  moveRight = false;

let prevTime = performance.now();

// dungeon map
const DUNGEON_SIZE = 41; // must be odd
let dungeonMap = []; // 0 wall | 1 floor

// Monster sprite + visibility
let monsterSprite;
let monsterPosition = new THREE.Vector3();
let monsterVisible = false;

// Added for 3D model
let monsterGLTF = null;
let monsterMixer = null;
let monsterClips = null;
const clipIndexByName = {};

// Open Treasures - Collect Coins
let goldCount = 0;
let openedTreasures = new Set();
let nearestTreasureIndex = null;
let coinDisplay = document.createElement("div");
coinDisplay.style.position = "absolute";
coinDisplay.style.top = "16px";
coinDisplay.style.left = "50%";
coinDisplay.style.transform = "translateX(-50%)";
coinDisplay.style.background = "rgba(0,0,0,0.85)";
coinDisplay.style.color = "#FFD700";
coinDisplay.style.fontWeight = "bold";
coinDisplay.style.fontSize = "28px";
coinDisplay.style.padding = "8px 32px";
coinDisplay.style.borderRadius = "12px";
coinDisplay.style.zIndex = "200";
coinDisplay.innerText = "🪙 Gold: 0";
document.body.appendChild(coinDisplay);

// Refresh UI
function updateCoinDisplay() {
  coinDisplay.innerText = `🪙 Gold: ${goldCount}`;
}

// hint when player is close to treasure
let treasureHint = document.createElement("div");
treasureHint.style.position = "absolute";
treasureHint.style.pointerEvents = "none";
treasureHint.style.background = "rgba(0,0,0,0.92)";
treasureHint.style.color = "#FFD700";
treasureHint.style.fontWeight = "bold";
treasureHint.style.fontSize = "22px";
treasureHint.style.padding = "7px 18px";
treasureHint.style.borderRadius = "10px";
treasureHint.style.display = "none";
treasureHint.style.zIndex = "150";
treasureHint.innerText = "Press E to open treasure";
document.body.appendChild(treasureHint);

// Health Bar (3 lives for 1 player)
let playerLives = 3;
const maxLives = 3;
// health bar
let healthBar = document.createElement("div");
healthBar.style.position = "absolute";
healthBar.style.top = "20px";
healthBar.style.left = "32px";
healthBar.style.width = "120px";
healthBar.style.height = "32px";
healthBar.style.background = "rgba(0,0,0,0.6)";
healthBar.style.borderRadius = "14px";
healthBar.style.padding = "6px 18px";
healthBar.style.fontSize = "22px";
healthBar.style.fontWeight = "bold";
healthBar.style.color = "#FF5555";
healthBar.style.zIndex = "500";
healthBar.style.letterSpacing = "2px";
healthBar.style.textShadow = "0 2px 10px #000";
document.body.appendChild(healthBar);

function updateHealthBar() {
  // 3 heart represent player's lives
  let hearts = "";
  for (let i = 0; i < playerLives; ++i) hearts += "❤️ ";
  for (let i = playerLives; i < maxLives; ++i) hearts += "🤍 ";
  healthBar.innerText = hearts.trim();
}
updateHealthBar();

// ─────────────────────────────────────────────────────────
// 3) HELPER — capsule-like AABB for the player
// ─────────────────────────────────────────────────────────
function makePlayerBox(pos) {
  // ★ NEW
  return new THREE.Box3(
    new THREE.Vector3(
      pos.x - PLAYER_RADIUS,
      pos.y - playerHeight,
      pos.z - PLAYER_RADIUS
    ),
    new THREE.Vector3(pos.x + PLAYER_RADIUS, pos.y, pos.z + PLAYER_RADIUS)
  );
}

function onAvatarLoaded() {
  loadedAvatars++;
  if (loadedAvatars === 4) {
    // now all avatarGLTF1–4 are non-null
    initSocketConnection();
  }
}

// ─────────────────────────────────────────────────────────
// 4) MAIN SET-UP
// ─────────────────────────────────────────────────────────
init();
animate();

function init() {
  // scene / camera / renderer
  scene = new THREE.Scene();
  //scene.background = new THREE.Color(0x111111);
  scene.background = new THREE.Color(0x000000);
  scene.fog = new THREE.Fog(0x000000, 18, 40);

  camera = new THREE.PerspectiveCamera(75, innerWidth / innerHeight, 0.1, 300);
  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(innerWidth, innerHeight);
  document.body.appendChild(renderer.domElement);

  // controls
  controls = new PointerLockControls(camera, document.body);
  const blocker = document.getElementById("blocker");
  const instructions = document.getElementById("instructions");

  instructions.addEventListener("click", () => controls.lock());
  controls.addEventListener("lock", () => {
    blocker.style.display = "none";
    instructions.style.display = "none";
  });
  controls.addEventListener("unlock", () => {
    blocker.style.display = "flex";
    instructions.style.display = "";
  });

  scene.add(controls.getObject());
  controls.getObject().position.set(0, playerHeight, 0);

  // lighting
  //   scene.add(new THREE.HemisphereLight(0xffffff, 0x444444, 0.8));
  //   const torch = new THREE.PointLight(0xffaa33, 1, 10);
  //   torch.position.set(0,3,0);
  //   scene.add(torch);
  // ── LIGHTING ───────────────────────────────────────

  // 1. Tiny ambient so walls aren't 100 % black
  scene.add(new THREE.AmbientLight(0x111111, 0.3));

  // 2. Player’s flashlight: a SpotLight
  torch = new THREE.SpotLight(
    0xffddaa, // warm colour
    3.0, // intensity
    150, // range (meters)
    Math.PI / 4, // inner cone (~25°)
    0.4, // penumbra softness
    1.0
  ); // decay (phys-correct)

  torch.castShadow = true; // optional, costs a bit of GPU
  torch.shadow.bias = -0.0003; // reduce acne
  torch.shadow.mapSize.set(512, 512);

  scene.add(torch);
  scene.add(torch.target);

  // textures & materials
  const texLoader = new THREE.TextureLoader();
  const wallTex = texLoader.load("textures/wall.jpeg");
  wallTex.wrapS = wallTex.wrapT = THREE.RepeatWrapping;
  wallTex.repeat.set(1, 1);

  const floorTex = texLoader.load("textures/floor.jpeg");
  floorTex.wrapS = floorTex.wrapT = THREE.RepeatWrapping;
  floorTex.repeat.set(1, 1);

  const wallMat = new THREE.MeshPhongMaterial({
    map: wallTex,
    shininess: 30,
    specular: 0x555555,
  });
  const floorMat = new THREE.MeshPhongMaterial({
    map: floorTex,
    shininess: 5,
    specular: 0x222222,
  });

  // dungeon
  loadFixedLayout();
  buildDungeonGeometry(wallMat, floorMat);
  //controls.getObject().position.copy(spawnPos);

  const gltfLoader = new GLTFLoader();

  // ─── LOAD THE MONSTER glTF ─────────────────────────────────
  gltfLoader.load(
    "models/scene.gltf",
    (gltf) => {
      console.log(gltf.animations);
      monsterGLTF = gltf.scene; // hold the master
      monsterClips = gltf.animations;

      // OPTIONAL: if there are animations in the glTF:
      // if (gltf.animations && gltf.animations.length > 0) {
      //   monsterMixer = new THREE.AnimationMixer(monsterGLTF);
      //   monsterMixer.clipAction(gltf.animations[0], monsterGLTF).play();
      // }
      monsterClips.forEach((clip, i) => {
        clipIndexByName[clip.name] = i;
      });

      placeMonsters(); // now that the model is loaded, populate monsters
    },
    undefined,
    (error) => {
      console.error("Error loading monster glTF:", error);
    }
  );

  // ─── LOAD THE AVATAR1 glTF ───────────────────────────
  gltfLoader.load(
    "avatar1/scene.gltf",
    (gltf) => {
      avatarGLTF1 = gltf.scene;
      avatarClips1 = gltf.animations;
      avatarGLTF1.userData.clips = gltf.animations;
      console.log(gltf.animations);

      // ── STEP 1: Measure the raw height (before scaling) ──────────────────
      scene.add(avatarGLTF1);
      avatarGLTF1.updateWorldMatrix(true, true);
      const rawBox = new THREE.Box3().setFromObject(avatarGLTF1);
      const rawHeight = rawBox.max.y - rawBox.min.y; // model’s “unscaled” height

      // ── STEP 2: Uniformly scale so total height ≈ playerHeight (1.6 m) ─
      const scale = playerHeight / rawHeight; // e.g. 1.6 ÷ (rawHeight)
      avatarGLTF1.scale.setScalar(scale);

      // ── STEP 3: After scaling, compute the new “foot” y and the “head” y ─
      avatarGLTF1.updateWorldMatrix(true, true);
      const scaledBox = new THREE.Box3().setFromObject(avatarGLTF1);
      const footY = scaledBox.min.y; // local Y of foot‐sole after scaling
      const headY_in_local = scaledBox.max.y; // local Y of head top after scaling

      // Drop feet onto Y = 0 (floor):
      avatarGLTF1.position.y -= footY;

      scene.remove(avatarGLTF1);
      scene.add(avatarGLTF1);

      avatarGLTF1.userData.headY = headY_in_local;

      // ROTATE so its “forward” faces camera’s forward. Tweak if needed:
      // e.g. Math.PI = 180°, Math.PI/2 = 90°, etc.
      const initialYaw = Math.PI / 2;
      //avatarGLTF.rotation.y = initialYaw;
      //avatarGLTF.userData.yawOffset = initialYaw;

      // ── STEP 5: Create the AnimationMixer but do NOT call .play() yet ─
      avatarMixer = new THREE.AnimationMixer(avatarGLTF1);
      const clip = avatarClips1.find((c) => c.name === AVATAR_ANIM);
      if (!clip) {
        console.warn(
          "Avatar1 clip not found:",
          avatarClips1.map((c) => c.name)
        );
        return;
      }

      avatarAction = avatarMixer.clipAction(clip);
      avatarAction.setLoop(THREE.LoopRepeat, Infinity);
      avatarAction.clampWhenFinished = true;

      // start paused at first frame:
      avatarAction.paused = true;
      avatarAction.time = 0;
      avatarAction.play();

      console.log("Avatar1 action ready (paused).");
      onAvatarLoaded();
    },
    undefined,
    (err) => console.error("Error loading avatar1 GLTF:", err)
  );

  // Player 2 = normal man
  gltfLoader.load(
    "avatar2/scene.gltf",
    (gltf) => {
      avatarGLTF2 = gltf.scene;
      avatarClips2 = gltf.animations;
      avatarGLTF2.userData.clips = gltf.animations;
      console.log(gltf.animations);

      // ── STEP 1: Measure the raw height (before scaling) ──────────────────

      scene.add(avatarGLTF2);
      avatarGLTF2.updateWorldMatrix(true, true);
      const rawBox = new THREE.Box3().setFromObject(avatarGLTF2);
      const rawHeight = rawBox.max.y - rawBox.min.y; // model’s “unscaled” height

      // ── STEP 2: Uniformly scale so total height ≈ playerHeight (1.6 m) ─
      //const scale = playerHeight / rawHeight;              // e.g. 1.6 ÷ (rawHeight)
      // console.log('scale:', scale);
      // console.log('raw height:', rawHeight);
      avatarGLTF2.scale.setScalar(1.1);

      // ── STEP 3: After scaling, compute the new “foot” y and the “head” y ─
      avatarGLTF2.updateWorldMatrix(true, true);
      const scaledBox = new THREE.Box3().setFromObject(avatarGLTF2);
      const footY = 0.09; // local Y of foot‐sole after scaling
      const headY_in_local = 1.694; // local Y of head top after scaling
      // console.log('footY:', footY);
      // console.log('headY_in_local:', headY_in_local);

      // Drop feet onto Y = 0 (floor):
      avatarGLTF2.position.y -= footY;

      scene.remove(avatarGLTF2);
      scene.add(avatarGLTF2);

      avatarGLTF2.userData.headY = headY_in_local;

      // ROTATE so its “forward” faces camera’s forward. Tweak if needed:
      // e.g. Math.PI = 180°, Math.PI/2 = 90°, etc.
      //const initialYaw = Math.PI/2;
      //avatarGLTF.rotation.y = initialYaw;
      //avatarGLTF.userData.yawOffset = initialYaw;

      // ── STEP 5: Create the AnimationMixer but do NOT call .play() yet ─
      avatarMixer = new THREE.AnimationMixer(avatarGLTF2);
      const clip = avatarClips2.find((c) => c.name === AVATAR_ANIM2);
      if (!clip) {
        console.warn(
          "Avatar2 clip not found:",
          avatarClips2.map((c) => c.name)
        );
        return;
      }

      avatarAction = avatarMixer.clipAction(clip);
      avatarAction.setLoop(THREE.LoopRepeat, Infinity);
      avatarAction.clampWhenFinished = true;

      // start paused at first frame:
      avatarAction.paused = true;
      avatarAction.time = 0;
      avatarAction.play();

      console.log("Avatar2 action ready (paused).");
      onAvatarLoaded();
    },
    undefined,
    (err) => console.error("Error loading avatar GLTF:", err)
  );

  //player3 = naruto
  gltfLoader.load(
    "avatar3/scene.gltf",
    (gltf) => {
      avatarGLTF3 = gltf.scene;
      avatarClips3 = gltf.animations;
      avatarGLTF3.userData.clips = gltf.animations;
      console.log(gltf.animations);

      // ── STEP 1: Measure the raw height (before scaling) ──────────────────

      scene.add(avatarGLTF3);
      avatarGLTF3.updateWorldMatrix(true, true);
      const rawBox = new THREE.Box3().setFromObject(avatarGLTF3);
      const rawHeight = rawBox.max.y - rawBox.min.y; // model’s “unscaled” height

      // ── STEP 2: Uniformly scale so total height ≈ playerHeight (1.6 m) ─
      avatarGLTF3.scale.setScalar(0.6);

      // ── STEP 3: After scaling, compute the new “foot” y and the “head” y ─
      avatarGLTF3.updateWorldMatrix(true, true);
      const footY = 0.09; // local Y of foot‐sole after scaling
      const headY_in_local = 1.694; // local Y of head top after scaling

      // Drop feet onto Y = 0 (floor):
      avatarGLTF3.position.y -= footY;

      scene.remove(avatarGLTF3);
      scene.add(avatarGLTF3);

      avatarGLTF3.userData.headY = headY_in_local;

      // ROTATE so its “forward” faces camera’s forward. Tweak if needed:
      // e.g. Math.PI = 180°, Math.PI/2 = 90°, etc.
      const initialYaw = Math.PI / 2;
      //avatarGLTF.rotation.y = initialYaw;
      //avatarGLTF.userData.yawOffset = initialYaw;

      // ── STEP 5: Create the AnimationMixer but do NOT call .play() yet ─
      avatarMixer = new THREE.AnimationMixer(avatarGLTF3);
      const clip = avatarClips3.find((c) => c.name === AVATAR_ANIM3);
      if (!clip) {
        console.warn(
          "Avatar2 clip not found:",
          avatarClips3.map((c) => c.name)
        );
        return;
      }

      avatarAction = avatarMixer.clipAction(clip);
      avatarAction.setLoop(THREE.LoopRepeat, Infinity);
      avatarAction.clampWhenFinished = true;

      // start paused at first frame:
      avatarAction.paused = true;
      avatarAction.time = 0;
      avatarAction.play();

      console.log("Avatar3 action ready (paused).");

      onAvatarLoaded();
    },
    undefined,
    (err) => console.error("Error loading avatar GLTF3:", err)
  );

  //player4 = cameraman
  gltfLoader.load(
    "avatar4/scene.gltf",
    (gltf) => {
      avatarGLTF4 = gltf.scene;
      avatarClips4 = gltf.animations;
      avatarGLTF4.userData.clips = gltf.animations;
      console.log(gltf.animations);

      // ── STEP 1: Measure the raw height (before scaling) ──────────────────

      scene.add(avatarGLTF4);
      avatarGLTF4.updateWorldMatrix(true, true);
      const rawBox = new THREE.Box3().setFromObject(avatarGLTF4);
      const rawHeight = rawBox.max.y - rawBox.min.y; // model’s “unscaled” height

      // ── STEP 2: Uniformly scale so total height ≈ playerHeight (1.6 m) ─
      const scale = playerHeight / rawHeight; // e.g. 1.6 ÷ (rawHeight)
      avatarGLTF4.scale.setScalar(scale);

      // ── STEP 3: After scaling, compute the new “foot” y and the “head” y ─
      avatarGLTF4.updateWorldMatrix(true, true);
      const footY = 0.09;
      const headY_in_local = 1.694;

      // Drop feet onto Y = 0 (floor):
      avatarGLTF4.position.y -= footY;

      scene.remove(avatarGLTF4);
      scene.add(avatarGLTF4);

      avatarGLTF4.userData.headY = headY_in_local;

      // ── STEP 5: Create the AnimationMixer but do NOT call .play() yet ─
      avatarMixer = new THREE.AnimationMixer(avatarGLTF4);
      const clip = avatarClips4.find((c) => c.name === AVATAR_ANIM4);
      if (!clip) {
        console.warn(
          "Avatar clip not found:",
          avatarClips4.map((c) => c.name)
        );
        return;
      }

      avatarAction = avatarMixer.clipAction(clip);
      avatarAction.setLoop(THREE.LoopRepeat, Infinity);
      avatarAction.clampWhenFinished = true;

      // start paused at first frame:
      avatarAction.paused = true;
      avatarAction.time = 0;
      avatarAction.play();

      console.log("Avatar4 action ready (paused).");

      onAvatarLoaded();
    },
    undefined,
    (err) => console.error("Error loading avatar4 GLTF:", err)
  );

  placeTreasures(texLoader);
  console.log("treasures:", treasures);

  // multiplayer
  // initSocketConnection();

  // input
  document.addEventListener("keydown", onKeyDown);
  document.addEventListener("keyup", onKeyUp);
  addEventListener("resize", onWindowResize);
}

// ─────────────────────────────────────────────────────────
// 5) DUNGEON GENERATION
// ─────────────────────────────────────────────────────────
function generateDungeon() {
  // Fill everything with walls
  for (let r = 0; r < DUNGEON_SIZE; r++) {
    dungeonMap[r] = [];
    for (let c = 0; c < DUNGEON_SIZE; c++) dungeonMap[r][c] = 0;
  }
  // drunken walk
  let x = DUNGEON_SIZE >> 1,
    y = DUNGEON_SIZE >> 1;
  dungeonMap[y][x] = 1;
  let carved = 1;
  const targetFloors = Math.floor(DUNGEON_SIZE * DUNGEON_SIZE * 0.45);
  while (carved < targetFloors) {
    switch ((Math.random() * 4) | 0) {
      case 0:
        if (x > 1) x--;
        break;
      case 1:
        if (x < DUNGEON_SIZE - 2) x++;
        break;
      case 2:
        if (y > 1) y--;
        break;
      case 3:
        if (y < DUNGEON_SIZE - 2) y++;
        break;
    }
    if (!dungeonMap[y][x]) {
      dungeonMap[y][x] = 1;
      carved++;
    }
  }
}

// function loadFixedLayout() {
//   dungeonMap = [];

//   for (let r = 0; r < DUNGEON_SIZE; r++) {
//     dungeonMap[r] = [];
//     for (let c = 0; c < DUNGEON_SIZE; c++) {
//       dungeonMap[r][c] = (FIXED_LAYOUT[r][c] === '#') ? 0 : 1;  // 0 = wall, 1 = floor
//     }
//   }
// }
function loadFixedLayout() {
  dungeonMap.length = 0;
  treasureSpots.length = 0;
  monsterSpots.length = 0;
  const half = DUNGEON_SIZE >> 1;

  for (let r = 0; r < DUNGEON_SIZE; r++) {
    dungeonMap[r] = [];
    for (let c = 0; c < DUNGEON_SIZE; c++) {
      const ch = FIXED_LAYOUT[r][c];
      dungeonMap[r][c] = ch === "#" ? 0 : 1; // wall = 0, floor/S = 1

      // catch the spawn tile
      if (ch === "S") {
        spawnPos.set((c - half) * 2, playerHeight, (r - half) * 2);
      } else if (ch === "T") {
        // treasure spot
        treasureSpots.push({ r, c });
      } else if (ch === "M") {
        monsterSpots.push({ r, c });
      }
    }
  }
}

function buildDungeonGeometry(wallMat, floorMat) {
  const half = DUNGEON_SIZE >> 1;
  const wallH = 2;

  for (let r = 0; r < DUNGEON_SIZE; r++) {
    for (let c = 0; c < DUNGEON_SIZE; c++) {
      const worldX = (c - half) * 2;
      const worldZ = (r - half) * 2;

      if (dungeonMap[r][c] === 0) {
        // Wall block
        const wall = new THREE.Mesh(
          new THREE.BoxGeometry(2, wallH, 2),
          wallMat
        );
        wall.position.set(worldX, wallH / 2, worldZ);
        scene.add(wall);
        objects.push(wall);

        // AABB (shrunk by 5 cm so “touch” isn’t collision)          ★ CHANGED
        wall.updateMatrixWorld();
        wallBoxes.push(
          new THREE.Box3().setFromObject(wall).expandByScalar(0.15)
        );
      } else {
        // Floor tile
        const floor = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), floorMat);
        floor.rotation.x = -Math.PI / 2;
        floor.position.set(worldX, 0, worldZ);
        scene.add(floor);
      }
    }
  }
}

// ─────────────────────────────────────────────────────────
// 6) MONSTER SETUP + RAYCAST VISIBILITY
// ─────────────────────────────────────────────────────────
/* 6)  MONSTER SETUP ───────────────────────────────────── */
function placeMonsters() {
  if (!monsterGLTF) {
    console.warn("Monster glTF not loaded yet; skipping placeMonsters.");
    return;
  }
  if (monsterSpots.length === 0) {
    console.warn("No 'M' tiles in FIXED_LAYOUT – no monsters spawned.");
    return;
  }

  const half = DUNGEON_SIZE >> 1;

  const idleIndex = clipIndexByName["idle"]; // e.g. 4
  const runIndex = clipIndexByName["run"]; // e.g. 0
  const biteIndex = clipIndexByName["attack_tail"];

  monsterSpots.forEach((cell) => {
    // Clone the loaded glTF (use SkeletonUtils for skinned meshes)
    const monsterClone = SkeletonUtils.clone(monsterGLTF);

    // Compute world‐coordinates
    const x = (cell.c - half) * 2;
    const z = (cell.r - half) * 2;
    monsterClone.position.set(x, 0, z);
    monsterClone.scale.set(1.0, 1.0, 1.0); // adjust monster sizes

    // Add clone to the scene:
    scene.add(monsterClone);
    const monsterBox = new THREE.Box3()
      .setFromObject(monsterClone)
      .expandByScalar(0.05);

    // If the original glTF had animations, make a fresh mixer for this clone
    // let mixerClone = null;
    // if (monsterMixer) {
    //   mixerClone = new THREE.AnimationMixer(monsterClone);
    //   monsterMixer._actions.forEach(origAction => {
    //     const clip = origAction.getClip();
    //     const actionClone = mixerClone.clipAction(clip, monsterClone);
    //     actionClone.play();
    //   });
    // }

    const mixerClone = new THREE.AnimationMixer(monsterClone);

    // 4) Build one action per clip:
    const actions = monsterClips.map((clip, idx) => {
      const action = mixerClone.clipAction(clip, monsterClone);
      action.enabled = true;
      action.setLoop(THREE.LoopRepeat, Infinity);
      action.clampWhenFinished = true;
      return action;
    });

    // 5) Play the "idle" animation immediately:
    actions[idleIndex].reset().play();

    // Store each monster’s data for AI & collision:
    monsters.push({
      mesh: monsterClone,
      mixer: mixerClone,
      actions: actions, // <-- store the array of AnimationActions
      current: idleIndex, // <-- index of the clip currently playing
      idleIndex: idleIndex, // <-- index of the "idle" clip
      runIndex: runIndex, // <-- index of the "run" clip
      biteIndex: biteIndex,
      position: new THREE.Vector3(x, 0, z),
      velocity: new THREE.Vector3(),
      chasing: false,
      visible: true,
      box: monsterBox,
    });

    // Keep track of clones if you want to dispose them later:
    monsterClones.push(monsterClone);
  });
}

// function placeMonsters(loader) {

//   if (monsterSpots.length === 0) {
//     console.warn("No 'M' tiles in FIXED_LAYOUT – no monsters spawned.");
//     return;
//   }

//   const tex  = loader.load('textures/monster.jpeg');
//   const half = DUNGEON_SIZE >> 1;

//   monsterSpots.forEach(cell => {
//     /* sprite */
//     const mat    = new THREE.SpriteMaterial({ map: tex, transparent: true });
//     const sprite = new THREE.Sprite(mat);
//     sprite.scale.set(1, 1, 1);
//     sprite.center.set(0.5, 0);          // bottom-anchored

//     /* world position */
//     const x = (cell.c - half) * 2;
//     const z = (cell.r - half) * 2;
//     sprite.position.set(x, 0, z);
//     scene.add(sprite);

//     monsters.push({
//       sprite,
//       position: new THREE.Vector3(x, 0, z),
//       velocity : new THREE.Vector3(),   // will point toward the player
//         chasing  : false,
//         visible  : true
//     });
//   });
// }

// function placeMonster(loader) {
//   // choose random floor cell
//   const floors = [];
//   for (let r = 0; r < DUNGEON_SIZE; r++)
//     for (let c = 0; c < DUNGEON_SIZE; c++)
//       if (dungeonMap[r][c] === 1) floors.push({ r, c });
//   const cell = floors[Math.random() * floors.length | 0];
//   const half = DUNGEON_SIZE >> 1;
//   monsterPosition.set((cell.c - half) * 2, 1, (cell.r - half) * 2);

//   const spriteMat = new THREE.SpriteMaterial({ map: loader.load('textures/monster.jpeg') });
//   monsterSprite = new THREE.Sprite(spriteMat);
//   monsterSprite.scale.set(1, 1, 1);
//   monsterSprite.position.copy(monsterPosition);
//   scene.add(monsterSprite);
// }

/* 6½)  TREASURE SETUP ─────────────────────────────────── */
function placeTreasures(loader) {
  if (treasureSpots.length === 0) {
    console.warn("No 'T' tiles in FIXED_LAYOUT – no treasures spawned.");
    return;
  }

  const tex = loader.load("textures/tres.png"); // or .jpg
  const geo = new THREE.BoxGeometry(1, 1, 1);
  const mat = new THREE.MeshPhongMaterial({ map: tex, shininess: 10 });
  const half = DUNGEON_SIZE >> 1;

  treasureSpots.forEach((cell) => {
    const mesh = new THREE.Mesh(geo, mat.clone()); // clone so each can tint later
    const x = (cell.c - half) * 2;
    const z = (cell.r - half) * 2;
    mesh.position.set(x, 0.5, z); // sits on the floor
    scene.add(mesh);

    treasures.push(mesh);
  });
}

function openTreasure(idx) {
  openedTreasures.add(idx); // mark as opened
  treasures[idx].visible = false; // hide the treasure
  const gold = 100; // random rewards (gold coins)
  goldCount += gold;
  showPopup(`You get: Gold x${gold}！`); // show reward
  updateCoinDisplay();
}

function showPopup(msg) {
  let popup = document.createElement("div");
  popup.style.position = "absolute";
  popup.style.left = "50%";
  popup.style.top = "40%";
  popup.style.transform = "translate(-50%, -50%)";
  popup.style.background = "rgba(0,0,0,0.95)";
  popup.style.color = "#FFD700";
  popup.style.fontSize = "24px";
  popup.style.fontWeight = "bold";
  popup.style.padding = "30px 40px";
  popup.style.borderRadius = "20px";
  popup.style.zIndex = "999";
  popup.innerText = msg;
  document.body.appendChild(popup);
  setTimeout(() => popup.remove(), 2000);
}

// ─────────────────────────────────────────────────────────
// 7) SOCKET.IO – MULTIPLAYER
// ─────────────────────────────────────────────────────────
function initSocketConnection() {
  socket = io();

  socket.on("currentPlayers", (payload) => {
    const list = Array.isArray(payload) // <--- NEW
      ? payload //       NEW
      : Object.values(payload); // <--- NEW

    list.forEach((p) => {
      if (p.id === socket.id) {
        mySlotIndex = p.slot;
        console.log("Slot my index:", mySlotIndex);
        controls.getObject().position.copy(spawnSpots[mySlotIndex]);

        let proto = null;

        if (mySlotIndex === 0) {
          console.log("mySlotIndex0");
          proto = avatarGLTF1;
        }
        if (mySlotIndex === 1) {
          console.log("mySlotIndex1");
          proto = avatarGLTF2;
        }
        if (mySlotIndex === 2) {
          console.log("mySlotIndex2");
          proto = avatarGLTF3;
        }
        if (mySlotIndex === 3) {
          console.log("mySlotIndex3");
          proto = avatarGLTF4;
        }

        console.log("proto:", proto);
        if (proto) {
          myAvatar = SkeletonUtils.clone(proto);
          myAvatar.userData.mixer = new THREE.AnimationMixer(myAvatar);

          // Pick the right clip name by slot:
          let clipName = "";
          if (mySlotIndex === 0) clipName = AVATAR_ANIM; // "CINEMA_4D___"
          if (mySlotIndex === 1) clipName = AVATAR_ANIM2;
          if (mySlotIndex === 2) clipName = AVATAR_ANIM3;
          if (mySlotIndex === 3) clipName = AVATAR_ANIM4;

          // Find that clip in the prototype’s list:
          const clips = proto.userData.clips;
          const clip = clips.find((c) => c.name === clipName);
          if (clip) {
            const action = myAvatar.userData.mixer.clipAction(clip);
            action.setLoop(THREE.LoopRepeat, Infinity);
            action.clampWhenFinished = true;
            // start paused at the first frame:
            action.paused = true;
            action.time = 0;
            action.play();
            myAvatar.userData.action = action;
          } else {
            console.warn(
              "Clip not found on avatar:",
              clipName,
              clips.map((c) => c.name)
            );
          }
          scene.add(myAvatar);
        }
      } else {
        addOtherPlayer(p);
      }
    });
  });
  // A newcomer joined after you: same logic
  socket.on("newPlayer", (pkt) => {
    const p = pkt.data ? { id: pkt.id, ...pkt.data } : pkt;
    addOtherPlayer(p);
  });

  socket.on("playerMoved", ({ id, data }) => {
    const p = players[id];
    if (p) {
      p.mesh.position.set(data.position.x, data.position.y, data.position.z);
      p.mesh.rotation.y = data.rotation.y;
      p.lastUpdate = performance.now();
    }
  });

  socket.on("removePlayer", (id) => {
    if (players[id]) {
      scene.remove(players[id].mesh);
      delete players[id];
    }
  });

  socket.on("roomFull", () => {
    alert("This dungeon already has four adventurers. Try again later!");
  });
}

// function addOtherPlayer(id, data) {
//   const geo = new THREE.BoxGeometry(1, 1.8, 1);
//   const mat = new THREE.MeshPhongMaterial({ color: 0x00ff00 });
//   const mesh = new THREE.Mesh(geo, mat);
//   mesh.position.set(data.position.x, data.position.y, data.position.z);
//   scene.add(mesh);
//   players[id] = { mesh, lastUpdate: performance.now() };
// }
function addOtherPlayer({ id, slot, position, rotation = { y: 0 } }) {
  let mesh;
  console.log("Slot here:", slot);

  // ─── 1. Choose the graphic ──────────────────────────────────────────
  if (slot === 0 && avatarGLTF1) {
    mesh = SkeletonUtils.clone(avatarGLTF1);
    console.log("Avatar1.");
  } else if (slot === 1 && avatarGLTF2) {
    mesh = SkeletonUtils.clone(avatarGLTF2);
    console.log("Avatar2.");
  } else if (slot === 2 && avatarGLTF3) {
    mesh = SkeletonUtils.clone(avatarGLTF3);
    console.log("Avatar3.");
  } else if (slot === 3 && avatarGLTF4) {
    mesh = SkeletonUtils.clone(avatarGLTF4);
    console.log("Avatar4.");
  } else {
    // fallback: green cube
    mesh = new THREE.Mesh(
      new THREE.BoxGeometry(1, 1.8, 1),
      new THREE.MeshPhongMaterial({ color: 0x00ff00 })
    );
  }

  // ─── 2. Place it in the world ───────────────────────────────────────
  mesh.position.set(position.x, position.y, position.z);
  mesh.rotation.y = rotation.y; // faces the right way
  scene.add(mesh);

  // ─── 3. Register in our dictionary ──────────────────────────────────
  players[id] = {
    mesh,
    lastUpdate: performance.now(),
  };
}

// ─────────────────────────────────────────────────────────
// 8) INPUT
// ─────────────────────────────────────────────────────────
function onKeyDown(e) {
  switch (e.code) {
    case "ArrowUp":
    case "KeyW":
      moveForward = true;
      break;
    case "ArrowLeft":
    case "KeyA":
      moveLeft = true;
      break;
    case "ArrowDown":
    case "KeyS":
      moveBackward = true;
      break;
    case "ArrowRight":
    case "KeyD":
      moveRight = true;
      break;
    case "KeyE":
      // open treasure
      if (
        nearestTreasureIndex !== null &&
        !openedTreasures.has(nearestTreasureIndex)
      ) {
        openTreasure(nearestTreasureIndex);
      }
      break;
  }
}
function onKeyUp(e) {
  switch (e.code) {
    case "ArrowUp":
    case "KeyW":
      moveForward = false;
      break;
    case "ArrowLeft":
    case "KeyA":
      moveLeft = false;
      break;
    case "ArrowDown":
    case "KeyS":
      moveBackward = false;
      break;
    case "ArrowRight":
    case "KeyD":
      moveRight = false;
      break;
  }
}

// ─────────────────────────────────────────────────────────
// 9) MAIN ANIMATION LOOP
// ─────────────────────────────────────────────────────────
function animate() {
  requestAnimationFrame(animate);

  const now = performance.now();
  const dt = (now - prevTime) / 1000; // seconds since last frame

  if (controls.isLocked) {
    // Find the unopened treasure chest closest to the player
    nearestTreasureIndex = null;
    let minDist = 2.0; // Maximum interactive distance (meters)
    const playerPos = controls.getObject().position;
    treasures.forEach((treasure, idx) => {
      if (openedTreasures.has(idx)) return; // ignore treasures that is already opened
      const dist = treasure.position.distanceTo(playerPos);
      if (dist < minDist) {
        minDist = dist;
        nearestTreasureIndex = idx;
      }
    });

    // Show hint or instruction on the treasure
    if (nearestTreasureIndex !== null) {
      const chest = treasures[nearestTreasureIndex];
      let chestWorldPos = chest.position.clone();
      chestWorldPos.y += 1.0;

      let screenPos = chestWorldPos.clone().project(camera);
      let x = (screenPos.x * 0.5 + 0.5) * window.innerWidth;
      let y = (1 - (screenPos.y * 0.5 + 0.5)) * window.innerHeight;

      treasureHint.style.left = `${x}px`;
      treasureHint.style.top = `${y}px`;
      treasureHint.style.display = "";
    } else {
      treasureHint.style.display = "none";
    }

    /* 9.1 Constant-speed WASD -------------------------------------------- */ // ★ CHANGED
    let dirX = 0,
      dirZ = 0;
    if (moveForward) dirZ -= 1;
    if (moveBackward) dirZ += 1;
    if (moveLeft) dirX -= 1;
    if (moveRight) dirX += 1;

    const movement =
      dirX || dirZ
        ? new THREE.Vector3(dirX, 0, dirZ)
            .normalize()
            .multiplyScalar(SPEED * dt)
            .applyQuaternion(camera.quaternion)
        : new THREE.Vector3();

    /* 9.2 Capsule-vs-AABB collision -------------------------------------- */
    const curr = controls.getObject().position.clone();
    const cand = curr.clone().add(movement);
    const playerBox = makePlayerBox(cand);

    let blocked = false;
    for (const box of wallBoxes) {
      if (playerBox.intersectsBox(box)) {
        blocked = true;
        break;
      }
    }
    if (!blocked) controls.getObject().position.copy(cand);

    /* 9.3 Keep avatar glued to the floor --------------------------------- */
    controls.getObject().position.y = playerHeight;

    /* 9.4 Flash-light follows + points forward  ---------------------------- */
    const head = controls.getObject();
    const dir = new THREE.Vector3();
    camera.getWorldDirection(dir);

    torch.position.copy(head.position).add(new THREE.Vector3(0, 0.2, 0));
    torch.target.position.copy(head.position).add(dir.multiplyScalar(2));

    if (myAvatar) {
      // 1) Retrieve headY_in_local from userData
      const headY = myAvatar.userData.headY;

      // 2) Compute the Y where the avatar’s origin (feet) must sit so head = camera Y:
      //     feetY = camera.position.y – headY
      const avatarOriginY = camera.position.y - headY;

      // 3) Snap avatar’s position.x/z to the camera’s x/z,
      //    and set position.y = avatarOriginY
      myAvatar.position.set(
        camera.position.x,
        avatarOriginY,
        camera.position.z
      );

      const forward = new THREE.Vector3();
      camera.getWorldDirection(forward);
      forward.normalize();

      const PUSH_FORWARD = -0.9; // adjust to test
      myAvatar.position.x += forward.x * PUSH_FORWARD;
      myAvatar.position.z += forward.z * PUSH_FORWARD;

      // 4) Let avatar face exactly the same yaw as the camera:
      //    camera.rotation.y is the yaw around the Y‐axis
      const cameraYaw = Math.atan2(forward.x, forward.z);

      // 3) Add your original “model‐to‐world” yawOffset so the mesh’s +Z‐axis lines up correctly
      const yawOffset = myAvatar.userData.yawOffset || 0;
      myAvatar.rotation.y = cameraYaw + yawOffset;
      //    (if your model needs an extra PI flip, do: camera.rotation.y + Math.PI)
    }

    if (myAvatar && myAvatar.userData.action) {
      const action = myAvatar.userData.action;
      if (movement.lengthSq() > 0) {
        // player is moving → unpause animation
        if (action.paused) action.paused = false;
      } else {
        // player stopped → pause and reset to first frame
        if (!action.paused) {
          action.paused = true;
          action.time = 0;
        }
      }
    }

    if (myAvatar && myAvatar.userData.mixer) {
      myAvatar.userData.mixer.update(dt);
    }

    /* 9.5 Monsters sight + movement  ------------------------------------ */
    const camPosFull = controls.getObject().position.clone();

    monsters.forEach((m) => {
      // 1) Compute the vector from monster to player (full 3D):
      const dirToPlayerFull = camPosFull.clone().sub(m.position);

      // 2) Zero out the Y component so we measure *horizontal* distance only:
      dirToPlayerFull.y = 0;
      const horizDist = dirToPlayerFull.length();

      // 3) LOS check (use full 3D ray origin + direction if you want),
      //    but for the “catch” threshold we only compare horizontal:
      let canSee = false;
      if (horizDist < MONSTER_SIGHT) {
        // Ray origin: up a little so we’re not shooting from the floor
        const rayOrigin = m.position.clone().add(new THREE.Vector3(0, 0.5, 0));
        // Ray direction: normalized full‐3D direction toward player
        const fullDir = camPosFull.clone().sub(m.position).normalize();
        raycaster.set(rayOrigin, fullDir);
        const hit = raycaster.intersectObjects(objects, true)[0];
        // If nothing blocks within (full 3D) distance, it can see:
        canSee =
          !hit ||
          hit.distance > camPosFull.clone().sub(m.position).length() - 0.3;
      }
      m.chasing = canSee;

      // 4) Decide “bite” vs “run” vs “idle” based on horizontal distance + LOS:
      const CATCH_DIST = 0.9; // horizontal meters

      // if (horizDist < CATCH_DIST) {
      //   // ─── “BITE” state ───────────────────
      //   if (m.current !== m.biteIndex) {
      //     m.actions[m.current].fadeOut(0.2);
      //     m.actions[m.biteIndex].reset().fadeIn(0.2).play();
      //     m.current = m.biteIndex;
      //   }
      //   // Do not move the monster any farther; it’s “biting” now.
      // }
      
      if (horizDist < CATCH_DIST) {
        // ─── “BITE” state ───────────────────
        if (m.current !== m.biteIndex) {
          m.actions[m.current].fadeOut(0.2);
          m.actions[m.biteIndex].reset().fadeIn(0.2).play();
          m.current = m.biteIndex;
        }
        // Attacked by monster
        if (!m.lastAttackTime) m.lastAttackTime = 0;
        const nowSec = now / 1000;
        const attackCD = 1.0; // only 1 attack in 1 seconds
        if (nowSec - m.lastAttackTime > attackCD) {
          m.lastAttackTime = nowSec;
          if (playerLives > 0) {
            playerLives--;
            updateHealthBar();
            showPopup("Attacked!");
            if (playerLives === 0) {
              showPopup("You Died! Game Over");
            }
          }
        }
      } else if (m.chasing) {
        // ─── “RUN” state (player seen but not in bite range) ─────────────────
        if (m.current !== m.runIndex) {
          m.actions[m.current].fadeOut(0.2);
          m.actions[m.runIndex].reset().fadeIn(0.2).play();
          m.current = m.runIndex;
        }

        // Movement + collision logic (unchanged, except use candPos on XZ)
        m.velocity
          .copy(dirToPlayerFull)
          .setY(0)
          .normalize()
          .multiplyScalar(MONSTER_SPEED);
        const candPos = m.position.clone().addScaledVector(m.velocity, dt);

        // Temporarily place mesh at candPos to rebuild its bounding‐box:
        const oldPos = m.mesh.position.clone();
        m.mesh.position.copy(candPos);
        m.mesh.updateMatrixWorld(true);
        m.box.setFromObject(m.mesh).expandByScalar(0.05);

        // Test that new box against every wallBox:
        let blocked = false;
        for (const w of wallBoxes) {
          if (m.box.intersectsBox(w)) {
            blocked = true;
            break;
          }
        }

        if (blocked) {
          // If blocked, revert back:
          m.mesh.position.copy(oldPos);
          m.mesh.updateMatrixWorld(true);
          m.box.setFromObject(m.mesh).expandByScalar(0.05);
        } else {
          // Otherwise commit the new position:
          m.position.copy(candPos);
          m.mesh.lookAt(
            new THREE.Vector3(camPosFull.x, candPos.y, camPosFull.z)
          );
        }
      } else {
        // ─── “IDLE” state (player out of sight) ─────────────────────────
        if (m.current !== m.idleIndex) {
          m.actions[m.current].fadeOut(0.2);
          m.actions[m.idleIndex].reset().fadeIn(0.2).play();
          m.current = m.idleIndex;
        }
      }

      // 5) Advance the mixer’s time:
      if (m.mixer) m.mixer.update(dt);
    });

    if (avatarMixer && avatarAction) {
      if (movement.lengthSq() > 0) {
        // — player is moving → un-pause the animation
        if (avatarAction.paused) {
          avatarAction.paused = false;
        }
      } else {
        // — player stopped → pause and reset to first frame (idle pose)
        if (!avatarAction.paused) {
          avatarAction.paused = true;
          avatarAction.time = 0;
        }
      }

      // advance the mixer if un-paused (or it’ll stay at 0 if paused)
      avatarMixer.update(dt);
    }

    /* 9.6 Broadcast movement (≈20 Hz) ------------------------------------ */
    if (now % 50 < dt * 1000) {
      const p = controls.getObject().position;
      const r = camera.rotation;
      socket.emit("updateMovement", {
        position: { x: p.x, y: p.y, z: p.z },
        rotation: { x: r.x, y: r.y, z: r.z },
      });
    }
  }

  /* 9.7 Purge stale remote players --------------------------------------- */
  for (const id in players)
    if (now - players[id].lastUpdate > 5000) {
      scene.remove(players[id].mesh);
      delete players[id];
    }

  prevTime = now;
  renderer.render(scene, camera);
}

// ─────────────────────────────────────────────────────────
// 10) RESIZE
// ─────────────────────────────────────────────────────────
function onWindowResize() {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
}
