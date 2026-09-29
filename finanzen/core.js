/*
 * Finanzen – Kernlogik (ohne DOM).
 * Läuft im Browser (window.FinCore) und in Node (require) für Tests.
 *
 * Konventionen:
 *  - Geldbeträge in Cent (Integer). Negativ = Abgang vom Konto.
 *  - Datumswerte als ISO-String 'YYYY-MM-DD'.
 *  - Umbuchung: ein Datensatz mit accountId (Quelle) und counterAccountId (Ziel).
 *    amount ist aus Sicht der Quelle (also negativ); das Ziel erhält -amount.
 *  - Wertpapier-Kurse und Stückzahlen als Float (Euro bzw. Stück).
 */
(function (root) {
  'use strict';

  var SCHEMA_VERSION = 1;

  // ---------------------------------------------------------------- IDs
  function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  // ---------------------------------------------------------------- Geld
  var moneyFmt = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' });
  var numFmt2 = new Intl.NumberFormat('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  function formatMoney(cents, opts) {
    if (cents == null || isNaN(cents)) return '–';
    var s = moneyFmt.format(cents / 100);
    if (opts && opts.sign && cents > 0) s = '+' + s;
    return s;
  }

  /** Betrag ohne Währungszeichen, z. B. für Eingabefelder: "1.234,56" */
  function formatAmountInput(cents) {
    if (cents == null || isNaN(cents)) return '';
    return numFmt2.format(cents / 100);
  }

  function formatNumber(n, digits) {
    if (n == null || isNaN(n)) return '–';
    var d = digits == null ? 2 : digits;
    return new Intl.NumberFormat('de-DE', { minimumFractionDigits: 0, maximumFractionDigits: d }).format(n);
  }

  function formatPercent(ratio) {
    if (ratio == null || !isFinite(ratio)) return '–';
    return new Intl.NumberFormat('de-DE', { style: 'percent', minimumFractionDigits: 1, maximumFractionDigits: 1, signDisplay: 'exceptZero' }).format(ratio);
  }

  /**
   * Parst deutsche und internationale Schreibweisen als Dezimalzahl.
   * "1.234,56" / "1234,56" / "1,234.56" / "1234.56" / "-12,5 €" / "1.500" (=1500)
   * Gibt NaN zurück, wenn nichts Sinnvolles erkannt wird.
   */
  function parseDecimal(input) {
    if (typeof input === 'number') return input;
    if (input == null) return NaN;
    var s = String(input).trim();
    if (!s) return NaN;
    var negative = false;
    // Klammern als Minus (Buchhaltungsformat), führendes/nachgestelltes Minus
    if (/^\(.*\)$/.test(s)) { negative = true; s = s.slice(1, -1); }
    s = s.replace(/[€\s ]|EUR/gi, '');
    if (/^[-−–]/.test(s)) { negative = !negative; s = s.slice(1); }
    else if (/[-−–]$/.test(s)) { negative = !negative; s = s.slice(0, -1); }
    if (s.charAt(0) === '+') s = s.slice(1);
    if (!/^[\d.,']+$/.test(s)) return NaN;
    s = s.replace(/'/g, '');
    var lastComma = s.lastIndexOf(',');
    var lastDot = s.lastIndexOf('.');
    if (lastComma >= 0 && lastDot >= 0) {
      if (lastComma > lastDot) s = s.replace(/\./g, '').replace(',', '.');
      else s = s.replace(/,/g, '');
    } else if (lastComma >= 0) {
      // "12,50" -> Dezimalkomma; "1,234,567" -> englische Tausender
      if (s.split(',').length > 2) s = s.replace(/,/g, '');
      else s = s.replace(',', '.');
    } else if (lastDot >= 0) {
      var dots = s.split('.').length - 1;
      var afterD = s.length - lastDot - 1;
      // "1.500" oder "1.234.567" -> Tausenderpunkte (deutsche Schreibweise)
      if (dots > 1 || (afterD === 3 && !/^0\./.test(s))) s = s.replace(/\./g, '');
    }
    var n = parseFloat(s);
    if (isNaN(n)) return NaN;
    return negative ? -n : n;
  }

  function parseMoney(input) {
    var n = parseDecimal(input);
    if (isNaN(n)) return NaN;
    return Math.round(n * 100);
  }

  // ---------------------------------------------------------------- Datum
  function pad(n) { return n < 10 ? '0' + n : '' + n; }

  function isoFromParts(y, m, d) { return y + '-' + pad(m) + '-' + pad(d); }

  function todayISO(now) {
    var d = now || new Date();
    return isoFromParts(d.getFullYear(), d.getMonth() + 1, d.getDate());
  }

  function parts(iso) {
    return { y: +iso.slice(0, 4), m: +iso.slice(5, 7), d: +iso.slice(8, 10) };
  }

  function daysInMonth(y, m) { return new Date(Date.UTC(y, m, 0)).getUTCDate(); }

  function addDays(iso, n) {
    var p = parts(iso);
    var dt = new Date(Date.UTC(p.y, p.m - 1, p.d + n));
    return isoFromParts(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate());
  }

  /** Monate addieren; Tag wird auf anchorDay (Default: aktueller Tag) gesetzt und am Monatsende gekappt. */
  function addMonths(iso, n, anchorDay) {
    var p = parts(iso);
    var total = p.y * 12 + (p.m - 1) + n;
    var y = Math.floor(total / 12);
    var m = total - y * 12 + 1;
    var d = Math.min(anchorDay || p.d, daysInMonth(y, m));
    return isoFromParts(y, m, d);
  }

  function monthKey(iso) { return iso.slice(0, 7); }
  function startOfMonth(iso) { return iso.slice(0, 8) + '01'; }
  function endOfMonth(iso) {
    var p = parts(iso);
    return isoFromParts(p.y, p.m, daysInMonth(p.y, p.m));
  }

  /** Liste der Monatsschlüssel 'YYYY-MM' von from bis to (inklusive). */
  function monthRange(fromIso, toIso) {
    var out = [];
    var cur = startOfMonth(fromIso);
    var end = startOfMonth(toIso);
    var guard = 0;
    while (cur <= end && guard++ < 1200) {
      out.push(monthKey(cur));
      cur = addMonths(cur, 1, 1);
    }
    return out;
  }

  var MONTHS_SHORT = ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'];
  var MONTHS_LONG = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];

  function formatDate(iso) {
    if (!iso) return '';
    return iso.slice(8, 10) + '.' + iso.slice(5, 7) + '.' + iso.slice(0, 4);
  }

  function formatMonth(key, long) {
    var m = +key.slice(5, 7) - 1;
    return (long ? MONTHS_LONG[m] + ' ' : MONTHS_SHORT[m] + ' ') + (long ? key.slice(0, 4) : key.slice(2, 4));
  }

  /** Parst "31.12.2025", "31.12.25", "2025-12-31", "31/12/2025", "12/31/2025" (nicht eindeutig -> TT/MM) */
  function parseDate(input, refYear) {
    if (!input) return null;
    var s = String(input).trim();
    var m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
    if (m) return validDate(+m[1], +m[2], +m[3]);
    m = s.match(/^(\d{1,2})[./](\d{1,2})[./](\d{2,4})$/);
    if (m) {
      var y = +m[3];
      if (y < 100) y += y > 70 ? 1900 : 2000;
      return validDate(y, +m[2], +m[1]);
    }
    m = s.match(/^(\d{1,2})\.(\d{1,2})\.?$/);
    if (m) return validDate(refYear || new Date().getFullYear(), +m[2], +m[1]);
    return null;
  }

  function validDate(y, m, d) {
    if (m < 1 || m > 12 || d < 1 || d > daysInMonth(y, m)) return null;
    return isoFromParts(y, m, d);
  }

  function diffDays(aIso, bIso) {
    var a = parts(aIso), b = parts(bIso);
    return Math.round((Date.UTC(b.y, b.m - 1, b.d) - Date.UTC(a.y, a.m - 1, a.d)) / 86400000);
  }

  // ---------------------------------------------------------------- Wiederkehrende Buchungen
  var FREQUENCIES = [
    { key: 'w1', label: 'wöchentlich', unit: 'week', interval: 1 },
    { key: 'w2', label: 'alle 2 Wochen', unit: 'week', interval: 2 },
    { key: 'm1', label: 'monatlich', unit: 'month', interval: 1 },
    { key: 'm2', label: 'alle 2 Monate', unit: 'month', interval: 2 },
    { key: 'm3', label: 'vierteljährlich', unit: 'month', interval: 3 },
    { key: 'm6', label: 'halbjährlich', unit: 'month', interval: 6 },
    { key: 'y1', label: 'jährlich', unit: 'year', interval: 1 }
  ];

  function frequencyLabel(rule) {
    for (var i = 0; i < FREQUENCIES.length; i++) {
      var f = FREQUENCIES[i];
      if (f.unit === rule.unit && f.interval === rule.interval) return f.label;
    }
    var names = { week: 'Wochen', month: 'Monate', year: 'Jahre' };
    return 'alle ' + rule.interval + ' ' + (names[rule.unit] || rule.unit);
  }

  /** Nächster Termin nach dateIso gemäß Regel (ausgehend vom Anker-Tag). */
  function stepDate(rule, dateIso) {
    var n = rule.interval || 1;
    if (rule.unit === 'week') return addDays(dateIso, 7 * n);
    var anchor = rule.anchorDay || parts(rule.startDate || dateIso).d;
    if (rule.unit === 'year') return addMonths(dateIso, 12 * n, anchor);
    return addMonths(dateIso, n, anchor);
  }

  /** Alle Termine der Regel von rule.nextDate bis toIso (inklusive), begrenzt durch endDate. */
  function occurrences(rule, toIso, limit) {
    var out = [];
    if (!rule.nextDate) return out;
    var d = rule.nextDate;
    var max = limit || 500;
    while (d <= toIso && (!rule.endDate || d <= rule.endDate) && out.length < max) {
      out.push(d);
      d = stepDate(rule, d);
    }
    return out;
  }

  /** Betrag pro Monat (Durchschnitt), vorzeichenbehaftet. */
  function monthlyEquivalent(rule) {
    var a = ruleAmount(rule);
    var n = rule.interval || 1;
    if (rule.unit === 'week') return Math.round(a * 52 / 12 / n);
    if (rule.unit === 'year') return Math.round(a / (12 * n));
    return Math.round(a / n);
  }

  function ruleKind(rule) {
    if (rule.securityId) return 'savingsplan';
    if (rule.counterAccountId) return 'transfer';
    return rule.amount < 0 ? 'expense' : 'income';
  }

  /** Betrag der Regel aus Sicht von rule.accountId (Sparplan: negativ). */
  function ruleAmount(rule) {
    if (rule.securityId) return -Math.abs(rule.amount);
    return rule.amount;
  }

  /** Legt die Buchung (oder den Sparplan-Kauf) für einen Termin an. overrides überschreibt Felder. */
  function materializeRule(state, rule, dateIso, overrides) {
    overrides = overrides || {};
    if (rule.securityId) {
      var total = Math.abs(overrides.amount != null ? overrides.amount : rule.amount);
      var fees = rule.fees || 0;
      var sec = findById(state.securities, rule.securityId);
      var price = overrides.price != null ? overrides.price : latestPrice(state, sec, dateIso).price;
      var qty = price ? roundQty((total - fees) / 100 / price) : 0;
      var trade = {
        id: uid(), date: dateIso, depotId: rule.depotId, securityId: rule.securityId, type: 'buy',
        qty: overrides.qty != null ? overrides.qty : qty, price: price || 0, fees: fees, taxes: 0,
        cashAccountId: rule.accountId || null, note: rule.note || '', recurringId: rule.id,
        estimated: overrides.qty == null
      };
      saveTrade(state, trade);
      return { trade: trade };
    }
    var t = {
      id: uid(),
      date: dateIso,
      accountId: rule.accountId,
      counterAccountId: rule.counterAccountId || null,
      amount: overrides.amount != null ? overrides.amount : rule.amount,
      payee: rule.payee || rule.name || '',
      categoryId: rule.counterAccountId ? null : (rule.categoryId || null),
      note: overrides.note != null ? overrides.note : (rule.note || ''),
      tags: (rule.tags || []).slice(),
      recurringId: rule.id
    };
    state.transactions.push(t);
    return { transaction: t };
  }

  /** Verarbeitet alle fälligen automatischen Regeln bis heute. Gibt Anzahl angelegter Buchungen zurück. */
  function processRecurring(state, today) {
    var created = 0;
    state.recurring.forEach(function (rule) {
      if (!rule.active || rule.mode !== 'auto') return;
      var dates = occurrences(rule, today, 400);
      dates.forEach(function (d) {
        materializeRule(state, rule, d);
        created++;
      });
      if (dates.length) rule.nextDate = stepDate(rule, dates[dates.length - 1]);
      finishIfEnded(rule);
    });
    return created;
  }

  function finishIfEnded(rule) {
    if (rule.endDate && rule.nextDate && rule.nextDate > rule.endDate) rule.active = false;
  }

  /** Fällige Termine von Regeln im Modus „bestätigen“. */
  function dueConfirmations(state, today) {
    var out = [];
    state.recurring.forEach(function (rule) {
      if (!rule.active || rule.mode === 'auto') return;
      occurrences(rule, today, 60).forEach(function (d) { out.push({ rule: rule, date: d }); });
    });
    out.sort(function (a, b) { return a.date < b.date ? -1 : a.date > b.date ? 1 : 0; });
    return out;
  }

  /** Bucht den nächsten Termin einer Regel und schaltet sie weiter. */
  function bookNext(state, rule, overrides) {
    var res = materializeRule(state, rule, (overrides && overrides.date) || rule.nextDate, overrides);
    skipNext(rule);
    return res;
  }

  function skipNext(rule) {
    rule.nextDate = stepDate(rule, rule.nextDate);
    finishIfEnded(rule);
  }

  /** Alle Termine aktiver Regeln im Zeitraum [from, to] (für Vorschau/Prognose). */
  function upcoming(state, fromIso, toIso) {
    var out = [];
    state.recurring.forEach(function (rule) {
      if (!rule.active) return;
      occurrences(rule, toIso, 400).forEach(function (d) {
        if (d >= fromIso) out.push({ rule: rule, date: d });
      });
    });
    out.sort(function (a, b) { return a.date < b.date ? -1 : a.date > b.date ? 1 : 0; });
    return out;
  }

  /**
   * Prognose: Kontostände zum Datum toIso inklusive aller noch nicht gebuchten
   * Termine (auch überfälliger Bestätigungs-Termine). Depotwerte bleiben konstant,
   * Sparpläne erhöhen den Depotwert um den Sparbetrag (abzgl. Gebühren).
   */
  function forecastBalances(state, today, toIso) {
    var bal = {};
    state.accounts.forEach(function (a) { bal[a.id] = accountBalance(state, a.id, today); });
    state.recurring.forEach(function (rule) {
      if (!rule.active) return;
      occurrences(rule, toIso, 1000).forEach(function () {
        var amt = ruleAmount(rule);
        if (rule.accountId && bal[rule.accountId] != null) bal[rule.accountId] += amt;
        if (rule.counterAccountId && bal[rule.counterAccountId] != null) bal[rule.counterAccountId] -= amt;
        if (rule.securityId && rule.depotId && bal[rule.depotId] != null) bal[rule.depotId] += Math.abs(rule.amount) - (rule.fees || 0);
      });
    });
    return bal;
  }

  // ---------------------------------------------------------------- Hilfen
  function findById(list, id) {
    if (!id || !list) return null;
    for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
    return null;
  }

  function roundQty(q) { return Math.round(q * 1e6) / 1e6; }

  function byDateAsc(a, b) { return a.date < b.date ? -1 : a.date > b.date ? 1 : 0; }

  // ---------------------------------------------------------------- Kontostände
  /**
   * Wirkung einer Buchung auf ein Konto (Cent), 0 wenn nicht betroffen.
   */
  function effectOn(t, accountId) {
    var e = 0;
    if (t.accountId === accountId) e += t.amount;
    if (t.counterAccountId === accountId) e -= t.amount;
    return e;
  }

  function isTransfer(t) { return !!t.counterAccountId; }

  /** Zählt die Buchung als Einnahme/Ausgabe (nicht Umbuchung, nicht Wertpapierkauf/-verkauf)? */
  function isIncomeExpense(t) {
    if (t.counterAccountId) return false;
    if (t.tradeId && t.tradeType !== 'dividend') return false;
    if (t.excludeFromReports) return false;
    return true;
  }

  function txType(t) {
    if (t.counterAccountId) return 'transfer';
    if (t.tradeId) return t.tradeType === 'dividend' ? 'income' : 'trade';
    return t.amount < 0 ? 'expense' : 'income';
  }

  /** Kontostand zum Stichtag (inklusive). Depots: Bargeld-Anteil + Marktwert der Positionen. */
  function accountBalance(state, accountId, asOf) {
    var acc = findById(state.accounts, accountId);
    if (!acc) return 0;
    var sum = acc.opening || 0;
    var txs = state.transactions;
    for (var i = 0; i < txs.length; i++) {
      var t = txs[i];
      if (asOf && t.date > asOf) continue;
      if (t.accountId === accountId) sum += t.amount;
      else if (t.counterAccountId === accountId) sum -= t.amount;
    }
    if (acc.type === 'depot') sum += depotValue(state, accountId, asOf);
    return sum;
  }

  /** Alle Kontostände zum Stichtag in einem Durchlauf. */
  function allBalances(state, asOf) {
    var bal = {};
    state.accounts.forEach(function (a) { bal[a.id] = a.opening || 0; });
    state.transactions.forEach(function (t) {
      if (asOf && t.date > asOf) return;
      if (bal[t.accountId] != null) bal[t.accountId] += t.amount;
      if (t.counterAccountId && bal[t.counterAccountId] != null) bal[t.counterAccountId] -= t.amount;
    });
    state.accounts.forEach(function (a) {
      if (a.type === 'depot') bal[a.id] += depotValue(state, a.id, asOf);
    });
    return bal;
  }

  /** Bargeld-Stand eines Kontos zum Stichtag (bei Depots ohne Wertpapiere). */
  function cashBalance(state, accountId, asOf) {
    var acc = findById(state.accounts, accountId);
    if (!acc) return 0;
    return accountBalance(state, accountId, asOf) - (acc.type === 'depot' ? depotValue(state, accountId, asOf) : 0);
  }

  /**
   * Abgleich auf einen echten Kontostand zum Datum.
   * mode 'opening': Anfangsbestand so verschieben, dass es passt (für nachgetragene alte Buchungen –
   *                 der gesamte Verlauf verschiebt sich mit, keine Korrekturbuchung).
   * mode 'booking': Korrekturbuchung am Datum (zählt nicht in Auswertungen).
   * Gibt die Differenz in Cent zurück (0 = passte schon).
   */
  function reconcileAccount(state, accountId, dateIso, realCents, mode) {
    var acc = findById(state.accounts, accountId);
    if (!acc) return 0;
    var diff = realCents - cashBalance(state, accountId, dateIso);
    if (!diff) return 0;
    if (mode === 'opening') acc.opening = (acc.opening || 0) + diff;
    else state.transactions.push({
      id: uid(), date: dateIso, accountId: accountId, counterAccountId: null, amount: diff,
      payee: 'Saldo-Korrektur', categoryId: null, note: 'Abgleich auf ' + formatMoney(realCents), tags: [], excludeFromReports: true
    });
    return diff;
  }

  function netWorth(state, asOf, balances) {
    var bal = balances || allBalances(state, asOf);
    var sum = 0;
    state.accounts.forEach(function (a) {
      if (a.excludeFromNetWorth) return;
      sum += bal[a.id] || 0;
    });
    return sum;
  }

  /** Vermögen zum Monatsende für die letzten n Monate (inklusive laufendem Monat bis heute). */
  function netWorthHistory(state, today, months) {
    var out = [];
    for (var i = months - 1; i >= 0; i--) {
      var d = endOfMonth(addMonths(startOfMonth(today), -i, 1));
      if (d > today) d = today;
      out.push({ date: d, month: monthKey(d), value: netWorth(state, d) });
    }
    return out;
  }

  // ---------------------------------------------------------------- Depots
  var TRADE_TYPES = {
    buy: 'Kauf',
    sell: 'Verkauf',
    dividend: 'Dividende/Ausschüttung',
    in: 'Einbuchung (Übertrag rein)',
    out: 'Ausbuchung (Übertrag raus)'
  };

  /** Geldwirkung eines Trades auf das Verrechnungskonto (Cent). */
  function tradeCashEffect(tr) {
    var gross = Math.round((tr.qty || 0) * (tr.price || 0) * 100);
    var fees = tr.fees || 0, taxes = tr.taxes || 0;
    switch (tr.type) {
      case 'buy': return -(gross + fees);
      case 'sell': return gross - fees - taxes;
      case 'dividend': return (tr.amount || 0) - taxes - fees;
      default: return 0;
    }
  }

  /** Letzter bekannter Kurs eines Wertpapiers zum Stichtag (manuelle Kurse + Handelskurse). */
  function latestPrice(state, sec, asOf) {
    var best = { price: null, date: null };
    if (!sec) return best;
    (sec.prices || []).forEach(function (p) {
      if (asOf && p.date > asOf) return;
      if (!best.date || p.date >= best.date) best = { price: p.price, date: p.date };
    });
    state.trades.forEach(function (tr) {
      if (tr.securityId !== sec.id || !tr.price || (tr.type !== 'buy' && tr.type !== 'sell' && tr.type !== 'in')) return;
      if (asOf && tr.date > asOf) return;
      if (!best.date || tr.date > best.date) best = { price: tr.price, date: tr.date };
    });
    return best;
  }

  /**
   * Positionen eines Depots (Durchschnittskostenmethode).
   * Liefert Array { securityId, security, qty, cost, avgPrice, price, priceDate, value, gain, gainPct, dividends, realized }
   * Beträge in Cent, qty/price als Float.
   */
  function holdings(state, depotId, asOf) {
    var map = {};
    var trades = state.trades.filter(function (tr) {
      return tr.depotId === depotId && (!asOf || tr.date <= asOf);
    }).sort(byDateAsc);
    trades.forEach(function (tr) {
      var h = map[tr.securityId];
      if (!h) h = map[tr.securityId] = { securityId: tr.securityId, qty: 0, cost: 0, dividends: 0, realized: 0, fees: 0 };
      var gross = Math.round((tr.qty || 0) * (tr.price || 0) * 100);
      if (tr.type === 'buy' || tr.type === 'in') {
        h.qty = roundQty(h.qty + (tr.qty || 0));
        h.cost += gross + (tr.fees || 0);
        h.fees += tr.fees || 0;
      } else if (tr.type === 'sell' || tr.type === 'out') {
        var q = Math.min(tr.qty || 0, h.qty);
        var costPart = h.qty > 0 ? Math.round(h.cost * q / h.qty) : 0;
        if (tr.type === 'sell') h.realized += gross - (tr.fees || 0) - (tr.taxes || 0) - costPart;
        h.qty = roundQty(h.qty - q);
        h.cost -= costPart;
        if (h.qty <= 1e-9) { h.qty = 0; h.cost = 0; }
        h.fees += tr.fees || 0;
      } else if (tr.type === 'dividend') {
        h.dividends += (tr.amount || 0) - (tr.taxes || 0) - (tr.fees || 0);
      }
    });
    return Object.keys(map).map(function (sid) {
      var h = map[sid];
      var sec = findById(state.securities, sid);
      var lp = latestPrice(state, sec, asOf);
      h.security = sec;
      h.price = lp.price;
      h.priceDate = lp.date;
      h.value = lp.price != null ? Math.round(h.qty * lp.price * 100) : h.cost;
      h.avgPrice = h.qty > 0 ? h.cost / 100 / h.qty : null;
      h.gain = h.value - h.cost;
      h.gainPct = h.cost > 0 ? h.gain / h.cost : null;
      return h;
    });
  }

  function depotValue(state, depotId, asOf) {
    var sum = 0;
    holdings(state, depotId, asOf).forEach(function (h) { sum += h.value; });
    return sum;
  }

  /** Trade speichern (neu oder ersetzen) und verknüpfte Geldbuchung synchronisieren. */
  function saveTrade(state, trade) {
    var idx = -1;
    for (var i = 0; i < state.trades.length; i++) if (state.trades[i].id === trade.id) idx = i;
    if (idx >= 0) state.trades[idx] = trade; else state.trades.push(trade);
    syncTradeTransaction(state, trade);
    return trade;
  }

  function deleteTrade(state, tradeId) {
    state.trades = state.trades.filter(function (t) { return t.id !== tradeId; });
    state.transactions = state.transactions.filter(function (t) { return t.tradeId !== tradeId; });
  }

  function syncTradeTransaction(state, trade) {
    state.transactions = state.transactions.filter(function (t) { return t.tradeId !== trade.id; });
    var effect = tradeCashEffect(trade);
    if (!trade.cashAccountId || !effect) return null;
    var sec = findById(state.securities, trade.securityId);
    var name = sec ? sec.name : 'Wertpapier';
    var label = { buy: 'Kauf', sell: 'Verkauf', dividend: 'Dividende' }[trade.type] || 'Wertpapier';
    var t = {
      id: uid(), date: trade.date, accountId: trade.cashAccountId, counterAccountId: null,
      amount: effect, payee: label + ' ' + name,
      categoryId: trade.type === 'dividend' ? (dividendCategoryId(state) || null) : null,
      note: trade.note || '', tags: [], tradeId: trade.id, tradeType: trade.type
    };
    state.transactions.push(t);
    return t;
  }

  function dividendCategoryId(state) {
    for (var i = 0; i < state.categories.length; i++) {
      var c = state.categories[i];
      if (c.type === 'income' && /dividend/i.test(c.name)) return c.id;
    }
    return null;
  }

  // ---------------------------------------------------------------- Kategorien
  function categoryPath(state, id) {
    var c = findById(state.categories, id);
    if (!c) return '';
    var p = c.parentId ? findById(state.categories, c.parentId) : null;
    return p ? p.name + ' › ' + c.name : c.name;
  }

  function mainCategoryId(state, id) {
    var c = findById(state.categories, id);
    if (!c) return null;
    return c.parentId || c.id;
  }

  /** Kategorien als sortierte Baumliste: [{cat, children:[...]}] */
  function categoryTree(state, type) {
    var mains = state.categories.filter(function (c) { return !c.parentId && (!type || c.type === type); });
    mains.sort(function (a, b) { return a.name.localeCompare(b.name, 'de'); });
    return mains.map(function (m) {
      var kids = state.categories.filter(function (c) { return c.parentId === m.id; });
      kids.sort(function (a, b) { return a.name.localeCompare(b.name, 'de'); });
      return { cat: m, children: kids };
    });
  }

  function descendantIds(state, id) {
    var out = [id];
    state.categories.forEach(function (c) { if (c.parentId === id) out.push(c.id); });
    return out;
  }

  // ---------------------------------------------------------------- Auswertungen
  /**
   * Summen je Kategorie und Monat.
   * opts: { from, to, accountIds (Array|null) }
   * Rückgabe: { months:[...], byCat: {catId: {month: cents}}, byMain: {...}, income: {month}, expense: {month} }
   */
  function categoryReport(state, opts) {
    var months = monthRange(opts.from, opts.to);
    var accSet = opts.accountIds ? toSet(opts.accountIds) : null;
    var byCat = {}, byMain = {}, income = {}, expense = {};
    months.forEach(function (m) { income[m] = 0; expense[m] = 0; });
    state.transactions.forEach(function (t) {
      if (t.date < opts.from || t.date > opts.to) return;
      if (!isIncomeExpense(t)) return;
      if (accSet && !accSet[t.accountId]) return;
      var m = monthKey(t.date);
      var cid = t.categoryId && findById(state.categories, t.categoryId) ? t.categoryId : '__none';
      var mid = cid === '__none' ? '__none' : mainCategoryId(state, cid);
      add(byCat, cid, m, t.amount);
      add(byMain, mid, m, t.amount);
      if (t.amount >= 0) income[m] += t.amount; else expense[m] += t.amount;
    });
    return { months: months, byCat: byCat, byMain: byMain, income: income, expense: expense };
  }

  function add(obj, key, m, v) {
    if (!obj[key]) obj[key] = {};
    obj[key][m] = (obj[key][m] || 0) + v;
  }

  function toSet(arr) {
    var s = {};
    arr.forEach(function (x) { s[x] = true; });
    return s;
  }

  /** Summe einer Kategorie (inkl. Unterkategorien) im Zeitraum. */
  function categorySpent(state, catId, from, to, accountIds) {
    var ids = toSet(descendantIds(state, catId));
    var accSet = accountIds ? toSet(accountIds) : null;
    var sum = 0;
    state.transactions.forEach(function (t) {
      if (t.date < from || t.date > to || !isIncomeExpense(t)) return;
      if (accSet && !accSet[t.accountId]) return;
      if (ids[t.categoryId]) sum += t.amount;
    });
    return sum;
  }

  // ---------------------------------------------------------------- Auto-Kategorisierung
  /** Regeln: { pattern: 'text' (Teilstring, Groß/klein egal; mehrere mit | trennen), categoryId, field: 'any'|'payee' } */
  function applyRules(rules, payee, purpose) {
    var hay = ((payee || '') + ' ' + (purpose || '')).toLowerCase();
    var payeeL = (payee || '').toLowerCase();
    for (var i = 0; i < rules.length; i++) {
      var r = rules[i];
      if (!r.pattern || !r.categoryId) continue;
      var target = r.field === 'payee' ? payeeL : hay;
      var alts = r.pattern.toLowerCase().split('|');
      for (var j = 0; j < alts.length; j++) {
        var a = alts[j].trim();
        if (a && target.indexOf(a) >= 0) return r.categoryId;
      }
    }
    return null;
  }

  /** Letzte Kategorie, die für einen Empfänger verwendet wurde. */
  function suggestCategory(state, payee) {
    if (!payee) return null;
    var p = payee.trim().toLowerCase();
    var best = null;
    state.transactions.forEach(function (t) {
      if (!t.categoryId || !t.payee || t.payee.trim().toLowerCase() !== p) return;
      if (!best || t.date > best.date) best = t;
    });
    if (best) return best.categoryId;
    return applyRules(state.rules || [], payee, '');
  }

  // ---------------------------------------------------------------- CSV
  function detectDelimiter(text) {
    var lines = text.split(/\r?\n/).slice(0, 30);
    var cands = [';', ',', '\t', '|'];
    var best = ';', bestScore = -1;
    cands.forEach(function (d) {
      var counts = lines.map(function (l) { return splitCSVLine(l, d).length; }).filter(function (n) { return n > 1; });
      if (!counts.length) return;
      // häufigste Spaltenanzahl * Häufigkeit
      var freq = {};
      counts.forEach(function (n) { freq[n] = (freq[n] || 0) + 1; });
      var score = 0;
      Object.keys(freq).forEach(function (n) { score = Math.max(score, freq[n] * Math.min(+n, 12)); });
      if (score > bestScore) { bestScore = score; best = d; }
    });
    return best;
  }

  function splitCSVLine(line, d) {
    return parseCSV(line, d)[0] || [];
  }

  /** RFC-4180-ähnlicher Parser mit Anführungszeichen und Zeilenumbrüchen in Feldern. */
  function parseCSV(text, d) {
    var rows = [], row = [], field = '', inQ = false, i = 0, n = text.length;
    if (text.charCodeAt(0) === 0xFEFF) i = 1;
    for (; i < n; i++) {
      var c = text[i];
      if (inQ) {
        if (c === '"') {
          if (text[i + 1] === '"') { field += '"'; i++; } else inQ = false;
        } else field += c;
      } else if (c === '"' && field === '') {
        inQ = true;
      } else if (c === d) {
        row.push(field); field = '';
      } else if (c === '\n' || c === '\r') {
        if (c === '\r' && text[i + 1] === '\n') i++;
        row.push(field); field = '';
        rows.push(row); row = [];
      } else field += c;
    }
    if (field !== '' || row.length) { row.push(field); rows.push(row); }
    return rows.filter(function (r) { return !(r.length === 1 && r[0].trim() === ''); });
  }

  /** Erste Zeile, die wie eine Kopfzeile aussieht (enthält Datum/Betrag o. ä.). */
  function detectHeaderRow(rows) {
    var re = /(datum|date|buchungstag|valuta|betrag|amount|umsatz|empf|auftrag|verwendung)/i;
    for (var i = 0; i < Math.min(rows.length, 40); i++) {
      var hits = rows[i].filter(function (c) { return re.test(c); }).length;
      if (hits >= 2) return i;
    }
    // sonst: erste Zeile mit der häufigsten Spaltenanzahl
    var freq = {};
    rows.forEach(function (r) { freq[r.length] = (freq[r.length] || 0) + 1; });
    var common = +Object.keys(freq).sort(function (a, b) { return freq[b] - freq[a]; })[0];
    for (var j = 0; j < rows.length; j++) if (rows[j].length === common) return j;
    return 0;
  }

  /** Spalten automatisch zuordnen anhand der Kopfzeile. */
  function guessMapping(header) {
    var map = { date: -1, amount: -1, debit: -1, credit: -1, payee: -1, purpose: -1, category: -1, subcategory: -1, account: -1, note: -1 };
    function find(re, exclude) {
      for (var i = 0; i < header.length; i++) {
        var h = (header[i] || '').toLowerCase();
        if (re.test(h) && !(exclude && exclude.test(h))) return i;
      }
      return -1;
    }
    map.date = find(/^(buchungs(tag|datum)|datum|date|buchung)/);
    if (map.date < 0) map.date = find(/(datum|date|tag)/, /valuta|wert/);
    map.amount = find(/^(betrag|amount|umsatz)/, /ursprung|original|fremd/);
    if (map.amount < 0) map.amount = find(/(betrag|amount|umsatz)/, /ursprung|original|fremd|währung/);
    map.debit = find(/^(soll|ausgang|lastschrift|debit)/);
    map.credit = find(/^(haben|eingang|gutschrift|credit)/);
    map.payee = find(/(empfänger|empfaenger|auftraggeber|zahlungspflichtige|name|gegenkonto|payee|beguenstigter|begünstigter)/, /iban|bic|konto ?nr|kontonummer|blz|referenzkonto|kontoname|account/);
    map.purpose = find(/(verwendungszweck|zweck|beschreibung|buchungstext|description|purpose|memo|details)/);
    map.category = find(/(hauptkategorie|^kategorie|^category)/);
    map.subcategory = find(/(unterkategorie|subcategory)/);
    map.account = find(/(name referenzkonto|kontoname|account name|^konto$|^account$)/);
    map.note = find(/(notiz|note|kommentar)/);
    return map;
  }

  /**
   * Findet Buchungspaare, die vermutlich eine Umbuchung zwischen eigenen Konten sind
   * (z. B. nach CSV-Import mehrerer Konten): gleicher Betrag mit umgekehrtem Vorzeichen,
   * verschiedene Konten, max. maxDays Tage auseinander, beide keine Umbuchung/Wertpapier.
   */
  function findTransferPairs(state, maxDays) {
    maxDays = maxDays == null ? 3 : maxDays;
    var cand = state.transactions.filter(function (t) { return !t.counterAccountId && !t.tradeId && t.amount; });
    var byAmt = {};
    cand.forEach(function (t) {
      var k = Math.abs(t.amount);
      (byAmt[k] = byAmt[k] || []).push(t);
    });
    var used = {}, pairs = [];
    Object.keys(byAmt).forEach(function (k) {
      var list = byAmt[k];
      if (list.length < 2) return;
      list.sort(byDateAsc);
      list.forEach(function (neg) {
        if (neg.amount >= 0 || used[neg.id]) return;
        var best = null, bestD = Infinity;
        list.forEach(function (pos) {
          if (pos.amount <= 0 || used[pos.id] || pos.accountId === neg.accountId) return;
          var d = Math.abs(diffDays(neg.date, pos.date));
          if (d <= maxDays && d < bestD) { best = pos; bestD = d; }
        });
        if (best) { used[neg.id] = used[best.id] = true; pairs.push({ from: neg, to: best, days: bestD }); }
      });
    });
    pairs.sort(function (a, b) { return byDateAsc(b.from, a.from); });
    return pairs;
  }

  /** Paar zu einer Umbuchung zusammenführen (Abgang bleibt, Eingang entfällt). */
  function mergeTransferPair(state, fromId, toId) {
    var from = findById(state.transactions, fromId), to = findById(state.transactions, toId);
    if (!from || !to) return false;
    from.counterAccountId = to.accountId;
    from.categoryId = null;
    if (!from.note && to.note) from.note = to.note;
    state.transactions = state.transactions.filter(function (t) { return t.id !== toId; });
    return true;
  }

  /** Einheitlicher Schlüssel für Duplikaterkennung. */
  function dupKey(accountId, date, amount, payee) {
    return accountId + '|' + date + '|' + amount + '|' + String(payee || '').trim().toLowerCase().slice(0, 24);
  }

  function csvEscape(v, d) {
    var s = v == null ? '' : String(v);
    if (s.indexOf(d) >= 0 || /["\r\n]/.test(s)) s = '"' + s.replace(/"/g, '""') + '"';
    return s;
  }

  function toCSV(rows, d) {
    d = d || ';';
    return rows.map(function (r) { return r.map(function (v) { return csvEscape(v, d); }).join(d); }).join('\r\n');
  }

  // ---------------------------------------------------------------- Zustand
  var ACCOUNT_TYPES = {
    giro: 'Girokonto',
    tagesgeld: 'Tagesgeld / Sparkonto',
    kreditkarte: 'Kreditkarte',
    bar: 'Bargeld',
    depot: 'Depot',
    darlehen: 'Kredit / Darlehen',
    sonstiges: 'Sonstiges'
  };

  var SECURITY_KINDS = ['ETF', 'Aktie', 'Fonds', 'Anleihe', 'Krypto', 'Edelmetall', 'Sonstiges'];

  var DEFAULT_CATEGORIES = {
    expense: [
      ['Wohnen', ['Miete / Kredit', 'Nebenkosten', 'Strom', 'Internet & Telefon', 'Rundfunkbeitrag', 'Einrichtung & Reparatur']],
      ['Lebenshaltung', ['Lebensmittel', 'Drogerie', 'Kleidung', 'Haushalt']],
      ['Mobilität', ['Kraftstoff / Laden', 'Kfz-Versicherung', 'Kfz-Steuer', 'Werkstatt & Wartung', 'ÖPNV / Bahn', 'Parken']],
      ['Versicherungen', ['Haftpflicht', 'Hausrat', 'Berufsunfähigkeit', 'Kranken / Pflege', 'Rechtsschutz', 'Leben / Risiko']],
      ['Freizeit', ['Restaurant & Café', 'Hobby', 'Urlaub & Reisen', 'Sport', 'Kultur & Events']],
      ['Abos & Mitgliedschaften', ['Streaming', 'Software', 'Vereine', 'Zeitschriften']],
      ['Gesundheit', ['Apotheke', 'Arzt / Zahnarzt']],
      ['Familie & Geschenke', ['Geschenke', 'Kinder', 'Spenden']],
      ['Finanzen', ['Bankgebühren', 'Zinsen', 'Steuern']],
      ['Business Keyboard-Sounds', ['Software & Plugins', 'Hardware & Equipment', 'Werbung & Marketing', 'Shop-Gebühren', 'Material & Versand']],
      ['Sonstiges', []]
    ],
    income: [
      ['Gehalt', []],
      ['Business-Einnahmen', ['Shopify', 'Etsy', 'Workshops & Kurse', 'Gigs']],
      ['Kapitalerträge', ['Zinsen', 'Dividenden']],
      ['Erstattungen', ['Steuererstattung', 'Versicherung', 'Rückzahlungen']],
      ['Sonstige Einnahmen', []]
    ]
  };

  var PALETTE = ['#2f6fdb', '#e0612b', '#1f9d74', '#c43f7a', '#7a58d6', '#c89a12', '#1b8fb0', '#8a6d4b', '#d1453b', '#4c8c2b', '#6b7280'];

  function defaultCategories() {
    var out = [];
    ['expense', 'income'].forEach(function (type) {
      DEFAULT_CATEGORIES[type].forEach(function (entry, i) {
        var main = { id: uid(), name: entry[0], parentId: null, type: type, color: PALETTE[i % PALETTE.length], budget: 0 };
        out.push(main);
        entry[1].forEach(function (sub) {
          out.push({ id: uid(), name: sub, parentId: main.id, type: type, color: main.color, budget: 0 });
        });
      });
    });
    return out;
  }

  function emptyState() {
    return {
      schema: SCHEMA_VERSION,
      accounts: [],
      categories: defaultCategories(),
      transactions: [],
      recurring: [],
      securities: [],
      trades: [],
      rules: [],
      settings: { theme: 'auto' },
      meta: { created: new Date().toISOString(), savedAt: null, lastBackup: null }
    };
  }

  /** Fehlende Felder ergänzen (ältere/fremde Dateien robust laden). */
  function normalizeState(s) {
    if (!s || typeof s !== 'object') throw new Error('Keine gültigen Finanzdaten.');
    var base = emptyState();
    ['accounts', 'transactions', 'recurring', 'securities', 'trades', 'rules'].forEach(function (k) {
      if (!Array.isArray(s[k])) s[k] = [];
    });
    if (!Array.isArray(s.categories)) s.categories = base.categories;
    s.settings = Object.assign({}, base.settings, s.settings || {});
    s.meta = Object.assign({}, base.meta, s.meta || {});
    s.schema = SCHEMA_VERSION;
    s.accounts.forEach(function (a, i) {
      if (a.order == null) a.order = i;
      if (!a.type) a.type = 'giro';
      if (a.opening == null) a.opening = 0;
    });
    s.transactions.forEach(function (t) {
      if (!Array.isArray(t.tags)) t.tags = t.tags ? String(t.tags).split(',').map(trim).filter(Boolean) : [];
      // ältere Korrekturbuchungen nicht in Auswertungen zählen
      if (t.payee === 'Saldo-Korrektur' && !t.categoryId && !t.counterAccountId) t.excludeFromReports = true;
    });
    s.securities.forEach(function (x) { if (!Array.isArray(x.prices)) x.prices = []; });
    s.recurring.forEach(function (r) {
      if (!r.unit) r.unit = 'month';
      if (!r.interval) r.interval = 1;
      if (!r.mode) r.mode = 'auto';
      if (r.active == null) r.active = true;
    });
    return s;
  }

  function trim(x) { return String(x).trim(); }

  function sortedAccounts(state, includeArchived) {
    return state.accounts.filter(function (a) { return includeArchived || !a.archived; })
      .slice().sort(function (a, b) {
        var ga = a.group || '', gb = b.group || '';
        if (ga !== gb) return ga.localeCompare(gb, 'de');
        return (a.order || 0) - (b.order || 0) || a.name.localeCompare(b.name, 'de');
      });
  }

  function accountGroups(state) {
    var seen = {}, out = [];
    sortedAccounts(state, true).forEach(function (a) {
      var g = a.group || '';
      if (!seen[g]) { seen[g] = true; out.push(g); }
    });
    return out;
  }

  // ---------------------------------------------------------------- Beispieldaten
  function demoState(today) {
    var s = emptyState();
    today = today || todayISO();
    function cat(name, type) {
      for (var i = 0; i < s.categories.length; i++) {
        if (s.categories[i].name === name && (!type || s.categories[i].type === type)) return s.categories[i].id;
      }
      return null;
    }
    function acc(name, type, group, opening) {
      var a = { id: uid(), name: name, type: type, group: group, opening: opening, order: s.accounts.length, archived: false, note: '' };
      s.accounts.push(a);
      return a.id;
    }
    var giro = acc('Girokonto', 'giro', 'Privat', 185000);
    var tg = acc('Tagesgeld', 'tagesgeld', 'Rücklagen', 800000);
    var kk = acc('Kreditkarte', 'kreditkarte', 'Privat', 0);
    var biz = acc('Geschäftskonto Keyboard-Sounds', 'giro', 'Business', 120000);
    var depot1 = acc('ETF-Depot', 'depot', 'Geldanlage', 0);
    var depot2 = acc('Aktien-Depot', 'depot', 'Geldanlage', 250000);

    var start = addMonths(startOfMonth(today), -5, 1);
    function rule(o) {
      var r = Object.assign({ id: uid(), active: true, mode: 'auto', unit: 'month', interval: 1, tags: [], note: '' }, o);
      r.anchorDay = parts(r.startDate).d;
      r.nextDate = r.startDate;
      s.recurring.push(r);
      return r;
    }
    rule({ name: 'Gehalt', accountId: giro, amount: 385000, payee: 'Arbeitgeber GmbH', categoryId: cat('Gehalt'), startDate: addDays(start, 26) });
    rule({ name: 'Miete', accountId: giro, amount: -115000, payee: 'Vermieter', categoryId: cat('Miete / Kredit'), startDate: addDays(start, 2) });
    rule({ name: 'Strom', accountId: giro, amount: -9500, payee: 'Stadtwerke', categoryId: cat('Strom'), startDate: addDays(start, 14) });
    rule({ name: 'Internet', accountId: giro, amount: -3999, payee: 'Telekom', categoryId: cat('Internet & Telefon'), startDate: addDays(start, 9) });
    rule({ name: 'Rundfunkbeitrag', accountId: giro, amount: -5508, payee: 'ARD ZDF Deutschlandradio', categoryId: cat('Rundfunkbeitrag'), startDate: addDays(start, 14), unit: 'month', interval: 3 });
    rule({ name: 'Kfz-Versicherung', accountId: giro, amount: -48000, payee: 'HUK', categoryId: cat('Kfz-Versicherung'), startDate: addMonths(start, 3, 1), unit: 'year', interval: 1, mode: 'confirm' });
    rule({ name: 'Streaming', accountId: kk, amount: -1799, payee: 'Netflix', categoryId: cat('Streaming'), startDate: addDays(start, 4) });
    rule({ name: 'Kreditkartenausgleich', accountId: giro, counterAccountId: kk, amount: -30000, payee: 'Kreditkarte', startDate: addDays(start, 27) });
    rule({ name: 'Sparrate Tagesgeld', accountId: giro, counterAccountId: tg, amount: -30000, payee: 'Sparen', startDate: addDays(start, 27) });
    rule({ name: 'Plugin-Abo', accountId: biz, amount: -2499, payee: 'Native Instruments', categoryId: cat('Software & Plugins'), startDate: addDays(start, 11) });

    var world = { id: uid(), name: 'MSCI World ETF', isin: 'IE00B4L5Y983', kind: 'ETF', prices: [] };
    var em = { id: uid(), name: 'Emerging Markets ETF', isin: 'IE00BKM4GZ66', kind: 'ETF', prices: [] };
    var apple = { id: uid(), name: 'Apple', isin: 'US0378331005', kind: 'Aktie', prices: [] };
    s.securities.push(world, em, apple);
    // Kursverlauf (vereinfachte Zufallsreihe, deterministisch)
    var pw = 88, pe = 31, pa = 185;
    monthRange(start, today).forEach(function (m, i) {
      pw *= 1 + ((i * 37) % 7 - 2) / 100;
      pe *= 1 + ((i * 53) % 9 - 4) / 100;
      pa *= 1 + ((i * 29) % 11 - 4) / 100;
      var d = m + '-01' <= today ? m + '-01' : today;
      world.prices.push({ date: d, price: Math.round(pw * 100) / 100 });
      em.prices.push({ date: d, price: Math.round(pe * 100) / 100 });
      apple.prices.push({ date: d, price: Math.round(pa * 100) / 100 });
    });
    s.trades.push({ id: uid(), date: addDays(start, -40), depotId: depot1, securityId: world.id, type: 'in', qty: 120, price: 72.5, fees: 0, taxes: 0, cashAccountId: null, note: 'Übertrag Altbestand' });
    s.trades.push({ id: uid(), date: addDays(start, 3), depotId: depot2, securityId: apple.id, type: 'buy', qty: 10, price: 182.4, fees: 100, taxes: 0, cashAccountId: depot2, note: '' });
    rule({ name: 'Sparplan MSCI World', accountId: giro, depotId: depot1, securityId: world.id, amount: 30000, fees: 0, payee: 'Sparplan', startDate: addDays(start, 1) });
    rule({ name: 'Sparplan EM', accountId: giro, depotId: depot1, securityId: em.id, amount: 10000, fees: 0, payee: 'Sparplan', startDate: addDays(start, 1) });

    s.rules.push({ id: uid(), pattern: 'rewe|edeka|aldi|lidl|kaufland', categoryId: cat('Lebensmittel'), field: 'any' });
    s.rules.push({ id: uid(), pattern: 'aral|shell|esso|jet ', categoryId: cat('Kraftstoff / Laden'), field: 'any' });
    s.rules.push({ id: uid(), pattern: 'shopify', categoryId: cat('Shopify'), field: 'any' });

    // Variable Ausgaben
    var shops = [['REWE', 'Lebensmittel', 4500], ['Aldi', 'Lebensmittel', 3200], ['dm', 'Drogerie', 1800], ['Aral', 'Kraftstoff / Laden', 6500], ['Pizzeria Roma', 'Restaurant & Café', 3800], ['Thomann', 'Hobby', 8900]];
    var seed = 7;
    function rnd() { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; }
    for (var d = start; d <= today; d = addDays(d, 1)) {
      if (rnd() < 0.35) {
        var sh = shops[Math.floor(rnd() * shops.length)];
        s.transactions.push({ id: uid(), date: d, accountId: rnd() < 0.3 ? kk : giro, amount: -Math.round(sh[2] * (0.5 + rnd())), payee: sh[0], categoryId: cat(sh[1]), note: '', tags: [] });
      }
      if (rnd() < 0.12) {
        s.transactions.push({ id: uid(), date: d, accountId: biz, amount: Math.round(2900 + rnd() * 9000), payee: rnd() < 0.6 ? 'Shopify Payout' : 'Etsy Payout', categoryId: cat(rnd() < 0.6 ? 'Shopify' : 'Etsy'), note: '', tags: ['Business'] });
      }
    }
    s.transactions.push({ id: uid(), date: addDays(start, 50), accountId: giro, amount: -120000, payee: 'Reisebüro', categoryId: cat('Urlaub & Reisen'), note: 'Sommerurlaub', tags: ['Urlaub'] });
    s.trades.push({ id: uid(), date: addDays(start, 60), depotId: depot2, securityId: apple.id, type: 'dividend', qty: 0, price: 0, amount: 230, fees: 0, taxes: 61, cashAccountId: depot2, note: '' });
    s.trades.forEach(function (tr) { syncTradeTransaction(s, tr); });
    processRecurring(s, today);
    s.meta.demo = true;
    return s;
  }

  // ---------------------------------------------------------------- Export
  var api = {
    SCHEMA_VERSION: SCHEMA_VERSION,
    uid: uid,
    // Geld
    formatMoney: formatMoney, formatAmountInput: formatAmountInput, formatNumber: formatNumber, formatPercent: formatPercent,
    parseDecimal: parseDecimal, parseMoney: parseMoney,
    // Datum
    todayISO: todayISO, addDays: addDays, addMonths: addMonths, daysInMonth: daysInMonth, parts: parts,
    monthKey: monthKey, startOfMonth: startOfMonth, endOfMonth: endOfMonth, monthRange: monthRange,
    formatDate: formatDate, formatMonth: formatMonth, parseDate: parseDate, diffDays: diffDays,
    MONTHS_LONG: MONTHS_LONG,
    // Wiederkehrend
    FREQUENCIES: FREQUENCIES, frequencyLabel: frequencyLabel, stepDate: stepDate, occurrences: occurrences,
    monthlyEquivalent: monthlyEquivalent, ruleKind: ruleKind, ruleAmount: ruleAmount, materializeRule: materializeRule,
    processRecurring: processRecurring, dueConfirmations: dueConfirmations, bookNext: bookNext, skipNext: skipNext,
    upcoming: upcoming, forecastBalances: forecastBalances,
    // Konten
    findById: findById, effectOn: effectOn, isTransfer: isTransfer, isIncomeExpense: isIncomeExpense, txType: txType,
    accountBalance: accountBalance, allBalances: allBalances, cashBalance: cashBalance, reconcileAccount: reconcileAccount, netWorth: netWorth, netWorthHistory: netWorthHistory,
    sortedAccounts: sortedAccounts, accountGroups: accountGroups, ACCOUNT_TYPES: ACCOUNT_TYPES,
    // Depots
    TRADE_TYPES: TRADE_TYPES, SECURITY_KINDS: SECURITY_KINDS, tradeCashEffect: tradeCashEffect, latestPrice: latestPrice,
    holdings: holdings, depotValue: depotValue, saveTrade: saveTrade, deleteTrade: deleteTrade,
    syncTradeTransaction: syncTradeTransaction, roundQty: roundQty,
    // Kategorien & Auswertung
    categoryPath: categoryPath, mainCategoryId: mainCategoryId, categoryTree: categoryTree, descendantIds: descendantIds,
    categoryReport: categoryReport, categorySpent: categorySpent, PALETTE: PALETTE,
    applyRules: applyRules, suggestCategory: suggestCategory,
    // CSV
    parseCSV: parseCSV, detectDelimiter: detectDelimiter, detectHeaderRow: detectHeaderRow, guessMapping: guessMapping,
    dupKey: dupKey, toCSV: toCSV, findTransferPairs: findTransferPairs, mergeTransferPair: mergeTransferPair,
    // Zustand
    emptyState: emptyState, normalizeState: normalizeState, demoState: demoState, defaultCategories: defaultCategories
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.FinCore = api;
})(typeof window !== 'undefined' ? window : this);
