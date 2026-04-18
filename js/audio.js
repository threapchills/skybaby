/* AUDIO ENGINE - REMASTERED v2
   Sound limiting, gentle reverb send, music ducking, synthetic whoosh.
*/

export class AudioManager {
    constructor() {
        this.ctx = new (window.AudioContext || window.webkitAudioContext)();
        this.masterGain = this.ctx.createGain();
        this.masterGain.connect(this.ctx.destination);
        this.masterGain.gain.value = 0.8;

        // Per-channel buses so we can duck music on spell casts without affecting SFX
        this.musicBus = this.ctx.createGain(); this.musicBus.gain.value = 1.0; this.musicBus.connect(this.masterGain);
        this.ambientBus = this.ctx.createGain(); this.ambientBus.gain.value = 1.0; this.ambientBus.connect(this.masterGain);
        this.sfxBus = this.ctx.createGain(); this.sfxBus.gain.value = 1.0; this.sfxBus.connect(this.masterGain);

        // Gentle reverb send for spells & hits — synthesised impulse, no extra asset cost
        this.reverbSend = this.ctx.createGain();
        this.reverbSend.gain.value = 0.0;
        this.reverbConv = this.ctx.createConvolver();
        this.reverbConv.buffer = this._makeImpulseResponse(1.6, 2.2);
        this.reverbConv.connect(this.masterGain);
        this.reverbSend.connect(this.reverbConv);

        this.sounds = {};
        this.files = {
            'ambience': 'assets/sounds/ambience.ogg',
            'jump': 'assets/sounds/jump.ogg',
            'land': 'assets/sounds/land.ogg',
            'fall': 'assets/sounds/fall.ogg',
            'shoot': 'assets/sounds/shoot.ogg',
            'hit': 'assets/sounds/hit.ogg',
            'music': 'assets/sounds/music.ogg',
            'teepee': 'assets/sounds/teepee.ogg',
            'death': 'assets/sounds/death.ogg',
            'munch': 'assets/sounds/munch.ogg',
            'fire': 'assets/sounds/spell1.wav',
            'water': 'assets/sounds/spell2.wav',
            'earth': 'assets/sounds/spell3.wav',
            'air': 'assets/sounds/spell4.wav',
            'horn': 'assets/sounds/teepee.ogg',
            'drum_loop': 'assets/sounds/ambience.ogg'
        };

        // How much of each sound to send to reverb (0..1).
        // Subtle by design — preserves the existing soundscape.
        this._reverbAmount = {
            'fire': 0.22, 'water': 0.30, 'earth': 0.18, 'air': 0.12,
            'death': 0.32, 'horn': 0.28, 'teepee': 0.18, 'hit': 0.06
        };

        // Which bus each sound routes to
        this._busFor = {
            'music': this.musicBus,
            'ambience': this.ambientBus,
            'drum_loop': this.ambientBus
        };

        this.loops = {};
        this.initialized = false;

        // Sound limiting: prevent audio spam
        this._lastPlayTime = {};
        this._minInterval = {
            'hit': 0.05,
            'shoot': 0.04,
            'air': 0.15,
            'jump': 0.1
        };
    }

    // Synthesised reverb impulse: exponential decay of white noise. Keeps it tight.
    _makeImpulseResponse(durationSec, decay) {
        const sr = this.ctx.sampleRate;
        const len = Math.max(1, Math.floor(sr * durationSec));
        const buf = this.ctx.createBuffer(2, len, sr);
        for (let ch = 0; ch < 2; ch++) {
            const data = buf.getChannelData(ch);
            for (let i = 0; i < len; i++) {
                const t = i / len;
                data[i] = (Math.random() * 2 - 1) * Math.pow(1 - t, decay);
            }
        }
        return buf;
    }

    async loadAll() {
        const promises = Object.entries(this.files).map(([key, url]) => this._loadBuffer(key, url));
        await Promise.all(promises);
    }

    async _loadBuffer(key, url) {
        try {
            const response = await fetch(url);
            if (!response.ok) return;
            const arrayBuffer = await response.arrayBuffer();
            this.sounds[key] = await this.ctx.decodeAudioData(arrayBuffer);
        } catch (e) {
            // Silent fail for missing audio
        }
    }

    resume() {
        if (this.ctx.state === 'suspended') {
            this.ctx.resume().then(() => { this.initialized = true; });
        } else {
            this.initialized = true;
        }
    }

