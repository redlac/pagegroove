import { deriveTrack, midiToFrequency } from "./music-map.js";

let audioContext = null;
let masterGain = null;
let compressor = null;
let noiseBuffer = null;
let schedulerId = null;
let healthcheckId = null;
let transport = null;
let currentVolume = 62;
const activeSources = new Set();
const SCHEDULER_LOOKAHEAD_SECONDS = 0.8;
const SCHEDULER_INTERVAL_MS = 100;
const MIN_START_OFFSET_SECONDS = 0.02;

function normalizeVolume(value) {
  const volume = Number(value);

  if (!Number.isFinite(volume)) {
    return 62;
  }

  return Math.min(100, Math.max(0, Math.round(volume)));
}

function volumeToGain(volume) {
  return (normalizeVolume(volume) / 100) * 0.9;
}

function applyMasterVolume(volume, rampDuration = 0.08) {
  currentVolume = normalizeVolume(volume);

  if (!audioContext || !masterGain) {
    return;
  }

  const targetGain = volumeToGain(currentVolume);
  masterGain.gain.cancelScheduledValues(audioContext.currentTime);
  masterGain.gain.setValueAtTime(masterGain.gain.value, audioContext.currentTime);
  masterGain.gain.linearRampToValueAtTime(targetGain, audioContext.currentTime + rampDuration);
}

function createNoiseBuffer(context) {
  const buffer = context.createBuffer(1, context.sampleRate, context.sampleRate);
  const channel = buffer.getChannelData(0);

  for (let index = 0; index < channel.length; index += 1) {
    channel[index] = Math.random() * 2 - 1;
  }

  return buffer;
}

async function ensureAudioEngine() {
  if (!audioContext) {
    audioContext = new AudioContext();
    compressor = audioContext.createDynamicsCompressor();
    compressor.threshold.value = -20;
    compressor.knee.value = 18;
    compressor.ratio.value = 5;
    compressor.attack.value = 0.01;
    compressor.release.value = 0.18;

    masterGain = audioContext.createGain();
    masterGain.gain.value = volumeToGain(currentVolume);
    masterGain.connect(compressor);
    compressor.connect(audioContext.destination);
    noiseBuffer = createNoiseBuffer(audioContext);

    healthcheckId = window.setInterval(() => {
      if (transport && audioContext?.state !== "running") {
        audioContext.resume().catch(() => {});
      }
    }, 1000);
  }

  if (audioContext.state === "suspended") {
    await audioContext.resume();
  }
}

function registerSource(source) {
  activeSources.add(source);
  source.addEventListener(
    "ended",
    () => {
      activeSources.delete(source);
    },
    { once: true }
  );
}

function indexByStep(items) {
  const map = new Map();

  for (const item of items) {
    const existing = map.get(item.step) || [];
    existing.push(item);
    map.set(item.step, existing);
  }

  return map;
}

function playKick(time) {
  const oscillator = audioContext.createOscillator();
  const gain = audioContext.createGain();

  oscillator.type = "sine";
  oscillator.frequency.setValueAtTime(150, time);
  oscillator.frequency.exponentialRampToValueAtTime(42, time + 0.18);

  gain.gain.setValueAtTime(0.0001, time);
  gain.gain.linearRampToValueAtTime(0.9, time + 0.006);
  gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.18);

  oscillator.connect(gain);
  gain.connect(masterGain);
  oscillator.start(time);
  oscillator.stop(time + 0.2);
  registerSource(oscillator);
}

function playHat(time, velocity, open) {
  const source = audioContext.createBufferSource();
  const highPass = audioContext.createBiquadFilter();
  const gain = audioContext.createGain();
  const duration = open ? 0.14 : 0.06;

  source.buffer = noiseBuffer;
  highPass.type = "highpass";
  highPass.frequency.value = open ? 4500 : 6500;

  gain.gain.setValueAtTime(0.0001, time);
  gain.gain.linearRampToValueAtTime(velocity * 0.16, time + 0.004);
  gain.gain.exponentialRampToValueAtTime(0.0001, time + duration);

  source.connect(highPass);
  highPass.connect(gain);
  gain.connect(masterGain);
  source.start(time);
  source.stop(time + duration + 0.03);
  registerSource(source);
}

function playBass(note, time, duration, velocity) {
  const primary = audioContext.createOscillator();
  const sub = audioContext.createOscillator();
  const filter = audioContext.createBiquadFilter();
  const gain = audioContext.createGain();
  const frequency = midiToFrequency(note);

  primary.type = "sawtooth";
  primary.frequency.setValueAtTime(frequency, time);
  primary.detune.value = -4;

  sub.type = "triangle";
  sub.frequency.setValueAtTime(frequency / 2, time);

  filter.type = "lowpass";
  filter.frequency.setValueAtTime(140, time);
  filter.frequency.exponentialRampToValueAtTime(900, time + 0.05);
  filter.Q.value = 1.8;

  gain.gain.setValueAtTime(0.0001, time);
  gain.gain.linearRampToValueAtTime(velocity * 0.24, time + 0.015);
  gain.gain.exponentialRampToValueAtTime(0.0001, time + duration);

  primary.connect(filter);
  sub.connect(filter);
  filter.connect(gain);
  gain.connect(masterGain);

  primary.start(time);
  sub.start(time);
  primary.stop(time + duration + 0.02);
  sub.stop(time + duration + 0.02);
  registerSource(primary);
  registerSource(sub);
}

