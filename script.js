// ==========================================
// 1. SUPABASE CLIENT INITIALIZATION
// ==========================================
const SUPABASE_URL = "https://byxzktunhhvxdntddpeo.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ5eHprdHVuaGh2eGRudGRkcGVvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODUwMTc2ODEsImV4cCI6MjEwMDU5MzY4MX0.o6KaXocIdyR3c1uSWHA98TyHuoFT9Zf8rquTJdFQ0p4";

const supabaseClient = window.supabase ? window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY) : null;


// ==========================================
// 2. AUTHENTICATION & PROFILE MANAGEMENT
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
const playerIdDisplay = document.getElementById("player-id-display");
const gameCreatorDisplay = document.getElementById("game-creator");
const friendsBox = document.getElementById("friends-box");

let isSignUp = true; 
let currentUser = null;
let currentNumericId = null;

const ORIGINAL_GAME_CREATOR = "898"; 

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

async function syncUserProfile(user) {
  if (!user || !supabaseClient) return;

  const displayName = user.user_metadata?.display_name || user.email.split("@")[0];

  // Fixed the select query string format
  const { data, error } = await supabaseClient
    .from("players")
    .upsert({
      id: user.id,
      username: displayName,
      last_seen: new Date().toISOString()
    }, { onConflict: 'id' })
    .select("player_id, username")
    .single();

  if (!error && data) {
    currentNumericId = data.player_id;
    if (playerIdDisplay) {
      playerIdDisplay.textContent = currentNumericId;
    }
  } else if (error) {
    console.error("Profile sync error:", error);
  }
}

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

      const { data, error } = await supabaseClient.auth.signUp({
        email,
        password,
        options: { data: { display_name: username } }
      });

      if (error) throw error;
      currentUser = data.user;
      if (currentUser) {
        usernameDisplay.textContent = username;
        if (gameCreatorDisplay) gameCreatorDisplay.textContent = `@${ORIGINAL_GAME_CREATOR}`;
        await syncUserProfile(currentUser);
        authScreen.classList.add("hidden");
      }
    } else {
      const { data, error } = await supabaseClient.auth.signInWithPassword({
        email,
        password
      });

      if (error) throw error;
      currentUser = data.user;
      if (currentUser) {
        const name = currentUser.user_metadata?.display_name || currentUser.email.split("@")[0];
        usernameDisplay.textContent = name;
        if (gameCreatorDisplay) gameCreatorDisplay.textContent = `@${ORIGINAL_GAME_CREATOR}`;
        await syncUserProfile(currentUser);
        authScreen.classList.add("hidden");
      }
    }
  } catch (error) {
    console.error("Auth Error:", error);
    errorMsg.textContent = error.message;
  }
});

function renderFriends(friendsArray = []) {
  if (!friendsBox) return;
  friendsBox.innerHTML = "";
  if (friendsArray.length === 0) {
    friendsBox.innerHTML = `<span style="color: #666; font-style: italic;">No friends added yet</span>`;
    return;
  }
  friendsArray.forEach(friend => {
    const friendItem = document.createElement("div");
    friendItem.className = "friend-item";
    friendItem.innerHTML = `<div class="friend-icon"></div><span>${friend.name} (#${friend.id})</span>`;
    friendsBox.appendChild(friendItem);
  });
}

// Auto Session Check
if (supabaseClient) {
  supabaseClient.auth.getSession().then(async ({ data: { session } }) => {
    if (session) {
      currentUser = session.user;
      authScreen.classList.add("hidden");
      const currentUsername = currentUser.user_metadata?.display_name || currentUser.email.split("@")[0];
      usernameDisplay.textContent = currentUsername;

      if (gameCreatorDisplay) {
        gameCreatorDisplay.textContent = `@${ORIGINAL_GAME_CREATOR}`;
      }
      await syncUserProfile(currentUser);
      renderFriends([]);
      initRealtime();
    } else {
      currentUser = null;
      authScreen.classList.remove("hidden");
    }
  });
}


// ==========================================
// 3. MULTIPLAYER WEBSOCKET BROADCAST SYSTEM
// ==========================================
const visitCountEl = document.getElementById("visit-count");
const playingCountEl = document.getElementById("playing-count");
const dashboardPeopleCountEl = document.getElementById("dashboard-people-count");

let otherPlayers = {};
let gameChannel = null;

