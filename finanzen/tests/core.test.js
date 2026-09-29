// Ausführen: node --test finanzen/tests
const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../core.js');

function baseState() {
  const s = C.emptyState();
  s.accounts.push({ id: 'giro', name: 'Giro', type: 'giro', opening: 100000 });
  s.accounts.push({ id: 'tg', name: 'Tagesgeld', type: 'tagesgeld', opening: 0 });
  s.accounts.push({ id: 'dep', name: 'Depot', type: 'depot', opening: 0 });
  return s;
}

test('parseMoney: deutsche und internationale Schreibweisen', () => {
  assert.equal(C.parseMoney('1.234,56'), 123456);
  assert.equal(C.parseMoney('1234,5'), 123450);
  assert.equal(C.parseMoney('-12,99 €'), -1299);
  assert.equal(C.parseMoney('1,234.56'), 123456);
  assert.equal(C.parseMoney('12.50'), 1250);
  assert.equal(C.parseMoney('1.500'), 150000);
  assert.equal(C.parseMoney('0.125'), 13);
  assert.equal(C.parseMoney('12-'), -1200);
  assert.equal(C.parseMoney('+5'), 500);
  assert.equal(C.parseMoney('(3,00)'), -300);
  assert.ok(Number.isNaN(C.parseMoney('abc')));
  assert.ok(Number.isNaN(C.parseMoney('')));
});

test('parseDate: Formate', () => {
  assert.equal(C.parseDate('31.12.2025'), '2025-12-31');
  assert.equal(C.parseDate('1.2.25'), '2025-02-01');
  assert.equal(C.parseDate('2025-03-04'), '2025-03-04');
  assert.equal(C.parseDate('5.6.', 2024), '2024-06-05');
  assert.equal(C.parseDate('31.02.2025'), null);
});

test('addMonths kappt am Monatsende und hält den Anker-Tag', () => {
  assert.equal(C.addMonths('2025-01-31', 1), '2025-02-28');
  assert.equal(C.addMonths('2024-01-31', 1), '2024-02-29');
  assert.equal(C.addMonths('2025-02-28', 1, 31), '2025-03-31');
  assert.equal(C.addMonths('2025-11-15', 3), '2026-02-15');
  assert.equal(C.addMonths('2025-01-15', -2), '2024-11-15');
});

test('Regel: Termine und Anker-Tag 31.', () => {
  const r = { unit: 'month', interval: 1, startDate: '2025-01-31', anchorDay: 31, nextDate: '2025-01-31' };
  assert.deepEqual(C.occurrences(r, '2025-05-01'), ['2025-01-31', '2025-02-28', '2025-03-31', '2025-04-30']);
  const w = { unit: 'week', interval: 2, startDate: '2025-01-01', nextDate: '2025-01-01', endDate: '2025-02-01' };
  assert.deepEqual(C.occurrences(w, '2025-12-31'), ['2025-01-01', '2025-01-15', '2025-01-29']);
  const y = { unit: 'year', interval: 1, startDate: '2024-02-29', anchorDay: 29, nextDate: '2024-02-29' };
  assert.deepEqual(C.occurrences(y, '2028-12-31'), ['2024-02-29', '2025-02-28', '2026-02-28', '2027-02-28', '2028-02-29']);
});

test('monthlyEquivalent', () => {
  assert.equal(C.monthlyEquivalent({ unit: 'year', interval: 1, amount: -120000 }), -10000);
  assert.equal(C.monthlyEquivalent({ unit: 'month', interval: 3, amount: -5508 }), -1836);
  assert.equal(C.monthlyEquivalent({ unit: 'week', interval: 1, amount: -1200 }), -5200);
});

test('Umbuchung wirkt auf beide Konten, zählt nicht als Ausgabe', () => {
  const s = baseState();
  s.transactions.push({ id: 't1', date: '2025-03-01', accountId: 'giro', counterAccountId: 'tg', amount: -20000, tags: [] });
  s.transactions.push({ id: 't2', date: '2025-03-02', accountId: 'giro', amount: -5000, categoryId: null, tags: [] });
  assert.equal(C.accountBalance(s, 'giro'), 75000);
  assert.equal(C.accountBalance(s, 'tg'), 20000);
  assert.equal(C.netWorth(s), 95000);
  const rep = C.categoryReport(s, { from: '2025-03-01', to: '2025-03-31' });
  assert.equal(rep.expense['2025-03'], -5000);
  assert.equal(C.accountBalance(s, 'giro', '2025-02-28'), 100000);
});

