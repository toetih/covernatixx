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

## Monatlich (ca. 10 Minuten)

1. In jedem Online-Banking die Umsätze als **CSV** exportieren.
2. Alle Dateien auf einmal **ins App-Fenster ziehen** (oder Übersicht › „CSV importieren …“). Beim ersten Mal ordnest du Spalten und Konto zu – die App merkt sich das als **Import-Profil**. Ab dem zweiten Monat: Datei rein, ein Klick. Depotdateien werden automatisch erkannt.
   Beim Import gleicht die App mit deinen Daueraufträgen ab: Die echte Bankbuchung ersetzt den automatisch gebuchten Eintrag (Kategorie bleibt), Umbuchungen und Kreditraten werden nicht doppelt gebucht, Sammelbuchungen (z. B. Gehalt + Sonderzahlung, zwei Verträge in einer Lastschrift) werden erkannt.
   Steht die IBAN im Dateikopf (z. B. ING), wählt die App das Konto selbst – auch wenn Giro und Extra-Konto dasselbe Format haben. Unterkonten wie Extra-Konto/Tagesgeld bekommen unter Konten › Bearbeiten **„Bucht nur gegen: Girokonto“**: Ihre Buchungen werden beim Import automatisch zu Umbuchungen und mit der Gegenbuchung auf dem Girokonto zusammengeführt (Zinsgutschriften und Rücklastschriften ausgenommen).
   Kategorien lassen sich als **„Nicht in Auswertung zählen“** markieren (Kategorie bearbeiten) – für durchlaufende Posten wie Auslagen für andere und deren Rückzahlung. Die Buchungen bleiben im Kontostand, verzerren aber Einnahmen/Ausgaben nicht.
   Die **Übersicht** zeigt den Monat in Haushaltssicht: Einnahmen nach Quelle (z. B. Grundgehalt, Sonderzahlung, Entnahmen vom Geschäftskonto), Ausgaben getrennt in Fixkosten (Daueraufträge, Verträge, Kreditraten) und variabel – inkl. noch geplanter Termine. Gehaltseingänge, die mehrere Daueraufträge enthalten, teilt der Import automatisch auf (feste Teile bleiben, der seltenste Teil nimmt die Differenz).
   Doppelt importieren ist unkritisch: Bereits vorhandene Bankbuchungen erkennt die App auch bei anders geschriebenem Empfänger oder um bis zu 3 Tage verschobenem Datum. Gehaltseingänge am Monatsende zählen automatisch zum Folgemonat, wenn der Dauerauftrag so eingestellt ist.
3. **„Jetzt zuordnen“**: offene Buchungen sind nach Empfänger gruppiert (z. B. „REWE 12×“) – eine Auswahl pro Zeile. Die App **lernt daraus Regeln**, beim nächsten Import ist das meiste schon kategorisiert.
4. **Monatsabschluss** (Erinnerung erscheint in der Übersicht): Importe ✓, offene Buchungen ✓, Kontostände prüfen ✓, fertig.

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
