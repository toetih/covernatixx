# Werbespot Tablet-Halterung

25-Sekunden-Spot für die iPad-/Samsung-Tablet-Halterungen aus dem Shop (keyboard-sounds.com).
Alle Fakten stammen aus den Shopify-Produktdaten (Stand 01.10.2026).

| Datei | Format | Einsatz |
|---|---|---|
| `tablet-halterung-9x16.mp4` | 1080×1920 | Instagram Reels, YouTube Shorts, TikTok, Story-Ads |
| `tablet-halterung-16x9.mp4` | 1920×1080 | YouTube, Shopify-Produktseite, Facebook |

## Storyboard

| Zeit | Szene | Botschaft |
|---|---|---|
| 0–3,3 s | Hook | „Tablet auf dem Keyboard? Rutscht. Wackelt. Liegt im Weg.“ |
| 3,3–6,7 s | Lösung | Halterung schnappt zu, gleiche Neigung wie das Bedienfeld |
| 6,7–10,2 s | Quer/hoch | Verstellbare Seitenteile, iPad & Samsung Galaxy Tab |
| 10,2–13,1 s | Neigung | 0° oder 15° (Seitenansicht) |
| 13,1–16,6 s | Kompatibilität | 8 Hersteller, über 25 Modelle, „Modell nicht dabei? Einfach anfragen.“ |
| 16,6–20 s | Personalisierung | Name oder Keyboard-Schriftzug, weitere Farben auf Anfrage |
| 20–25 s | CTA | ab 32 € inkl. Versand*, Lieferung 3–7 Tage, keyboard-sounds.com |

## Posting-Text (Vorschlag)

> Wohin mit dem iPad auf der Bühne? 🎹 Ab aufs Keyboard – passgenau für Yamaha, Korg, Nord, Roland & Co. Quer oder hoch, 0° oder 15°, auf Wunsch mit deinem Namen. Im 3D-Druck gefertigt – vom Keyboarder für Keyboarder. 👉 keyboard-sounds.com
> #keyboarder #coverband #ipad #livekeys #yamahamodx #korgkronos #nordstage #rolandfantom

## Neu rendern / anpassen

Texte, Preise und Timing stehen in `tablet-halterung-spot.html` (Vorschau im Browser: `tablet-halterung-spot.html?f=v&play`).

```bash
python3 musik.py          # erzeugt musik.wav (benötigt numpy + scipy)
node render.mjs           # rendert beide Formate (benötigt Playwright + ffmpeg)
node render.mjs v 12.5    # Standbild bei 12,5 s zur Kontrolle
```

Eigene Musik: `musik.wav` ersetzen (z. B. ein Demo-Loop deiner Sounds) und neu rendern.
