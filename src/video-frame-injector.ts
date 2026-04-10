/**
 * Injects video frames into butterchurn's sampler_noise_lq texture (256×256)
 * and prevTexture (sampler_pc_main feedback buffer).
 *
 * Two independent toggles — mutually exclusive:
 *   toggleFile()   — V key: stop camera if running, then toggle file picker
 *   toggleCamera() — K key: stop file if running, then toggle camera
 */

export type VideoSource = "off" | "camera" | "file";

export class VideoFrameInjector {
  private readonly video: HTMLVideoElement;
  /** 256×256 canvas for sampler_noise_lq uploads. */
  private readonly offscreen: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  /** Framebuffer-sized canvas for prevTexture uploads — resized on demand. */
  private readonly fbCanvas: HTMLCanvasElement;
  private readonly fbCtx: CanvasRenderingContext2D;
  private source: VideoSource = "off";
  private stream: MediaStream | null = null;

  constructor() {
    this.video = document.createElement("video");
    this.video.loop = true;
    this.video.muted = true;
    this.video.playsInline = true;
    this.video.style.display = "none";
    document.body.appendChild(this.video);

    this.offscreen = document.createElement("canvas");
    this.offscreen.width = 256;
    this.offscreen.height = 256;
    this.ctx = this.offscreen.getContext("2d")!;

    this.fbCanvas = document.createElement("canvas");
    this.fbCanvas.width = 1;
    this.fbCanvas.height = 1;
    this.fbCtx = this.fbCanvas.getContext("2d")!;
  }

  private stop(): void {
    this.video.pause();
    this.video.srcObject = null;
    this.video.src = "";
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    this.source = "off";
  }

  private async startCamera(): Promise<void> {
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      this.video.srcObject = this.stream;
      await this.video.play();
      this.source = "camera";
      console.log("[video] camera started");
    } catch (err) {
      console.error("[video] camera error:", err);
      this.source = "off";
    }
  }

  private openFilePicker(): void {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "video/*";
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) {
        this.source = "off";
        return;
      }
      this.video.srcObject = null;
      this.video.src = URL.createObjectURL(file);
      this.video
        .play()
        .then(() => {
          this.source = "file";
          console.log("[video] file loaded:", file.name);
        })
        .catch((err) => {
          console.error("[video] file play error:", err);
          this.source = "off";
        });
    };
    input.click();
  }

  /** V key — toggle file video. Stops camera first if it was running. */
  toggleFile(): void {
    if (this.source === "file") {
      this.stop();
      console.log("[video] file off");
    } else {
      if (this.source === "camera") this.stop();
      this.openFilePicker();
    }
  }

  /** K key — toggle camera. Stops file first if it was running. */
  toggleCamera(): void {
    if (this.source === "camera") {
      this.stop();
      console.log("[video] camera off");
    } else {
      if (this.source === "file") this.stop();
      this.startCamera();
    }
  }

  isActive(): boolean {
    return this.source !== "off";
  }

  getSource(): VideoSource {
    return this.source;
  }

  /**
   * Draw current video frame into butterchurn's noiseTexLQ texture (256×256).
   * Must be called before visualizer.render() each frame.
   */
  injectFrame(gl: WebGL2RenderingContext, noiseTexLQ: WebGLTexture): void {
    if (this.source === "off" || this.video.readyState < 2) return;
    this.ctx.drawImage(this.video, 0, 0, 256, 256);
    gl.bindTexture(gl.TEXTURE_2D, noiseTexLQ);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, this.offscreen);
    gl.generateMipmap(gl.TEXTURE_2D);
    gl.bindTexture(gl.TEXTURE_2D, null);
  }

  /**
   * Draw current video frame into butterchurn's targetTexture.
   *
   * Why targetTexture, not prevTexture? butterchurn swaps prevTexture↔targetTexture
   * at the START of render(). So what is targetTexture NOW (before render) becomes
   * prevTexture (sampler_pc_main, the actual read input) after the swap. Injecting
   * into prevTexture would just land in the write target and get overwritten.
   *
   * Uses texSubImage2D (in-place update) — targetTexture has a permanent FBO
   * attachment; texImage2D would reallocate storage and invalidate it.
   */
  injectToFeedback(gl: WebGL2RenderingContext, targetTexture: WebGLTexture): void {
    if (this.source === "off" || this.video.readyState < 2) return;
    const w = (gl.canvas as HTMLCanvasElement).width;
    const h = (gl.canvas as HTMLCanvasElement).height;
    if (this.fbCanvas.width !== w || this.fbCanvas.height !== h) {
      this.fbCanvas.width = w;
      this.fbCanvas.height = h;
    }
    this.fbCtx.drawImage(this.video, 0, 0, w, h);
    gl.bindTexture(gl.TEXTURE_2D, targetTexture);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, gl.RGBA, gl.UNSIGNED_BYTE, this.fbCanvas);
    gl.bindTexture(gl.TEXTURE_2D, null);
  }
}