test('Automatische Regel bucht alle fälligen Termine genau einmal', () => {
  const s = baseState();
  s.recurring.push({ id: 'r1', name: 'Miete', active: true, mode: 'auto', unit: 'month', interval: 1, accountId: 'giro', amount: -80000, startDate: '2025-01-03', anchorDay: 3, nextDate: '2025-01-03' });
  assert.equal(C.processRecurring(s, '2025-03-10'), 3);
  assert.equal(s.recurring[0].nextDate, '2025-04-03');
  assert.equal(C.processRecurring(s, '2025-03-10'), 0);
  assert.equal(C.accountBalance(s, 'giro'), 100000 - 240000);
});

test('Bestätigungs-Regel: fällig, buchen, überspringen, Ende', () => {
  const s = baseState();
  const r = { id: 'r2', name: 'Versicherung', active: true, mode: 'confirm', unit: 'month', interval: 1, accountId: 'giro', amount: -1000, startDate: '2025-01-10', anchorDay: 10, nextDate: '2025-01-10', endDate: '2025-03-10' };
  s.recurring.push(r);
  assert.equal(C.processRecurring(s, '2025-02-15'), 0);
  assert.equal(C.dueConfirmations(s, '2025-02-15').length, 2);
  C.bookNext(s, r, { amount: -1100 });
  assert.equal(s.transactions[0].amount, -1100);
  assert.equal(r.nextDate, '2025-02-10');
  C.skipNext(r);
  C.skipNext(r);
  assert.equal(r.nextDate, '2025-04-10');
  assert.equal(r.active, false);
});

test('Depot: Durchschnittskosten, Verkauf, Dividende, Geldbuchungen', () => {
  const s = baseState();
  s.securities.push({ id: 'etf', name: 'World', prices: [] });
  C.saveTrade(s, { id: 'b1', date: '2025-01-01', depotId: 'dep', securityId: 'etf', type: 'buy', qty: 10, price: 100, fees: 100, cashAccountId: 'giro' });
  C.saveTrade(s, { id: 'b2', date: '2025-02-01', depotId: 'dep', securityId: 'etf', type: 'buy', qty: 10, price: 120, fees: 100, cashAccountId: 'giro' });
  // Kosten: 1000+1 + 1200+1 = 2202 € -> 220200 Cent
  let h = C.holdings(s, 'dep')[0];
  assert.equal(h.qty, 20);
  assert.equal(h.cost, 220200);
  assert.equal(h.value, 240000); // letzter Kurs 120
  assert.equal(C.accountBalance(s, 'giro'), 100000 - 100100 - 120100);

  C.saveTrade(s, { id: 's1', date: '2025-03-01', depotId: 'dep', securityId: 'etf', type: 'sell', qty: 5, price: 130, fees: 100, taxes: 500, cashAccountId: 'giro' });
  h = C.holdings(s, 'dep')[0];
  assert.equal(h.qty, 15);
  assert.equal(h.cost, 165150);
  assert.equal(h.realized, 65000 - 100 - 500 - 55050);
  C.saveTrade(s, { id: 'd1', date: '2025-03-15', depotId: 'dep', securityId: 'etf', type: 'dividend', amount: 2000, taxes: 300, cashAccountId: 'giro' });
  h = C.holdings(s, 'dep')[0];
  assert.equal(h.dividends, 1700);

  s.securities[0].prices.push({ date: '2025-04-01', price: 150 });
  assert.equal(C.depotValue(s, 'dep'), 225000);
  assert.equal(C.depotValue(s, 'dep', '2025-03-31'), 195000);

  // Kauf/Verkauf nicht in Auswertung, Dividende schon
  const rep = C.categoryReport(s, { from: '2025-01-01', to: '2025-12-31' });
  const divCat = s.transactions.find(t => t.tradeId === 'd1').categoryId;
  assert.ok(divCat);
  assert.equal(rep.byCat[divCat]['2025-03'], 1700);
  assert.equal(rep.expense['2025-01'], 0);

  // Trade ändern ersetzt die Geldbuchung
  C.saveTrade(s, { id: 'b1', date: '2025-01-01', depotId: 'dep', securityId: 'etf', type: 'buy', qty: 10, price: 100, fees: 0, cashAccountId: 'giro' });
  assert.equal(s.transactions.filter(t => t.tradeId === 'b1').length, 1);
  assert.equal(s.transactions.find(t => t.tradeId === 'b1').amount, -100000);
  C.deleteTrade(s, 'b1');
  assert.equal(s.transactions.filter(t => t.tradeId === 'b1').length, 0);
});

