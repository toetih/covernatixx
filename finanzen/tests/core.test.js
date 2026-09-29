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
