// ==========================================
// 1. FIREBASE CONFIG & INITIALIZATION
// ==========================================
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.0.0/firebase-app.js";
import { 
  getAuth, 
  setPersistence,
  browserLocalPersistence,
  createUserWithEmailAndPassword, 
  signInWithEmailAndPassword, 
  updateProfile,
  onAuthStateChanged 
} from "https://www.gstatic.com/firebasejs/12.0.0/firebase-auth.js";
import { 
  getDatabase, 
  ref, 
  onValue, 
  runTransaction, 
  set, 
  remove, 
  onDisconnect
} from "https://www.gstatic.com/firebasejs/12.0.0/firebase-database.js";

const firebaseConfig = {
  apiKey: "AIzaSyAqM7xsEN6SHt-lrnlF2tHoRLHRbxdWlkI",
  authDomain: "nova-ca4b5.firebaseapp.com",
  projectId: "nova-ca4b5",
  storageBucket: "nova-ca4b5.firebasestorage.app",
  messagingSenderId: "491973304543",
  appId: "1:491973304543:web:f63d6ff665b9c8551c896a",
  measurementId: "G-90TDNQ5VXP",
  databaseURL: "https://nova-ca4b5-default-rtdb.firebaseio.com"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getDatabase(app);

setPersistence(auth, browserLocalPersistence).catch((error) => {
  console.error("Auth persistence error:", error);
});


// ==========================================
// 2. AUTHENTICATION LOGIC
// ==========================================
const authScreen = document.getElementById("auth-screen");
const authTitle = document.getElementById("auth-title");
const authBtn = document.getElementById("auth-btn");
const toggleAuthMode = document.getElementById("toggle-auth-mode");
const usernameInput = document.getElementById("auth-username");
const emailInput = document.getElementById("auth-email");
const passwordInput = document.getElementById("auth-password");
const errorMsg = document.getElementById("auth-error");

const usernameDisplay = document.getElementById("username");
const gameCreatorDisplay = document.getElementById("game-creator");
const friendsBox = document.getElementById("friends-box");

let isSignUp = true; 
let currentUser = null;

toggleAuthMode.addEventListener("click", () => {
  isSignUp = !isSignUp;
  if (isSignUp) {
    authTitle.textContent = "Sign Up";
    authBtn.textContent = "Sign Up";
    usernameInput.style.display = "block";
    toggleAuthMode.textContent = "Log In";
  } else {
    authTitle.textContent = "Log In";
    authBtn.textContent = "Log In";
    usernameInput.style.display = "none";
    toggleAuthMode.textContent = "Sign Up";
  }
  errorMsg.textContent = "";
});

authBtn.addEventListener("click", async (e) => {
  e.preventDefault();
  const email = emailInput.value.trim();
  const password = passwordInput.value.trim();
  const username = usernameInput.value.trim();

  errorMsg.textContent = "";

  if (!email || !password) {
    errorMsg.textContent = "Please fill in email and password!";
    return;
  }

  if (password.length < 6) {
    errorMsg.textContent = "Password must be at least 6 characters!";
    return;
  }

  try {
    if (isSignUp) {
      if (!username) {
        errorMsg.textContent = "Please enter a username!";
        return;
      }
      
      // 1. Create user account
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      
      // 2. Save the username into Firebase Auth Profile immediately
      await updateProfile(userCredential.user, { displayName: username });
      
      // 3. Update the UI text right away
      usernameDisplay.textContent = username;
      gameCreatorDisplay.textContent = `@${username}`;
    } else {
      await signInWithEmailAndPassword(auth, email, password);
    }
  } catch (error) {
    console.error("Auth Error:", error);
    errorMsg.textContent = error.message.replace("Firebase: ", "");
  }
});

function renderFriends(friendsArray = []) {
  friendsBox.innerHTML = "";
  if (friendsArray.length === 0) {
    friendsBox.innerHTML = `<span style="color: #666; font-style: italic;">No friends added yet</span>`;
    return;
  }
  friendsArray.forEach(friend => {
    const friendItem = document.createElement("div");
    friendItem.className = "friend-item";
    friendItem.innerHTML = `<div class="friend-icon"></div><span>${friend.name}</span>`;
    friendsBox.appendChild(friendItem);
  });
}

onAuthStateChanged(auth, (user) => {
  if (user) {
    currentUser = user;
    authScreen.classList.add("hidden");
    
    // Check for explicit displayName first; fallback to email prefix if not set
    const currentUsername = user.displayName || user.email.split("@")[0];
    usernameDisplay.textContent = currentUsername;
    gameCreatorDisplay.textContent = `@${currentUsername}`;
    renderFriends([]); 
  } else {
    currentUser = null;
    authScreen.classList.remove("hidden");
  }
});


// ==========================================
// 3. LIVE STATS & MULTIPLAYER PRESENCE
// ==========================================
const visitCountEl = document.getElementById("visit-count");
const playingCountEl = document.getElementById("playing-count");
const dashboardPeopleCountEl = document.getElementById("dashboard-people-count");

const visitsRef = ref(db, "games/test/visits");
const activePlayersRef = ref(db, "games/test/activePlayers");

let hasVisitedThisSession = false;
let otherPlayers = {};
let lastDbUpdate = 0; // Throttling helper for database performance

onValue(visitsRef, (snapshot) => {
  const count = snapshot.val() || 0;
  visitCountEl.textContent = count;
});

onValue(activePlayersRef, (snapshot) => {
  const playersData = snapshot.val() || {};
  otherPlayers = playersData;
  const activeCount = Object.keys(playersData).length;
  playingCountEl.textContent = activeCount;
  dashboardPeopleCountEl.textContent = activeCount;
});

function incrementVisits() {
  runTransaction(visitsRef, (currentVisits) => {
    return (currentVisits || 0) + 1;
  });
}

function enterGamePresence() {
  if (!currentUser) return;
  
  myLastMessage = "";
  myMessageTime = 0;

  const playerPresenceRef = ref(db, `games/test/activePlayers/${currentUser.uid}`);

  set(playerPresenceRef, {
    username: currentUser.displayName || currentUser.email.split("@")[0],
    x: player.x,
    y: player.y,
    lastMsg: "",
    msgTimestamp: 0
  });

  onDisconnect(playerPresenceRef).remove();
}

function updateMyPositionInDB(force = false) {
  if (!currentUser) return;

  const now = Date.now();
  // Throttle updates to max 20 per second to keep Firebase running smoothly
  if (!force && now - lastDbUpdate < 50) return;
  lastDbUpdate = now;

  if (myLastMessage && now - myMessageTime > 4000) {
    myLastMessage = "";
    myMessageTime = 0;
  }

  const myPosRef = ref(db, `games/test/activePlayers/${currentUser.uid}`);
  set(myPosRef, {
    username: currentUser.displayName || currentUser.email.split("@")[0],
    x: Math.round(player.x),
    y: Math.round(player.y),
    lastMsg: myLastMessage,
    msgTimestamp: myMessageTime
  });
}

function leaveGamePresence() {
  if (!currentUser) return;
  const playerPresenceRef = ref(db, `games/test/activePlayers/${currentUser.uid}`);
  remove(playerPresenceRef);
}


// ==========================================
// 4. IN-GAME MULTIPLAYER CHAT LOGIC
// ==========================================
const chatMessagesList = document.getElementById("chat-messages");
const chatForm = document.getElementById("chat-form");
const chatInput = document.getElementById("chat-input");

let myLastMessage = "";
let myMessageTime = 0;

const IGNORED_KEYS = ["w", "a", "s", "d", "W", "A", "S", "D"];
const currentChatRef = ref(db, "games/test/currentChat");

onValue(currentChatRef, (snapshot) => {
  const msg = snapshot.val();
  chatMessagesList.innerHTML = "";

  if (!msg || !msg.text) return;

  if (IGNORED_KEYS.includes(msg.text.trim())) return;

  const item = document.createElement("div");
  item.className = "chat-message-item";
  item.innerHTML = `<span class="chat-author">${msg.username}:</span> ${msg.text}`;
  chatMessagesList.appendChild(item);
  
  chatMessagesList.scrollTop = chatMessagesList.scrollHeight;
});

chatForm.addEventListener("submit", (e) => {
  e.preventDefault();
  const text = chatInput.value.trim();
  
  if (!text || !currentUser || IGNORED_KEYS.includes(text)) {
    chatInput.value = "";
    chatInput.blur();
    return;
  }

  const username = currentUser.displayName || currentUser.email.split("@")[0];

  set(currentChatRef, {
    username: username,
    text: text,
    timestamp: Date.now()
  });

  myLastMessage = text;
  myMessageTime = Date.now();
  updateMyPositionInDB(true);

  chatInput.value = "";
  chatInput.blur(); 
});


// ==========================================
// 5. PAGE NAVIGATION LOGIC
// ==========================================
const dashboardView = document.getElementById("dashboard-view");
const gamePageView = document.getElementById("game-page-view");
const openGameBtn = document.getElementById("open-game-btn");
const backBtn = document.getElementById("back-btn");

openGameBtn.addEventListener("click", () => {
  dashboardView.classList.add("hidden");
  gamePageView.classList.remove("hidden");
  
  if (!hasVisitedThisSession) {
    incrementVisits();
    hasVisitedThisSession = true; 
  }
});

backBtn.addEventListener("click", () => {
  stopGame();
  gamePageView.classList.add("hidden");
  dashboardView.classList.remove("hidden");
});


// ==========================================
// 6. 8-BIT GAME ENGINE & CANVAS RENDERING
// ==========================================
const gameDetailsContainer = document.getElementById("game-details-container");
const gameCanvasContainer = document.getElementById("game-canvas-container");
const startPlayBtn = document.getElementById("start-play-btn");
const exitGameBtn = document.getElementById("exit-game-btn");
const resumeBtn = document.getElementById("resume-btn");
const pauseMenu = document.getElementById("pause-menu");

const canvas = document.getElementById("game-canvas");
const ctx = canvas.getContext("2d");

let gameAnimationId = null;
let isGamePlaying = false;
let isPaused = false;

const player = {
  x: 200,
  y: 300,
  width: 60,
  height: 70,
  velocityX: 0,
  velocityY: 0,
  speed: 6,
  jumpStrength: -14,
  gravity: 0.6,
  isGrounded: false
};

const keys = {
  a: false,
  d: false,
  w: false,
  ArrowLeft: false,
  ArrowRight: false,
  ArrowUp: false,
  " ": false
};

function resetKeys() {
  Object.keys(keys).forEach(k => keys[k] = false);
}

function resizeCanvas() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
}
window.addEventListener("resize", () => {
  if (isGamePlaying) resizeCanvas();
});

