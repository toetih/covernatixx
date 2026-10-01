"""Synthetisiert den Musik-Bed für den Werbespot (25 s, 44.1 kHz, Stereo) -> musik.wav

Akkordwechsel liegen auf den Szenenwechseln (alle 3,3 s):
  Am (Hook) | C (Halterung, Drums setzen ein) | G (quer/hoch) | Am (Neigung) | F (Keyboards) | C (Name) | G -> C (CTA)
Klick-Sound bei 5,05 s, wenn die Seitenteile zuschnappen.

Tipp: Für den finalen Spot lieber einen eigenen Sound/Preset-Demo-Loop verwenden – das ist
Markenwerbung für deine Sounds gleich mit. Einfach musik.wav ersetzen und neu rendern.
"""
import numpy as np
from scipy.signal import lfilter, butter
import sys
import wave

V2 = len(sys.argv) > 1 and sys.argv[1] == 'v2'   # v2: 28 s, eine Szene mehr

SR = 44100
DUR = 28.0 if V2 else 25.0
N = int(SR * DUR)
BEAT = 60 / 145.45          # ~0,4125 s, 2 Takte = 3,3 s
rng = np.random.default_rng(7)

L = np.zeros(N)
R = np.zeros(N)


def midi(n):
    return 440.0 * 2 ** ((n - 69) / 12)


def add(sig, start, gain=1.0, pan=0.0):
    i = int(start * SR)
    if i >= N:
        return
    sig = sig[: N - i]
    L[i:i + len(sig)] += sig * gain * np.sqrt((1 - pan) / 2)
    R[i:i + len(sig)] += sig * gain * np.sqrt((1 + pan) / 2)


def env(n, a=0.01, d=0.2, s=0.7, r=0.3, length=None):
    length = length or n / SR
    t = np.arange(n) / SR
    e = np.where(t < a, t / a, np.where(t < a + d, 1 - (1 - s) * (t - a) / d, s))
    rel = np.clip((t - (length - r)) / r, 0, 1)
    return e * (1 - rel)


def lowpass(x, fc, order=2):
    b, a = butter(order, fc / (SR / 2))
    return lfilter(b, a, x)


def highpass(x, fc, order=2):
    b, a = butter(order, fc / (SR / 2), btype='high')
    return lfilter(b, a, x)


def saw(f, n, phase=0.0):
    t = np.arange(n) / SR
    return 2 * ((f * t + phase) % 1.0) - 1


# --- Akkorde -------------------------------------------------------------
SEG = 3.3
CHORDS = [  # (start, dauer, midi-noten)
    (0.0, SEG, [57, 60, 64]),          # Am
    (SEG, SEG, [48 + 12, 52 + 12, 55 + 12]),  # C
    (2 * SEG, SEG, [55, 59, 62]),      # G
    (3 * SEG, SEG, [57, 60, 64]),      # Am
    (4 * SEG, SEG, [53, 57, 60]),      # F
    (5 * SEG, SEG, [60, 64, 67]),      # C
    (6 * SEG, SEG / 2, [55, 59, 62]),  # G
    (6.5 * SEG, DUR - 6.5 * SEG, [60, 64, 67, 72]),  # C (Schluss)
]
BASS = [45, 48, 43, 45, 41, 48, 43, 36]

# Pad: verstimmte Sägezähne, weich gefiltert
for (st, du, notes) in CHORDS:
    n = int((du + 0.6) * SR)
    pad = np.zeros(n)
    for note in notes:
        for det, ph in ((-0.12, 0.0), (0.0, 0.33), (0.12, 0.66)):
            pad += saw(midi(note + det), n, ph)
    pad = lowpass(pad, 1400 if st < SEG else 2200)
    pad *= env(n, a=0.35, d=0.5, s=0.8, r=0.6)
    add(pad, st, gain=0.035, pan=-0.25)
    add(lowpass(pad, 900), st + 0.012, gain=0.03, pan=0.25)

# Bass: Achtel auf dem Grundton ab Szene 2
for k, (st, du, _) in enumerate(CHORDS):
    if st < SEG:
        continue
    f = midi(BASS[k])
    steps = int(round(du / (BEAT / 2)))
    for s in range(steps):
        n = int(BEAT / 2 * SR)
        t = np.arange(n) / SR
        b = np.sin(2 * np.pi * f * t) + 0.35 * np.sin(2 * np.pi * 2 * f * t)
        b = np.tanh(1.6 * b) * np.exp(-t * 7)
        add(b, st + s * BEAT / 2, gain=0.16 if s % 2 else 0.1)

