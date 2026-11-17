# Pista original (sintetizada, sin samples de terceros) de 78 s para el vídeo corporativo.
# Uso: python3 make_music.py salida.wav
import math, random, struct, sys, wave
SR = 44100
DUR = 78.0
N = int(SR * DUR)
random.seed(7)
buf = [0.0] * N
BPM = 120
BEAT = 60.0 / BPM

def add(start, length, fn):
    i0 = int(start * SR)
    n = int(length * SR)
    for i in range(n):
        j = i0 + i
        if j >= N: break
        buf[j] += fn(i / SR)

def kick(t):
    if t > 0.35: return 0.0
    f = 45 + 110 * math.exp(-t * 30)
    return 0.9 * math.sin(2 * math.pi * f * t) * math.exp(-t * 9)

def hat(t):
    if t > 0.06: return 0.0
    return 0.18 * (random.random() * 2 - 1) * math.exp(-t * 80)

def boom(t):
    if t > 1.6: return 0.0
    return 0.7 * math.sin(2 * math.pi * (38 + 20 * math.exp(-t * 4)) * t) * math.exp(-t * 2.5)

def riser(t, L):
    p = t / L
    return 0.25 * p * p * (random.random() * 2 - 1)

def note(f, t, L):
    # Bajo: onda con armónicos suaves y caída
    env = math.exp(-t * 3.0) * min(1.0, t * 40)
    s = math.sin(2 * math.pi * f * t) + 0.35 * math.sin(4 * math.pi * f * t)
    return 0.32 * env * s

def pad(freqs, t, L):
    att = min(1.0, t / 1.2) * min(1.0, (L - t) / 1.2)
    s = 0.0
    for f in freqs:
        s += math.sin(2 * math.pi * f * t) + 0.5 * math.sin(2 * math.pi * f * 1.004 * t)
    return 0.07 * att * s / len(freqs)

def hz(midi): return 440.0 * 2 ** ((midi - 69) / 12)

# Progresión (Re menor): Dm - Bb - F - C, 2 s por acorde
chords = [(50, 53, 57), (46, 50, 53), (41, 45, 48), (48, 52, 55)]
CHORD_LEN = 4 * BEAT * 2  # 4 pulsos x 2 = 4 s por acorde? (ajustado abajo)
CHORD_LEN = 4.0

# Pads de fondo para todo el vídeo, con mayor presencia en las escenas de valores
t = 0.0
while t < DUR:
    idx = int(t // CHORD_LEN) % 4
    L = min(CHORD_LEN, DUR - t)
    add(t, L, lambda u, idx=idx, L=L, t0=t: pad([hz(m) for m in chords[idx]], u, L))
    t += CHORD_LEN

# Riser de entrada a la escena 2 (tensión antes del primer corte)
add(7.5, 2.0, lambda u: riser(u, 2.0))

# Pulsos de percusión desde el inicio de la escena 2 (9.5 s)
beat = 0
t = 9.5
while t < 75.5:
    add(t, 0.4, kick)
    if t >= 17.5 and beat % 2 == 1:
        add(t, 0.1, boom if False else hat)
    if t >= 27.5:
        # corcheas de bajo, raíz del acorde actual
        for k in range(2):
            tt = t + k * BEAT / 2
            idx = int(tt // CHORD_LEN) % 4
            root = chords[idx][0] - 24
            add(tt, 0.4, lambda u, f=hz(root): note(f, u, 0.4))
    t += BEAT
    beat += 1

# Impactos en los cortes de escena (sincronizados con los barridos rojos)
for b in [9.5, 17.5, 27.5, 43.5, 57.0, 66.0]:
    add(b, 1.6, boom)
    add(b - 0.6, 0.6, lambda u: riser(u, 0.6))  # pequeño barrido de entrada

# Brillo final y fundido de salida
peak = max(abs(x) for x in buf) or 1.0
out = wave.open(sys.argv[1], 'wb')
out.setnchannels(2); out.setsampwidth(2); out.setframerate(SR)
frames = bytearray()
for i in range(N):
    fade = min(1.0, (DUR - i / SR) / 2.0)
    v = buf[i] / peak * 0.8 * fade
    s = int(max(-1, min(1, v)) * 32767)
    frames += struct.pack('<hh', s, s)
out.writeframes(bytes(frames))
out.close()
print('music ok', peak)
