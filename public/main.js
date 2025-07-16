import * as THREE from "three";
import { FIXED_LAYOUT, spawnSpots } from "./layout.js";
import { PointerLockControls } from "https://unpkg.com/three@0.160.0/examples/jsm/controls/PointerLockControls.js";
import { GLTFLoader } from "https://unpkg.com/three@0.160.0/examples/jsm/loaders/GLTFLoader.js";
import * as SkeletonUtils from "https://unpkg.com/three@0.160.0/examples/jsm/utils/SkeletonUtils.js";
import { DecalGeometry } from "https://unpkg.com/three@0.160.0/examples/jsm/geometries/DecalGeometry.js";

let socket;
let mySlotIndex = null;
let loadedAvatars = 0;
let isSoloMode = false;

let camera, scene, renderer, controls;
let raycaster = new THREE.Raycaster();
let spawnPos = new THREE.Vector3();
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

const objects = [];
const wallBoxes = [];
const players = {};

const MONSTER_SPEED = 2.0;
const MONSTER_SIGHT = 18.0;
const MONSTER_RADIUS = 0.4;

const SPEED = 5;
const playerHeight = 1.6;
const PLAYER_RADIUS = 0.4;

const listener = new THREE.AudioListener();
const audioLoader = new THREE.AudioLoader();

let moveForward = false,
  moveBackward = false,
  moveLeft = false,
  moveRight = false;

let prevTime = performance.now();

const DUNGEON_SIZE = 41;
let dungeonMap = [];

let monsterGLTF = null;
let monsterMixer = null;
let monsterClips = null;
const clipIndexByName = {};

let minimapCanvas, minimapCtx;
minimapCanvas = document.getElementById("minimap");
if (minimapCanvas) {
  minimapCtx = minimapCanvas.getContext("2d");
} else {
  console.warn("Minimap canvas not found");
}

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

function updateCoinDisplay() {
  coinDisplay.innerText = `🪙 Gold: ${goldCount}`;
}

const namesPanel = document.getElementById('namesPanel') || (() => {
  const div = document.createElement('div');
  div.id = 'namesPanel';
  div.style.cssText = `
  position:absolute; left:30px; bottom:30px;
  background:rgba(0,0,0,.8); color:#fff; font-size:18px;
  padding:16px 26px; border-radius:12px; z-index:800;
  min-width:200px; line-height:1.4`;
  div.innerHTML = '<b>Players</b><br>';
  document.body.appendChild(div);
  return div;
})();

document.querySelectorAll('#namesPanel').forEach((el,i)=> i && el.remove());

const playerNames = {};
const coinsById = {};
const joinOrder = [];

function refreshNames() {
  namesPanel.innerHTML =
    '<b>Players</b><br>' +
    joinOrder
      .filter(id => playerNames[id])
      .map(id => `• ${playerNames[id]} (Slot ${players[id]?.slot ?? (id === socket.id ? mySlotIndex : '?')})${id === socket.id ? ' (You)' : ''}${players[id]?.slot === 0 ? ' (Host)' : ''}`)
      .join('<br>');
}

function rememberPlayer(id, name='Anon') {
  if (!playerNames[id]) joinOrder.push(id);
  playerNames[id] = name;
  if (coinsById[id] == null) coinsById[id] = 0;
}

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

let playerLives = 3;
const maxLives = 3;
let playerDead = false;
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
  let hearts = "";
  for (let i = 0; i < playerLives; ++i) hearts += "❤️ ";
  for (let i = playerLives; i < maxLives; ++i) hearts += "🤍 ";
  healthBar.innerText = hearts.trim();
}
updateHealthBar();

let timerDisplay = document.createElement("div");
timerDisplay.style.position = "absolute";
timerDisplay.style.top = "20px";
timerDisplay.style.right = "32px";
timerDisplay.style.background = "rgba(0,0,0,0.6)";
timerDisplay.style.color = "#FFF";
timerDisplay.style.fontWeight = "bold";
timerDisplay.style.fontSize = "22px";
timerDisplay.style.padding = "6px 18px";
timerDisplay.style.borderRadius = "14px";
timerDisplay.style.zIndex = "500";
timerDisplay.style.letterSpacing = "2px";
timerDisplay.style.textShadow = "0 2px 10px #000";
timerDisplay.innerText = "Time: 120";
document.body.appendChild(timerDisplay);
let gameEnded = false;

let readyStatusDisplay = document.createElement("div");
readyStatusDisplay.id = "readyStatusDisplay";
readyStatusDisplay.style.position = "absolute";
readyStatusDisplay.style.top = "60px";
readyStatusDisplay.style.right = "32px";
readyStatusDisplay.style.background = "rgba(0,0,0,0.6)";
readyStatusDisplay.style.color = "#FFF";
readyStatusDisplay.style.fontWeight = "bold";
readyStatusDisplay.style.fontSize = "18px";
readyStatusDisplay.style.padding = "6px 18px";
readyStatusDisplay.style.borderRadius = "14px";
readyStatusDisplay.style.zIndex = "500";
readyStatusDisplay.style.display = "none";
document.body.appendChild(readyStatusDisplay);

function makePlayerBox(pos) {
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
    initSocketConnection();
  }
}

const dragonGeo = new THREE.SphereGeometry(0.5, 64, 64);
const dragonMat = new THREE.MeshStandardMaterial({
  color: 0xffc63f,
  metalness: 0,
  roughness: 0.7,
});