function playPad(notes, time, duration, velocity) {
  const voices = notes.map((note) => {
    const oscillator = audioContext.createOscillator();
    oscillator.type = "triangle";
    oscillator.frequency.setValueAtTime(midiToFrequency(note), time);
    return oscillator;
  });
  const filter = audioContext.createBiquadFilter();
  const gain = audioContext.createGain();

  filter.type = "lowpass";
  filter.frequency.value = 900;
  filter.Q.value = 0.5;

  gain.gain.setValueAtTime(0.0001, time);
  gain.gain.linearRampToValueAtTime(velocity, time + 0.18);
  gain.gain.exponentialRampToValueAtTime(0.0001, time + duration);

  for (const voice of voices) {
    voice.connect(filter);
    voice.start(time);
    voice.stop(time + duration + 0.04);
    registerSource(voice);
  }

  filter.connect(gain);
  gain.connect(masterGain);
}

function stopTransport() {
  if (schedulerId) {
    window.clearInterval(schedulerId);
    schedulerId = null;
  }

  for (const source of activeSources) {
    try {
      source.stop(audioContext.currentTime + 0.01);
    } catch (error) {
      activeSources.delete(source);
    }
  }

  activeSources.clear();
  transport = null;
}

function scheduleStep(step, stepTime) {
  if (!transport) {
    return;
  }

  const safeStepTime = Math.max(stepTime, audioContext.currentTime + MIN_START_OFFSET_SECONDS);

  if (transport.kickSteps.has(step)) {
    playKick(safeStepTime);
  }

  const hats = transport.hatByStep.get(step) || [];
  const bassNotes = transport.bassByStep.get(step) || [];
  const padChords = transport.padByStep.get(step) || [];

  for (const hat of hats) {
    playHat(safeStepTime, hat.velocity, hat.open);
  }

  for (const bassNote of bassNotes) {
    playBass(
      bassNote.note,
      safeStepTime,
      bassNote.durationSteps * transport.secondsPerStep,
      bassNote.velocity
    );
  }

  for (const chord of padChords) {
    playPad(
      chord.notes,
      safeStepTime,
      chord.durationSteps * transport.secondsPerStep,
      chord.velocity
    );
  }
}

function scheduler() {
  if (!transport) {
    return;
  }

  const currentTime = audioContext.currentTime;

  if (transport.nextStepTime < currentTime - transport.secondsPerStep) {
    const missedSteps = Math.floor((currentTime - transport.nextStepTime) / transport.secondsPerStep);
    transport.stepIndex = (transport.stepIndex + missedSteps) % transport.track.steps;
    transport.nextStepTime += missedSteps * transport.secondsPerStep;
  }

  while (transport.nextStepTime < currentTime + SCHEDULER_LOOKAHEAD_SECONDS) {
    scheduleStep(transport.stepIndex, transport.nextStepTime);
    transport.nextStepTime += transport.secondsPerStep;
    transport.stepIndex = (transport.stepIndex + 1) % transport.track.steps;
  }
}

async function startTrack(metrics, settings, volume) {
  await ensureAudioEngine();
  stopTransport();

  const track = deriveTrack(metrics, settings);
  const secondsPerStep = (60 / track.tempo) * track.stepDurationBeats;

  applyMasterVolume(volume, 0.08);

  transport = {
    track,
    stepIndex: 0,
    nextStepTime: audioContext.currentTime + 0.05,
    secondsPerStep,
    kickSteps: new Set(track.kickPattern),
    hatByStep: indexByStep(track.hatPattern),
    bassByStep: indexByStep(track.bassPattern),
    padByStep: indexByStep(track.padPattern)
  };

  scheduler();
  schedulerId = window.setInterval(scheduler, SCHEDULER_INTERVAL_MS);
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "PLAY_TRACK") {
    void startTrack(message.metrics, message.settings, message.volume)
      .then(() => {
        sendResponse({
          ok: true
        });
      })
      .catch((error) => {
        console.error("PageGroove offscreen play failed", error);
        sendResponse({
          ok: false,
          error: error instanceof Error ? error.message : String(error)
        });
      });

    return true;
  }

  if (message.type === "SET_VOLUME") {
    try {
      applyMasterVolume(message.volume, 0.04);
      sendResponse({
        ok: true
      });
    } catch (error) {
      console.error("PageGroove offscreen volume update failed", error);
      sendResponse({
        ok: false,
        error: error instanceof Error ? error.message : String(error)
      });
    }

    return false;
  }

  if (message.type === "STOP_TRACK") {
    try {
      stopTransport();
      sendResponse({
        ok: true
      });
    } catch (error) {
      console.error("PageGroove offscreen stop failed", error);
      sendResponse({
        ok: false,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  return false;
});