# Arpeggio (Pluck) ab Szene 2
for (st, du, notes) in CHORDS:
    if st < SEG:
        continue
    seq = notes + [notes[1] + 12, notes[0] + 12, notes[2]]
    steps = int(round(du / (BEAT / 2)))
    for s in range(steps):
        f = midi(seq[s % len(seq)] + 12)
        n = int(0.35 * SR)
        t = np.arange(n) / SR
        p = (np.sin(2 * np.pi * f * t) + 0.3 * np.sin(2 * np.pi * 2 * f * t) + 0.12 * np.sin(2 * np.pi * 3 * f * t)) * np.exp(-t * 11)
        add(p, st + s * BEAT / 2, gain=0.05, pan=0.4 if s % 2 else -0.4)

# --- Drums ---------------------------------------------------------------
def kick():
    n = int(0.35 * SR)
    t = np.arange(n) / SR
    f = 45 + 95 * np.exp(-t * 28)
    ph = 2 * np.pi * np.cumsum(f) / SR
    return np.sin(ph) * np.exp(-t * 9)


def clap():
    n = int(0.25 * SR)
    t = np.arange(n) / SR
    x = rng.standard_normal(n)
    b, a = butter(2, [900 / (SR / 2), 3500 / (SR / 2)], btype='band')
    x = lfilter(b, a, x)
    e = np.exp(-t * 18) * (1 + 0.6 * (np.sin(2 * np.pi * 90 * t) > 0) * (t < 0.03))
    return x * e


def hat(length=0.05):
    n = int(length * SR)
    t = np.arange(n) / SR
    return highpass(rng.standard_normal(n), 7000) * np.exp(-t * 60)


K, C = kick(), clap()
DRUM_START, DRUM_END = SEG, (26.4 if V2 else 23.1)
beats = int(DUR / BEAT) + 1
for i in range(beats):
    tb = i * BEAT
    if tb < DRUM_START:
        # Hook: tickende Hi-Hats, Spannung
        add(hat(0.03), tb, gain=0.12, pan=0.3)
        add(hat(0.03), tb + BEAT / 2, gain=0.07, pan=-0.3)
        continue
    if tb >= DRUM_END:
        break
    add(K, tb, gain=0.55)
    if (i % 2) == 1:
        add(C, tb, gain=0.22)
    add(hat(), tb + BEAT / 2, gain=0.16, pan=0.25)
    add(hat(0.025), tb + BEAT / 4, gain=0.05, pan=-0.25)

# Riser in den Drop (Hook -> Halterung)
n = int(1.6 * SR)
t = np.arange(n) / SR
riser = highpass(rng.standard_normal(n), 2500) * (t / t[-1]) ** 2
add(riser, SEG - 1.6, gain=0.12)
# Impact auf dem Drop
add(K * 1.0, SEG, gain=0.4)

# Klick: Seitenteile schnappen zu
n = int(0.08 * SR)
t = np.arange(n) / SR
click = (highpass(rng.standard_normal(n), 3000) * np.exp(-t * 120) + 0.6 * np.sin(2 * np.pi * 2100 * t) * np.exp(-t * 90))
for tc in ([7.4, 13.6] if V2 else [5.05]):   # v2: Callouts erscheinen
    add(click, tc, gain=0.5)
    add(click, tc + 0.06, gain=0.3)

# --- Mix -----------------------------------------------------------------
mix = np.stack([L, R], axis=1)
fade = np.ones(N)
fo = int(1.6 * SR)
fade[-fo:] = np.linspace(1, 0, fo) ** 1.5
fi = int(0.05 * SR)
fade[:fi] = np.linspace(0, 1, fi)
mix *= fade[:, None]
mix = np.tanh(mix * 1.4) / np.tanh(1.4)       # sanfte Sättigung
mix /= np.max(np.abs(mix)) / 0.89             # Peak ~ -1 dBFS

pcm = (mix * 32767).astype('<i2')
with wave.open('musik-v2.wav' if V2 else 'musik.wav', 'wb') as w:
    w.setnchannels(2)
    w.setsampwidth(2)
    w.setframerate(SR)
    w.writeframes(pcm.tobytes())
print('Musik geschrieben', DUR, 's')
