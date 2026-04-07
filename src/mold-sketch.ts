import p5 from "p5";
import { Mold } from "./mold";

export const MOLD_COUNT_DEFAULT = 2000;
export const MOLD_COUNT_LOW = 500;

/** p5 mold layer; reads freeze and level via getters so host can toggle without recreating sketch. */
export function createMoldSketch(
  moldContainer: HTMLElement,
  getFreezeMode: () => boolean,
  getAudioLevel: () => number,
  numMolds: number = MOLD_COUNT_DEFAULT,
): p5 {
  return new p5((p: p5) => {
    const molds: Mold[] = [];
    let d: number;

    p.setup = () => {
      const c = p.createCanvas(p.windowWidth, p.windowHeight);
      c.parent(moldContainer);
      p.angleMode(p.DEGREES);
      d = p.pixelDensity();
      for (let i = 0; i < numMolds; i++) molds.push(new Mold(p));
    };

    p.windowResized = () => p.resizeCanvas(p.windowWidth, p.windowHeight);

    p.draw = () => {
      if (!getFreezeMode()) p.background(0, 5);
      p.loadPixels();
      const level = getAudioLevel();
      for (const mold of molds) {
        mold.update(d);
        if (level > 0.01) mold.heading += p.random(-1, 1) * level * 360;
        mold.display();
      }
    };
  });
}