test('Sparplan-Regel erzeugt geschätzten Kauf', () => {
  const s = baseState();
  s.securities.push({ id: 'etf', name: 'World', prices: [{ date: '2025-01-01', price: 50 }] });
  s.recurring.push({ id: 'sp', name: 'Sparplan', active: true, mode: 'auto', unit: 'month', interval: 1, accountId: 'giro', depotId: 'dep', securityId: 'etf', amount: 10000, fees: 0, startDate: '2025-01-02', anchorDay: 2, nextDate: '2025-01-02' });
  C.processRecurring(s, '2025-02-05');
  assert.equal(s.trades.length, 2);
  assert.equal(s.trades[0].qty, 2);
  assert.equal(s.trades[0].estimated, true);
  assert.equal(C.accountBalance(s, 'giro'), 80000);
  assert.equal(C.depotValue(s, 'dep'), 20000);
});

test('Prognose berücksichtigt Umbuchungen und Sparpläne', () => {
  const s = baseState();
  s.securities.push({ id: 'etf', name: 'World', prices: [{ date: '2025-01-01', price: 50 }] });
  s.recurring.push({ id: 'a', active: true, mode: 'confirm', unit: 'month', interval: 1, accountId: 'giro', counterAccountId: 'tg', amount: -10000, nextDate: '2025-02-01', anchorDay: 1 });
  s.recurring.push({ id: 'b', active: true, mode: 'auto', unit: 'month', interval: 1, accountId: 'giro', depotId: 'dep', securityId: 'etf', amount: 5000, fees: 0, nextDate: '2025-02-01', anchorDay: 1 });
  const f = C.forecastBalances(s, '2025-01-15', '2025-03-31');
  assert.equal(f.giro, 100000 - 20000 - 10000);
  assert.equal(f.tg, 20000);
  assert.equal(f.dep, 10000);
});

test('CSV: Trenner, Anführungszeichen, Kopfzeile, Zuordnung', () => {
  const text = '﻿Kontonummer;DE123\n\nBuchungstag;Valuta;Auftraggeber / Begünstigter;Verwendungszweck;Betrag (EUR)\n01.03.2025;01.03.2025;"REWE; Markt";"Einkauf ""Wocheneinkauf""";-45,20\n02.03.2025;02.03.2025;Arbeitgeber;Gehalt;3.200,00\n';
  const d = C.detectDelimiter(text);
  assert.equal(d, ';');
  const rows = C.parseCSV(text, d);
  const h = C.detectHeaderRow(rows);
  assert.equal(rows[h][0], 'Buchungstag');
  const m = C.guessMapping(rows[h]);
  assert.equal(m.date, 0);
  assert.equal(m.payee, 2);
  assert.equal(m.purpose, 3);
  assert.equal(m.amount, 4);
  assert.equal(rows[h + 1][2], 'REWE; Markt');
  assert.equal(rows[h + 1][3], 'Einkauf "Wocheneinkauf"');
  assert.equal(C.parseMoney(rows[h + 2][4]), 320000);
});

test('Regeln und Kategorie-Vorschlag', () => {
  const s = baseState();
  s.rules.push({ pattern: 'rewe|edeka', categoryId: 'food', field: 'any' });
  assert.equal(C.applyRules(s.rules, 'REWE Markt GmbH', ''), 'food');
  assert.equal(C.applyRules(s.rules, 'Bäcker', 'bei Edeka'), 'food');
  assert.equal(C.applyRules(s.rules, 'Aral', ''), null);
  s.transactions.push({ date: '2025-01-01', payee: 'Aral', categoryId: 'fuel', accountId: 'giro', amount: -1 });
  assert.equal(C.suggestCategory(s, 'aral '), 'fuel');
});

