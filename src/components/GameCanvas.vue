<template>
  <div ref="gameContainer" class="game-container"></div>
</template>

<script setup>
import { onMounted, ref } from "vue";
import { createGame } from "../game/game";

const gameContainer = ref(null);

onMounted(() => {
  createGame(gameContainer.value);
});
</script>
