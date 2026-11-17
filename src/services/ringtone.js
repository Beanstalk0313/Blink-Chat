// Synthesized call tones, so neither end needs an audio asset.
//
// The two sides sound different on purpose:
//  - incoming: a warm two-note doorbell chime, repeated every few seconds.
//  - outgoing: a quiet, steady ringback (440 + 480 Hz) like a phone network
//    plays while the other person's device rings.
//
// Both are built from sine/triangle oscillators through a gentle low-pass, with
// soft attacks and decays; square-ish edges and hard gain cuts are what make
// synthesized rings sound harsh.

function createAudioContext() {
  const AudioContextClass = typeof window !== 'undefined'
    ? window.AudioContext || window.webkitAudioContext
    : null;
  if (!AudioContextClass) return null;
  try {
    const context = new AudioContextClass();
    const filter = context.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 2600;
    filter.Q.value = 0.4;
    filter.connect(context.destination);
    return { context, destination: filter };
  } catch {
    return null;
  }
}

// One soft bell note: a sine fundamental plus a quiet octave, decaying away.
function playBell(context, destination, startAt, frequency) {
  const peak = 0.11;
  const fundamental = context.createOscillator();
  fundamental.type = 'sine';
  fundamental.frequency.setValueAtTime(frequency, startAt);

  const shimmer = context.createOscillator();
  shimmer.type = 'sine';
  shimmer.frequency.setValueAtTime(frequency * 2, startAt);

  const shimmerGain = context.createGain();
  shimmerGain.gain.setValueAtTime(0.28, startAt);

  const envelope = context.createGain();
  envelope.gain.setValueAtTime(0.0001, startAt);
  envelope.gain.exponentialRampToValueAtTime(peak, startAt + 0.015);
  envelope.gain.exponentialRampToValueAtTime(0.0001, startAt + 1.35);

  fundamental.connect(envelope);
  shimmer.connect(shimmerGain);
  shimmerGain.connect(envelope);
  envelope.connect(destination);

  fundamental.start(startAt);
  shimmer.start(startAt);
  fundamental.stop(startAt + 1.4);
  shimmer.stop(startAt + 1.4);
}

// Ringback: two close tones together, held, with a short fade in and out.
function playRingback(context, destination, startAt) {
  const peak = 0.055;
  const holdFor = 1.15;
  const envelope = context.createGain();
  envelope.gain.setValueAtTime(0.0001, startAt);
  envelope.gain.linearRampToValueAtTime(peak, startAt + 0.08);
  envelope.gain.setValueAtTime(peak, startAt + holdFor - 0.12);
  envelope.gain.linearRampToValueAtTime(0.0001, startAt + holdFor);
  envelope.connect(destination);

  [440, 480].forEach(frequency => {
    const oscillator = context.createOscillator();
    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(frequency, startAt);
    oscillator.connect(envelope);
    oscillator.start(startAt);
    oscillator.stop(startAt + holdFor + 0.02);
  });
}

// Starts the tone for `kind` and returns a cleanup function that silences it.
export function startRingtone(kind) {
  const audio = createAudioContext();
  if (!audio) return () => {};
  const { context, destination } = audio;
  let stopped = false;
  let interval = 0;

  const playCycle = () => {
    if (stopped) return;
    const start = context.currentTime + 0.03;
    if (kind === 'incoming') {
      playBell(context, destination, start, 659.25); // E5
      playBell(context, destination, start + 0.38, 523.25); // C5
    } else {
      playRingback(context, destination, start);
    }
  };

  // Browsers may hold the context suspended until this tab gets an interaction;
  // the ring still starts and the next cycle plays as soon as it resumes.
  if (context.state === 'suspended') context.resume?.().catch(() => {});

  playCycle();
  interval = window.setInterval(playCycle, kind === 'incoming' ? 3000 : 3200);

  return () => {
    stopped = true;
    window.clearInterval(interval);
    context.close?.().catch(() => {});
  };
}
