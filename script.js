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
const genderInput = document.getElementById("auth-gender");
const emailInput = document.getElementById("auth-email");
const passwordInput = document.getElementById("auth-password");
const errorMsg = document.getElementById("auth-error");

const usernameDisplay = document.getElementById("username");
const playerIdDisplay = document.getElementById("player-id-display");
const gameCreatorDisplay = document.getElementById("game-creator");
const friendsBox = document.getElementById("friends-box");
const logoutBtn = document.getElementById("logout-btn");

let isSignUp = true; 
let currentUser = null;
let currentNumericId = null;
let currentUserGender = "boy"; 

const ORIGINAL_GAME_CREATOR = "898"; 

if (toggleAuthMode) {
  toggleAuthMode.addEventListener("click", () => {
    isSignUp = !isSignUp;
    if (isSignUp) {
      authTitle.textContent = "Sign Up";
      authBtn.textContent = "Sign Up";
      if (usernameInput) usernameInput.style.display = "block";
      if (genderInput) genderInput.style.display = "block";
      toggleAuthMode.textContent = "Log In";
    } else {
      authTitle.textContent = "Log In";
      authBtn.textContent = "Log In";
      if (usernameInput) usernameInput.style.display = "none";
      if (genderInput) genderInput.style.display = "none";
      toggleAuthMode.textContent = "Sign Up";
    }
    errorMsg.textContent = "";
  });
}

async function syncUserProfile(user, selectedGender = "boy") {
  if (!user || !supabaseClient) return;

  const displayName = user.user_metadata?.display_name || user.email.split("@")[0];
  const userGender = user.user_metadata?.gender || selectedGender;
  currentUserGender = userGender;

  try {
    let { data, error } = await supabaseClient
      .from("players")
      .select("player_id, username, gender")
      .eq("id", user.id)
      .maybeSingle();

    if (!data) {
      const insertResult = await supabaseClient
        .from("players")
        .upsert({
          id: user.id,
          username: displayName,
          gender: userGender,
          last_seen: new Date().toISOString()
        }, { onConflict: 'id' })
        .select("player_id, username, gender")
        .single();

      data = insertResult.data;
      error = insertResult.error;
    }

    if (data) {
      if (data.player_id) {
        currentNumericId = data.player_id;
        if (playerIdDisplay) playerIdDisplay.textContent = currentNumericId;
      }
      if (data.gender) currentUserGender = data.gender;
    }
  } catch (err) {
    console.error("Profile Sync Error:", err);
  }
}

if (authBtn) {
  authBtn.addEventListener("click", async (e) => {
    e.preventDefault();
    const email = emailInput ? emailInput.value.trim() : "";
    const password = passwordInput ? passwordInput.value.trim() : "";
    const username = usernameInput ? usernameInput.value.trim() : "";
    const gender = genderInput ? genderInput.value : "boy";

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
          options: { 
            data: { 
              display_name: username,
              gender: gender 
            } 
          }
        });

        if (error) throw error;
        currentUser = data.user;
        if (currentUser) {
          if (usernameDisplay) usernameDisplay.textContent = username;
          if (gameCreatorDisplay) gameCreatorDisplay.textContent = `@${ORIGINAL_GAME_CREATOR}`;
          await syncUserProfile(currentUser, gender);
          if (authScreen) authScreen.classList.add("hidden");
          initRealtime();
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
          if (usernameDisplay) usernameDisplay.textContent = name;
          if (gameCreatorDisplay) gameCreatorDisplay.textContent = `@${ORIGINAL_GAME_CREATOR}`;
          await syncUserProfile(currentUser);
          if (authScreen) authScreen.classList.add("hidden");
          initRealtime();
        }
      }
    } catch (error) {
      console.error("Auth Error:", error);
      errorMsg.textContent = error.message;
    }
  });
}

