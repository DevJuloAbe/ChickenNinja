<template>
  <main class="app-shell">
    <section class="game-stage">
      <GameCanvas />

      <button
        v-if="isGameOver && !isVerified && !showVerifyModal"
        class="verify-fab"
        type="button"
        @click="showVerifyModal = true"
      >
        Verify Mobile
      </button>

      <aside class="leaderboard-panel desktop-leaderboard">
        <h2>Top Ninjas</h2>
        <ol>
          <li v-for="(player, index) in leaderboard" :key="player.id || index">
            <span class="rank">#{{ index + 1 }}</span>
            <span>{{ player.nickname || player.name || player.phone || player.mobile || "Ninja" }}</span>
            <strong>{{ player.points || player.score || player.total_points || 0 }}</strong>
          </li>
        </ol>
      </aside>
    </section>

    <aside class="game-list-panel">
      <h2>Games</h2>
      <a
        v-for="game in otherGames"
        :key="game.id"
        class="game-card"
        :class="{ disabled: !game.game_url }"
        :href="game.game_url || undefined"
      >
        <img :src="game.image_url" :alt="game.name" />
        <span>{{ game.name }}</span>
      </a>
    </aside>

    <aside class="leaderboard-panel mobile-leaderboard">
      <h2>Top Ninjas</h2>
      <ol>
        <li v-for="(player, index) in leaderboard" :key="player.id || index">
          <span class="rank">#{{ index + 1 }}</span>
          <span>{{ player.nickname || player.name || player.phone || player.mobile || "Ninja" }}</span>
          <strong>{{ player.points || player.score || player.total_points || 0 }}</strong>
        </li>
      </ol>
    </aside>

    <div v-if="showVerifyModal && !isVerified" class="modal-backdrop">
      <form class="verify-modal" @submit.prevent="submitPhone">
        <button class="modal-close" type="button" @click="showVerifyModal = false">x</button>
        <h2>Mobile Verification</h2>
        <p>Enter your nickname and Philippine mobile number without +63.</p>
        <label class="nickname-field">
          <span>Name</span>
          <input
            v-model.trim="nickname"
            maxlength="24"
            placeholder="Chicken Ninja"
          />
        </label>
        <small v-if="nicknameError">{{ nicknameError }}</small>
        <label class="phone-field">
          <span>+63</span>
          <input
            v-model.trim="phone"
            inputmode="numeric"
            maxlength="10"
            placeholder="9XXXXXXXXX"
          />
        </label>
        <small v-if="phoneError">{{ phoneError }}</small>
        <button class="submit-button" type="submit" :disabled="isSubmitting">
          {{ isSubmitting ? "Verifying..." : "Verify" }}
        </button>
      </form>
    </div>
  </main>
</template>

<script setup>
import { computed, onMounted, onUnmounted, ref } from "vue";
import GameCanvas from "./components/GameCanvas.vue";

const GAMES_ENDPOINT = "https://docking-635955947416.asia-east1.run.app/api/games/";
const VERIFY_PHONE_ENDPOINT = "https://docking-635955947416.asia-east1.run.app/api/auth/game-login";
const LEADERBOARD_ENDPOINT = "https://docking-635955947416.asia-east1.run.app/api/usermobile/masked/topscorer";
const GAME_SECRET_KEY = "9ae58c2c2e2a24fb49dba86f27a6ec4a";
const CURRENT_GAME_SLUG = "chicken-ninja";

const games = ref([]);

function getGameSecretKey() {
  return currentGame.value?.game_secret_key
    || currentGame.value?.secret_key
    || currentGame.value?.gamesecretkey
    || currentGame.value?.gameSecretKey
    || currentGame.value?.secretKey
    || GAME_SECRET_KEY;
}
const currentGame = ref(null);
const leaderboard = ref([]);
const score = ref(0);
const nickname = ref("");
const phone = ref("");
const nicknameError = ref("");
const phoneError = ref("");
const showVerifyModal = ref(false);
const isGameOver = ref(false);
const isVerified = ref(false);
const isSubmitting = ref(false);