test('Beispieldaten sind konsistent', () => {
  const s = C.demoState('2025-06-15');
  assert.ok(s.accounts.length >= 5);
  assert.ok(s.transactions.length > 50);
  assert.ok(C.netWorth(s) > 0);
  const json = JSON.parse(JSON.stringify(s));
  C.normalizeState(json);
  assert.equal(C.netWorth(json), C.netWorth(s));
  assert.equal(C.netWorthHistory(s, '2025-06-15', 6).length, 6);
});

test('Umbuchungs-Paare erkennen und zusammenführen', () => {
  const s = baseState();
  s.transactions.push({ id: 'a', date: '2025-05-02', accountId: 'giro', amount: -50000, payee: 'Übertrag', tags: [] });
  s.transactions.push({ id: 'b', date: '2025-05-03', accountId: 'tg', amount: 50000, payee: 'Übertrag', tags: [] });
  s.transactions.push({ id: 'c', date: '2025-05-20', accountId: 'giro', amount: 50000, payee: 'Gehalt', tags: [] });
  s.transactions.push({ id: 'd', date: '2025-05-02', accountId: 'giro', amount: -999, payee: 'X', tags: [] });
  const pairs = C.findTransferPairs(s, 3);
  assert.equal(pairs.length, 1);
  assert.equal(pairs[0].from.id, 'a');
  assert.equal(pairs[0].to.id, 'b');
  const before = C.netWorth(s);
  C.mergeTransferPair(s, 'a', 'b');
  assert.equal(s.transactions.length, 3);
  assert.equal(C.accountBalance(s, 'tg'), 50000);
  assert.equal(C.netWorth(s), before);
});

test('CSV-Zuordnung Finanzguru-ähnlicher Export', () => {
  const header = ['Buchungstag', 'Referenzkonto', 'Name Referenzkonto', 'Betrag', 'Kontostand', 'Waehrung', 'Beguenstigter/Auftraggeber', 'IBAN Beguenstigter/Auftraggeber', 'Verwendungszweck', 'Analyse-Hauptkategorie', 'Analyse-Unterkategorie'];
  const m = C.guessMapping(header);
  assert.equal(m.date, 0);
  assert.equal(m.account, 2);
  assert.equal(m.amount, 3);
  assert.equal(m.payee, 6);
  assert.equal(m.purpose, 8);
  assert.equal(m.category, 9);
  assert.equal(m.subcategory, 10);
});

test('Abgleich: alte Buchungen nachtragen und Anfangsbestand anpassen', () => {
  const s = baseState();
  // Konto wurde heute mit 1.000 € angelegt, dann alte Buchungen nachgetragen
  s.transactions.push({ id: 'o1', date: '2025-01-10', accountId: 'giro', amount: -30000, tags: [] });
  s.transactions.push({ id: 'o2', date: '2025-02-10', accountId: 'giro', amount: 50000, tags: [] });
  assert.equal(C.accountBalance(s, 'giro', '2025-06-01'), 120000);
  const diff = C.reconcileAccount(s, 'giro', '2025-06-01', 100000, 'opening');
  assert.equal(diff, -20000);
  assert.equal(s.accounts[0].opening, 80000);
  assert.equal(C.accountBalance(s, 'giro', '2025-06-01'), 100000);
  assert.equal(C.accountBalance(s, 'giro', '2025-01-31'), 50000);
  assert.equal(s.transactions.length, 2);
  // Korrekturbuchung zählt nicht in Auswertungen
  C.reconcileAccount(s, 'giro', '2025-06-02', 99000, 'booking');
  assert.equal(C.accountBalance(s, 'giro', '2025-06-02'), 99000);
  const rep = C.categoryReport(s, { from: '2025-06-01', to: '2025-06-30' });
  assert.equal(rep.expense['2025-06'], 0);
  assert.equal(C.reconcileAccount(s, 'giro', '2025-06-02', 99000, 'booking'), 0);
});