    play(name, vol = 1.0, pitchVar = 0.0) {
        if (!this.sounds[name]) return;

        // Sound limiting
        const now = this.ctx.currentTime;
        const minInt = this._minInterval[name] || 0.02;
        if (this._lastPlayTime[name] && (now - this._lastPlayTime[name]) < minInt) return;
        this._lastPlayTime[name] = now;

        try {
            const source = this.ctx.createBufferSource();
            source.buffer = this.sounds[name];

            if (pitchVar > 0) {
                source.playbackRate.value = 1.0 + (Math.random() * 2 - 1) * pitchVar;
            }

            const gainNode = this.ctx.createGain();
            gainNode.gain.value = vol;
            source.connect(gainNode);
            const bus = this._busFor[name] || this.sfxBus;
            gainNode.connect(bus);

            // Send a small portion to reverb for body-and-tail
            const wet = this._reverbAmount[name];
            if (wet) {
                const sendGain = this.ctx.createGain();
                sendGain.gain.value = vol * wet;
                gainNode.connect(sendGain);
                sendGain.connect(this.reverbSend);
            }

            source.start(0);

            // Music ducking on the louder spell hits
            if (name === 'fire' || name === 'earth' || name === 'water' || name === 'death' || name === 'horn') {
                this._duck(name === 'death' || name === 'horn' ? 0.45 : 0.7, 0.9);
            }
        } catch (e) { /* ignore */ }
    }

    // Ramp music down to `floor`, hold briefly, ramp back to 1.0 over `recoverSec`.
    _duck(floor, recoverSec) {
        try {
            const t = this.ctx.currentTime;
            const g = this.musicBus.gain;
            g.cancelScheduledValues(t);
            g.setValueAtTime(g.value, t);
            g.linearRampToValueAtTime(floor, t + 0.06);
            g.linearRampToValueAtTime(1.0, t + 0.06 + recoverSec);
        } catch (e) { /* ignore */ }
    }

    // Synthesised wind whoosh — used when the hookshot fires.
    // Cheap: white noise through a bandpass with envelope. Doesn't load any asset.
    playWhoosh(intensity = 1.0) {
        try {
            const t = this.ctx.currentTime;
            const dur = 0.35;
            const sr = this.ctx.sampleRate;
            const len = Math.floor(sr * dur);
            const buf = this.ctx.createBuffer(1, len, sr);
            const data = buf.getChannelData(0);
            for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
            const src = this.ctx.createBufferSource();
            src.buffer = buf;
            const bp = this.ctx.createBiquadFilter();
            bp.type = 'bandpass';
            bp.frequency.setValueAtTime(800, t);
            bp.frequency.exponentialRampToValueAtTime(220, t + dur);
            bp.Q.value = 1.2;
            const g = this.ctx.createGain();
            g.gain.setValueAtTime(0.0, t);
            g.gain.linearRampToValueAtTime(0.18 * intensity, t + 0.05);
            g.gain.exponentialRampToValueAtTime(0.001, t + dur);
            src.connect(bp); bp.connect(g); g.connect(this.sfxBus);
            // Tiny bit to reverb for body
            const sg = this.ctx.createGain(); sg.gain.value = 0.12 * intensity;
            g.connect(sg); sg.connect(this.reverbSend);
            src.start(t);
            src.stop(t + dur + 0.05);
        } catch (e) { /* ignore */ }
    }

    startLoop(name, vol = 1.0) {
        if (!this.sounds[name] || this.loops[name]) return;
        try {
            const source = this.ctx.createBufferSource();
            source.buffer = this.sounds[name];
            source.loop = true;

            const gainNode = this.ctx.createGain();
            gainNode.gain.value = vol;
            source.connect(gainNode);
            const bus = this._busFor[name] || this.sfxBus;
            gainNode.connect(bus);
            source.start(0);

            this.loops[name] = { source, gain: gainNode };
        } catch (e) { /* ignore */ }
    }

    setLoopVolume(name, vol) {
        if (this.loops[name]) {
            try {
                this.loops[name].gain.gain.setTargetAtTime(vol, this.ctx.currentTime, 0.1);
            } catch (e) { /* ignore */ }
        }
    }

    setLoopPitch(name, rate) {
        if (this.loops[name]) {
            try {
                this.loops[name].source.playbackRate.setTargetAtTime(rate, this.ctx.currentTime, 0.1);
            } catch (e) { /* ignore */ }
        }
    }

    setMasterVolume(vol) {
        this.masterGain.gain.setTargetAtTime(vol, this.ctx.currentTime, 0.05);
    }
}
