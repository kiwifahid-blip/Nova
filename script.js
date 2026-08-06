// ==========================================
// 1. SUPABASE CLIENT INITIALIZATION
// ==========================================
const SUPABASE_URL = "https://byxzktunhhvxdntddpeo.supabase.co";
const SUPABASE_KEY = "sb_publishable_zTjxmELF8PntXEw1fqT-RQ__YJZlw1y"; // Make sure to replace with your public anon key starting with eyJ...

const supabaseClient = window.supabase ? window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY) : null;


// ==========================================
// 2. AUTHENTICATION LOGIC & PROFILE MANAGEMENT
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
    } else {
      currentUser = null;
      authScreen.classList.remove("hidden");
    }
  });
}


// ==========================================
// 3. MULTIPLAYER PRESENCE & STATS
// ==========================================
const visitCountEl = document.getElementById("visit-count");
const playingCountEl = document.getElementById("playing-count");
const dashboardPeopleCountEl = document.getElementById("dashboard-people-count");

let otherPlayers = {};
let lastDbUpdate = 0;

if (supabaseClient) {
  supabaseClient
    .channel("public:players")
    .on("postgres_changes", { event: "*", schema: "public", table: "players" }, (payload) => {
      if (payload.eventType === "DELETE") {
        delete otherPlayers[payload.old.id];
      } else {
        const playerObj = payload.new;
        otherPlayers[playerObj.id] = {
          username: playerObj.username,
          numericId: playerObj.player_id,
          x: playerObj.x,
          y: playerObj.y,
          lastMsg: playerObj.last_msg,
          msgTimestamp: playerObj.msg_timestamp
        };
      }
      const activeCount = Object.keys(otherPlayers).length;
      if (playingCountEl) playingCountEl.textContent = activeCount;
      if (dashboardPeopleCountEl) dashboardPeopleCountEl.textContent = activeCount;
    })
    .subscribe();
}

function enterGamePresence() {
  if (!currentUser || !supabaseClient) return;  
  myLastMessage = "";
  myMessageTime = 0;

  supabaseClient.from("players").upsert({
    id: currentUser.id,
    username: currentUser.user_metadata?.display_name || currentUser.email.split("@")[0],
    player_id: currentNumericId,
    x: Math.round(player.x),
    y: Math.round(player.y),
    last_msg: "",
    msg_timestamp: 0,
    last_seen: new Date().toISOString()
  });
}

async function updateMyPositionInDB(force = false) {
  if (!currentUser || !supabaseClient) return;

  const now = Date.now();
  if (!force && now - lastDbUpdate < 50) return;
  lastDbUpdate = now;

  if (myLastMessage && now - myMessageTime > 4000) {
    myLastMessage = "";
    myMessageTime = 0;
  }

  await supabaseClient.from("players").upsert({
    id: currentUser.id,
    username: currentUser.user_metadata?.display_name || currentUser.email.split("@")[0],
    player_id: currentNumericId,
    x: Math.round(player.x),
    y: Math.round(player.y),
    last_msg: myLastMessage,
    msg_timestamp: myMessageTime,
    last_seen: new Date().toISOString()
  });
}

async function leaveGamePresence() {
  if (!currentUser || !supabaseClient) return;
  await supabaseClient.from("players").delete().eq("id", currentUser.id);
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

async function loadChatHistory() {
  if (!supabaseClient) return;

  const { data, error } = await supabaseClient
    .from("messages")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(15);

  if (error) {
    console.error("Error loading chat history:", error);
    return;
  }

  chatMessagesList.innerHTML = "";
  if (data) {
    data.reverse().forEach(msg => appendChatMessage(msg.username, msg.text));
  }
}

if (supabaseClient) {
  loadChatHistory();

  supabaseClient
    .channel("public:messages")
    .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages" }, (payload) => {
      const newMsg = payload.new;
      appendChatMessage(newMsg.username, newMsg.text);
    })
    .subscribe();
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
    updateMyPositionInDB(true);

    if (supabaseClient) {
      const { error } = await supabaseClient
        .from("messages")
        .insert([{ username: username, text: text }]);

      if (error) console.error("Error sending message to Supabase:", error);
    }

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
// 6. 8-BIT GAME ENGINE & CANVAS RENDERING
// ==========================================
const gameDetailsContainer = document.getElementById("game-details-container");
const gameCanvasContainer = document.getElementById("game-canvas-container");
const startPlayBtn = document.getElementById("start-play-btn");
const exitGameBtn = document.getElementById("exit-game-btn");
const resumeBtn = document.getElementById("resume-btn");
const pauseMenu = document.getElementById("pause-menu");