new THREE.TextureLoader().load(
  "textures/dragonball.png",
  (decalTex) => {
    decalTex.minFilter = THREE.LinearMipMapLinearFilter;
    decalTex.magFilter = THREE.LinearFilter;
    decalTex.wrapS = decalTex.wrapT = THREE.ClampToEdgeWrapping;
    placeDragonBalls(decalTex);
  },
  undefined,
  (err) => console.error("Failed to load dragonball.png:", err)
);

function init() {
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x000000);
  scene.fog = new THREE.Fog(0x000000, 18, 40);
  scene.userData.lastRaptorTime = 0;

  camera = new THREE.PerspectiveCamera(75, innerWidth / innerHeight, 0.1, 300);
  renderer = new THREE.WebGLRenderer({ antialias: true });

  camera.add(listener);

  const bgm = new THREE.Audio(listener);
  audioLoader.load("sounds/bgm.mp3", (buffer) => {
    bgm.setBuffer(buffer);
    bgm.setLoop(true);
    bgm.setVolume(0.3);
  });
  scene.userData.bgm = bgm;

  const walkSound = new THREE.Audio(listener);
  audioLoader.load("sounds/walking.mp3", (buffer) => {
    walkSound.setBuffer(buffer);
    walkSound.setLoop(true);
    walkSound.setVolume(1.2);
  });
  scene.userData.walkSound = walkSound;

  const coinSound = new THREE.Audio(listener);
  audioLoader.load("sounds/coin.mp3", (buffer) => {
    coinSound.setBuffer(buffer);
    coinSound.setLoop(false);
    coinSound.setVolume(1.0);
  });
  scene.userData.coinSound = coinSound;

  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.setSize(innerWidth, innerHeight);
  document.body.appendChild(renderer.domElement);

  controls = new PointerLockControls(camera, document.body);
  const blocker = document.getElementById("blocker");
  const instructions = document.getElementById("instructions");

  instructions.addEventListener("click", () => controls.lock());
  controls.addEventListener("lock", () => {
    const bgm = scene.userData.bgm;
    if (bgm && bgm.buffer && !bgm.isPlaying) bgm.play();
    blocker.style.display = "none";
    instructions.style.display = "none";
    if (socket && socket.connected) {
      socket.emit('playerReady');
      if (mySlotIndex === 0 || isSoloMode) {
        socket.emit('startGame');
      }
      if (isSoloMode) {
        socket.emit('resumeGame');
      }
    }
  });
  controls.addEventListener("unlock", () => {
    const bgm = scene.userData.bgm;
    if (bgm && bgm.isPlaying) bgm.stop();
    blocker.style.display = "flex";
    instructions.style.display = "";
    if (socket && socket.connected && isSoloMode) {
      socket.emit('pauseGame');
    }
    if (!isSoloMode) {
      showPopup("Pause disabled in multiplayer");
    }
  });

  scene.add(controls.getObject());
  controls.getObject().position.set(0, playerHeight, 0);

  scene.add(new THREE.AmbientLight(0x111111, 0.3));
  torch = new THREE.SpotLight(
    0xffddaa,
    3.0,
    150,
    Math.PI / 4,
    0.4,
    1.0
  );
  torch.castShadow = true;
  torch.angle = Math.PI / 3;
  torch.shadow.camera.near = 0.2;
  torch.shadow.camera.far = 40;
  torch.shadow.camera.updateProjectionMatrix();
  torch.shadow.bias = -0.0003;
  torch.shadow.mapSize.width = 2048;
  torch.shadow.mapSize.height = 2048;
  torch.shadow.mapSize.set(512, 512);
  scene.add(torch);
  scene.add(torch.target);

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

  loadFixedLayout();
  buildDungeonGeometry(wallMat, floorMat);

  const gltfLoader = new GLTFLoader();

  gltfLoader.load(
    "models/scene.gltf",
    (gltf) => {
      monsterGLTF = gltf.scene;
      monsterClips = gltf.animations;
      monsterClips.forEach((clip, i) => {
        clipIndexByName[clip.name] = i;
      });
      placeMonsters();
    },
    undefined,
    (error) => {
      console.error("Error loading monster glTF:", error);
    }
  );

  gltfLoader.load(
    "avatar1/scene.gltf",
    (gltf) => {
      avatarGLTF1 = gltf.scene;
      avatarClips1 = gltf.animations;
      avatarGLTF1.userData.clips = gltf.animations;
      scene.add(avatarGLTF1);
      avatarGLTF1.updateWorldMatrix(true, true);
      const rawBox = new THREE.Box3().setFromObject(avatarGLTF1);
      const rawHeight = rawBox.max.y - rawBox.min.y;
      const scale = playerHeight / rawHeight;
      avatarGLTF1.scale.setScalar(scale);
      avatarGLTF1.updateWorldMatrix(true, true);
      const scaledBox = new THREE.Box3().setFromObject(avatarGLTF1);
      const footY = scaledBox.min.y;
      const headY_in_local = scaledBox.max.y;
      avatarGLTF1.position.y -= footY;
      scene.remove(avatarGLTF1);
      scene.add(avatarGLTF1);
      avatarGLTF1.userData.headY = headY_in_local;
      avatarMixer = new THREE.AnimationMixer(avatarGLTF1);
      const clip = avatarClips1.find((c) => c.name === AVATAR_ANIM);
      if (!clip) {
        console.warn("Avatar1 clip not found:", avatarClips1.map((c) => c.name));
        return;
      }
      avatarAction = avatarMixer.clipAction(clip);
      avatarAction.setLoop(THREE.LoopRepeat, Infinity);
      avatarAction.clampWhenFinished = true;
      avatarAction.paused = true;
      avatarAction.time = 0;
      avatarAction.play();
      console.log("Avatar1 action ready (paused).");
      onAvatarLoaded();
    },
    undefined,
    (err) => console.error("Error loading avatar1 GLTF:", err)
  );

  gltfLoader.load(
    "avatar2/scene.gltf",
    (gltf) => {
      avatarGLTF2 = gltf.scene;
      avatarClips2 = gltf.animations;
      avatarGLTF2.userData.clips = gltf.animations;
      scene.add(avatarGLTF2);
      avatarGLTF2.updateWorldMatrix(true, true);
      const rawBox = new THREE.Box3().setFromObject(avatarGLTF2);
      const rawHeight = rawBox.max.y - rawBox.min.y;
      avatarGLTF2.scale.setScalar(1.1);
      avatarGLTF2.updateWorldMatrix(true, true);
      const footY = 0.09;
      const headY_in_local = 1.694;
      avatarGLTF2.position.y -= footY;
      scene.remove(avatarGLTF2);
      scene.add(avatarGLTF2);
      avatarGLTF2.userData.headY = headY_in_local;
      avatarMixer = new THREE.AnimationMixer(avatarGLTF2);
      const clip = avatarClips2.find((c) => c.name === AVATAR_ANIM2);
      if (!clip) {
        console.warn("Avatar2 clip not found:", avatarClips2.map((c) => c.name));
        return;
      }
      avatarAction = avatarMixer.clipAction(clip);
      avatarAction.setLoop(THREE.LoopRepeat, Infinity);
      avatarAction.clampWhenFinished = true;
      avatarAction.paused = true;
      avatarAction.time = 0;
      avatarAction.play();
      console.log("Avatar2 action ready (paused).");
      onAvatarLoaded();
    },
    undefined,
    (err) => console.error("Error loading avatar2 GLTF:", err)
  );

  gltfLoader.load(
    "avatar3/scene.gltf",
    (gltf) => {
      avatarGLTF3 = gltf.scene;
      avatarClips3 = gltf.animations;
      avatarGLTF3.userData.clips = gltf.animations;
      scene.add(avatarGLTF3);
      avatarGLTF3.updateWorldMatrix(true, true);
      const rawBox = new THREE.Box3().setFromObject(avatarGLTF3);
      const rawHeight = rawBox.max.y - rawBox.min.y;
      avatarGLTF3.scale.setScalar(0.6);
      avatarGLTF3.updateWorldMatrix(true, true);
      const footY = 0.09;
      const headY_in_local = 1.694;
      avatarGLTF3.position.y -= footY;
      scene.remove(avatarGLTF3);
      scene.add(avatarGLTF3);
      avatarGLTF3.userData.headY = headY_in_local;
      avatarMixer = new THREE.AnimationMixer(avatarGLTF3);
      const clip = avatarClips3.find((c) => c.name === AVATAR_ANIM3);
      if (!clip) {
        console.warn("Avatar3 clip not found:", avatarClips3.map((c) => c.name));
        return;
      }
      avatarAction = avatarMixer.clipAction(clip);
      avatarAction.setLoop(THREE.LoopRepeat, Infinity);
      avatarAction.clampWhenFinished = true;
      avatarAction.paused = true;
      avatarAction.time = 0;
      avatarAction.play();
      console.log("Avatar3 action ready (paused).");
      onAvatarLoaded();
    },
    undefined,
    (err) => console.error("Error loading avatar3 GLTF:", err)
  );

  gltfLoader.load(
    "avatar4/scene.gltf",
    (gltf) => {
      avatarGLTF4 = gltf.scene;
      avatarClips4 = gltf.animations;
      avatarGLTF4.userData.clips = gltf.animations;
      scene.add(avatarGLTF4);
      avatarGLTF4.updateWorldMatrix(true, true);
      const rawBox = new THREE.Box3().setFromObject(avatarGLTF4);
      const rawHeight = rawBox.max.y - rawBox.min.y;
      const scale = playerHeight / rawHeight;
      avatarGLTF4.scale.setScalar(scale);
      avatarGLTF4.updateWorldMatrix(true, true);
      const footY = 0.09;
      const headY_in_local = 1.694;
      avatarGLTF4.position.y -= footY;
      scene.remove(avatarGLTF4);
      scene.add(avatarGLTF4);
      avatarGLTF4.userData.headY = headY_in_local;
      avatarMixer = new THREE.AnimationMixer(avatarGLTF4);
      const clip = avatarClips4.find((c) => c.name === AVATAR_ANIM4);
      if (!clip) {
        console.warn("Avatar4 clip not found:", avatarClips4.map((c) => c.name));
        return;
      }
      avatarAction = avatarMixer.clipAction(clip);
      avatarAction.setLoop(THREE.LoopRepeat, Infinity);
      avatarAction.clampWhenFinished = true;
      avatarAction.paused = true;
      avatarAction.time = 0;
      avatarAction.play();
      console.log("Avatar4 action ready (paused).");
      onAvatarLoaded();
    },
    undefined,
    (err) => console.error("Error loading avatar4 GLTF:", err)
  );

  document.addEventListener("keydown", onKeyDown);
  document.addEventListener("keyup", onKeyUp);
  addEventListener("resize", onWindowResize);
}

