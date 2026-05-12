import Phaser from "phaser";
import MainScene from "./mainScene";

export function createGame(parent) {
  return new Phaser.Game({
    type: Phaser.AUTO,
    width: parent?.clientWidth || window.innerWidth,
    height: parent?.clientHeight || window.innerHeight,
    parent: parent,
    backgroundColor: "#0f1720",
    scale: {
      mode: Phaser.Scale.RESIZE,
      autoCenter: Phaser.Scale.CENTER_BOTH,
      width: "100%",
      height: "100%",
    },
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
