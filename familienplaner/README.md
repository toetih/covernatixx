# Familienkompass

Familien-Organisation für den ADHS-Alltag: Heute-Ansicht, Aufgaben mit Brain-Dump,
Routinen mit Zeitscheibe und Sternen fürs Kind, Familienkalender, Einkaufsliste und Essensplan.
Eine einzige HTML-Datei, ohne Build-Schritt und ohne Abhängigkeiten.

## Wo die Daten liegen

| Wie geöffnet | Speicher | Sync |
|---|---|---|
| Als Artifact auf claude.ai | claude.ai-Datenbank des Artifacts | live zwischen allen Geräten und Personen mit Bearbeiten-Recht |
| Datei direkt im Browser | `localStorage` dieses Browsers | keiner |

Wer mitschreiben soll (z. B. Partner:in), wird im Artifact über **Teilen → per E-Mail als Bearbeiter:in** eingeladen.
Leser:innen sehen alles, können aber nichts abhaken.

## Funktionen

- **Heute:** großes „Jetzt dran“ (nächster Aufbruch mit Time-Timer-Scheibe, laufende Routine oder die eine nächste Aufgabe),
  Termine als Zeitleiste, höchstens N wichtige Aufgaben (einstellbar), Brain-Dump-Feld, Tageszähler „geschafft“.
- **Aufgaben:** Eingang → Heute / Bald / Irgendwann, Dauer-Schätzung, Wiederholung (täglich/wöchentlich), Fokus-Modus mit Timer
  und Feld zum „Gedanken parken“. Überfälliges heißt freundlich „von gestern“, nicht rot.
- **Routinen:** Schritt-für-Schritt-Player im Vollbild, pro Schritt Zeitscheibe, Ton und Konfetti am Ende; fünf Vorlagen
  (Morgen/Abend fürs Kind, Morgenstart, Abend-Reset, Aus dem Haus).
- **Kinder-Ansicht:** große Bild-Kacheln, Sterne-Glas mit Belohnungsziel; Verlassen nur durch 1,5 s Gedrückthalten („Eltern“).
- **Kalender:** Wochenansicht, Personenfarben, Vorlauf („los um 07:40“), Serien (wöchentlich, 2-wöchentlich, monatlich, jährlich),
  Import von `.ics`-Dateien aus dem Apple-Kalender (Duplikate werden erkannt).
- **Essen & Einkauf:** Wochen-Essensplan, Zutaten mit einem Tipp auf die Einkaufsliste, zuletzt Gekauftes zum Wieder-Antippen.
- **Datensicherung:** Export/Import als JSON.

## Bekannte Grenzen (Version 1)

- Keine Push-Erinnerungen: Eine Web-Seite kann das iPhone nicht wecken. Termine mit Alarm bleiben im Apple-Kalender.
- Kein Export als `.ics` aus dem Artifact (der Dateityp ist dort nicht erlaubt); Import funktioniert.
- Offline nur mit dem zuletzt geladenen Stand; Änderungen brauchen Verbindung.