function initRealtime() {
  if (!supabaseClient) return;

  gameChannel = supabaseClient.channel('nova-game-room');

  gameChannel
    .on('broadcast', { event: 'player-move' }, (payload) => {
      const p = payload.payload;
      if (currentUser && p.id === currentUser.id) return;
      
      otherPlayers[p.id] = {
        username: p.username,
        numericId: p.numericId,
        x: p.x,
        y: p.y,
        facingRight: p.facingRight,
        lastMsg: p.lastMsg,
        msgTimestamp: p.msgTimestamp
      };
      updatePlayerCounts();
    })
    .on('broadcast', { event: 'player-leave' }, (payload) => {
      delete otherPlayers[payload.payload.id];
      updatePlayerCounts();
    })
    .subscribe((status) => {
      console.log("Realtime status:", status);
    });
}

function updatePlayerCounts() {
  const activeCount = Object.keys(otherPlayers).length;
  if (playingCountEl) playingCountEl.textContent = activeCount;
  if (dashboardPeopleCountEl) dashboardPeopleCountEl.textContent = activeCount;
}

function broadcastMyPosition() {
  if (!currentUser || !gameChannel) return;

  const myName = currentUser.user_metadata?.display_name || currentUser.email.split("@")[0];

  gameChannel.send({
    type: 'broadcast',
    event: 'player-move',
    payload: {
      id: currentUser.id,
      username: myName,
      numericId: currentNumericId,
      x: Math.round(player.x),
      y: Math.round(player.y),
      facingRight: facingRight,
      lastMsg: myLastMessage,
      msgTimestamp: myMessageTime
    }
  });
}

function leaveGamePresence() {
  if (!currentUser || !gameChannel) return;
  gameChannel.send({
    type: 'broadcast',
    event: 'player-leave',
    payload: { id: currentUser.id }
  });
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

function appendChatMessage(username, text) {
  if (!text || IGNORED_KEYS.includes(text.trim())) return;

  const item = document.createElement("div");
  item.className = "chat-message-item";
  item.innerHTML = `<span class="chat-author">${username}:</span> ${text}`;
  chatMessagesList.appendChild(item);
  chatMessagesList.scrollTop = chatMessagesList.scrollHeight;
}

if (chatForm) {
  chatForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const text = chatInput.value.trim();

    if (!text || !currentUser || IGNORED_KEYS.includes(text)) {
      chatInput.value = "";
      chatInput.blur();
      return;
    }

    const username = currentUser.user_metadata?.display_name || currentUser.email.split("@")[0];

    myLastMessage = text;
    myMessageTime = Date.now();
    
    appendChatMessage(username, text);
    broadcastMyPosition();

    chatInput.value = "";
    chatInput.blur();
  });
}


// ==========================================
// 5. PAGE NAVIGATION LOGIC
// ==========================================
const dashboardView = document.getElementById("dashboard-view");
const gamePageView = document.getElementById("game-page-view");
const openGameBtn = document.getElementById("open-game-btn");
const backBtn = document.getElementById("back-btn");

if (openGameBtn) {
  openGameBtn.addEventListener("click", () => {
    if (dashboardView) dashboardView.classList.add("hidden");
    if (gamePageView) gamePageView.classList.remove("hidden");
  });
}

if (backBtn) {
  backBtn.addEventListener("click", () => {
    stopGame();
    if (gamePageView) gamePageView.classList.add("hidden");
    if (dashboardView) dashboardView.classList.remove("hidden");
  });
}


// ==========================================
// 6. GAME ENGINE & CANVAS RENDERING
// ==========================================
const gameDetailsContainer = document.getElementById("game-details-container");
const gameCanvasContainer = document.getElementById("game-canvas-container");
const startPlayBtn = document.getElementById("start-play-btn");
const exitGameBtn = document.getElementById("exit-game-btn");
const resumeBtn = document.getElementById("resume-btn");
const pauseMenu = document.getElementById("pause-menu");

const canvas = document.getElementById("game-canvas");
const ctx = canvas ? canvas.getContext("2d") : null;

let facingRight = true;
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
  if (canvas) {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
  }
}

window.addEventListener("resize", () => {
  if (isGamePlaying) resizeCanvas();
});

window.addEventListener("keydown", (e) => {
  if (!e || !e.key) return;

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

  const keyLower = e.key.toLowerCase();
  if (keys.hasOwnProperty(e.key)) keys[e.key] = true;
  if (keys.hasOwnProperty(keyLower)) keys[keyLower] = true;
});

window.addEventListener("keyup", (e) => {
  if (!e || !e.key) return;
  if (document.activeElement === chatInput) return;

  const keyLower = e.key.toLowerCase();
  if (keys.hasOwnProperty(e.key)) keys[e.key] = false;
  if (keys.hasOwnProperty(keyLower)) keys[keyLower] = false;
});

function togglePauseMenu() {
  isPaused = !isPaused;
  resetKeys();
  if (pauseMenu) pauseMenu.classList.toggle("hidden", !isPaused);
}

