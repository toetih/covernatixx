# Finanzen – lokaler Finanz-Tracker

Browser-App für den Rechner: Konten, Umbuchungen, Depots, Daueraufträge, Kategorien, Auswertungen.
Kein Server, kein Konto, keine Cloud: Die Daten bleiben auf deinem Rechner.

## Starten

- **Online:** `https://www.covernatixx.de/finanzen/` in Chrome oder Edge öffnen. Die Seite ist nur das Programm, deine Daten werden nicht hochgeladen.
- **Offline (empfohlen):** Die Einzeldatei `Finanzen.html` herunterladen, z. B. in den Dropbox-Ordner legen und per Doppelklick in Chrome oder Edge öffnen. Sie enthält die komplette App.

Tipp: In Chrome/Edge über Menü › „Streamen, speichern und teilen“ › „Als App installieren“ bekommt die Seite ein eigenes Fenster und ein Symbol in der Taskleiste.

## Einrichten (einmalig, ca. 30 Minuten)

1. **Daten & Import › Neue Datei anlegen …**, z. B. `Dropbox/Finanzen/finanzen.json`. Ab dann wird jede Änderung automatisch dort gespeichert (Backup + Nutzung auf mehreren PCs). Nach einem Browser-Neustart einmal „Datei freigeben“ klicken.
2. **Konten** anlegen, jeweils mit aktuellem Stand und einer Gruppe (Privat, Business, Rücklagen, Geldanlage …).
3. **Depots:** Konto vom Typ „Depot“ anlegen, dann im Bereich Depots den Bestand per „Einbuchen“ übernehmen (Stück + Einstandskurs).
4. **Wiederkehrend:** Gehalt, Miete, Versicherungen, Abos, Sparraten und Sparpläne eintragen.
   - *automatisch*: wird am Fälligkeitstag gebucht.
   - *bestätigen*: erscheint in der Übersicht zum Buchen, Anpassen oder Überspringen (für schwankende Beträge).
5. **Kredite › + Kredit** für eine Baufinanzierung: aktuelle Restschuld, Sollzins, Monatsrate, Zinsbindung. Die Rate wird monatlich gebucht: Zinsen als Ausgabe, Tilgung senkt die Restschuld. Optional die Immobilie als Vermögenswert anlegen.
6. Optional **CSV-Import** aus Online-Banking oder Finanzguru, danach „Umbuchungen erkennen“.

## Im Alltag

- `N` → neue Buchung, `Enter` bucht. `+50` = Einnahme, `Alt+U` = Umbuchung, `#tag` in der Notiz = Tag.
- **Abgleichen** (Konten): echten Kontostand eingeben, die Differenz wird als Korrektur gebucht.
- **Kurse aktualisieren** (Depots): alle Kurse in einer Maske nachtragen.
- **Sondertilgung** (Kredite): als Umbuchung aufs Darlehenskonto. Der Rechner „Was wäre wenn …“ zeigt vorher, wie viel Zeit und Zinsen sie spart.
- **Gehalt am Monatsende:** Häkchen „Zählt in der Auswertung zum Folgemonat“ im Dauerauftrag bzw. in der Buchung. Für schon gebuchte Gehälter: in Buchungen markieren › „→ Folgemonat an/aus“. Kontostände bleiben am echten Datum.
- `Strg+Z` macht die letzte Änderung rückgängig.

## Technik

- `core.js`: Rechenlogik ohne Oberfläche (Salden, Wiederholungen, Depot mit Durchschnittskosten, CSV).
- `store.js`: Speicherung (IndexedDB, optional JSON-Datei über die File System Access API).
- `app.js`, `views.js`: Oberfläche. `style.css`: Design (hell/dunkel).
- `Finanzen.html`: automatisch gebaute Einzeldatei, nach Code-Änderungen neu erzeugen mit `node finanzen/tools/bundle.js`.
- Tests: `node --test finanzen/tests/*.test.js`
