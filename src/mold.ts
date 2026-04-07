import p5 from 'p5';

export class Mold {
  x: number;
  y: number;
  color: p5.Color;
  heading: number;
  vx: number;
  vy: number;

  readonly r: number = 0.5;
  readonly rotAngle: number = 45;
  readonly sensorAngle: number = 45;
  readonly sensorDist: number = 10;

  private rSensorPos: p5.Vector;
  private lSensorPos: p5.Vector;
  private fSensorPos: p5.Vector;

  constructor(private p: p5) {
    this.x = p.random(p.width / 2 - 20, p.width / 2 + 20);
    this.y = p.random(p.height / 2 - 20, p.height / 2 + 20);
    this.color = p.color(p.random(255), p.random(255), p.random(255));
    this.heading = p.random(360);
    this.vx = p.cos(this.heading);
    this.vy = p.sin(this.heading);
    this.rSensorPos = p.createVector(0, 0);
    this.lSensorPos = p.createVector(0, 0);
    this.fSensorPos = p.createVector(0, 0);
  }

  update(d: number): void {
    const p = this.p;
    this.vx = p.cos(this.heading);
    this.vy = p.sin(this.heading);

    this.x = (this.x + this.vx + p.width) % p.width;
    this.y = (this.y + this.vy + p.height) % p.height;

    this.getSensorPos(this.rSensorPos, this.heading + this.sensorAngle);
    this.getSensorPos(this.lSensorPos, this.heading - this.sensorAngle);
    this.getSensorPos(this.fSensorPos, this.heading);

    const stride = d * p.width * 4;
    const r = p.pixels[Math.floor(this.rSensorPos.y) * d * stride + Math.floor(this.rSensorPos.x) * d * 4];
    const l = p.pixels[Math.floor(this.lSensorPos.y) * d * stride + Math.floor(this.lSensorPos.x) * d * 4];
    const f = p.pixels[Math.floor(this.fSensorPos.y) * d * stride + Math.floor(this.fSensorPos.x) * d * 4];

    if (f > l && f > r) {
      // keep heading
    } else if (f < l && f < r) {
      this.heading += p.random(1) < 0.5 ? this.rotAngle : -this.rotAngle;
    } else if (l > r) {
      this.heading -= this.rotAngle;
    } else if (r > l) {
      this.heading += this.rotAngle;
    }
  }

  display(): void {
    const p = this.p;
    p.noStroke();
    p.fill(this.color);
    p.ellipse(this.x, this.y, this.r * 2, this.r * 2);
  }

  private getSensorPos(sensor: p5.Vector, angle: number): void {
    const p = this.p;
    sensor.x = (this.x + this.sensorDist * p.cos(angle) + p.width) % p.width;
    sensor.y = (this.y + this.sensorDist * p.sin(angle) + p.height) % p.height;
  }
}