// LOGOUT LOGIC
if (logoutBtn) {
  logoutBtn.addEventListener("click", async () => {
    try {
      if (isGamePlaying) {
        stopGame();
      } else {
        leaveGamePresence();
      }

      if (supabaseClient) {
        await supabaseClient.auth.signOut();
      }

      currentUser = null;
      currentNumericId = null;
      otherPlayers = {};

      if (usernameDisplay) usernameDisplay.textContent = "";
      if (playerIdDisplay) playerIdDisplay.textContent = "--";
      if (emailInput) emailInput.value = "";
      if (passwordInput) passwordInput.value = "";
      if (usernameInput) usernameInput.value = "";

      if (gamePageView) gamePageView.classList.add("hidden");
      if (dashboardView) dashboardView.classList.remove("hidden");
      if (authScreen) authScreen.classList.remove("hidden");

      renderFriends([]);
      updatePlayerCounts();
    } catch (err) {
      console.error("Logout Error:", err);
    }
  });
}

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
      if (authScreen) authScreen.classList.add("hidden");
      const currentUsername = currentUser.user_metadata?.display_name || currentUser.email.split("@")[0];
      if (usernameDisplay) usernameDisplay.textContent = currentUsername;

      if (gameCreatorDisplay) {
        gameCreatorDisplay.textContent = `@${ORIGINAL_GAME_CREATOR}`;
      }
      await syncUserProfile(currentUser);
      renderFriends([]);
      initRealtime();
    } else {
      currentUser = null;
      if (authScreen) authScreen.classList.remove("hidden");
    }
  });
}


// ==========================================
// 3. FRIEND SEARCH LOGIC
// ==========================================
const friendSearchInput = document.getElementById("search-person-input");
const friendSearchBtn = document.getElementById("search-person-btn");
const searchDropdown = document.getElementById("search-results-dropdown");

if (friendSearchBtn) {
  friendSearchBtn.addEventListener("click", async () => {
    let query = friendSearchInput ? friendSearchInput.value.trim() : "";
    if (!query || !supabaseClient) return;

    query = query.replace("#", "");

    try {
      let dbQuery = supabaseClient
        .from("players")
        .select("id, player_id, username");

      if (!isNaN(query) && query !== "") {
        dbQuery = dbQuery.eq("player_id", parseInt(query, 10));
      } else {
        dbQuery = dbQuery.ilike("username", `%${query}%`);
      }

      const { data, error } = await dbQuery;

      if (error) throw error;

      renderSearchResults(data || []);
    } catch (err) {
      console.error("Search Error:", err);
    }
  });
}

function renderSearchResults(results) {
  if (!searchDropdown) return;

  searchDropdown.innerHTML = "";
  searchDropdown.classList.remove("hidden");

  const validResults = results.filter(p => !currentUser || p.id !== currentUser.id);

  if (validResults.length === 0) {
    searchDropdown.innerHTML = `<div style="padding: 10px; color: #888; font-style: italic;">No players found</div>`;
    return;
  }

  validResults.forEach(player => {
    const item = document.createElement("div");
    item.className = "search-result-item";
    item.style.display = "flex";
    item.style.justifyContent = "space-between";
    item.style.alignItems = "center";
    item.style.padding = "8px 12px";

    item.innerHTML = `
      <span>${player.username} (#${player.player_id || 'N/A'})</span>
      <button class="add-friend-btn" style="padding: 2px 8px; cursor: pointer; border-radius: 4px; border: none; background: #00ffcc; color: #000; font-weight: bold;">Add</button>
    `;

    const addBtn = item.querySelector(".add-friend-btn");
    addBtn.addEventListener("click", () => {
      addBtn.textContent = "Added!";
      addBtn.style.background = "#666";
      addBtn.style.color = "#fff";
      addBtn.disabled = true;
    });

    searchDropdown.appendChild(item);
  });
}


// ==========================================
// 4. GLOBAL VISIT COUNTER (SUPABASE)
// ==========================================
const visitCountEl = document.getElementById("visit-count");

async function fetchGlobalVisits() {
  if (!supabaseClient) return;
  try {
    const { data, error } = await supabaseClient
      .from("games")
      .select("visits")
      .eq("id", "main_game")
      .single();

    if (error) throw error;

    if (data && visitCountEl) {
      visitCountEl.textContent = data.visits;
    }
  } catch (err) {
    console.error("Error fetching visits:", err);
  }
}

async function incrementGlobalVisits() {
  if (!supabaseClient) return;
  try {
    const { data } = await supabaseClient
      .from("games")
      .select("visits")
      .eq("id", "main_game")
      .single();

    const currentVisits = data ? data.visits : 0;
    const newVisits = currentVisits + 1;

    await supabaseClient
      .from("games")
      .update({ visits: newVisits })
      .eq("id", "main_game");

    if (visitCountEl) visitCountEl.textContent = newVisits;
  } catch (err) {
    console.error("Error updating visits:", err);
  }
}

fetchGlobalVisits();


