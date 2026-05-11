import Phaser from "phaser";
import MainScene from "./mainScene";

export function createGame(parent) {
  return new Phaser.Game({
    type: Phaser.AUTO,
    width: 800,
    height: 600,
    parent: parent,
    physics: {
      default: "arcade",
      arcade: {
        gravity: { y: 500 },
        debug: false,
      },
    },
    scene: [MainScene],
  });
}