const nameOverlay = document.getElementById('nameOverlay');
const startBtn = document.getElementById('startBtn');
const nameInput = document.getElementById('playerName');

startBtn.addEventListener('click', () => {
  const typed = (nameInput.value || '').trim().slice(0, 16) || 'Anon';
  rememberPlayer(socket?.id || 'local', typed);
  refreshNames();
  window.myPlayerName = typed;
  if (socket && socket.connected) {
    socket.emit('setName', typed);
  } else {
    window.pendingName = typed;
  }
  listener.context.resume().then(() => {
    const bgm = scene.userData.bgm;
    if (bgm && !bgm.isPlaying) bgm.play();
  });
  nameOverlay.style.display = 'none';
  document.getElementById('blocker').style.display = 'flex';
});

function loadFixedLayout() {
  dungeonMap.length = 0;
  treasureSpots.length = 0;
  monsterSpots.length = 0;
  const half = DUNGEON_SIZE >> 1;

  for (let r = 0; r < DUNGEON_SIZE; r++) {
    dungeonMap[r] = [];
    for (let c = 0; c < DUNGEON_SIZE; c++) {
      const ch = FIXED_LAYOUT[r][c];
      dungeonMap[r][c] = ch === "#" ? 0 : 1;
      if (ch === "S") {
        spawnPos.set((c - half) * 2, playerHeight, (r - half) * 2);
      } else if (ch === "T") {
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
        const wall = new THREE.Mesh(
          new THREE.BoxGeometry(2, wallH, 2),
          wallMat
        );
        wall.position.set(worldX, wallH / 2, worldZ);
        wall.receiveShadow = true;
        wall.castShadow = false;
        scene.add(wall);
        objects.push(wall);
        wall.updateMatrixWorld();
        wallBoxes.push(
          new THREE.Box3().setFromObject(wall).expandByScalar(0.15)
        );
      } else {
        const floor = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), floorMat);
        floor.rotation.x = -Math.PI / 2;
        floor.position.set(worldX, 0, worldZ);
        floor.receiveShadow = true;
        scene.add(floor);
      }
    }
  }
}

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
  const idleIndex = clipIndexByName["idle"];
  const runIndex = clipIndexByName["run"];
  const biteIndex = clipIndexByName["attack_tail"];

  monsterSpots.forEach((cell) => {
    const monsterClone = SkeletonUtils.clone(monsterGLTF);
    monsterClone.traverse((node) => {
      if (node.isMesh) {
        node.castShadow = true;
        node.receiveShadow = true;
      }
    });

    const x = (cell.c - half) * 2;
    const z = (cell.r - half) * 2;
    monsterClone.position.set(x, 0, z);
    monsterClone.scale.set(1.0, 1.0, 1.0);

    const roar = new THREE.PositionalAudio(listener);
    audioLoader.load("sounds/trex.mp3", (buffer) => {
      roar.setBuffer(buffer);
      roar.setRefDistance(8);
      roar.setVolume(1.0);
    });
    monsterClone.add(roar);

    scene.add(monsterClone);
    const monsterBox = new THREE.Box3()
      .setFromObject(monsterClone)
      .expandByScalar(0.05);

    const mixerClone = new THREE.AnimationMixer(monsterClone);
    const actions = monsterClips.map((clip, idx) => {
      const action = mixerClone.clipAction(clip, monsterClone);
      action.enabled = true;
      action.setLoop(THREE.LoopRepeat, Infinity);
      action.clampWhenFinished = true;
      return action;
    });

    actions[idleIndex].reset().play();

    monsters.push({
      mesh: monsterClone,
      roar: roar,
      mixer: mixerClone,
      actions: actions,
      current: idleIndex,
      idleIndex: idleIndex,
      runIndex: runIndex,
      biteIndex: biteIndex,
      position: new THREE.Vector3(x, 0, z),
      velocity: new THREE.Vector3(),
      chasing: false,
      visible: true,
      box: monsterBox,
    });

    monsterClones.push(monsterClone);
  });
}