if (resumeBtn) {
  resumeBtn.addEventListener("click", () => {
    isPaused = false;
    resetKeys();
    if (pauseMenu) pauseMenu.classList.add("hidden");
  });
}

if (startPlayBtn) {
  startPlayBtn.addEventListener("click", () => {
    if (gameDetailsContainer) gameDetailsContainer.classList.add("hidden");
    if (gameCanvasContainer) gameCanvasContainer.classList.remove("hidden");
    resizeCanvas();
    isGamePlaying = true;
    isPaused = false;

    myLastMessage = "";
    myMessageTime = 0;
    if (chatInput) {
      chatInput.value = "";
      chatInput.blur();
    }
    resetKeys();

    if (pauseMenu) pauseMenu.classList.add("hidden");
    resetPlayer();
    broadcastMyPosition();
    gameLoop();
  });
}

if (exitGameBtn) {
  exitGameBtn.addEventListener("click", () => {
    stopGame();
    if (gameCanvasContainer) gameCanvasContainer.classList.add("hidden");
    if (gameDetailsContainer) gameDetailsContainer.classList.remove("hidden");
  });
}

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
  player.y = canvas ? canvas.height - 190 : 300;
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
    facingRight = false;
    moved = true;
  } else if (keys.d || keys.ArrowRight) {
    player.velocityX = player.speed;
    facingRight = true;
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
  if (canvas && player.x + player.width > canvas.width) player.x = canvas.width - player.width;

  const groundY = canvas ? canvas.height - 120 : 500;
  if (player.y + player.height >= groundY) {
    player.y = groundY - player.height;
    player.velocityY = 0;
    player.isGrounded = true;
  }

  if (moved || Math.abs(player.velocityY) > 0.1) {
    broadcastMyPosition();
  }
}

function drawGame() {
  if (!ctx || !canvas) return;

  // Background
  ctx.fillStyle = "#70c5ce";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Clouds
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(150, 80, 120, 40);
  ctx.fillRect(canvas.width * 0.5, 120, 160, 55);
  ctx.fillRect(canvas.width * 0.8, 60, 110, 35);

  // Ground
  const groundHeight = 120;
  ctx.fillStyle = "#8b5a2b";
  ctx.fillRect(0, canvas.height - groundHeight, canvas.width, groundHeight);

  ctx.fillStyle = "#2e8b57";
  ctx.fillRect(0, canvas.height - groundHeight, canvas.width, 20);

  // Draw Other Online Players
  const now = Date.now();
  Object.keys(otherPlayers).forEach(id => {
    if (currentUser && id === currentUser.id) return;
    const p = otherPlayers[id];
    drawCharacter(p.x, p.y, p.username, p.facingRight ?? true, p.numericId, "#ff4757");

    if (p.lastMsg && !IGNORED_KEYS.includes(p.lastMsg) && now - p.msgTimestamp < 4000) {
      drawSpeechBubble(p.x + 30, p.y - 10, p.lastMsg);
    }
  });

  // Draw Current Player
  const myName = currentUser ? (currentUser.user_metadata?.display_name || currentUser.email.split("@")[0]) : "You";
  drawCharacter(player.x, player.y, myName, facingRight, currentNumericId, "#2ed573");

  if (myLastMessage && !IGNORED_KEYS.includes(myLastMessage) && now - myMessageTime < 4000) {
    drawSpeechBubble(player.x + 30, player.y - 10, myLastMessage);
  }
}

// Custom vector drawing so sprites never fail to render (Fixes Imgur 403 error)
function drawCharacter(px, py, username, isFacingRight = true, numericId = null, color = "#2ed573") {
  if (!ctx) return;
  
  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 14px monospace";
  ctx.textAlign = "center";
  
  const label = numericId ? `${username} (#${numericId})` : username;
  ctx.fillText(label, px + 30, py - 10);

  ctx.save();

  // Character body
  ctx.fillStyle = color;
  ctx.fillRect(px + 10, py + 15, 40, 45);

  // Head
  ctx.fillStyle = "#ffeaa7";
  ctx.fillRect(px + 15, py, 30, 25);

  // Eyes
  ctx.fillStyle = "#2d3436";
  const eyeOffset = isFacingRight ? 35 : 18;
  ctx.fillRect(px + eyeOffset, py + 8, 6, 6);

  // Legs
  ctx.fillStyle = "#2d3436";
  ctx.fillRect(px + 15, py + 60, 12, 10);
  ctx.fillRect(px + 33, py + 60, 12, 10);

  ctx.restore();
}

function drawSpeechBubble(centerX, topY, text) {
  if (!ctx) return;
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
