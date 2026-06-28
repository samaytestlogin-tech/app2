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

  // Ring Tone: Incoming Ring - Plays a premium, sweet chime arpeggio
  public playRingTone() {
    this.stop();
    this.initCtx();
    if (!this.ctx) return;

    const playMelody = () => {
      if (!this.ctx) return;
      
      const now = this.ctx.currentTime;
      
      // Chime notes: E5, G5, A5, B5, E6, B5
      const notes = [659.25, 783.99, 880.00, 987.77, 1318.51, 987.77];
      const noteDelay = 0.15; // 150ms between notes
      
      notes.forEach((freq, index) => {
        if (!this.ctx) return;
        
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        
        // Triangle wave for sweet, soft chime/marimba timbre
        osc.type = 'triangle';
        osc.frequency.value = freq;
        
        const startTime = now + (index * noteDelay);
        const duration = 0.4; // 400ms duration per note
        
        // Volume envelope: fast attack, exponential decay for chime sound
        gain.gain.setValueAtTime(0, startTime);
        gain.gain.linearRampToValueAtTime(0.25, startTime + 0.03); // quick rise
        gain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration); // smooth decay
        
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        
        osc.start(startTime);
        osc.stop(startTime + duration);
        
        const item = { osc, gain };
        this.oscillators.push(item);
        
        // Clean up oscillator references later
        setTimeout(() => {
          try {
            osc.disconnect();
            gain.disconnect();
          } catch (e) {}
          this.oscillators = this.oscillators.filter(o => o.osc !== osc);
        }, (index * noteDelay + duration + 0.5) * 1000);
      });
    };

    playMelody();
    // Loop the melody every 1.6 seconds
    this.intervalId = setInterval(playMelody, 1600);
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