function placeDragonBalls(decalTex) {
  const tex = new THREE.TextureLoader().load("textures/dragonball.png");
  tex.minFilter = THREE.LinearMipMapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;

  const half = DUNGEON_SIZE >> 1;

  treasureSpots.forEach((cell) => {
    const sphere = new THREE.Mesh(
      dragonGeo,
      new THREE.MeshStandardMaterial({
        map: tex,
        metalness: 0,
        roughness: 0.7,
      })
    );
    sphere.position.set(
      ((cell.c - half) | 0) * 2,
      0.5,
      ((cell.r - half) | 0) * 2
    );
    sphere.rotation.set(Math.PI / 2, Math.PI / 2, 0);
    sphere.castShadow = true;
    sphere.receiveShadow = true;
    scene.add(sphere);
    treasures.push(sphere);
  });
}

function openTreasure(idx) {
  const coin = scene.userData.coinSound;
  if (coin) coin.play();

  openedTreasures.add(idx);
  treasures[idx].visible = false;
  const gold = 100;
  goldCount += gold;
  coinsById[socket.id] = goldCount;
  refreshRanking();
  showPopup(`You get: Gold x${gold}!`);
  updateCoinDisplay();

  if (socket) socket.emit("goldChanged", { coins: goldCount });
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

function initSocketConnection() {
  socket = io();
  socket.on('connect',()=>{
    const name = window.pendingName || window.myPlayerName || 'Anon';
    rememberPlayer(socket.id, name);
    refreshNames();
    socket.emit('setName', name);
    console.log(`Connected as socket ${socket.id}, name ${name}`);
  });

  socket.on("timerUpdate", ({ remaining }) => {
    timerDisplay.innerText = `Time: ${remaining}`;
    if (!gameEnded && remaining <= 0) {
      endGame(true);
    }
  });

  socket.on("gamePaused", ({ paused }) => {
    if (isSoloMode && !gameEnded) {
      timerDisplay.innerText = timerDisplay.innerText.replace(" (Paused)", "");
      if (paused) {
        timerDisplay.innerText += " (Paused)";
      }
    }
  });

  socket.on("gameStarted", () => {
    readyStatusDisplay.style.display = "none";
    timerDisplay.innerText = timerDisplay.innerText.replace(" (Paused)", "");
    gameEnded = false;
    console.log('Game started, timer initialized');
  });

  socket.on("readyStatus", ({ readyCount, totalPlayers }) => {
    isSoloMode = totalPlayers === 1;
    if (isSoloMode) {
      readyStatusDisplay.style.display = "none";
    } else if (!gameEnded) {
      readyStatusDisplay.style.display = "block";
      readyStatusDisplay.innerText = mySlotIndex === 0
        ? `${readyCount}/${totalPlayers} players ready`
        : `Waiting for host... (${readyCount}/${totalPlayers} ready)`;
    }
    console.log(`Ready status: ${readyCount}/${totalPlayers}, isSoloMode: ${isSoloMode}, mySlot: ${mySlotIndex}`);
  });

  socket.on("gameOver", () => {
    if (!gameEnded) endGame(true);
  });

  socket.on("currentPlayers", (payload) => {
    const list = Array.isArray(payload) ? payload : Object.values(payload);
    list.forEach((p) => {
      if (p.name) rememberPlayer(p.id, p.name);
      if (p.id === socket.id) {
        mySlotIndex = p.slot;
        controls.getObject().position.copy(spawnSpots[mySlotIndex]);
        console.log(`Assigned slot ${mySlotIndex} to self (socket ${socket.id})`);

        let proto = null;
        if (mySlotIndex === 0) proto = avatarGLTF1;
        if (mySlotIndex === 1) proto = avatarGLTF2;
        if (mySlotIndex === 2) proto = avatarGLTF3;
        if (mySlotIndex === 3) proto = avatarGLTF4;

        if (proto) {
          myAvatar = SkeletonUtils.clone(proto);
          myAvatar.userData.mixer = new THREE.AnimationMixer(myAvatar);
          let clipName = "";
          if (mySlotIndex === 0) clipName = AVATAR_ANIM;
          if (mySlotIndex === 1) clipName = AVATAR_ANIM2;
          if (mySlotIndex === 2) clipName = AVATAR_ANIM3;
          if (mySlotIndex === 3) clipName = AVATAR_ANIM4;
          const clips = proto.userData.clips;
          const clip = clips.find((c) => c.name === clipName);
          if (clip) {
            const action = myAvatar.userData.mixer.clipAction(clip);
            action.setLoop(THREE.LoopRepeat, Infinity);
            action.clampWhenFinished = true;
            action.paused = true;
            action.time = 0;
            action.play();
            myAvatar.userData.action = action;
          } else {
            console.warn("Clip not found on avatar:", clipName, clips.map((c) => c.name));
          }
          scene.add(myAvatar);
        }
      } else {
        addOtherPlayer(p);
      }
    });
    refreshNames();
  });

  socket.on("newPlayer", (pkt) => {
    const p = pkt.data ? { id: pkt.id, ...pkt.data } : pkt;
    if (p.name) rememberPlayer(p.id, p.name);
    refreshRanking();
    addOtherPlayer(p);
    refreshNames();
  });

  socket.on("playerMoved", ({ id, data }) => {
    const p = players[id];
    if (!p) return;
    const prevX = p.mesh.position.x;
    const prevZ = p.mesh.position.z;
    p.mesh.position.set(data.position.x, data.position.y, data.position.z);
    p.mesh.rotation.y = data.rotation.y + Math.PI;
    p.lastUpdate = performance.now();
    const dx = data.position.x - prevX;
    const dz = data.position.z - prevZ;
    const moving = Math.hypot(dx, dz) > 0.001;
    if (p.action) {
      if (moving && p.action.paused) p.action.paused = false;
      if (!moving && !p.action.paused) {
        p.action.paused = true;
        p.action.time = 0;
      }
    }
  });

  socket.on('playerNameUpdated',({id,name})=>{
    rememberPlayer(id, name);
    refreshRanking();
    refreshNames();
  });

  socket.on("removePlayer", (id) => {
    if (players[id]) {
      scene.remove(players[id].mesh);
      delete players[id];
    }
    delete playerNames[id];
    const i = joinOrder.indexOf(id);
    if (i !== -1) joinOrder.splice(i, 1);
    refreshNames();
    refreshRanking();
  });

  socket.on("roomFull", () => {
    alert("This dungeon already has four adventurers. Try again later!");
  });

  socket.on('goldChanged', ({ id, coins }) => {
    coinsById[id] = coins ?? 0;
    refreshRanking();
  });

  socket.on('playersRanking', (playersInfo=[]) => {
    playersInfo.forEach(p => {
      coinsById[p.id] = p.coins ?? 0;
      if (p.name) rememberPlayer(p.id, p.name);
    });
    refreshRanking();
  });
}

setInterval(() => {
  if (!socket?.connected) return;
  const p = controls.getObject().position;
  const r = camera.rotation;
  socket.emit("updateMovement", {
    position: { x: p.x, y: p.y - playerHeight, z: p.z },
    rotation: { x: r.x, y: r.y, z: r.z }
  });
}, 1000);

function addOtherPlayer({ id, slot, position, rotation = { y: 0 } }) {
  let mesh, proto;
  if (slot === 0 && avatarGLTF1) {
    mesh = SkeletonUtils.clone(avatarGLTF1);
    proto = avatarGLTF1;
  } else if (slot === 1 && avatarGLTF2) {
    mesh = SkeletonUtils.clone(avatarGLTF2);
    proto = avatarGLTF2;
  } else if (slot === 2 && avatarGLTF3) {
    mesh = SkeletonUtils.clone(avatarGLTF3);
    proto = avatarGLTF3;
  } else if (slot === 3 && avatarGLTF4) {
    mesh = SkeletonUtils.clone(avatarGLTF4);
    proto = avatarGLTF4;
  }
  if (proto) {
    const mixer = new THREE.AnimationMixer(mesh);
    const clipNames = [AVATAR_ANIM, AVATAR_ANIM2, AVATAR_ANIM3, AVATAR_ANIM4];
    const wantName = clipNames[slot] || proto.userData.clips[0].name;
    const srcClip = proto.userData.clips.find(c => c.name === wantName) || proto.userData.clips[0];
    const action = mixer.clipAction(srcClip);
    action.setLoop(THREE.LoopRepeat, Infinity);
    action.clampWhenFinished = true;
    action.paused = true;
    action.time = 0;
    action.play();
    mesh.userData.mixer = mixer;
    mesh.userData.action = action;
  }
  mesh.position.set(position.x, position.y - playerHeight, position.z);
  mesh.rotation.y = (rotation.y || 0) + Math.PI;
  scene.add(mesh);
  players[id] = {
    mesh,
    mixer: mesh.userData.mixer || null,
    action: mesh.userData.action || null,
    lastUpdate: performance.now(),
    slot
  };
}

function onKeyDown(e) {
  if (playerDead) return;
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
      if (nearestTreasureIndex !== null && !openedTreasures.has(nearestTreasureIndex)) {
        openTreasure(nearestTreasureIndex);
      }
      break;
  }
}