function loanState() {
  const s = baseState();
  s.categories.push({ id: 'zins', name: 'Kreditzinsen', type: 'expense', parentId: null });
  // 300.000 € Restschuld, 3,5 % Sollzins, 1.500 € Rate
  s.accounts.push({ id: 'kredit', name: 'Baufinanzierung', type: 'darlehen', opening: -30000000,
    loan: { rate: 3.5, amount: 35000000, fixedUntil: '2035-06-30', interestCategoryId: 'zins' } });
  s.recurring.push({ id: 'rate', name: 'Rate', active: true, mode: 'auto', unit: 'month', interval: 1,
    accountId: 'giro', loanAccountId: 'kredit', amount: 150000, startDate: '2025-07-30', anchorDay: 30, nextDate: '2025-07-30' });
  return s;
}

test('Kredit: Rate teilt sich in Zinsen (Ausgabe) und Tilgung', () => {
  const s = loanState();
  C.processRecurring(s, '2025-08-31');
  assert.equal(s.transactions.length, 4);
  const z1 = s.transactions.find(t => t.loanPart === 'interest' && t.date === '2025-07-30');
  assert.equal(z1.amount, -87500);               // 300.000 × 3,5 % / 12
  assert.equal(C.loanDebt(s, 'kredit', '2025-07-31'), 30000000 - 62500);
  const z2 = s.transactions.find(t => t.loanPart === 'interest' && t.date === '2025-08-30');
  assert.equal(z2.amount, -Math.round((30000000 - 62500) * 3.5 / 1200));
  // Girokonto: nur die Raten
  assert.equal(C.accountBalance(s, 'giro', '2025-08-31'), 100000 - 300000);
  // Auswertung: nur die Zinsen sind Ausgaben
  const rep = C.categoryReport(s, { from: '2025-07-01', to: '2025-08-31' });
  assert.equal(rep.expense['2025-07'], -87500);
  // Vermögen sinkt nur um die Zinsen
  assert.equal(C.netWorth(s, '2025-08-31'), 100000 - 30000000 + z1.amount + z2.amount);
});

test('Kredit: Tilgungsplan, Sondertilgung, Restschuld Zinsbindung, Prognose', () => {
  const s = loanState();
  const st = C.loanStats(s, 'kredit', '2025-07-01');
  assert.equal(st.debt, 30000000);
  const rows = st.schedule.rows;
  assert.equal(rows[0].interest, 87500);
  assert.equal(rows[0].principal, 62500);
  assert.ok(st.schedule.payoffDate > '2050-01-01' && st.schedule.payoffDate < '2055-12-31', st.schedule.payoffDate);
  assert.equal(rows[rows.length - 1].rest, 0);
  assert.ok(st.restAtFixedEnd > 0 && st.restAtFixedEnd < 30000000);
  const withExtra = C.loanStats(s, 'kredit', '2025-07-01', { extra: 500000, extraMonth: 12 });
  assert.ok(withExtra.schedule.payoffDate < st.schedule.payoffDate);
  assert.ok(withExtra.schedule.totalInterest < st.schedule.totalInterest);
  // Rate deckt Zinsen nicht -> läuft nie ab
  const never = C.loanSchedule({ debt: 30000000, rate: 7, payment: 150000, firstDate: '2025-01-01' });
  assert.equal(never.neverEnds, true);
  // Prognose rechnet mit Zinsen
  const f = C.forecastBalances(s, '2025-07-01', '2025-08-31');
  assert.equal(f.giro, 100000 - 300000);
  assert.equal(f.kredit, -30000000 + 150000 - 87500 + 150000 - Math.round((30000000 - 62500) * 3.5 / 1200));
  // Monatlicher Anteil
  assert.equal(C.monthlyEquivalent(s.recurring[0]), -150000);
});

test('Kredit: letzte Rate nur bis Restschuld, danach Regel inaktiv', () => {
  const s = loanState();
  s.accounts.find(a => a.id === 'kredit').opening = -100000;
  C.processRecurring(s, '2026-12-31');
  assert.equal(C.loanDebt(s, 'kredit', '2026-12-31'), 0);
  assert.equal(s.recurring[0].active, false);
  const pays = s.transactions.filter(t => t.loanPart === 'payment');
  assert.equal(pays.length, 1);
  assert.equal(pays[0].amount, -(100000 + Math.round(100000 * 3.5 / 1200)));
});

