export class CallAudioEffects {
  private ctx: AudioContext | null = null;
  private oscillators: { osc: OscillatorNode; gain: GainNode }[] = [];
  private intervalId: any = null;

  private initCtx() {
    if (!this.ctx) {
      // @ts-ignore
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  // Dial Tone: Outgoing Ring (440Hz + 480Hz) playing 2s ON, 4s OFF
  public playDialTone() {
    this.stop();
    this.initCtx();
    if (!this.ctx) return;

    const playPulse = () => {
      if (!this.ctx) return;
      const osc1 = this.ctx.createOscillator();
      const osc2 = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc1.frequency.value = 440;
      osc2.frequency.value = 480;

      // Soft volume
      gain.gain.setValueAtTime(0, this.ctx.currentTime);
      gain.gain.linearRampToValueAtTime(0.12, this.ctx.currentTime + 0.1);
      gain.gain.setValueAtTime(0.12, this.ctx.currentTime + 1.9);
      gain.gain.linearRampToValueAtTime(0, this.ctx.currentTime + 2.0);

      osc1.connect(gain);
      osc2.connect(gain);
      gain.connect(this.ctx.destination);

      osc1.start();
      osc2.start();

      const item1 = { osc: osc1, gain };
      const item2 = { osc: osc2, gain };
      this.oscillators.push(item1, item2);

      // Clean up after 2 seconds
      setTimeout(() => {
        try {
          osc1.stop();
          osc2.stop();
          osc1.disconnect();
          osc2.disconnect();
          gain.disconnect();
        } catch (e) {}
        this.oscillators = this.oscillators.filter(o => o.osc !== osc1 && o.osc !== osc2);
      }, 2100);
    };

    playPulse();
    this.intervalId = setInterval(playPulse, 6000);
  }

  // Ring Tone: Incoming Ring (warbling/modulated 400Hz + 450Hz) playing 2s ON, 4s OFF
  public playRingTone() {
    this.stop();
    this.initCtx();
    if (!this.ctx) return;

    const playPulse = () => {
      if (!this.ctx) return;
      const osc1 = this.ctx.createOscillator();
      const osc2 = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      // Low frequency modulation (warbling sound)
      osc1.frequency.value = 400;
      osc2.frequency.value = 450;

      // Pulse volume (2s on, 4s off)
      gain.gain.setValueAtTime(0, this.ctx.currentTime);
      gain.gain.linearRampToValueAtTime(0.2, this.ctx.currentTime + 0.05);
      
      // Tremolo/modulation effect using Gain scheduling
      for (let t = 0.1; t < 2.0; t += 0.25) {
        gain.gain.setValueAtTime(0.2, this.ctx.currentTime + t);
        gain.gain.linearRampToValueAtTime(0.05, this.ctx.currentTime + t + 0.12);
        gain.gain.linearRampToValueAtTime(0.2, this.ctx.currentTime + t + 0.25);
      }

      gain.gain.setValueAtTime(0.2, this.ctx.currentTime + 1.95);
      gain.gain.linearRampToValueAtTime(0, this.ctx.currentTime + 2.0);

      osc1.connect(gain);
      osc2.connect(gain);
      gain.connect(this.ctx.destination);

      osc1.start();
      osc2.start();

      const item1 = { osc: osc1, gain };
      const item2 = { osc: osc2, gain };
      this.oscillators.push(item1, item2);

      // Clean up after 2 seconds
      setTimeout(() => {
        try {
          osc1.stop();
          osc2.stop();
          osc1.disconnect();
          osc2.disconnect();
          gain.disconnect();
        } catch (e) {}
        this.oscillators = this.oscillators.filter(o => o.osc !== osc1 && o.osc !== osc2);
      }, 2100);
    };

    playPulse();
    this.intervalId = setInterval(playPulse, 6000);
  }

  public stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    this.oscillators.forEach(({ osc, gain }) => {
      try {
        osc.stop();
        osc.disconnect();
        gain.disconnect();
      } catch (e) {}
    });
    this.oscillators = [];
  }
}