window.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && isGamePlaying) {
    if (document.activeElement === chatInput) {
      chatInput.blur();
    }
    togglePauseMenu();
    return;
  }

  if (e.key === "Enter" && isGamePlaying && !isPaused) {
    if (document.activeElement !== chatInput) {
      resetKeys();
      chatInput.focus();
      return;
    }
  }

  if (document.activeElement === chatInput) return;

  if (keys.hasOwnProperty(e.key) || keys.hasOwnProperty(e.key.toLowerCase())) {
    keys[e.key] = true;
    keys[e.key.toLowerCase()] = true;
  }
});

window.addEventListener("keyup", (e) => {
  if (document.activeElement === chatInput) return;

  if (keys.hasOwnProperty(e.key) || keys.hasOwnProperty(e.key.toLowerCase())) {
    keys[e.key] = false;
    keys[e.key.toLowerCase()] = false;
  }
});

function togglePauseMenu() {
  isPaused = !isPaused;
  resetKeys();
  if (isPaused) {
    pauseMenu.classList.remove("hidden");
  } else {
    pauseMenu.classList.add("hidden");
  }
}

resumeBtn.addEventListener("click", () => {
  isPaused = false;
  resetKeys();
  pauseMenu.classList.add("hidden");
});

startPlayBtn.addEventListener("click", () => {
  gameDetailsContainer.classList.add("hidden");
  gameCanvasContainer.classList.remove("hidden");
  resizeCanvas();
  isGamePlaying = true;
  isPaused = false;

  myLastMessage = "";
  myMessageTime = 0;
  chatInput.value = "";
  chatInput.blur();
  resetKeys();

  pauseMenu.classList.add("hidden");
  enterGamePresence();
  resetPlayer();
  gameLoop();
});