test('Auswertung mit geplanten Buchungen (Einnahmen, Ausgaben, Kreditzinsen)', () => {
  const s = loanState();
  s.recurring.push({ id: 'gehalt', name: 'Gehalt', active: true, mode: 'auto', unit: 'month', interval: 1, accountId: 'giro', amount: 400000, categoryId: 'geh', nextDate: '2025-08-25', anchorDay: 25 });
  s.recurring.push({ id: 'bonus', name: 'Bonus', active: true, mode: 'confirm', unit: 'year', interval: 1, accountId: 'giro', amount: 100000, categoryId: 'geh', nextDate: '2025-07-15', anchorDay: 15 });
  s.recurring.push({ id: 'spar', name: 'Sparen', active: true, mode: 'auto', unit: 'month', interval: 1, accountId: 'giro', counterAccountId: 'tg', amount: -50000, nextDate: '2025-08-01', anchorDay: 1 });
  s.categories.push({ id: 'geh', name: 'Gehalt', type: 'income', parentId: null });
  s.transactions.push({ id: 'x', date: '2025-07-10', accountId: 'giro', amount: -2000, categoryId: null, tags: [] });
  const opts = { from: '2025-07-01', to: '2025-09-30', today: '2025-07-20', planned: true };
  const r = C.categoryReport(s, opts);
  // Juli: gebuchte Ausgabe + überfälliger Bonus (bestätigen) + Kreditzinsen 30.07.
  assert.equal(r.planned.income['2025-07'], 100000);
  assert.equal(r.planned.expense['2025-07'], -87500);
  assert.equal(r.expense['2025-07'], -2000 - 87500);
  // August/September: Gehalt + fallende Zinsen; Umbuchung zählt nicht
  assert.equal(r.income['2025-08'], 400000);
  assert.equal(r.planned.expense['2025-08'], -Math.round((30000000 - 62500) * 3.5 / 1200));
  assert.ok(r.planned.expense['2025-09'] > r.planned.expense['2025-08']);
  assert.equal(r.byCat.zins['2025-07'], -87500);
  assert.equal(r.none.expense['2025-07'], -2000);
  // Ohne planned: nur Gebuchtes
  const r2 = C.categoryReport(s, Object.assign({}, opts, { planned: false }));
  assert.equal(r2.income['2025-08'], 0);
  assert.equal(r2.expense['2025-07'], -2000);
});

test('Depot-CSV: Bestand und Umsätze erkennen', () => {
  const bestand = ['Bezeichnung', 'ISIN', 'WKN', 'Stück', 'Einstandskurs', 'Einstandswert', 'Aktueller Kurs', 'Kurswert', 'Währung'];
  const m = C.guessDepotMapping(bestand);
  assert.equal(m.mode, 'holdings');
  assert.deepEqual([m.name, m.isin, m.wkn, m.qty, m.costPrice, m.costValue, m.price, m.value], [0, 1, 2, 3, 4, 5, 6, 7]);
  const ums = ['Datum', 'Transaktionsart', 'Wertpapier', 'ISIN', 'Anzahl', 'Kurs', 'Betrag', 'Gebühren', 'Steuern'];
  const u = C.guessDepotMapping(ums);
  assert.equal(u.mode, 'trades');
  assert.deepEqual([u.date, u.type, u.name, u.isin, u.qty, u.price, u.amount, u.fees, u.taxes], [0, 1, 2, 3, 4, 5, 6, 7, 8]);
  assert.equal(C.parseTradeType('Kauf'), 'buy');
  assert.equal(C.parseTradeType('Sparplanausführung'), 'buy');
  assert.equal(C.parseTradeType('Verkauf'), 'sell');
  assert.equal(C.parseTradeType('Ausschüttung'), 'dividend');
  assert.equal(C.parseTradeType('Depoteingang'), 'in');
  assert.equal(C.parseTradeType('Irgendwas'), null);
  const s = baseState();
  s.securities.push({ id: 'w', name: 'MSCI World', isin: 'IE00B4L5Y983', prices: [] });
  assert.equal(C.findSecurity(s, 'ie00b4l5y983', '').id, 'w');
  assert.equal(C.findSecurity(s, '', 'msci world').id, 'w');
  assert.equal(C.findSecurity(s, 'XX', 'Anderes'), null);
});