const otherGames = computed(() => {
  return games.value.filter((game) => game.game_id !== currentGame.value?.game_id);
});

function normalizeLeaderboard(payload) {
  const data = payload?.data || payload;
  const scores = data?.top_scorers || data?.scores || data?.leaderboard || data?.users || data;
  return Array.isArray(scores) ? scores.slice(0, 3) : [];
}

function verificationStorageKey() {
  return currentGame.value?.game_id ? `chickenNinjaVerifiedPhone:${currentGame.value.game_id}` : "";
}

function syncVerificationState() {
  const key = verificationStorageKey();
  const verifiedPhone = key ? localStorage.getItem(key) : "";
  const savedNickname = key ? localStorage.getItem(`${key}:nickname`) : "";
  if (savedNickname) nickname.value = savedNickname;
  isVerified.value = Boolean(verifiedPhone);
  showVerifyModal.value = false;
}

async function loadGames() {
  const response = await fetch(GAMES_ENDPOINT);
  const payload = await response.json();
  games.value = payload?.data?.games || [];
  currentGame.value = games.value.find((game) => game.slug === CURRENT_GAME_SLUG)
    || games.value.find((game) => game.name?.toLowerCase() === "chicken ninja")
    || games.value.find((game) => game.name?.toLowerCase() === "tek hen")
    || games.value[0]
    || null;
}

async function loadLeaderboard() {
  if (!currentGame.value?.game_id) return;

  const response = await fetch(`${LEADERBOARD_ENDPOINT}?game_id=${currentGame.value.game_id}`);
  const payload = await response.json();
  leaderboard.value = normalizeLeaderboard(payload);
}

function validatePhone() {
  if (nickname.value.length < 2) {
    nicknameError.value = "Nickname must be at least 2 characters.";
    return false;
  }

  nicknameError.value = "";

  if (!/^9\d{9}$/.test(phone.value)) {
    phoneError.value = "Use a valid PH number: 10 digits starting with 9.";
    return false;
  }

  phoneError.value = "";
  return true;
}

async function submitPhone() {
  if (!validatePhone() || !currentGame.value) return;

  if (!currentGame.value.game_id) {
    phoneError.value = "Verification failed: game_id is missing.";
    return;
  }

  isSubmitting.value = true;
  phoneError.value = "";

  const payload = {
    game_id: currentGame.value.game_id,
    nickname: nickname.value,
    game_secret_key: getGameSecretKey(),
    phone: phone.value,
    game_icon_path: currentGame.value.image_url,
    points: String(score.value),
    is_verified: 1,
  };

  try {
    const response = await fetch(VERIFY_PHONE_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await response.json().catch(() => ({}));

    if (response.status === 404) {
      phoneError.value = "Verification endpoint not found (404).";
      return;
    }

    if (!response.ok || data?.success === false) {
      phoneError.value = data?.message || "This number could not be verified.";
      return;
    }

    const key = verificationStorageKey();
    if (key) localStorage.setItem(key, phone.value);
    if (key) localStorage.setItem(`${key}:nickname`, nickname.value);
    isVerified.value = true;
    showVerifyModal.value = false;
  } catch (error) {
    console.error("Verification request failed", error);
    phoneError.value = "Verification failed. Please try again.";
  } finally {
    isSubmitting.value = false;
  }
}

function handleScore(event) {
  score.value = event.detail?.score || 0;
}

function handleGameOver(event) {
  score.value = event.detail?.score ?? score.value;
  isGameOver.value = true;

  if (!isVerified.value) {
    showVerifyModal.value = true;
  }
}

onMounted(async () => {
  window.addEventListener("chicken-ninja-score", handleScore);
  window.addEventListener("chicken-ninja-game-over", handleGameOver);

  try {
    await loadGames();
    syncVerificationState();
    await loadLeaderboard();
  } catch {
    games.value = [];
    leaderboard.value = [];
  }
});

onUnmounted(() => {
  window.removeEventListener("chicken-ninja-score", handleScore);
  window.removeEventListener("chicken-ninja-game-over", handleGameOver);
});
</script>