// ==========================================
// 5. MULTIPLAYER WEBSOCKET BROADCAST SYSTEM
// ==========================================
const playingCountEl = document.getElementById("playing-count");
const dashboardPeopleCountEl = document.getElementById("dashboard-people-count");

let otherPlayers = {};
let gameChannel = null;
let heartbeatInterval = null;

function initRealtime() {
  if (!supabaseClient) return;

  if (gameChannel) {
    supabaseClient.removeChannel(gameChannel);
  }

  gameChannel = supabaseClient.channel('nova-game-room');

  gameChannel
    .on('broadcast', { event: 'player-move' }, (payload) => {
      const p = payload.payload;
      if (currentUser && p.id === currentUser.id) return;

      otherPlayers[p.id] = {
        username: p.username,
        numericId: p.numericId,
        gender: p.gender || "boy",
        x: p.x,
        y: p.y,
        facingRight: p.facingRight,
        isMoving: p.isMoving,
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
      if (status === 'SUBSCRIBED') {
        const isLocalMoving = keys.a || keys.d || keys.ArrowLeft || keys.ArrowRight;
        broadcastMyPosition(isLocalMoving);
      }
    });

  if (heartbeatInterval) clearInterval(heartbeatInterval);

  heartbeatInterval = setInterval(() => {
    if (isGamePlaying && !isPaused) {
      const isLocalMoving = keys.a || keys.d || keys.ArrowLeft || keys.ArrowRight;
      broadcastMyPosition(isLocalMoving);
    }
  }, 100);
}

function updatePlayerCounts() {
  const activeCount = isGamePlaying ? (Object.keys(otherPlayers).length + 1) : Object.keys(otherPlayers).length;
  if (playingCountEl) playingCountEl.textContent = activeCount;
  if (dashboardPeopleCountEl) dashboardPeopleCountEl.textContent = activeCount;
}

function broadcastMyPosition(isMoving = false) {
  if (!currentUser || !gameChannel) return;

  const myName = currentUser.user_metadata?.display_name || currentUser.email.split("@")[0];

  gameChannel.send({
    type: 'broadcast',
    event: 'player-move',
    payload: {
      id: currentUser.id,
      username: myName,
      numericId: currentNumericId,
      gender: currentUserGender,
      x: Math.round(player.x),
      y: Math.round(player.y),
      facingRight: facingRight,
      isMoving: isMoving,
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
// 6. IN-GAME MULTIPLAYER CHAT LOGIC
// ==========================================
const chatForm = document.getElementById("chat-form");
const chatInput = document.getElementById("chat-input");

let myLastMessage = "";
let myMessageTime = 0;
const IGNORED_KEYS = ["w", "a", "s", "d", "W", "A", "S", "D"];

if (chatForm) {
  chatForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const text = chatInput.value.trim();

    if (!text || !currentUser || IGNORED_KEYS.includes(text)) {
      chatInput.value = "";
      chatInput.blur();
      return;
    }

    myLastMessage = text;
    myMessageTime = Date.now();
    
    const isLocalMoving = keys.a || keys.d || keys.ArrowLeft || keys.ArrowRight;
    broadcastMyPosition(isLocalMoving);

    chatInput.value = "";
    chatInput.blur();
  });
}


// ==========================================
// 7. PAGE NAVIGATION LOGIC
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
// 8. GAME ENGINE & CANVAS RENDERING
// ==========================================
const gameDetailsContainer = document.getElementById("game-details-container");
const gameCanvasContainer = document.getElementById("game-canvas-container");
const startPlayBtn = document.getElementById("start-play-btn");
const exitGameBtn = document.getElementById("exit-game-btn");
const resumeBtn = document.getElementById("resume-btn");
const pauseMenu = document.getElementById("pause-menu");

const canvas = document.getElementById("game-canvas");
const ctx = canvas ? canvas.getContext("2d") : null;

function createGameImage(src) {
  const img = new Image();
  img.crossOrigin = "anonymous";
  img.referrerPolicy = "no-referrer";
  img.src = src;
  return img;
}

// MALE SPRITES
const maleIdle1 = createGameImage("https://i.imgur.com/GynwpQb.png");
const maleIdle2 = createGameImage("https://i.imgur.com/2tmFG15.png");
const maleWalk1 = createGameImage("https://i.imgur.com/HdoZEFA.png");
const maleWalk2 = createGameImage("https://i.imgur.com/0K6RSYe.png");

// FEMALE SPRITES
const femaleIdle1 = createGameImage("https://i.imgur.com/Q4Yyzz0.png");
const femaleIdle2 = createGameImage("https://i.imgur.com/zuFvwky.png");
const femaleWalk1 = createGameImage("https://i.imgur.com/eHyNVgJ.png");
const femaleWalk2 = createGameImage("https://i.imgur.com/gdFqVVX.png");

let globalAnimTimer = 0;
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
  startPlayBtn.addEventListener("click", async () => {
    if (gameDetailsContainer) gameDetailsContainer.classList.add("hidden");
    if (gameCanvasContainer) gameCanvasContainer.classList.remove("hidden");
    resizeCanvas();
    isGamePlaying = true;
    isPaused = false;

    await incrementGlobalVisits();
    updatePlayerCounts();

    myLastMessage = "";
    myMessageTime = 0;
    if (chatInput) {
      chatInput.value = "";
      chatInput.blur();
    }
    resetKeys();

    if (pauseMenu) pauseMenu.classList.add("hidden");
    resetPlayer();
    broadcastMyPosition(false);
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
  if (heartbeatInterval) clearInterval(heartbeatInterval);
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
}

function getSpriteForPlayer(isMoving, gender = "boy") {
  const isGirl = (gender.toLowerCase() === "female" || gender.toLowerCase() === "girl");
  
  const idle1 = isGirl ? femaleIdle1 : maleIdle1;
  const idle2 = isGirl ? femaleIdle2 : maleIdle2;
  const walk1 = isGirl ? femaleWalk1 : maleWalk1;
  const walk2 = isGirl ? femaleWalk2 : maleWalk2;

  if (isMoving) {
    const walkFrame = Math.floor(globalAnimTimer / 8) % 2;
    return walkFrame === 0 ? walk1 : walk2;
  } else {
    const idleFrame = Math.floor(globalAnimTimer / 30) % 2;
    return idleFrame === 0 ? idle1 : idle2;
  }
}

function drawGame() {
  if (!ctx || !canvas) return;

  globalAnimTimer++;

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

  const now = Date.now();

  // Draw Other Connected Players
  Object.keys(otherPlayers).forEach(id => {
    if (currentUser && id === currentUser.id) return;
    const p = otherPlayers[id];
    const remoteSprite = getSpriteForPlayer(p.isMoving, p.gender);

    drawCharacter(p.x, p.y, p.username, remoteSprite, p.facingRight ?? true, p.numericId, p.gender);

    if (p.lastMsg && !IGNORED_KEYS.includes(p.lastMsg) && now - p.msgTimestamp < 4000) {
      drawSpeechBubble(p.x + 30, p.y - 10, p.lastMsg);
    }
  });

  // Draw Main Local Player
  const isLocalMoving = keys.a || keys.d || keys.ArrowLeft || keys.ArrowRight;
  const localSprite = getSpriteForPlayer(isLocalMoving, currentUserGender);
  const myName = currentUser ? (currentUser.user_metadata?.display_name || currentUser.email.split("@")[0]) : "You";

  drawCharacter(player.x, player.y, myName, localSprite, facingRight, currentNumericId, currentUserGender);

  if (myLastMessage && !IGNORED_KEYS.includes(myLastMessage) && now - myMessageTime < 4000) {
    drawSpeechBubble(player.x + 30, player.y - 10, myLastMessage);
  }
}

function drawCharacter(px, py, username, spriteImg, isFacingRight = true, numericId = null, gender = "boy") {
  if (!ctx) return;
  
  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 14px monospace";
  ctx.textAlign = "center";
  
  const label = numericId ? `${username} (#${numericId})` : username;
  ctx.fillText(label, px + 30, py - 10);

  ctx.save();

  if (spriteImg && spriteImg.complete && spriteImg.naturalWidth !== 0) {
    if (!isFacingRight) {
      ctx.translate(px + player.width, py);
      ctx.scale(-1, 1);
      ctx.drawImage(spriteImg, 0, 0, player.width, player.height);
    } else {
      ctx.drawImage(spriteImg, px, py, player.width, player.height);
    }
  } else {
    const isGirl = (gender.toLowerCase() === "female" || gender.toLowerCase() === "girl");
    ctx.fillStyle = isGirl ? "#ff78ae" : "#2ed573";
    ctx.fillRect(px, py, player.width, player.height);
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
  const by = topY - bubbleHeight - 15;

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
