<template>
  <div ref="gameContainer"></div>
</template>

<script setup>
import { onMounted, ref } from "vue";
import { createGame } from "../game/game";

const gameContainer = ref(null);

onMounted(() => {
  createGame(gameContainer.value);
});
</script>