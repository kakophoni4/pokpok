import type { DisplayCue } from "./display-clock";
const NOTES: Record<DisplayCue, number[]> = {
  minute: [523, 659],
  ten: [659, 659, 784],
  level: [523, 659, 784],
  break: [784, 659, 523],
  pause: [392, 330],
  resume: [392, 523, 659],
  complete: [523, 659, 784, 1046],
};
/** Short local chimes, unlocked by an explicit gesture on the TV. */
export class DisplayAudio {
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private nodes = new Set<OscillatorNode>();
  async enable(volume: number) {
    const Audio =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!Audio)
      throw new Error("Этот браузер не поддерживает звуковые сигналы");
    if (!this.context || this.context.state === "closed") {
      this.context = new Audio();
      this.master = this.context.createGain();
      this.master.connect(this.context.destination);
    }
    await this.context.resume();
    if (this.context.state !== "running")
      throw new Error("Не удалось включить звук");
    this.volume(volume);
  }
  volume(value: number) {
    if (this.master && this.context)
      this.master.gain.setValueAtTime(
        Math.max(0, Math.min(1, value)) * 0.3,
        this.context.currentTime,
      );
  }
  get active() {
    return this.context?.state === "running";
  }
  play(cue: DisplayCue) {
    const ctx = this.context,
      master = this.master;
    if (!ctx || !master || ctx.state !== "running") return;
    this.stop();
    NOTES[cue].forEach((frequency, i) => {
      const osc = ctx.createOscillator(),
        envelope = ctx.createGain(),
        start = ctx.currentTime + i * 0.24;
      osc.type = "sine";
      osc.frequency.value = frequency;
      envelope.gain.setValueAtTime(0, start);
      envelope.gain.linearRampToValueAtTime(0.8, start + 0.015);
      envelope.gain.exponentialRampToValueAtTime(0.001, start + 0.5);
      osc.connect(envelope);
      envelope.connect(master);
      this.nodes.add(osc);
      osc.onended = () => {
        osc.disconnect();
        envelope.disconnect();
        this.nodes.delete(osc);
      };
      osc.start(start);
      osc.stop(start + 0.55);
    });
  }
  stop() {
    for (const node of this.nodes) {
      try {
        node.stop();
      } catch {
        /* already ended */
      }
    }
    this.nodes.clear();
  }
  dispose() {
    this.stop();
    if (this.context) void this.context.close();
    this.context = null;
    this.master = null;
  }
}