exitGameBtn.addEventListener("click", () => {
  stopGame();
  gameCanvasContainer.classList.add("hidden");
  gameDetailsContainer.classList.remove("hidden");
});

function stopGame() {
  leaveGamePresence();
  isGamePlaying = false;
  isPaused = false;
  myLastMessage = "";
  myMessageTime = 0;
  resetKeys();
  if (gameAnimationId) {
    cancelAnimationFrame(gameAnimationId);
    gameAnimationId = null;
  }
}

function resetPlayer() {
  player.x = 200;
  player.y = canvas.height - 190;
  player.velocityX = 0;
  player.velocityY = 0;
}

function gameLoop() {
  if (!isPaused) {
    updateGame();
    drawGame();
  }
  if (isGamePlaying) {
    gameAnimationId = requestAnimationFrame(gameLoop);
  }
}

function updateGame() {
  let moved = false;

  if (keys.a || keys.ArrowLeft) {
    player.velocityX = -player.speed;
    moved = true;
  } else if (keys.d || keys.ArrowRight) {
    player.velocityX = player.speed;
    moved = true;
  } else {
    player.velocityX = 0;
  }

  if ((keys.w || keys.ArrowUp || keys[" "]) && player.isGrounded) {
    player.velocityY = player.jumpStrength;
    player.isGrounded = false;
    moved = true;
  }

  player.velocityY += player.gravity;

  player.x += player.velocityX;
  player.y += player.velocityY;

  if (player.x < 0) player.x = 0;
  if (player.x + player.width > canvas.width) player.x = canvas.width - player.width;

  const groundY = canvas.height - 120;
  if (player.y + player.height >= groundY) {
    player.y = groundY - player.height;
    player.velocityY = 0;
    player.isGrounded = true;
  }

  if (moved || Math.abs(player.velocityY) > 0.1) {
    updateMyPositionInDB();
  }
}