const canvas = document.getElementById("game-canvas");
const ctx = canvas ? canvas.getContext("2d") : null;

// Character Sprites
const idle1Sprite = new Image();
idle1Sprite.crossOrigin = "anonymous";
idle1Sprite.src = "https://i.imgur.com/GynwpQb.png";

const idle2Sprite = new Image();
idle2Sprite.crossOrigin = "anonymous";
idle2Sprite.src = "https://i.imgur.com/2tmFG15.png";

const walk1Sprite = new Image();
walk1Sprite.crossOrigin = "anonymous";
walk1Sprite.src = "https://i.imgur.com/HdoZEFA.png";

const walk2Sprite = new Image();
walk2Sprite.crossOrigin = "anonymous";
walk2Sprite.src = "https://i.imgur.com/0K6RSYe.png";

let animTimer = 0;
let walkFrame = 1;
let idleFrame = 1;
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
    enterGamePresence();
    resetPlayer();
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
    updateMyPositionInDB();
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

  // Animation Toggle
  animTimer++;
  const isMoving = keys.a || keys.d || keys.ArrowLeft || keys.ArrowRight;
  let activeSprite;

  if (isMoving) {
    if (animTimer % 8 === 0) walkFrame = (walkFrame === 1) ? 2 : 1;
    activeSprite = (walkFrame === 1) ? walk1Sprite : walk2Sprite;
  } else {
    if (animTimer % 30 === 0) idleFrame = (idleFrame === 1) ? 2 : 1;
    activeSprite = (idleFrame === 1) ? idle1Sprite : idle2Sprite;
  }

  // Draw Other Online Players
  const now = Date.now();
  Object.keys(otherPlayers).forEach(id => {
    if (currentUser && id === currentUser.id) return;
    const p = otherPlayers[id];
    drawCharacter(p.x, p.y, p.username, activeSprite, true, p.numericId);

    if (p.lastMsg && !IGNORED_KEYS.includes(p.lastMsg) && now - p.msgTimestamp < 4000) {
      drawSpeechBubble(p.x + 30, p.y - 10, p.lastMsg);
    }
  });

  // Draw Current Player
  const myName = currentUser ? (currentUser.user_metadata?.display_name || currentUser.email.split("@")[0]) : "You";
  drawCharacter(player.x, player.y, myName, activeSprite, facingRight, currentNumericId);

  if (myLastMessage && !IGNORED_KEYS.includes(myLastMessage) && now - myMessageTime < 4000) {
    drawSpeechBubble(player.x + 30, player.y - 10, myLastMessage);
  }
}

function drawCharacter(px, py, username, spriteImg, isFacingRight = true, numericId = null) {
  if (!ctx) return;
  
  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 14px monospace";
  ctx.textAlign = "center";
  
  const label = numericId ? `${username} (#${numericId})` : username;
  ctx.fillText(label, px + 30, py - 10);

  ctx.save();

  if (!isFacingRight) {
    ctx.translate(px + player.width, py);
    ctx.scale(-1, 1);
    if (spriteImg.complete && spriteImg.naturalWidth !== 0) {
      ctx.drawImage(spriteImg, 0, 0, player.width, player.height);
    }
  } else {
    if (spriteImg.complete && spriteImg.naturalWidth !== 0) {
      ctx.drawImage(spriteImg, px, py, player.width, player.height);
    }
  }

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