function onKeyUp(e) {
  if (playerDead) return;
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

function updateMinimap() {
  if (!minimapCtx) return;

  const canvasWidth = minimapCanvas.width;
  const canvasHeight = minimapCanvas.height;
  const half = DUNGEON_SIZE >> 1;
  const cellSize = canvasWidth / DUNGEON_SIZE;

  minimapCtx.clearRect(0, 0, canvasWidth, canvasHeight);

  for (let r = 0; r < DUNGEON_SIZE; r++) {
    for (let c = 0; c < DUNGEON_SIZE; c++) {
      minimapCtx.fillStyle = dungeonMap[r][c] === 0 ? "#444" : "#888";
      minimapCtx.fillRect(c * cellSize, r * cellSize, cellSize, cellSize);
    }
  }

  treasureSpots.forEach((spot, idx) => {
    if (!openedTreasures.has(idx)) {
      minimapCtx.fillStyle = "#FFD700";
      minimapCtx.beginPath();
      minimapCtx.arc(
        (spot.c + 0.5) * cellSize,
        (spot.r + 0.5) * cellSize,
        cellSize * 0.3,
        0,
        Math.PI * 2
      );
      minimapCtx.fill();
    }
  });

  monsters.forEach((monster) => {
    const x = (monster.position.x / 2 + half) * cellSize;
    const z = (monster.position.z / 2 + half) * cellSize;
    minimapCtx.fillStyle = "#FF5555";
    minimapCtx.beginPath();
    minimapCtx.arc(x, z, cellSize * 0.3, 0, Math.PI * 2);
    minimapCtx.fill();
  });

  for (const id in players) {
    const player = players[id];
    const x = (player.mesh.position.x / 2 + half) * cellSize;
    const z = (player.mesh.position.z / 2 + half) * cellSize;
    minimapCtx.fillStyle = "#00FF00";
    minimapCtx.beginPath();
    minimapCtx.arc(x, z, cellSize * 0.4, 0, Math.PI * 2);
    minimapCtx.fill();
  }

  const playerPos = controls.getObject().position;
  const px = (playerPos.x / 2 + half) * cellSize;
  const pz = (playerPos.z / 2 + half) * cellSize;
  minimapCtx.fillStyle = "#FFFFFF";
  minimapCtx.beginPath();
  minimapCtx.arc(px, pz, cellSize * 0.4, 0, Math.PI * 2);
  minimapCtx.fill();
}

function animate() {
  requestAnimationFrame(animate);

  const now = performance.now();
  const dt = (now - prevTime) / 1000;

  if (controls.isLocked && !gameEnded) {
    if (playerDead) {
      treasureHint.style.display = "none";
      if (myAvatar && myAvatar.userData.action) {
        const action = myAvatar.userData.action;
        if (!action.paused) {
          action.paused = true;
          action.time = 0;
        }
      }
      return;
    }

    nearestTreasureIndex = null;
    let minDist = 2.0;
    const playerPos = controls.getObject().position;
    treasures.forEach((treasure, idx) => {
      if (openedTreasures.has(idx)) return;
      const dist = treasure.position.distanceTo(playerPos);
      if (dist < minDist) {
        minDist = dist;
        nearestTreasureIndex = idx;
      }
    });

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

    let dirX = 0, dirZ = 0;
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

    const walk = scene.userData.walkSound;
    if (movement.lengthSq() > 0) {
      if (walk && !walk.isPlaying) walk.play();
      const nowSec = performance.now() / 1000;
      if (nowSec - scene.userData.lastRaptorTime > 5 + Math.random() * 10) {
        scene.userData.lastRaptorTime = nowSec;
        const r = new THREE.Audio(listener);
        audioLoader.load("sounds/raptor.mp3", (buf) => {
          r.setBuffer(buf);
          r.setVolume(0.8);
          r.play();
        });
      }
    } else {
      if (walk && walk.isPlaying) walk.stop();
    }

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

    controls.getObject().position.y = playerHeight;

    const head = controls.getObject();
    const dir = new THREE.Vector3();
    camera.getWorldDirection(dir);
    torch.position.copy(head.position).add(new THREE.Vector3(0, 0.2, 0));
    torch.target.position.copy(head.position).add(dir.multiplyScalar(2));

    if (myAvatar) {
      const headY = myAvatar.userData.headY;
      const avatarOriginY = camera.position.y - headY;
      myAvatar.position.set(
        camera.position.x,
        avatarOriginY,
        camera.position.z
      );
      const forward = new THREE.Vector3();
      camera.getWorldDirection(forward);
      forward.normalize();
      const PUSH_FORWARD = -0.9;
      myAvatar.position.x += forward.x * PUSH_FORWARD;
      myAvatar.position.z += forward.z * PUSH_FORWARD;
      const cameraYaw = Math.atan2(forward.x, forward.z);
      const yawOffset = myAvatar.userData.yawOffset || 0;
      myAvatar.rotation.y = cameraYaw + yawOffset;
    }

    if (myAvatar && myAvatar.userData.action) {
      const action = myAvatar.userData.action;
      if (movement.lengthSq() > 0) {
        if (action.paused) action.paused = false;
      } else {
        if (!action.paused) {
          action.paused = true;
          action.time = 0;
        }
      }
    }

    if (myAvatar && myAvatar.userData.mixer) {
      myAvatar.userData.mixer.update(dt);
    }

    monsters.forEach((m) => {
      const dirToPlayerFull = controls.getObject().position.clone().sub(m.position);
      dirToPlayerFull.y = 0;
      const horizDist = dirToPlayerFull.length();
      let canSee = false;
      if (horizDist < MONSTER_SIGHT) {
        const rayOrigin = m.position.clone().add(new THREE.Vector3(0, 0.5, 0));
        const fullDir = controls.getObject().position.clone().sub(m.position).normalize();
        raycaster.set(rayOrigin, fullDir);
        const hit = raycaster.intersectObjects(objects, true)[0];
        canSee =
          !hit ||
          hit.distance > controls.getObject().position.clone().sub(m.position).length() - 0.3;
      }
      m.chasing = canSee;

      const wasChasing = m._wasChasing || false;
      if (!wasChasing && m.chasing) {
        if (m.roar.isPlaying === false) m.roar.play();
      }
      m._wasChasing = m.chasing;

      const CATCH_DIST = 0.9;
      if (horizDist < CATCH_DIST) {
        if (m.current !== m.biteIndex) {
          m.actions[m.current].fadeOut(0.2);
          m.actions[m.biteIndex].reset().fadeIn(0.2).play();
          m.current = m.biteIndex;
        }
        if (!m.lastAttackTime) m.lastAttackTime = 0;
        const nowSec = now / 1000;
        const attackCD = 1.0;
        if (nowSec - m.lastAttackTime > attackCD) {
          m.lastAttackTime = nowSec;
          if (playerLives > 0) {
            playerLives--;
            updateHealthBar();
            showPopup("Attacked!");
            if (playerLives === 0 && !gameEnded) {
              endGame();
            }
          }
        }
      } else if (m.chasing) {
        if (m.current !== m.runIndex) {
          m.actions[m.current].fadeOut(0.2);
          m.actions[m.runIndex].reset().fadeIn(0.2).play();
          m.current = m.runIndex;
        }
        m.velocity
          .copy(dirToPlayerFull)
          .setY(0)
          .normalize()
          .multiplyScalar(MONSTER_SPEED);
        const candPos = m.position.clone().addScaledVector(m.velocity, dt);
        const oldPos = m.mesh.position.clone();
        m.mesh.position.copy(candPos);
        m.mesh.updateMatrixWorld(true);
        m.box.setFromObject(m.mesh).expandByScalar(0.05);
        let blocked = false;
        for (const w of wallBoxes) {
          if (m.box.intersectsBox(w)) {
            blocked = true;
            break;
          }
        }
        if (blocked) {
          m.mesh.position.copy(oldPos);
          m.mesh.updateMatrixWorld(true);
          m.box.setFromObject(m.mesh).expandByScalar(0.05);
        } else {
          m.position.copy(candPos);
          m.mesh.lookAt(
            new THREE.Vector3(controls.getObject().position.x, candPos.y, controls.getObject().position.z)
          );
        }
      } else {
        if (m.current !== m.idleIndex) {
          m.actions[m.current].fadeOut(0.2);
          m.actions[m.idleIndex].reset().fadeIn(0.2).play();
          m.current = m.idleIndex;
        }
      }
      if (m.mixer) m.mixer.update(dt);
    });

    if (avatarMixer && avatarAction) {
      if (movement.lengthSq() > 0) {
        if (avatarAction.paused) avatarAction.paused = false;
      } else {
        if (!avatarAction.paused) {
          avatarAction.paused = true;
          avatarAction.time = 0;
        }
      }
      avatarMixer.update(dt);
    }

    for (const id in players) {
      const m = players[id].mixer;
      if (m) m.update(dt);
    }

    if (now % 50 < dt * 1000) {
      const p = controls.getObject().position;
      const r = camera.rotation;
      socket.emit("updateMovement", {
        position: { x: p.x, y: p.y - playerHeight, z: p.z },
        rotation: { x: r.x, y: r.y, z: r.z },
      });
    }

    updateMinimap();
  }

  prevTime = now;
  renderer.render(scene, camera);
}

let rankingPanel = document.createElement("div");
rankingPanel.style.position = "absolute";
rankingPanel.style.right = "30px";
rankingPanel.style.bottom = "30px";
rankingPanel.style.background = "rgba(0,0,0,0.8)";
rankingPanel.style.borderRadius = "12px";
rankingPanel.style.padding = "18px 32px";
rankingPanel.style.zIndex = "999";
rankingPanel.style.color = "#fff";
rankingPanel.style.minWidth = "260px";
rankingPanel.style.fontSize = "18px";
rankingPanel.innerHTML = "<b>🏆 Ranking</b><br/>";
document.body.appendChild(rankingPanel);

function refreshRanking() {
  const rows = joinOrder.map(id => ({
    id,
    name: playerNames[id] || 'Anon',
    slot: players[id]?.slot ?? (id === socket.id ? mySlotIndex : 0),
    coins: coinsById[id] ?? 0
  }));
  rows.sort((a,b) => b.coins - a.coins);
  rankingPanel.innerHTML = "<b>🏆 Ranking</b><br><br>";
  rows.forEach(r => {
    const icon =
        r.slot === 0 ? "🧙‍♂️" :
        r.slot === 1 ? "🧑" :
        r.slot === 1 ? "🧑" :
        r.slot === 2 ? "🦸‍♂️" :
        r.slot === 3 ? "🎥" : "🧑";
    const you = r.id === socket.id ? " <b>(You)</b>" : "";
    rankingPanel.innerHTML += `
      <div style="margin-bottom:7px;display:flex;align-items:center;gap:8px">
        <span style="font-size:22px">${icon}</span>
        <span style="flex:1">${r.name}</span>
        <span style="color:#FFD700;font-weight:bold">${r.coins}</span>${you}
      </div>`;
  });
  window.lastPlayersInfo = rows;
}

function onWindowResize() {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
}

function endGame(isTimeout = false) {
  if (gameEnded) return;
  gameEnded = true;
  playerDead = true;
  refreshRanking();
  showDeathOverlay(isTimeout);
  controls.unlock();
}

function showDeathOverlay(isTimeout = false) {
  let oldOverlay = document.getElementById("deathOverlay");
  if (oldOverlay) oldOverlay.remove();

  const overlay = document.createElement("div");
  overlay.id = "deathOverlay";
  overlay.style.position = "fixed";
  overlay.style.left = 0;
  overlay.style.top = 0;
  overlay.style.width = "100vw";
  overlay.style.height = "100vh";
  overlay.style.background = "rgba(0,0,0,0.85)";
  overlay.style.display = "flex";
  overlay.style.flexDirection = "column";
  overlay.style.justifyContent = "center";
  overlay.style.alignItems = "center";
  overlay.style.zIndex = "2000";
  overlay.style.backdropFilter = "blur(2px)";

  const msgBlock = document.createElement("div");
  msgBlock.style.display = "flex";
  msgBlock.style.flexDirection = "column";
  msgBlock.style.alignItems = "center";
  msgBlock.style.gap = "12px";

  const icon = document.createElement("div");
  icon.style.fontSize = "74px";
  icon.innerText = isTimeout ? "⏰" : "💀";

  const msg = document.createElement("div");
  msg.style.fontSize = "60px";
  msg.style.fontWeight = "bold";
  msg.style.color = "#fff";
  msg.innerText = isTimeout ? "TIME'S UP!" : "GAME OVER!";

  const goldRow = document.createElement("div");
  goldRow.style.fontSize = "30px";
  goldRow.style.margin = "12px 0 4px";
  goldRow.style.color = "#fff";
  goldRow.innerHTML = `Gold: <span style="color:#FFD700;font-weight:bold">${goldCount}</span>`;

  const rankBlock = document.createElement("div");
  rankBlock.style.margin = "18px 0 0 0";
  rankBlock.style.padding = "10px 28px";
  rankBlock.style.background = "rgba(30,30,30,0.95)";
  rankBlock.style.borderRadius = "12px";
  rankBlock.style.color = "#fff";
  rankBlock.style.fontSize = "20px";
  rankBlock.style.minWidth = "250px";
  rankBlock.style.boxShadow = "0 2px 12px #0008";
  rankBlock.innerHTML = rankingPanel.innerHTML;

  const btn = document.createElement("button");
  btn.innerText = "Play Again";
  btn.style.fontSize = "28px";
  btn.style.padding = "12px 44px";
  btn.style.margin = "26px 0 0 0";
  btn.style.borderRadius = "14px";
  btn.style.border = "none";
  btn.style.cursor = "pointer";
  btn.style.background = "#fff";
  btn.onclick = () => window.location.reload();

  msgBlock.appendChild(icon);
  msgBlock.appendChild(msg);
  msgBlock.appendChild(goldRow);
  msgBlock.appendChild(rankBlock);
  msgBlock.appendChild(btn);
  overlay.appendChild(msgBlock);

  document.body.appendChild(overlay);
}

function getRankingHTML() {
  if (!window.lastPlayersInfo)
    return "<b>Ranking</b><br/>You: " + goldCount;
  let playersInfo = window.lastPlayersInfo.slice();
  playersInfo.sort((a, b) => b.coins - a.coins);
  let html = "<b>🏆 Ranking</b><br/><br/>";
  playersInfo.forEach((info) => {
    const name = (info.name || playerNames[info.id] || 'Anon');
    let avatarIcon = "🧑";
    if (info.slot === 0) avatarIcon = "🧙‍♂️";
    if (info.slot === 1) avatarIcon = "🧑";
    if (info.slot === 2) avatarIcon = "🦸‍♂️";
    if (info.slot === 3) avatarIcon = "🎥";
    let you = info.id === socket.id ? " <b>(You)</b>" : "";
    html += `
      <div style="margin-bottom:7px;display:flex;align-items:center;gap:8px">
        <span style="font-size:22px">${avatarIcon}</span>
        <span style="flex:1">${name}</span>
        <span style="color:#FFD700;font-weight:bold">${info.coins}</span>${you}
      </div>`;
  });
  return html;
}

init();
animate();