function drawGame() {
  // Sky
  ctx.fillStyle = "#70c5ce";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Clouds
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(150, 80, 120, 40);
  ctx.fillRect(canvas.width * 0.5, 120, 160, 55);
  ctx.fillRect(canvas.width * 0.8, 60, 110, 35);

  // Ground Dirt & Grass
  const groundHeight = 120;
  ctx.fillStyle = "#8b5a2b";
  ctx.fillRect(0, canvas.height - groundHeight, canvas.width, groundHeight);

  ctx.fillStyle = "#2e8b57";
  ctx.fillRect(0, canvas.height - groundHeight, canvas.width, 20);

  // Render Other Connected Players
  const now = Date.now();
  Object.keys(otherPlayers).forEach(uid => {
    if (currentUser && uid === currentUser.uid) return;
    const p = otherPlayers[uid];
    drawCharacter(p.x, p.y, p.username, "#00ffff");

    if (p.lastMsg && !IGNORED_KEYS.includes(p.lastMsg) && now - p.msgTimestamp < 4000) {
      drawSpeechBubble(p.x + 30, p.y - 10, p.lastMsg);
    }
  });

  // Render Local Player
  const myName = currentUser ? (currentUser.displayName || currentUser.email.split("@")[0]) : "You";
  drawCharacter(player.x, player.y, myName, "#00ffff");

  if (myLastMessage && !IGNORED_KEYS.includes(myLastMessage) && now - myMessageTime < 4000) {
    drawSpeechBubble(player.x + 30, player.y - 10, myLastMessage);
  }
}

function drawCharacter(px, py, username, shirtColor) {
  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 14px monospace";
  ctx.textAlign = "center";
  ctx.fillText(username, px + 30, py - 10);

  // Head
  ctx.fillStyle = "#ffcc99";
  ctx.fillRect(px + 12, py, 36, 26);

  // Eyes
  ctx.fillStyle = "#000000";
  ctx.fillRect(px + 20, py + 8, 6, 6);
  ctx.fillRect(px + 34, py + 8, 6, 6);

  // Torso / Shirt
  ctx.fillStyle = shirtColor;
  ctx.fillRect(px + 12, py + 26, 36, 26);

  // Left & Right Arms
  ctx.fillStyle = "#ffcc99";
  ctx.fillRect(px, py + 26, 12, 26);
  ctx.fillRect(px + 48, py + 26, 12, 26);

  // Pants / Feet
  ctx.fillStyle = "#002b80";
  ctx.fillRect(px + 12, py + 52, 36, 18);
}

function drawSpeechBubble(centerX, topY, text) {
  ctx.font = "12px monospace";
  const textWidth = ctx.measureText(text).width;
  const padding = 8;
  const bubbleWidth = textWidth + padding * 2;
  const bubbleHeight = 22;

  const bx = centerX - bubbleWidth / 2;
  const by = topY - bubbleHeight - 10;

  ctx.fillStyle = "#ffffff";
  ctx.strokeStyle = "#000000";
  ctx.lineWidth = 2;

  ctx.fillRect(bx, by, bubbleWidth, bubbleHeight);
  ctx.strokeRect(bx, by, bubbleWidth, bubbleHeight);

  ctx.beginPath();
  ctx.moveTo(centerX - 4, by + bubbleHeight);
  ctx.lineTo(centerX, by + bubbleHeight + 6);
  ctx.lineTo(centerX + 4, by + bubbleHeight);
  ctx.fillStyle = "#ffffff";
  ctx.fill();

  ctx.fillStyle = "#000000";
  ctx.textAlign = "center";
  ctx.fillText(text, centerX, by + 15);
}
