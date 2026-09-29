/*
 * Finanzen – Oberfläche, Teil 2: Depots, Wiederkehrend, Auswertung, Kategorien & Regeln, Daten & Import.
 */
(function () {
  'use strict';
  var C = window.FinCore;
  var Store = window.FinStore;
  var App = window.App;
  var H = App.h;
  var $ = H.$, $$ = H.$$, esc = H.esc, money = H.money, today = H.today, acc = H.acc, cat = H.cat, accName = H.accName;

  function num(n, d) { return C.formatNumber(n, d == null ? 4 : d); }
  function sel(v, cur) { return v === cur ? ' selected' : ''; }

  // ================================================================ DEPOTS
  App.views.depots = function (el) {
    var s = App.state;
    var t = today();
    var depots = C.sortedAccounts(s, false).filter(function (a) { return a.type === 'depot'; });
    var html = '<div class="page-head"><div><h1>Depots</h1><div class="sub">Positionen nach Durchschnittskosten · Kurse pflegst du manuell (oder sie ergeben sich aus deinen Käufen).</div></div>' +
      '<div class="actions">' + (depots.length ? '<button class="btn" data-act="prices">Kurse aktualisieren</button><button class="btn" data-act="securities">Wertpapiere</button><button class="btn" data-act="plan">↻ Sparplan</button><button class="btn primary" data-act="trade" data-type="buy">+ Kauf</button>' : '') + '</div></div>';
    if (!depots.length) {
      html += '<div class="card"><div class="empty"><h3>Noch kein Depot</h3><p>Lege ein Konto vom Typ „Depot“ an – danach erfasst du hier Käufe, Verkäufe, Dividenden und Sparpläne.</p><button class="btn primary" data-act="new-depot">Depot anlegen</button></div></div>';
      el.innerHTML = html;
      el.onclick = function (e) { if (e.target.closest('[data-act="new-depot"]')) App.editAccount(null, { type: 'depot', group: 'Geldanlage' }); };
      return;
    }
    var totV = 0, totC = 0, totD = 0, totR = 0;
    var blocks = depots.map(function (d) {
      var hs = C.holdings(s, d.id, t);
      var open = hs.filter(function (h) { return h.qty > 0; });
      var v = 0, c = 0, div = 0, real = 0;
      hs.forEach(function (h) { v += h.value; c += h.cost; div += h.dividends; real += h.realized; });
      totV += v; totC += c; totD += div; totR += real;
      var cash = C.accountBalance(s, d.id, t) - v;
      var b = '<div class="card"><div class="card-head"><div><h2>' + esc(d.name) + '</h2><div class="help">Wert ' + esc(C.formatMoney(v)) + ' · Einstand ' + esc(C.formatMoney(c)) + ' · G/V ' + money(v - c, { color: true }) + (c ? ' (' + C.formatPercent((v - c) / c) + ')' : '') +
        (div ? ' · Ausschüttungen ' + esc(C.formatMoney(div)) : '') + (real ? ' · realisiert ' + money(real, { color: true }) : '') + (cash ? ' · Bargeld im Depot ' + esc(C.formatMoney(cash)) : '') + '</div></div>' +
        '<div class="actions"><button class="btn small" data-act="trade" data-type="buy" data-depot="' + d.id + '">Kauf</button><button class="btn small" data-act="trade" data-type="sell" data-depot="' + d.id + '">Verkauf</button><button class="btn small" data-act="trade" data-type="dividend" data-depot="' + d.id + '">Dividende</button><button class="btn small" data-act="trade" data-type="in" data-depot="' + d.id + '" title="Bestand übernehmen, z. B. beim Start oder Depotwechsel">Einbuchen</button></div></div>';
      if (!open.length) b += '<div class="empty">Keine offenen Positionen. Starte mit „Einbuchen“ für deinen aktuellen Bestand oder erfasse einen Kauf.</div>';
      else {
        b += '<div class="card-body flush tbl-wrap"><table class="tbl"><thead><tr><th>Wertpapier</th><th class="num">Stück</th><th class="num">Ø Einstand</th><th class="num">Kurs</th><th class="num">Wert</th><th class="num">G/V</th><th class="num">G/V %</th><th class="num">Anteil</th><th class="num">Ausschüttungen</th></tr></thead><tbody>';
        open.sort(function (x, y) { return y.value - x.value; }).forEach(function (h) {
          var sec = h.security || { name: '?' };
          var old = h.priceDate && C.diffDays(h.priceDate, t) > 7;
          b += '<tr><td><a href="#" data-sec="' + h.securityId + '">' + esc(sec.name) + '</a><div class="small">' + esc([sec.kind, sec.isin].filter(Boolean).join(' · ')) + '</div></td>' +
            '<td class="num">' + num(h.qty) + '</td><td class="num">' + (h.avgPrice != null ? esc(C.formatNumber(h.avgPrice, 2)) + ' €' : '–') + '</td>' +
            '<td class="num"><a href="#" data-price="' + h.securityId + '" title="Kurs eintragen">' + (h.price != null ? esc(C.formatNumber(h.price, 2)) + ' €' : 'eintragen') + '</a><div class="small' + (old ? ' neg' : '') + '">' + (h.priceDate ? C.formatDate(h.priceDate) : '') + '</div></td>' +
            '<td class="num bold">' + money(h.value) + '</td><td class="num">' + money(h.gain, { color: true }) + '</td><td class="num">' + esc(C.formatPercent(h.gainPct)) + '</td>' +
            '<td class="num">' + (v ? esc(C.formatPercent(h.value / v).replace('+', '')) : '–') + '</td><td class="num">' + (h.dividends ? money(h.dividends) : '<span class="muted">–</span>') + '</td></tr>';
        });
        b += '</tbody></table></div>';
      }
      var trades = s.trades.filter(function (tr) { return tr.depotId === d.id; }).sort(function (x, y) { return x.date < y.date ? 1 : -1; });
      if (trades.length) {
        b += '<details class="card-body" style="border-top:1px solid var(--border)"><summary class="bold" style="cursor:pointer">Transaktionen (' + trades.length + ')' + (trades.some(function (x) { return x.estimated; }) ? ' <span class="badge warn">' + trades.filter(function (x) { return x.estimated; }).length + ' geschätzt</span>' : '') + '</summary>' +
          '<div class="tbl-wrap mt" style="max-height:360px"><table class="tbl"><thead><tr><th>Datum</th><th>Art</th><th>Wertpapier</th><th class="num">Stück</th><th class="num">Kurs</th><th class="num">Gebühren/Steuern</th><th class="num">Geldbewegung</th><th>Verrechnungskonto</th></tr></thead><tbody>';
        trades.forEach(function (tr) {
          var sec = C.findById(s.securities, tr.securityId);
          b += '<tr class="click" data-trade="' + tr.id + '"><td class="nowrap">' + C.formatDate(tr.date) + '</td><td>' + esc(C.TRADE_TYPES[tr.type]) + (tr.estimated ? ' <span class="badge warn" title="Aus Sparplan geschätzt – bitte Stück/Kurs laut Abrechnung korrigieren">geschätzt</span>' : '') + (tr.recurringId ? ' <span class="icon-rec">↻</span>' : '') + '</td>' +
            '<td>' + esc(sec ? sec.name : '?') + '</td><td class="num">' + (tr.type === 'dividend' ? '' : num(tr.qty)) + '</td><td class="num">' + (tr.type === 'dividend' ? '' : esc(C.formatNumber(tr.price, 4))) + '</td>' +
            '<td class="num">' + esc(C.formatMoney((tr.fees || 0) + (tr.taxes || 0))) + '</td><td class="num">' + money(C.tradeCashEffect(tr), { color: true }) + '</td><td>' + esc(tr.cashAccountId ? accName(tr.cashAccountId) : '–') + '</td></tr>';
        });
        b += '</tbody></table></div></details>';
      }
      return b + '</div>';
    });
    var plans = s.recurring.filter(function (r) { return r.securityId; });
    html += '<div class="kpis">' +
      kpi('Depotwert gesamt', money(totV)) + kpi('Einstand', money(totC)) +
      kpi('Kursgewinn (unrealisiert)', money(totV - totC, { color: true }) + ' <span class="muted" style="font-size:13px">' + esc(totC ? C.formatPercent((totV - totC) / totC) : '') + '</span>') +
      kpi('Ausschüttungen (netto)', money(totD)) + kpi('Realisierte G/V', money(totR, { color: true })) + '</div>';
    html += blocks.join('');
    if (plans.length) {
      html += '<div class="card"><div class="card-head"><h2>Sparpläne</h2><a class="btn small" href="#wiederkehrend">Alle wiederkehrenden</a></div><div class="card-body flush"><table class="tbl"><thead><tr><th>Name</th><th>Wertpapier</th><th>Depot</th><th>Rhythmus</th><th>Nächste Ausführung</th><th class="num">Rate</th></tr></thead><tbody>';
      plans.forEach(function (r) {
        var sec = C.findById(s.securities, r.securityId);
        html += '<tr class="click' + (r.active ? '' : ' muted') + '" data-rule="' + r.id + '"><td>' + esc(r.name) + '</td><td>' + esc(sec ? sec.name : '?') + '</td><td>' + esc(accName(r.depotId)) + '</td><td>' + esc(C.frequencyLabel(r)) + '</td><td>' + (r.active ? C.formatDate(r.nextDate) : 'beendet') + '</td><td class="num">' + money(Math.abs(r.amount)) + '</td></tr>';
      });
      html += '</tbody></table></div></div>';
    }
    el.innerHTML = html;
    el.onclick = function (e) {
      var a = e.target.closest('[data-act],[data-trade],[data-sec],[data-price],[data-rule]');
      if (!a) return;
      e.preventDefault();
      if (a.dataset.trade) return App.editTrade(C.findById(s.trades, a.dataset.trade));
      if (a.dataset.sec) return App.editSecurity(C.findById(s.securities, a.dataset.sec));
      if (a.dataset.price) return App.updatePrices([a.dataset.price]);
      if (a.dataset.rule) return App.editRule(C.findById(s.recurring, a.dataset.rule));
      var act = a.dataset.act;
      if (act === 'trade') App.editTrade(null, { type: a.dataset.type, depotId: a.dataset.depot });
      else if (act === 'prices') App.updatePrices(null);
      else if (act === 'securities') App.securitiesDialog();
      else if (act === 'plan') App.editRule(null, { kind: 'savingsplan' });
    };
  };

  function kpi(l, v) { return '<div class="kpi"><div class="l">' + esc(l) + '</div><div class="v">' + v + '</div></div>'; }

  function securityOptions(selected, withNew) {
    var list = App.state.securities.slice().sort(function (a, b) { return a.name.localeCompare(b.name, 'de'); });
    return '<option value="">– wählen –</option>' + list.map(function (x) {
      return '<option value="' + x.id + '"' + sel(x.id, selected) + '>' + esc(x.name) + (x.isin ? ' (' + esc(x.isin) + ')' : '') + '</option>';
    }).join('') + (withNew ? '<option value="__new">＋ Neues Wertpapier …</option>' : '');
  }

  function newSecurityFields() {
    return '<div class="full" id="new-sec" style="display:none;border:1px dashed var(--border-strong);border-radius:6px;padding:10px"><div class="form-grid">' +
      '<label>Name</label><input type="text" name="secName" placeholder="z. B. Vanguard FTSE All-World">' +
      '<label>ISIN / WKN</label><input type="text" name="secIsin" placeholder="optional">' +
      '<label>Art</label><select name="secKind">' + C.SECURITY_KINDS.map(function (k) { return '<option>' + k + '</option>'; }).join('') + '</select></div></div>';
  }
  function bindNewSecurity(form) {
    var s = form.elements.securityId;
    function upd() { $('#new-sec', form).style.display = s.value === '__new' ? 'block' : 'none'; if (s.value === '__new') form.elements.secName.focus(); }
    s.addEventListener('change', upd);
  }
  /** Liefert securityId; legt ggf. neues Wertpapier im übergebenen Zustand an. */
  function resolveSecurity(form, st) {
    var id = form.elements.securityId.value;
    if (id !== '__new') return id || null;
    var name = form.elements.secName.value.trim();
    if (!name) return null;
    var sec = { id: C.uid(), name: name, isin: form.elements.secIsin.value.trim(), kind: form.elements.secKind.value, prices: [] };
    st.securities.push(sec);
    return sec.id;
  }

  App.editTrade = function (tr, preset) {
    var s = App.state;
    var isNew = !tr;
    preset = preset || {};
    var depots = s.accounts.filter(function (a) { return a.type === 'depot'; });
    if (!depots.length) return App.toast('Bitte zuerst ein Konto vom Typ „Depot“ anlegen.', { error: true });
    var d = tr ? Object.assign({}, tr) : {
      date: today(), depotId: preset.depotId || depots[0].id, securityId: preset.securityId || '', type: preset.type || 'buy',
      qty: 0, price: 0, fees: 0, taxes: 0, amount: 0, cashAccountId: '', note: ''
    };
    if (isNew && !d.cashAccountId) {
      // letztes verwendetes Verrechnungskonto dieses Depots
      var last = s.trades.filter(function (x) { return x.depotId === d.depotId && x.cashAccountId; }).pop();
      d.cashAccountId = last ? last.cashAccountId : '';
    }
    function body() {
      var div = d.type === 'dividend', inout = d.type === 'in' || d.type === 'out';
      return '<div class="form-grid">' +
        '<label>Art</label><select name="type">' + Object.keys(C.TRADE_TYPES).map(function (k) { return '<option value="' + k + '"' + sel(k, d.type) + '>' + C.TRADE_TYPES[k] + '</option>'; }).join('') + '</select>' +
        '<label>Datum</label><input type="date" name="date" value="' + esc(d.date) + '">' +
        '<label>Depot</label><select name="depotId">' + App.accountOptions(d.depotId, { filter: function (a) { return a.type === 'depot'; } }) + '</select>' +
        '<label>Wertpapier</label><select name="securityId">' + securityOptions(d.securityId, true) + '</select>' + newSecurityFields() +
        (div
          ? '<label>Betrag brutto (€)</label><input type="text" class="amount" name="amount" value="' + (d.amount ? esc(C.formatAmountInput(d.amount)) : '') + '" placeholder="vor Steuern">'
          : '<label>Stück</label><input type="text" class="amount" name="qty" value="' + (d.qty ? esc(C.formatNumber(d.qty, 6)) : '') + '">' +
            '<label>Kurs je Stück (€)</label><input type="text" class="amount" name="price" value="' + (d.price ? esc(C.formatNumber(d.price, 4)) : '') + '">') +
        (inout ? '' : '<label>Gebühren (€)</label><input type="text" class="amount" name="fees" value="' + esc(C.formatAmountInput(d.fees || 0)) + '">') +
        (d.type === 'sell' || div ? '<label>Steuern (€)</label><input type="text" class="amount" name="taxes" value="' + esc(C.formatAmountInput(d.taxes || 0)) + '">' : '') +
        (inout ? '<span></span><div class="help">' + (d.type === 'in' ? 'Übernimmt einen bestehenden Bestand ohne Geldbewegung. Kurs = dein Einstandskurs (für die G/V-Berechnung).' : 'Bestand verlässt das Depot ohne Geldbewegung (z. B. Depotübertrag).') + '</div>'
          : '<label>Verrechnungskonto</label><select name="cashAccountId"><option value="">– keine Geldbuchung –</option>' + App.accountOptions(d.cashAccountId) + '</select>' +
            '<span></span><div class="help">Von/auf dieses Konto fließt das Geld. Bei Neobrokern mit Guthaben im Depot: das Depot selbst wählen.</div>') +
        '<label>Notiz</label><input type="text" name="note" value="' + esc(d.note || '') + '">' +
        '<label>Summe</label><div class="bold" id="trade-sum"></div>' +
        (d.estimated ? '<span></span><div class="help" style="color:var(--warn)">Aus Sparplan geschätzt (letzter Kurs). Trage Stück und Kurs laut Abrechnung ein.</div>' : '') +
        '</div>';
    }
    function read(form) {
      var f = form.elements;
      d.type = f.type.value; d.date = f.date.value; d.depotId = f.depotId.value;
      if (f.securityId.value !== '__new') d.securityId = f.securityId.value;
      if (f.qty) d.qty = Math.abs(C.parseDecimal(f.qty.value)) || 0;
      if (f.price) d.price = Math.abs(C.parseDecimal(f.price.value)) || 0;
      if (f.amount) d.amount = Math.abs(C.parseMoney(f.amount.value)) || 0;
      d.fees = f.fees ? Math.abs(C.parseMoney(f.fees.value)) || 0 : 0;
      d.taxes = f.taxes ? Math.abs(C.parseMoney(f.taxes.value)) || 0 : 0;
      d.cashAccountId = f.cashAccountId ? f.cashAccountId.value : '';
      d.note = f.note.value.trim();
    }
    function open() {
      var form = App.modal({
        title: (isNew ? 'Neu: ' : '') + C.TRADE_TYPES[d.type],
        body: body(),
        onSubmit: function (form) {
          read(form);
          if (!d.date || !d.depotId) return false;
          if (form.elements.securityId.value === '__new' && !form.elements.secName.value.trim()) { form.elements.secName.focus(); return false; }
          if (!form.elements.securityId.value) { App.toast('Bitte ein Wertpapier wählen.', { error: true }); return false; }
          if (d.type === 'dividend' ? !d.amount : !d.qty) { App.toast(d.type === 'dividend' ? 'Bitte den Betrag angeben.' : 'Bitte die Stückzahl angeben.', { error: true }); return false; }
          if (d.type === 'sell' || d.type === 'out') {
            var h = C.holdings(s, d.depotId, d.date).find(function (x) { return x.securityId === d.securityId; });
            var avail = (h ? h.qty : 0) + (tr && tr.securityId === d.securityId && (tr.type === 'sell' || tr.type === 'out') ? tr.qty : 0);
            if (d.qty > avail + 1e-9) { App.toast('Nur ' + C.formatNumber(avail, 6) + ' Stück im Bestand.', { error: true }); return false; }
          }
          App.commit(isNew ? 'Depotbuchung angelegt' : 'Depotbuchung geändert', function (st) {
            var rec = {
              id: d.id || C.uid(), date: d.date, depotId: d.depotId, securityId: resolveSecurity(form, st), type: d.type,
              qty: d.type === 'dividend' ? 0 : d.qty, price: d.type === 'dividend' ? 0 : d.price,
              amount: d.type === 'dividend' ? d.amount : 0, fees: d.fees, taxes: d.taxes,
              cashAccountId: d.type === 'in' || d.type === 'out' ? null : (d.cashAccountId || null), note: d.note
            };
            if (d.recurringId) rec.recurringId = d.recurringId;
            C.saveTrade(st, rec);
          }, { toast: 'Gespeichert.' });
        },
        extraButtons: isNew ? [] : [{ label: 'Löschen', cls: 'danger', onClick: function () {
          App.closeModal();
          App.commit('Depotbuchung gelöscht', function (st) { C.deleteTrade(st, tr.id); }, { toast: 'Gelöscht (inkl. Geldbuchung).' });
        } }]
      });
      bindNewSecurity(form);
      form.elements.type.addEventListener('change', function () { read(form); open(); });
      function sum() {
        read(form);
        var eff = C.tradeCashEffect(d);
        var txt = d.type === 'in' || d.type === 'out' ? C.formatMoney(Math.round(d.qty * d.price * 100)) + ' (Bestandswert)' : (eff < 0 ? 'Belastung ' : 'Gutschrift ') + C.formatMoney(Math.abs(eff));
        $('#trade-sum', form).textContent = txt;
      }
      form.addEventListener('input', sum);
      sum();
      return form;
    }
    open();
  };

  App.updatePrices = function (ids) {
    var s = App.state;
    var t = today();
    var held = {};
    s.accounts.filter(function (a) { return a.type === 'depot'; }).forEach(function (a) {
      C.holdings(s, a.id, t).forEach(function (h) { if (h.qty > 0) held[h.securityId] = true; });
    });
    var list = s.securities.filter(function (x) { return ids ? ids.indexOf(x.id) >= 0 : held[x.id]; });
    if (!list.length) return App.toast('Keine Wertpapiere im Bestand.');
    var body = '<div class="form-grid"><label>Kursdatum</label><input type="date" name="date" value="' + t + '"></div><hr class="sep">' +
      '<table class="tbl"><thead><tr><th>Wertpapier</th><th class="num">Letzter Kurs</th><th class="num">Neuer Kurs (€)</th></tr></thead><tbody>' +
      list.map(function (x, i) {
        var lp = C.latestPrice(s, x, t);
        return '<tr><td>' + esc(x.name) + '<div class="small">' + esc(x.isin || '') + '</div></td><td class="num">' + (lp.price != null ? esc(C.formatNumber(lp.price, 4)) + ' €<div class="small">' + C.formatDate(lp.date) + '</div>' : '–') + '</td>' +
          '<td class="num"><input type="text" class="amount" name="p_' + x.id + '" style="width:120px"' + (i === 0 ? ' autofocus' : '') + '></td></tr>';
      }).join('') + '</tbody></table><div class="help mt">Leere Felder bleiben unverändert. Tipp: Kurse findest du z. B. bei deiner Bank, justETF oder finanzen.net. Mit Tab springst du zum nächsten Feld.</div>';
    App.modal({
      title: 'Kurse aktualisieren', body: body, wide: true,
      onSubmit: function (form) {
        var date = form.elements.date.value || t;
        var n = 0;
        App.commit('Kurse aktualisiert', function (st) {
          list.forEach(function (x) {
            var v = C.parseDecimal(form.elements['p_' + x.id].value);
            if (isNaN(v) || v <= 0) return;
            var sec = C.findById(st.securities, x.id);
            sec.prices = sec.prices.filter(function (p) { return p.date !== date; });
            sec.prices.push({ date: date, price: v });
            sec.prices.sort(function (a, b) { return a.date < b.date ? -1 : 1; });
            n++;
          });
        }, { toast: 'Kurse aktualisiert.' });
        void n;
      }
    });
  };

  App.securitiesDialog = function () {
    var s = App.state;
    var used = {};
    s.trades.forEach(function (tr) { used[tr.securityId] = (used[tr.securityId] || 0) + 1; });
    var body = s.securities.length ? '<table class="tbl"><thead><tr><th>Name</th><th>ISIN / WKN</th><th>Art</th><th class="num">Transaktionen</th><th></th></tr></thead><tbody>' +
      s.securities.slice().sort(function (a, b) { return a.name.localeCompare(b.name, 'de'); }).map(function (x) {
        return '<tr><td>' + esc(x.name) + '</td><td>' + esc(x.isin || '') + '</td><td>' + esc(x.kind || '') + '</td><td class="num">' + (used[x.id] || 0) + '</td><td class="num"><button type="button" class="btn small" data-sec="' + x.id + '">Bearbeiten</button></td></tr>';
      }).join('') + '</tbody></table>' : '<div class="empty">Noch keine Wertpapiere.</div>';
    var form = App.modal({ title: 'Wertpapiere', body: body, wide: true, extraButtons: [{ label: '+ Wertpapier', onClick: function () { App.editSecurity(null); } }] });
    form.addEventListener('click', function (e) {
      var b = e.target.closest('[data-sec]');
      if (b) App.editSecurity(C.findById(s.securities, b.dataset.sec));
    });
  };

  App.editSecurity = function (x) {
    var s = App.state;
    var isNew = !x;
    var d = x ? Object.assign({}, x) : { name: '', isin: '', kind: 'ETF', prices: [] };
    var used = !isNew && (s.trades.some(function (t) { return t.securityId === x.id; }) || s.recurring.some(function (r) { return r.securityId === x.id; }));
    var prices = (d.prices || []).slice().reverse().slice(0, 12);
    App.modal({
      title: isNew ? 'Neues Wertpapier' : 'Wertpapier bearbeiten',
      body: '<div class="form-grid"><label>Name</label><input type="text" name="name" value="' + esc(d.name) + '" autofocus>' +
        '<label>ISIN / WKN</label><input type="text" name="isin" value="' + esc(d.isin || '') + '">' +
        '<label>Art</label><select name="kind">' + C.SECURITY_KINDS.map(function (k) { return '<option' + sel(k, d.kind) + '>' + k + '</option>'; }).join('') + '</select></div>' +
        (prices.length ? '<hr class="sep"><div class="bold mb">Letzte manuelle Kurse</div><table class="tbl"><tbody>' + prices.map(function (p) { return '<tr><td>' + C.formatDate(p.date) + '</td><td class="num">' + esc(C.formatNumber(p.price, 4)) + ' €</td></tr>'; }).join('') + '</tbody></table>' : ''),
      onSubmit: function (form) {
        var name = form.elements.name.value.trim();
        if (!name) return false;
        App.commit(isNew ? 'Wertpapier angelegt' : 'Wertpapier geändert', function (st) {
          if (isNew) st.securities.push({ id: C.uid(), name: name, isin: form.elements.isin.value.trim(), kind: form.elements.kind.value, prices: [] });
          else Object.assign(C.findById(st.securities, x.id), { name: name, isin: form.elements.isin.value.trim(), kind: form.elements.kind.value });
        }, { toast: 'Gespeichert.' });
      },
      extraButtons: isNew ? [] : [{ label: used ? 'Löschen (in Verwendung)' : 'Löschen', cls: 'danger', onClick: function () {
        if (used) return App.toast('Wertpapier hat Transaktionen oder Sparpläne.', { error: true });
        App.closeModal();
        App.commit('Wertpapier gelöscht', function (st) { st.securities = st.securities.filter(function (y) { return y.id !== x.id; }); }, { toast: 'Gelöscht.' });
      } }]
    });
  };

  // ================================================================ WIEDERKEHREND
  App.ui.rec = { account: '' };

  App.views.wiederkehrend = function (el) {
    var s = App.state;
    var f = App.ui.rec;
    var ids = App.accountFilterIds(f.account);
    var idSet = null;
    if (ids) { idSet = {}; ids.forEach(function (i) { idSet[i] = true; }); }
    var rules = s.recurring.filter(function (r) { return !idSet || idSet[r.accountId] || idSet[r.counterAccountId] || idSet[r.depotId]; });
    var groups = { income: [], expense: [], transfer: [], savingsplan: [], inactive: [] };
    rules.forEach(function (r) { (r.active ? groups[C.ruleKind(r)] : groups.inactive).push(r); });
    var sums = { income: 0, expense: 0, transfer: 0, savingsplan: 0 };
    Object.keys(sums).forEach(function (k) { groups[k].forEach(function (r) { sums[k] += C.monthlyEquivalent(r); }); });

    var html = '<div class="page-head"><div><h1>Wiederkehrende Buchungen</h1><div class="sub">Daueraufträge, Verträge, Abos, Gehalt, Sparpläne – werden automatisch gebucht oder dir zur Bestätigung vorgelegt.</div></div>' +
      '<div class="actions"><select data-f="account"><option value="">Alle Konten</option>' + App.accountOptions(f.account, { groups: true }) + '</select><button class="btn primary" data-act="new">+ Neu</button></div></div>';
    html += '<div class="kpis">' +
      kpi('Feste Einnahmen / Monat', money(sums.income)) +
      kpi('Fixkosten / Monat', money(sums.expense)) +
      kpi('Sparpläne / Monat', money(-sums.savingsplan)) +
      kpi('Bleibt / Monat', money(sums.income + sums.expense + sums.savingsplan, { color: true })) +
      kpi('Fixkosten / Jahr', money(sums.expense * 12)) + '</div>';
    if (!rules.length) {
      html += '<div class="card"><div class="empty"><h3>Noch keine wiederkehrenden Buchungen</h3><p>Trag Miete, Gehalt, Versicherungen, Abos, Sparraten und Sparpläne einmal ein – sie werden dann automatisch gebucht.</p><button class="btn primary" data-act="new">Anlegen</button></div></div>';
    } else {
      [['income', 'Einnahmen'], ['expense', 'Ausgaben'], ['transfer', 'Umbuchungen'], ['savingsplan', 'Sparpläne'], ['inactive', 'Pausiert / beendet']].forEach(function (g) {
        var list = groups[g[0]];
        if (!list.length) return;
        list.sort(function (a, b) {
          var ca = C.categoryPath(s, a.categoryId), cb = C.categoryPath(s, b.categoryId);
          return ca.localeCompare(cb, 'de') || a.name.localeCompare(b.name, 'de');
        });
        html += '<div class="card"><div class="card-head"><h2>' + g[1] + ' <span class="badge">' + list.length + '</span></h2>' + (g[0] !== 'inactive' ? '<span class="bold">' + money(sums[g[0]]) + ' / Monat</span>' : '') + '</div><div class="card-body flush tbl-wrap"><table class="tbl"><thead><tr><th>Name</th><th>Konto / Kategorie</th><th>Rhythmus</th><th>Nächster Termin</th><th>Modus</th><th class="num">Betrag</th><th class="num">pro Monat</th><th></th></tr></thead><tbody>';
        list.forEach(function (r) {
          var overdue = r.active && r.nextDate <= today();
          html += '<tr class="click' + (r.active ? '' : ' muted') + '" data-rule="' + r.id + '"><td class="bold">' + esc(r.name) + (r.note ? '<div class="small">' + esc(r.note) + '</div>' : '') + '</td><td>' + esc(App.ruleAccountsLabel(r)) + '</td>' +
            '<td class="nowrap">' + esc(C.frequencyLabel(r)) + '</td><td class="nowrap' + (overdue ? ' bold' : '') + '">' + (r.active ? C.formatDate(r.nextDate) + (overdue ? ' <span class="badge warn">fällig</span>' : '') : (r.endDate ? 'bis ' + C.formatDate(r.endDate) : 'pausiert')) + (r.endDate && r.active ? '<div class="small">bis ' + C.formatDate(r.endDate) + '</div>' : '') + '</td>' +
            '<td>' + (r.mode === 'auto' ? '<span class="badge accent">automatisch</span>' : '<span class="badge">bestätigen</span>') + '</td>' +
            '<td class="num bold">' + money(C.ruleAmount(r)) + '</td><td class="num">' + money(C.monthlyEquivalent(r)) + '</td>' +
            '<td class="num nowrap">' + (r.active ? '<button class="btn small" data-act="book" data-id="' + r.id + '" title="Nächsten Termin jetzt buchen">Jetzt buchen</button>' : '') + '</td></tr>';
        });
        html += '</tbody></table></div></div>';
      });
    }
    el.innerHTML = html;
    $('[data-f="account"]', el).onchange = function () { f.account = this.value; App.render(); };
    el.onclick = function (e) {
      var a = e.target.closest('[data-act]');
      if (a) {
        e.stopPropagation();
        if (a.dataset.act === 'new') App.editRule(null);
        if (a.dataset.act === 'book') App.bookRuleDialog(C.findById(s.recurring, a.dataset.id));
        return;
      }
      var tr = e.target.closest('[data-rule]');
      if (tr) App.editRule(C.findById(s.recurring, tr.dataset.rule));
    };
  };

  App.editRule = function (r, preset) {
    var s = App.state;
    if (!s.accounts.length) return App.toast('Bitte zuerst ein Konto anlegen.', { error: true });
    var isNew = !r;
    preset = preset || {};
    var d = r ? Object.assign({}, r) : Object.assign({
      name: '', accountId: App.ui.quick.accountId || C.sortedAccounts(s, false)[0].id, counterAccountId: null, depotId: null, securityId: null,
      amount: 0, fees: 0, payee: '', categoryId: null, note: '', tags: [], unit: 'month', interval: 1,
      nextDate: C.addDays(today(), 1), endDate: null, mode: 'auto', active: true
    }, preset);
    var kind = preset.kind || (r ? C.ruleKind(r) : (d.counterAccountId ? 'transfer' : (d.amount > 0 ? 'income' : 'expense')));
    if (preset.startDate) d.nextDate = preset.startDate;
    var origNext = r ? r.nextDate : null;
    function freqKey() {
      var fr = C.FREQUENCIES.find(function (x) { return x.unit === d.unit && x.interval === d.interval; });
      return fr ? fr.key : 'custom';
    }
    function body() {
      var tr = kind === 'transfer', sp = kind === 'savingsplan';
      var depotOpts = App.accountOptions(d.depotId, { filter: function (a) { return a.type === 'depot'; }, empty: '– Depot –' });
      return '<div class="mb"><span class="seg" id="r-kind">' +
        '<button type="button" data-kind="expense" class="' + (kind === 'expense' ? 'on neg' : '') + '">Ausgabe</button>' +
        '<button type="button" data-kind="income" class="' + (kind === 'income' ? 'on pos' : '') + '">Einnahme</button>' +
        '<button type="button" data-kind="transfer" class="' + (tr ? 'on' : '') + '">Umbuchung</button>' +
        '<button type="button" data-kind="savingsplan" class="' + (sp ? 'on' : '') + '">Sparplan</button></span></div>' +
        '<div class="form-grid">' +
        '<label>Bezeichnung</label><input type="text" name="name" value="' + esc(d.name) + '" placeholder="z. B. Miete, Netflix, Gehalt" autofocus>' +
        '<label>' + (tr || sp ? 'Von Konto' : 'Konto') + '</label><select name="accountId">' + App.accountOptions(d.accountId) + '</select>' +
        (tr ? '<label>Nach Konto</label><select name="counterAccountId">' + App.accountOptions(d.counterAccountId, { empty: '– Zielkonto –' }) + '</select>' : '') +
        (sp ? '<label>Depot</label><select name="depotId">' + depotOpts + '</select><label>Wertpapier</label><select name="securityId">' + securityOptions(d.securityId, true) + '</select>' + newSecurityFields() : '') +
        '<label>' + (sp ? 'Sparrate (€)' : 'Betrag (€)') + '</label><input type="text" name="amount" class="amount" value="' + (d.amount ? esc(C.formatAmountInput(Math.abs(d.amount))) : '') + '" placeholder="0,00">' +
        (sp ? '<label>Gebühr je Ausführung</label><input type="text" name="fees" class="amount" value="' + esc(C.formatAmountInput(d.fees || 0)) + '">' : '') +
        (tr || sp ? '' : '<label>Empfänger / Zahler</label><input type="text" name="payee" list="dl-payees-r" value="' + esc(d.payee || '') + '">' +
          '<label>Kategorie</label><select name="categoryId">' + App.categoryOptions(d.categoryId, { type: kind }) + '</select>') +
        '<label>Rhythmus</label><div class="row"><select name="freq">' + C.FREQUENCIES.map(function (x) { return '<option value="' + x.key + '"' + sel(x.key, freqKey()) + '>' + x.label + '</option>'; }).join('') +
        '<option value="custom"' + sel('custom', freqKey()) + '>benutzerdefiniert …</option></select>' +
        '<span id="custom-freq" style="display:' + (freqKey() === 'custom' ? 'inline-flex' : 'none') + ';gap:6px;align-items:center">alle <input type="number" name="interval" min="1" max="99" value="' + d.interval + '" style="width:60px"><select name="unit"><option value="week"' + sel('week', d.unit) + '>Wochen</option><option value="month"' + sel('month', d.unit) + '>Monate</option><option value="year"' + sel('year', d.unit) + '>Jahre</option></select></span></div>' +
        '<label>' + (isNew ? 'Erster Termin' : 'Nächster Termin') + '</label><input type="date" name="nextDate" value="' + esc(d.nextDate) + '">' +
        '<span></span><div class="help">Liegt der Termin in der Vergangenheit, werden bei „automatisch“ alle Termine bis heute sofort gebucht.</div>' +
        '<label>Endet am</label><input type="date" name="endDate" value="' + esc(d.endDate || '') + '">' +
        '<label>Modus</label><select name="mode"><option value="auto"' + sel('auto', d.mode) + '>Automatisch buchen</option><option value="confirm"' + sel('confirm', d.mode) + '>Zur Bestätigung vorlegen (Betrag variiert)</option></select>' +
        '<label>Notiz</label><input type="text" name="note" value="' + esc(d.note || '') + '">' +
        (tr || sp ? '' : '<label>Tags</label><input type="text" name="tags" value="' + esc((d.tags || []).join(', ')) + '">') +
        (isNew ? '' : '<span></span><label class="chk"><input type="checkbox" name="active"' + (d.active ? ' checked' : '') + '> Aktiv</label>') +
        '</div>' + (tr || sp ? '' : App.payeeDatalist('dl-payees-r'));
    }
    function read(form) {
      var f = form.elements;
      d.name = f.name.value.trim();
      d.accountId = f.accountId.value;
      d.counterAccountId = f.counterAccountId ? f.counterAccountId.value || null : null;
      d.depotId = f.depotId ? f.depotId.value || null : null;
      if (f.securityId && f.securityId.value !== '__new') d.securityId = f.securityId.value || null;
      var amt = C.parseMoney(f.amount.value);
      d._amt = isNaN(amt) ? NaN : Math.abs(amt);
      d.fees = f.fees ? Math.abs(C.parseMoney(f.fees.value)) || 0 : 0;
      d.payee = f.payee ? f.payee.value.trim() : '';
      d.categoryId = f.categoryId ? f.categoryId.value || null : null;
      var fk = f.freq.value;
      if (fk === 'custom') { d.unit = f.unit.value; d.interval = Math.max(1, parseInt(f.interval.value, 10) || 1); }
      else { var fr = C.FREQUENCIES.find(function (x) { return x.key === fk; }); d.unit = fr.unit; d.interval = fr.interval; }
      d.nextDate = f.nextDate.value;
      d.endDate = f.endDate.value || null;
      d.mode = f.mode.value;
      d.note = f.note.value.trim();
      d.tags = f.tags ? App.parseTags(f.tags.value) : [];
      if (f.active) d.active = f.active.checked;
    }
    function open() {
      var form = App.modal({
        title: isNew ? 'Neue wiederkehrende Buchung' : 'Wiederkehrende Buchung bearbeiten',
        body: body(),
        onSubmit: function (form) {
          read(form);
          if (isNaN(d._amt) || !d._amt) { form.elements.amount.classList.add('invalid'); form.elements.amount.focus(); return false; }
          if (!d.nextDate) { form.elements.nextDate.focus(); return false; }
          if (kind === 'transfer' && (!d.counterAccountId || d.counterAccountId === d.accountId)) { App.toast('Bitte ein anderes Zielkonto wählen.', { error: true }); return false; }
          if (kind === 'savingsplan') {
            if (!d.depotId) { App.toast('Bitte ein Depot wählen.', { error: true }); return false; }
            if (!form.elements.securityId.value || (form.elements.securityId.value === '__new' && !form.elements.secName.value.trim())) { App.toast('Bitte ein Wertpapier wählen.', { error: true }); return false; }
          }
          var created = 0;
          App.commit(isNew ? 'Wiederkehrende Buchung angelegt' : 'Wiederkehrende Buchung geändert', function (st) {
            var rec = {
              id: d.id || C.uid(), name: d.name || d.payee || 'Ohne Namen', accountId: d.accountId,
              counterAccountId: kind === 'transfer' ? d.counterAccountId : null,
              depotId: kind === 'savingsplan' ? d.depotId : null,
              securityId: kind === 'savingsplan' ? resolveSecurity(form, st) : null,
              amount: kind === 'income' ? d._amt : (kind === 'savingsplan' ? d._amt : -d._amt),
              fees: kind === 'savingsplan' ? d.fees : 0,
              payee: kind === 'transfer' ? (d.name || 'Umbuchung') : (kind === 'savingsplan' ? 'Sparplan' : d.payee),
              categoryId: kind === 'expense' || kind === 'income' ? d.categoryId : null,
              note: d.note, tags: d.tags, unit: d.unit, interval: d.interval,
              startDate: d.startDate || d.nextDate, nextDate: d.nextDate, endDate: d.endDate,
              anchorDay: (!origNext || origNext !== d.nextDate || !d.anchorDay) ? C.parts(d.nextDate).d : d.anchorDay,
              mode: d.mode, active: isNew ? true : d.active
            };
            var i = st.recurring.findIndex(function (x) { return x.id === rec.id; });
            if (i >= 0) st.recurring[i] = rec; else st.recurring.push(rec);
            created = C.processRecurring(st, today());
          });
          App.toast('Gespeichert.' + (created ? ' ' + created + ' fällige Termine gebucht.' : ''), { undo: true });
        },
        extraButtons: isNew ? [] : [
          { label: 'Löschen', cls: 'danger', onClick: function () {
            App.confirm('„' + esc(r.name) + '“ löschen? Bereits gebuchte Einträge bleiben erhalten.', function () {
              App.commit('Wiederkehrende Buchung gelöscht', function (st) { st.recurring = st.recurring.filter(function (x) { return x.id !== r.id; }); }, { toast: 'Gelöscht.' });
            }, 'Löschen');
          } },
          { label: 'Gebuchte anzeigen', onClick: function () {
            App.closeModal();
            App.ui.tx.q = '';
            App.go('buchungen', { tx: { account: '', period: 'all', cat: '', type: '', q: r.payee || r.name, tag: '' } });
          } }
        ]
      });
      $$('#r-kind button', form).forEach(function (b) {
        b.onclick = function () {
          read(form);
          kind = b.dataset.kind;
          d.amount = isNaN(d._amt) ? 0 : d._amt;
          if (d.categoryId && cat(d.categoryId) && cat(d.categoryId).type !== kind) d.categoryId = null;
          open();
        };
      });
      form.elements.freq.addEventListener('change', function () { $('#custom-freq', form).style.display = this.value === 'custom' ? 'inline-flex' : 'none'; });
      if (form.elements.securityId) bindNewSecurity(form);
      var payeeIn = form.elements.payee, catSel = form.elements.categoryId;
      if (payeeIn && catSel) payeeIn.addEventListener('change', function () {
        if (!catSel.value) {
          var sug = C.suggestCategory(App.state, payeeIn.value);
          if (sug && $('option[value="' + sug + '"]', catSel)) catSel.value = sug;
        }
        if (!form.elements.name.value) form.elements.name.value = payeeIn.value;
      });
    }
    open();
  };

  /** Nächsten Termin mit abweichendem Betrag/Datum buchen. */
  App.bookRuleDialog = function (r) {
    if (!r) return;
    var sp = !!r.securityId;
    var s = App.state;
    var sec = sp ? C.findById(s.securities, r.securityId) : null;
    var lp = sp ? C.latestPrice(s, sec, r.nextDate) : null;
    App.modal({
      title: r.name + ' buchen',
      body: '<div class="form-grid"><label>Termin</label><div>' + C.formatDate(r.nextDate) + ' <span class="muted">(' + esc(C.frequencyLabel(r)) + ')</span></div>' +
        '<label>Buchungsdatum</label><input type="date" name="date" value="' + esc(r.nextDate) + '">' +
        '<label>' + (sp ? 'Sparrate (€)' : 'Betrag (€)') + '</label><input type="text" name="amount" class="amount" value="' + esc(C.formatAmountInput(Math.abs(r.amount))) + '" autofocus>' +
        (sp ? '<label>Kurs (€)</label><input type="text" name="price" class="amount" value="' + (lp.price ? esc(C.formatNumber(lp.price, 4)) : '') + '"><label>Stück</label><input type="text" name="qty" class="amount" placeholder="leer = Rate / Kurs">' : '') +
        (sp ? '' : '<label>Notiz</label><input type="text" name="note" value="' + esc(r.note || '') + '">') +
        '<span></span><div class="help">Danach springt der nächste Termin auf ' + C.formatDate(C.stepDate(r, r.nextDate)) + '.</div></div>',
      submitLabel: 'Buchen',
      onSubmit: function (form) {
        var amt = Math.abs(C.parseMoney(form.elements.amount.value));
        if (isNaN(amt) || !amt) { form.elements.amount.classList.add('invalid'); return false; }
        var ov = { date: form.elements.date.value || r.nextDate };
        if (sp) {
          ov.amount = amt;
          var p = C.parseDecimal(form.elements.price.value);
          if (!isNaN(p) && p > 0) ov.price = p;
          var q = C.parseDecimal(form.elements.qty.value);
          if (!isNaN(q) && q > 0) ov.qty = q;
        } else {
          ov.amount = C.ruleAmount(r) < 0 ? -amt : amt;
          ov.note = form.elements.note.value.trim();
        }
        App.commit('Termin gebucht', function (st) { C.bookNext(st, C.findById(st.recurring, r.id), ov); }, { toast: r.name + ' gebucht.' });
      }
    });
  };

  // ================================================================ AUSWERTUNG
  App.ui.rep = { period: 'thisYear', year: null, account: '', detail: false };

  App.views.auswertung = function (el) {
    var s = App.state;
    var f = App.ui.rep;
    var t = today();
    var years = {};
    s.transactions.forEach(function (x) { years[x.date.slice(0, 4)] = true; });
    years[t.slice(0, 4)] = true;
    var yearList = Object.keys(years).sort().reverse();
    var range;
    if (f.period === 'last12') range = App.periodRange('last12');
    else { var y = f.year || t.slice(0, 4); range = [y + '-01-01', y + '-12-31']; }
    var accIds = App.accountFilterIds(f.account);
    var rep = C.categoryReport(s, { from: range[0], to: range[1], accountIds: accIds });
    var months = rep.months;

    var html = '<div class="page-head"><div><h1>Auswertung</h1><div class="sub">Einnahmen und Ausgaben nach Kategorie – Umbuchungen und Wertpapierkäufe zählen nicht mit. Klick auf einen Betrag zeigt die Buchungen.</div></div>' +
      '<div class="actions"><select data-f="period"><option value="last12"' + sel('last12', f.period) + '>Letzte 12 Monate</option>' +
      yearList.map(function (y) { return '<option value="y' + y + '"' + (f.period === 'year' && (f.year || t.slice(0, 4)) === y || (f.period === 'thisYear' && y === t.slice(0, 4)) ? ' selected' : '') + '>Jahr ' + y + '</option>'; }).join('') + '</select>' +
      '<select data-f="account"><option value="">Alle Konten</option>' + App.accountOptions(f.account, { groups: true, includeArchived: true }) + '</select>' +
      '<label class="chk"><input type="checkbox" data-f="detail"' + (f.detail ? ' checked' : '') + '> Unterkategorien</label>' +
      '<button class="btn" data-act="print">Drucken</button></div></div>';

    var totalIn = 0, totalOut = 0;
    months.forEach(function (m) { totalIn += rep.income[m]; totalOut += rep.expense[m]; });
    // Ø nur über Monate, in denen es schon Daten gibt (nicht über Zukunft oder Zeit vor der ersten Buchung)
    var firstMonth = s.transactions.reduce(function (mn, x) { return !mn || x.date < mn ? x.date : mn; }, null);
    firstMonth = firstMonth ? C.monthKey(firstMonth) : C.monthKey(t);
    var elapsed = months.filter(function (m) { return m <= C.monthKey(t) && m >= firstMonth; }).length || 1;
    var anyBudget = s.categories.some(function (c) { return c.budget; });
    html += '<div class="kpis">' + kpi('Einnahmen', money(totalIn)) + kpi('Ausgaben', money(totalOut)) +
      kpi('Saldo', money(totalIn + totalOut, { color: true })) +
      kpi('Sparquote', esc(totalIn > 0 ? C.formatPercent((totalIn + totalOut) / totalIn).replace('+', '') : '–')) +
      kpi('Ø Ausgaben / Monat', money(Math.round(totalOut / elapsed))) + '</div>';

    html += '<div class="card"><div class="card-head"><h2>Einnahmen und Ausgaben je Monat</h2><div class="legend"><span><i style="background:var(--series-1)"></i>Einnahmen</span><span><i style="background:var(--series-2)"></i>Ausgaben</span></div></div><div class="card-body">' +
      App.barChart(months.map(function (m) { return { label: C.formatMonth(m), a: rep.income[m], b: -rep.expense[m] }; }), ['Einnahmen', 'Ausgaben']) + '</div></div>';

    // Pivot-Tabelle
    html += '<div class="card"><div class="card-head"><h2>Kategorien × Monate</h2><button class="btn small" data-act="csv">CSV</button></div><div class="card-body flush tbl-wrap"><table class="tbl pivot"><thead><tr><th>Kategorie</th>' +
      months.map(function (m) { return '<th class="num">' + esc(C.formatMonth(m)) + '</th>'; }).join('') + '<th class="num">Summe</th><th class="num">Ø Monat</th>' + (anyBudget ? '<th class="num">Budget</th>' : '') + '</tr></thead><tbody>';
    var csvRows = [['Kategorie'].concat(months, ['Summe'])];
    function row(label, data, opts) {
      opts = opts || {};
      var sum = 0;
      var cells = months.map(function (m) {
        var v = data[m] || 0;
        sum += v;
        var over = opts.budget && -v > opts.budget;
        return '<td class="num' + (opts.cat ? ' click' : '') + (over ? ' neg' : '') + '"' + (opts.cat ? ' data-cat="' + opts.cat + '" data-m="' + m + '"' : '') + '>' + (v ? esc(C.formatMoney(v)) : '<span class="muted">·</span>') + '</td>';
      }).join('');
      csvRows.push([label].concat(months.map(function (m) { return C.formatAmountInput(data[m] || 0); }), [C.formatAmountInput(sum)]));
      return '<tr class="' + (opts.cls || '') + '"><td class="' + (opts.sub ? 'sub' : '') + '">' + (opts.dot ? '<span class="cat-dot" style="background:' + esc(opts.dot) + '"></span>' : '') + esc(label) + '</td>' + cells +
        '<td class="num bold' + (opts.cat ? ' click' : '') + '"' + (opts.cat ? ' data-cat="' + opts.cat + '" data-m=""' : '') + '>' + esc(C.formatMoney(sum)) + '</td><td class="num">' + esc(C.formatMoney(Math.round(sum / elapsed))) + '</td>' + (anyBudget ? '<td class="num muted">' + (opts.budget ? esc(C.formatMoney(opts.budget)) : '') + '</td>' : '') + '</tr>';
    }
    [['income', 'Einnahmen', rep.income], ['expense', 'Ausgaben', rep.expense]].forEach(function (sec) {
      html += '<tr class="group-row"><td colspan="' + (months.length + (anyBudget ? 4 : 3)) + '">' + sec[1] + '</td></tr>';
      var tree = C.categoryTree(s, sec[0]);
      var rowsOut = [];
      tree.forEach(function (node) {
        var data = rep.byMain[node.cat.id];
        if (!data) return;
        var total = 0;
        Object.keys(data).forEach(function (k) { total += data[k]; });
        rowsOut.push({ node: node, data: data, total: total });
      });
      rowsOut.sort(function (a, b) { return sec[0] === 'income' ? b.total - a.total : a.total - b.total; });
      rowsOut.forEach(function (r) {
        html += row(r.node.cat.name, r.data, { cat: r.node.cat.id, dot: r.node.cat.color, cls: f.detail && r.node.children.length ? 'bold' : '', budget: sec[0] === 'expense' ? App.budgetFor(r.node.cat) : 0 });
        if (f.detail) {
          if (rep.byCat[r.node.cat.id] && r.node.children.length) html += row('(allgemein)', rep.byCat[r.node.cat.id], { cat: r.node.cat.id, sub: true });
          r.node.children.forEach(function (c) { if (rep.byCat[c.id]) html += row(c.name, rep.byCat[c.id], { cat: c.id, sub: true, budget: sec[0] === 'expense' ? c.budget : 0 }); });
        }
      });
      // Ohne Kategorie (nach Vorzeichen getrennt)
      var none = rep.byCat.__none;
      if (none) {
        var part = {};
        s.transactions.forEach(function (x) {
          if (x.date < range[0] || x.date > range[1] || !C.isIncomeExpense(x) || (x.categoryId && cat(x.categoryId))) return;
          if (accIds && accIds.indexOf(x.accountId) < 0) return;
          if ((sec[0] === 'income') !== (x.amount >= 0)) return;
          var m = C.monthKey(x.date);
          part[m] = (part[m] || 0) + x.amount;
        });
        if (Object.keys(part).length) html += row('Ohne Kategorie', part, { cat: '__none', dot: '#999' });
      }
      html += row('Summe ' + sec[1], sec[2], { cls: 'sum-row' });
    });
    var saldo = {};
    months.forEach(function (m) { saldo[m] = rep.income[m] + rep.expense[m]; });
    html += row('Saldo', saldo, { cls: 'sum-row' });
    html += '</tbody></table></div></div>';

    // Tags & Empfänger
    var tags = {}, payees = {};
    s.transactions.forEach(function (x) {
      if (x.date < range[0] || x.date > range[1] || !C.isIncomeExpense(x)) return;
      if (accIds && accIds.indexOf(x.accountId) < 0) return;
      (x.tags || []).forEach(function (tg) { tags[tg] = (tags[tg] || 0) + x.amount; });
      if (x.amount < 0 && x.payee) { var k = x.payee.trim(); payees[k] = (payees[k] || 0) + x.amount; }
    });
    var tagList = Object.keys(tags).sort(function (a, b) { return tags[a] - tags[b]; });
    var payList = Object.keys(payees).sort(function (a, b) { return payees[a] - payees[b]; }).slice(0, 12);
    html += '<div class="grid two" style="margin-top:16px"><div class="card"><div class="card-head"><h2>Tags</h2><span class="help">z. B. #urlaub2026, #steuer</span></div>' +
      (tagList.length ? '<div class="card-body flush"><table class="tbl"><tbody>' + tagList.map(function (tg) { return '<tr class="click" data-tag="' + esc(tg) + '"><td><span class="tag">#' + esc(tg) + '</span></td><td class="num">' + money(tags[tg]) + '</td></tr>'; }).join('') + '</tbody></table></div>' : '<div class="empty">Keine Tags im Zeitraum.</div>') +
      '</div><div class="card"><div class="card-head"><h2>Größte Empfänger</h2></div>' +
      (payList.length ? '<div class="card-body flush"><table class="tbl"><tbody>' + payList.map(function (p) { return '<tr class="click" data-payee="' + esc(p) + '"><td>' + esc(p) + '</td><td class="num">' + money(payees[p]) + '</td></tr>'; }).join('') + '</tbody></table></div>' : '<div class="empty">Keine Ausgaben im Zeitraum.</div>') +
      '</div></div>';

    el.innerHTML = html;
    App.bindChartTips(el);
    $$('[data-f]', el).forEach(function (inp) {
      inp.onchange = function () {
        var k = inp.dataset.f;
        if (k === 'period') {
          if (inp.value === 'last12') f.period = 'last12';
          else { f.period = 'year'; f.year = inp.value.slice(1); }
        } else if (k === 'detail') f.detail = inp.checked;
        else f[k] = inp.value;
        App.render();
      };
    });
    el.onclick = function (e) {
      var a = e.target.closest('[data-act],[data-cat],[data-tag],[data-payee]');
      if (!a) return;
      if (a.dataset.act === 'print') return window.print();
      if (a.dataset.act === 'csv') return App.download('auswertung-' + range[0].slice(0, 4) + '.csv', '﻿' + C.toCSV(csvRows, ';'), 'text/csv;charset=utf-8');
      var from = range[0], to = range[1];
      if (a.dataset.m) { from = a.dataset.m + '-01'; to = C.endOfMonth(from); }
      var base = { account: f.account, period: 'custom', from: from, to: to, cat: '', type: '', q: '', tag: '' };
      if (a.dataset.cat) base.cat = a.dataset.cat;
      if (a.dataset.tag) base.tag = a.dataset.tag;
      if (a.dataset.payee) base.q = a.dataset.payee;
      App.go('buchungen', { tx: base });
    };
  };

  // ================================================================ KATEGORIEN & REGELN
  App.views.kategorien = function (el) {
    var s = App.state;
    var counts = {};
    s.transactions.forEach(function (x) { if (x.categoryId) counts[x.categoryId] = (counts[x.categoryId] || 0) + 1; });
    var html = '<div class="page-head"><div><h1>Kategorien &amp; Regeln</h1><div class="sub">Zwei Ebenen: Hauptkategorie › Unterkategorie. Budgets gelten pro Monat.</div></div>' +
      '<div class="actions"><button class="btn" data-act="new" data-type="income">+ Einnahme-Kategorie</button><button class="btn primary" data-act="new" data-type="expense">+ Ausgabe-Kategorie</button></div></div>';
    html += '<div class="grid two">';
    [['expense', 'Ausgaben'], ['income', 'Einnahmen']].forEach(function (tp) {
      html += '<div class="card"><div class="card-head"><h2>' + tp[1] + '</h2></div><div class="card-body flush"><table class="tbl"><thead><tr><th>Kategorie</th><th class="num">Buchungen</th>' + (tp[0] === 'expense' ? '<th class="num">Budget/Monat</th>' : '') + '<th></th></tr></thead><tbody>';
      C.categoryTree(s, tp[0]).forEach(function (node) {
        var c = node.cat;
        html += '<tr class="click" data-cat="' + c.id + '"><td class="bold"><span class="cat-dot" style="background:' + esc(c.color) + '"></span>' + esc(c.name) + '</td><td class="num">' + (counts[c.id] || '') + '</td>' +
          (tp[0] === 'expense' ? '<td class="num">' + (App.budgetFor(c) ? esc(C.formatMoney(App.budgetFor(c))) + (c.budget ? '' : ' <span class="small">Σ</span>') : '') + '</td>' : '') +
          '<td class="num"><button class="btn small ghost" data-act="sub" data-id="' + c.id + '" title="Unterkategorie hinzufügen">+ Unter</button></td></tr>';
        node.children.forEach(function (k) {
          html += '<tr class="click" data-cat="' + k.id + '"><td class="sub">' + esc(k.name) + '</td><td class="num">' + (counts[k.id] || '') + '</td>' + (tp[0] === 'expense' ? '<td class="num">' + (k.budget ? esc(C.formatMoney(k.budget)) : '') + '</td>' : '') + '<td></td></tr>';
        });
      });
      html += '</tbody></table></div></div>';
    });
    html += '</div>';

    // Regeln
    var uncategorized = s.transactions.filter(function (x) { return !x.categoryId && C.isIncomeExpense(x); }).length;
    html += '<div class="card"><div class="card-head"><div><h2>Regeln für automatische Kategorisierung</h2><div class="help">Greifen beim CSV-Import und bei der Eingabe unbekannter Empfänger. Mehrere Suchbegriffe mit | trennen. Die erste passende Regel gewinnt.</div></div>' +
      '<div class="actions">' + (uncategorized ? '<button class="btn" data-act="apply-rules">Auf ' + uncategorized + ' unkategorisierte anwenden</button>' : '') + '<button class="btn primary" data-act="new-rule">+ Regel</button></div></div>';
    if (!s.rules.length) html += '<div class="empty">Noch keine Regeln. Beispiel: „rewe|edeka|aldi“ → Lebensmittel.</div>';
    else {
      html += '<div class="card-body flush"><table class="tbl"><thead><tr><th>#</th><th>Wenn … enthält</th><th>Suchen in</th><th>→ Kategorie</th><th></th></tr></thead><tbody>';
      s.rules.forEach(function (r, i) {
        html += '<tr class="click" data-rule="' + r.id + '"><td class="muted">' + (i + 1) + '</td><td><code>' + esc(r.pattern) + '</code></td><td>' + (r.field === 'payee' ? 'Empfänger' : 'Empfänger + Zweck/Notiz') + '</td><td>' + App.h.catLabel(r.categoryId) + '</td>' +
          '<td class="num nowrap"><button class="btn small ghost" data-act="rule-up" data-id="' + r.id + '">↑</button><button class="btn small ghost" data-act="rule-down" data-id="' + r.id + '">↓</button></td></tr>';
      });
      html += '</tbody></table></div>';
    }
    html += '</div>';
    el.innerHTML = html;
    el.onclick = function (e) {
      var a = e.target.closest('[data-act]');
      if (a) {
        e.stopPropagation();
        var act = a.dataset.act;
        if (act === 'new') App.editCategory(null, { type: a.dataset.type });
        else if (act === 'sub') { var p = cat(a.dataset.id); App.editCategory(null, { type: p.type, parentId: p.id, color: p.color }); }
        else if (act === 'new-rule') App.editRule2(null);
        else if (act === 'rule-up' || act === 'rule-down') {
          App.commit('Regel verschoben', function (st) {
            var i = st.rules.findIndex(function (r) { return r.id === a.dataset.id; });
            var j = i + (act === 'rule-up' ? -1 : 1);
            if (j < 0 || j >= st.rules.length) return;
            var tmp = st.rules[i]; st.rules[i] = st.rules[j]; st.rules[j] = tmp;
          });
        } else if (act === 'apply-rules') {
          var n = 0;
          App.commit('Regeln angewendet', function (st) {
            st.transactions.forEach(function (x) {
              if (x.categoryId || !C.isIncomeExpense(x)) return;
              var c = C.applyRules(st.rules, x.payee, x.note);
              if (c) { x.categoryId = c; n++; }
            });
          });
          App.toast(n + ' Buchungen kategorisiert.', { undo: true });
        }
        return;
      }
      var r = e.target.closest('[data-rule]');
      if (r) return App.editRule2(C.findById(s.rules, r.dataset.rule));
      var c = e.target.closest('[data-cat]');
      if (c) App.editCategory(cat(c.dataset.cat));
    };
  };

  App.editCategory = function (c, preset) {
    var s = App.state;
    var isNew = !c;
    var d = c ? Object.assign({}, c) : Object.assign({ name: '', parentId: null, type: 'expense', color: C.PALETTE[s.categories.filter(function (x) { return !x.parentId; }).length % C.PALETTE.length], budget: 0 }, preset || {});
    var hasKids = !isNew && s.categories.some(function (x) { return x.parentId === c.id; });
    var mains = s.categories.filter(function (x) { return !x.parentId && x.type === d.type && (!c || x.id !== c.id); }).sort(function (a, b) { return a.name.localeCompare(b.name, 'de'); });
    var usedCount = isNew ? 0 : s.transactions.filter(function (x) { return x.categoryId === c.id; }).length;
    App.modal({
      title: isNew ? (d.parentId ? 'Neue Unterkategorie' : 'Neue Kategorie') : 'Kategorie bearbeiten',
      body: '<div class="form-grid"><label>Name</label><input type="text" name="name" value="' + esc(d.name) + '" autofocus>' +
        '<label>Art</label><select name="type"' + (d.parentId || hasKids ? ' disabled' : '') + '><option value="expense"' + sel('expense', d.type) + '>Ausgabe</option><option value="income"' + sel('income', d.type) + '>Einnahme</option></select>' +
        '<label>Übergeordnet</label><select name="parentId"' + (hasKids ? ' disabled' : '') + '><option value="">– keine (Hauptkategorie) –</option>' + mains.map(function (m) { return '<option value="' + m.id + '"' + sel(m.id, d.parentId) + '>' + esc(m.name) + '</option>'; }).join('') + '</select>' +
        '<label>Farbe</label><input type="color" name="color" value="' + esc(d.color || '#2f6fdb') + '">' +
        (d.type === 'expense' ? '<label>Budget / Monat (€)</label><input type="text" name="budget" class="amount" value="' + (d.budget ? esc(C.formatAmountInput(d.budget)) : '') + '" placeholder="optional">' +
          (!d.parentId ? '<span></span><div class="help">Leer lassen = Summe der Unterkategorie-Budgets.</div>' : '') : '') +
        '</div>',
      onSubmit: function (form) {
        var name = form.elements.name.value.trim();
        if (!name) return false;
        var b = form.elements.budget ? C.parseMoney(form.elements.budget.value) : 0;
        App.commit(isNew ? 'Kategorie angelegt' : 'Kategorie geändert', function (st) {
          var rec = Object.assign({}, d, {
            id: d.id || C.uid(), name: name,
            parentId: form.elements.parentId.disabled ? d.parentId : (form.elements.parentId.value || null),
            color: form.elements.color.value, budget: isNaN(b) ? 0 : Math.abs(b || 0)
          });
          if (!form.elements.type.disabled) rec.type = form.elements.type.value;
          if (rec.parentId) { var p = C.findById(st.categories, rec.parentId); if (p) rec.type = p.type; }
          var i = st.categories.findIndex(function (x) { return x.id === rec.id; });
          if (i >= 0) st.categories[i] = rec; else st.categories.push(rec);
        }, { toast: 'Gespeichert.' });
      },
      extraButtons: isNew ? [] : [{ label: 'Löschen', cls: 'danger', onClick: function () {
        if (hasKids) return App.toast('Bitte zuerst die Unterkategorien löschen oder verschieben.', { error: true });
        var target = c.parentId ? cat(c.parentId) : null;
        App.confirm('Kategorie „' + esc(c.name) + '“ löschen?' + (usedCount ? ' ' + usedCount + ' Buchungen werden ' + (target ? 'nach „' + esc(target.name) + '“ verschoben.' : 'unkategorisiert.') : ''), function () {
          App.commit('Kategorie gelöscht', function (st) {
            st.transactions.forEach(function (x) { if (x.categoryId === c.id) x.categoryId = target ? target.id : null; });
            st.recurring.forEach(function (x) { if (x.categoryId === c.id) x.categoryId = target ? target.id : null; });
            st.rules = st.rules.filter(function (x) { return x.categoryId !== c.id; });
            st.categories = st.categories.filter(function (x) { return x.id !== c.id; });
          }, { toast: 'Kategorie gelöscht.' });
        }, 'Löschen');
      } }]
    });
  };

  /** Regel für Auto-Kategorisierung bearbeiten. */
  App.editRule2 = function (r, preset) {
    var isNew = !r;
    var d = r ? Object.assign({}, r) : Object.assign({ pattern: '', categoryId: null, field: 'any' }, preset || {});
    App.modal({
      title: isNew ? 'Neue Regel' : 'Regel bearbeiten',
      body: '<div class="form-grid"><label>Suchbegriff(e)</label><input type="text" name="pattern" value="' + esc(d.pattern) + '" placeholder="z. B. rewe|edeka|aldi" autofocus>' +
        '<label>Suchen in</label><select name="field"><option value="any"' + sel('any', d.field) + '>Empfänger + Verwendungszweck/Notiz</option><option value="payee"' + sel('payee', d.field) + '>nur Empfänger</option></select>' +
        '<label>Kategorie</label><select name="categoryId">' + App.categoryOptions(d.categoryId) + '</select>' +
        '<span></span><div class="help">Groß-/Kleinschreibung egal. Treffer = Text kommt irgendwo vor.</div></div>',
      onSubmit: function (form) {
        var p = form.elements.pattern.value.trim(), c = form.elements.categoryId.value;
        if (!p || !c) { App.toast('Suchbegriff und Kategorie angeben.', { error: true }); return false; }
        App.commit(isNew ? 'Regel angelegt' : 'Regel geändert', function (st) {
          var rec = { id: d.id || C.uid(), pattern: p, field: form.elements.field.value, categoryId: c };
          var i = st.rules.findIndex(function (x) { return x.id === rec.id; });
          if (i >= 0) st.rules[i] = rec; else st.rules.push(rec);
        }, { toast: 'Regel gespeichert.' });
      },
      extraButtons: isNew ? [] : [{ label: 'Löschen', cls: 'danger', onClick: function () {
        App.closeModal();
        App.commit('Regel gelöscht', function (st) { st.rules = st.rules.filter(function (x) { return x.id !== r.id; }); }, { toast: 'Regel gelöscht.' });
      } }]
    });
  };

  // ================================================================ DATEN & IMPORT
  App.views.daten = function (el) {
    var s = App.state;
    var fileHtml;
    if (!Store.fileSupported) {
      fileHtml = '<p>Dein Browser unterstützt das direkte Speichern in eine Datei nicht (das können Chrome und Edge). Deine Daten liegen im Browser – exportiere daher regelmäßig ein Backup.</p>';
    } else if (Store.fileStatus === 'connected') {
      fileHtml = '<p><span class="badge accent">verbunden</span> Jede Änderung wird automatisch in <b>' + esc(Store.fileName()) + '</b> gespeichert' + (Store.lastFileSave ? ' (zuletzt ' + Store.lastFileSave.toLocaleTimeString('de-DE') + ')' : '') + '.</p>' +
        '<div class="row"><button class="btn" data-act="file-open">Andere Datei öffnen …</button><button class="btn" data-act="file-new">Als neue Datei speichern …</button><button class="btn ghost" data-act="file-disconnect">Verbindung trennen</button></div>';
    } else if (Store.fileStatus === 'needs-permission' || Store.fileStatus === 'error') {
      fileHtml = '<p><span class="badge warn">Freigabe nötig</span> Verknüpft mit <b>' + esc(Store.fileName()) + '</b>. Der Browser verlangt nach jedem Neustart einmal deine Zustimmung.</p>' +
        '<div class="row"><button class="btn primary" data-act="file-reconnect">Datei freigeben</button><button class="btn ghost" data-act="file-disconnect">Verbindung trennen</button></div>';
    } else {
      fileHtml = '<p>Empfehlung: Lege die Datei in einen synchronisierten Ordner (Dropbox, OneDrive, iCloud Drive). Dann hast du automatisch ein Backup und kannst auf jedem Rechner weiterarbeiten.</p>' +
        '<div class="row"><button class="btn primary" data-act="file-new">Neue Datei anlegen …</button><button class="btn" data-act="file-open">Vorhandene Datei öffnen …</button></div>';
    }
    var html = '<div class="page-head"><div><h1>Daten &amp; Import</h1><div class="sub">' + s.transactions.length + ' Buchungen · ' + s.accounts.length + ' Konten · ' + s.recurring.length + ' wiederkehrend · ' + s.trades.length + ' Depot-Transaktionen</div></div></div>';
    html += '<div class="grid two">';
    html += '<div class="card"><div class="card-head"><h2>Speicherort</h2></div><div class="card-body">' + fileHtml +
      '<div class="help mt"><p>Deine Daten verlassen deinen Rechner nie – es gibt keinen Server. Ohne Datei liegen sie im Speicher dieses Browsers (nicht im Inkognito-Modus nutzen, Browserdaten nicht löschen).</p></div></div></div>';
    html += '<div class="card"><div class="card-head"><h2>Backup</h2></div><div class="card-body"><p>Komplette Sicherung als JSON-Datei – auch zum Umzug auf einen anderen Rechner oder Browser.</p>' +
      '<div class="row"><button class="btn primary" data-act="backup">Backup herunterladen</button><label class="btn">Backup einspielen …<input type="file" accept=".json,application/json" data-act="restore" hidden></label></div>' +
      '<div class="help mt">' + (s.meta.lastBackup ? 'Letztes Backup: ' + C.formatDate(s.meta.lastBackup.slice(0, 10)) : 'Noch kein Backup heruntergeladen.') + '</div></div></div>';
    html += '</div>';

    html += '<div class="grid two" style="margin-top:16px">';
    html += '<div class="card"><div class="card-head"><h2>CSV-Import</h2></div><div class="card-body"><p>Umsätze aus dem Online-Banking, von der Kreditkarte oder aus Finanzguru übernehmen. Spalten werden automatisch erkannt, Duplikate übersprungen, Regeln angewendet.</p>' +
      '<div class="row"><label class="btn primary">CSV-Datei wählen …<input type="file" accept=".csv,.txt,text/csv" data-act="csv" hidden></label><button class="btn" data-act="pairs">Umbuchungen erkennen …</button></div>' +
      '<div class="help mt"><p><b>Finanzguru:</b> Export über Einstellungen › Daten exportieren (CSV). Enthält die Datei mehrere Konten, ordnest du sie im Import einzeln zu.</p><p><b>Umbuchungen erkennen:</b> Nach einem Import mehrerer Konten stehen Überträge doppelt drin (Abgang + Eingang). Diese Funktion findet solche Paare und macht daraus echte Umbuchungen.</p></div></div></div>';
    html += '<div class="card"><div class="card-head"><h2>Export &amp; Darstellung</h2></div><div class="card-body">' +
      '<div class="row mb"><button class="btn" data-act="export-csv">Alle Buchungen als CSV (Excel)</button></div>' +
      '<div class="row"><span>Farbschema</span><select data-act="theme"><option value="auto"' + sel('auto', s.settings.theme) + '>wie System</option><option value="light"' + sel('light', s.settings.theme) + '>hell</option><option value="dark"' + sel('dark', s.settings.theme) + '>dunkel</option></select></div>' +
      '<hr class="sep"><div class="help"><b>Tastenkürzel</b><p><kbd>1</kbd>–<kbd>8</kbd> Bereiche · <kbd>N</kbd> neue Buchung · <kbd>/</kbd> Suche · <kbd>Strg</kbd>+<kbd>Z</kbd> rückgängig · <kbd>Esc</kbd> Dialog schließen</p>' +
      '<p>In der Schnelleingabe: <kbd>Enter</kbd> bucht · <kbd>Alt</kbd>+<kbd>A</kbd>/<kbd>E</kbd>/<kbd>U</kbd> Ausgabe/Einnahme/Umbuchung · „+50“ = Einnahme</p></div></div></div>';
    html += '</div>';

    html += '<div class="card"><div class="card-head"><h2>Zurücksetzen</h2></div><div class="card-body row"><button class="btn" data-act="demo">Beispieldaten laden</button><button class="btn danger" data-act="wipe">Alle Daten löschen …</button><span class="help">Beides ersetzt den aktuellen Stand – vorher Backup ziehen. Rückgängig mit Strg+Z ist möglich, solange die Seite offen ist.</span></div></div>';
    el.innerHTML = html;

    el.onclick = function (e) {
      var a = e.target.closest('button[data-act]');
      if (!a) return;
      var act = a.dataset.act;
      if (act === 'file-new') Store.createFile(App.state).then(function () { App.toast('Datei angelegt – ab jetzt wird automatisch gespeichert.'); App.render(); }).catch(fileErr);
      else if (act === 'file-open') Store.openFile().then(function (data) {
        App.commit('Datei geöffnet', function () { App.state = C.normalizeState(data); });
        App.runRecurring();
        App.toast('Datei geladen.');
      }).catch(fileErr);
      else if (act === 'file-reconnect') App.reconnectFile();
      else if (act === 'file-disconnect') Store.disconnect().then(function () { App.render(); });
      else if (act === 'backup') {
        App.state.meta.lastBackup = new Date().toISOString();
        App.persist();
        App.download('finanzen-backup-' + today() + '.json', JSON.stringify(App.state, null, 1), 'application/json');
        App.render();
      } else if (act === 'export-csv') {
        var rows = [['Datum', 'Konto', 'Gegenkonto', 'Betrag', 'Empfänger', 'Hauptkategorie', 'Kategorie', 'Notiz', 'Tags']];
        App.state.transactions.slice().sort(function (x, y) { return x.date < y.date ? -1 : 1; }).forEach(function (t) {
          var c = cat(t.categoryId), main = c && c.parentId ? cat(c.parentId) : c;
          rows.push([C.formatDate(t.date), accName(t.accountId), t.counterAccountId ? accName(t.counterAccountId) : '', C.formatAmountInput(t.amount), t.payee || '', main ? main.name : '', c && c.parentId ? c.name : '', t.note || '', (t.tags || []).join(', ')]);
        });
        App.download('alle-buchungen-' + today() + '.csv', '﻿' + C.toCSV(rows, ';'), 'text/csv;charset=utf-8');
      } else if (act === 'pairs') App.transferPairsDialog();
      else if (act === 'demo') App.confirm('Aktuellen Stand durch Beispieldaten ersetzen?', function () { App.commit('Beispieldaten geladen', function () { App.state = C.demoState(today()); }); }, 'Laden');
      else if (act === 'wipe') App.confirm('<b>Alle Daten löschen?</b> Konten, Buchungen, Depots, Regeln – alles. Eine verbundene Datei wird mit dem leeren Stand überschrieben.', function () {
        App.commit('Alles gelöscht', function () { App.state = C.emptyState(); }, { toast: 'Alle Daten gelöscht.' });
      }, 'Endgültig löschen');
    };
    el.onchange = function (e) {
      var a = e.target.closest('[data-act]');
      if (!a) return;
      if (a.dataset.act === 'theme') { App.commit('Farbschema', function (st) { st.settings.theme = a.value; }); App.applyTheme(); }
      if (a.dataset.act === 'restore' && a.files[0]) {
        a.files[0].text().then(function (txt) {
          var data = C.normalizeState(JSON.parse(txt));
          App.confirm('Backup vom ' + (data.meta.savedAt ? new Date(data.meta.savedAt).toLocaleString('de-DE') : '?') + ' mit ' + data.transactions.length + ' Buchungen einspielen? Der aktuelle Stand wird ersetzt.', function () {
            App.commit('Backup eingespielt', function () { App.state = data; }, { toast: 'Backup eingespielt.' });
            App.runRecurring();
          }, 'Einspielen');
        }).catch(function (err) { App.toast('Datei konnte nicht gelesen werden: ' + err.message, { error: true }); });
        a.value = '';
      }
      if (a.dataset.act === 'csv' && a.files[0]) { App.csvImport(a.files[0]); a.value = ''; }
    };
  };

  function fileErr(e) {
    if (e && e.name === 'AbortError') return;
    App.toast((e && e.message) || String(e), { error: true });
  }

  App.transferPairsDialog = function () {
    var pairs = C.findTransferPairs(App.state, 4);
    if (!pairs.length) return App.toast('Keine passenden Paare gefunden.');
    var body = '<p class="help">Gleicher Betrag, umgekehrtes Vorzeichen, verschiedene Konten, höchstens 4 Tage Abstand. Häkchen = zusammenführen.</p><div class="tbl-wrap" style="max-height:55vh"><table class="tbl"><thead><tr><th class="cb"><input type="checkbox" id="pairs-all" checked></th><th>Datum</th><th>Von</th><th>Nach</th><th>Texte</th><th class="num">Betrag</th></tr></thead><tbody>' +
      pairs.map(function (p, i) {
        return '<tr><td class="cb"><input type="checkbox" name="p' + i + '" checked></td><td class="nowrap">' + C.formatDate(p.from.date) + (p.days ? '<div class="small">+' + p.days + ' T.</div>' : '') + '</td><td>' + esc(accName(p.from.accountId)) + '</td><td>' + esc(accName(p.to.accountId)) + '</td>' +
          '<td class="small">' + esc(p.from.payee || '') + '<br>' + esc(p.to.payee || '') + '</td><td class="num">' + esc(C.formatMoney(-p.from.amount)) + '</td></tr>';
      }).join('') + '</tbody></table></div>';
    var form = App.modal({
      title: pairs.length + ' mögliche Umbuchungen', body: body, wide: true, submitLabel: 'Zusammenführen',
      onSubmit: function (form) {
        var n = 0;
        App.commit('Umbuchungen zusammengeführt', function (st) {
          pairs.forEach(function (p, i) { if (form.elements['p' + i].checked && C.mergeTransferPair(st, p.from.id, p.to.id)) n++; });
        });
        App.toast(n + ' Umbuchungen erstellt.', { undo: true });
      }
    });
    $('#pairs-all', form).onchange = function () { var on = this.checked; pairs.forEach(function (p, i) { form.elements['p' + i].checked = on; }); };
  };

  // ---------------------------------------------------------------- CSV-Import
  function decode(buf, enc) {
    if (enc && enc !== 'auto') return new TextDecoder(enc).decode(buf);
    try { return new TextDecoder('utf-8', { fatal: true }).decode(buf); }
    catch (e) { return new TextDecoder('windows-1252').decode(buf); }
  }

  App.csvImport = function (file) {
    var s = App.state;
    if (!s.accounts.length) return App.toast('Bitte zuerst mindestens ein Konto anlegen.', { error: true });
    file.arrayBuffer().then(function (buf) {
      var o = { enc: 'auto', delim: null, header: null, map: null, accountId: App.ui.quick.accountId || C.sortedAccounts(s, false)[0].id, accountMode: 'fixed', accMap: {}, invert: false, purposeToNote: true, useRules: true, catFromCsv: true, createCats: true };
      var text, rows;
      function parse() {
        text = decode(buf, o.enc);
        if (!o.delim) o.delim = C.detectDelimiter(text);
        rows = C.parseCSV(text, o.delim);
        if (o.header == null) o.header = C.detectHeaderRow(rows);
        if (!o.map) {
          o.map = C.guessMapping(rows[o.header] || []);
          if (o.map.account >= 0) o.accountMode = 'column';
        }
      }
      parse();

      function colOpts(v) {
        var hdr = rows[o.header] || [];
        return '<option value="-1">– nicht verwenden –</option>' + hdr.map(function (h, i) { return '<option value="' + i + '"' + (i === v ? ' selected' : '') + '>' + esc(h || ('Spalte ' + (i + 1))) + '</option>'; }).join('');
      }
      function catByName(name, type) {
        if (!name) return null;
        var n = name.trim().toLowerCase();
        var hit = s.categories.find(function (c) { return c.name.toLowerCase() === n && (!type || c.type === type); }) || s.categories.find(function (c) { return c.name.toLowerCase() === n; });
        return hit ? hit.id : null;
      }
      /** Zeilen in Buchungsentwürfe umwandeln */
      function build() {
        var m = o.map;
        var existing = {};
        s.transactions.forEach(function (t) { existing[C.dupKey(t.accountId, t.date, t.amount, t.payee)] = true; });
        var seenInFile = {};
        var out = [];
        rows.slice(o.header + 1).forEach(function (r, i) {
          if (r.every(function (c) { return !String(c).trim(); })) return;
          var e = { line: o.header + i + 2, raw: r, errors: [] };
          e.date = C.parseDate(r[m.date]);
          if (!e.date) e.errors.push('Datum');
          var amt = NaN;
          if (m.amount >= 0) amt = C.parseMoney(r[m.amount]);
          else if (m.debit >= 0 || m.credit >= 0) {
            var deb = m.debit >= 0 ? C.parseMoney(r[m.debit]) : NaN, cre = m.credit >= 0 ? C.parseMoney(r[m.credit]) : NaN;
            amt = (isNaN(cre) ? 0 : Math.abs(cre)) - (isNaN(deb) ? 0 : Math.abs(deb));
            if (isNaN(deb) && isNaN(cre)) amt = NaN;
          }
          if (isNaN(amt)) e.errors.push('Betrag');
          e.amount = o.invert ? -amt : amt;
          e.payee = m.payee >= 0 ? String(r[m.payee] || '').trim() : '';
          e.purpose = m.purpose >= 0 ? String(r[m.purpose] || '').replace(/\s+/g, ' ').trim() : '';
          if (!e.payee && e.purpose) e.payee = e.purpose.slice(0, 60);
          e.noteCol = m.note >= 0 ? String(r[m.note] || '').trim() : '';
          if (o.accountMode === 'column' && m.account >= 0) {
            var key = String(r[m.account] || '').trim();
            e.accKey = key;
            e.accountId = o.accMap[key] || null;
          } else e.accountId = o.accountId;
          // Kategorie
          e.categoryId = null;
          var type = e.amount < 0 ? 'expense' : 'income';
          if (o.catFromCsv && (m.category >= 0 || m.subcategory >= 0)) {
            var main = m.category >= 0 ? String(r[m.category] || '').trim() : '';
            var sub = m.subcategory >= 0 ? String(r[m.subcategory] || '').trim() : '';
            e.csvCat = { main: main, sub: sub, type: type };
            e.categoryId = catByName(sub, type) || catByName(main, type);
          }
          if (!e.categoryId && o.useRules) e.categoryId = C.applyRules(s.rules, e.payee, e.purpose);
          if (!e.categoryId && o.useRules) e.categoryId = C.suggestCategory(s, e.payee);
          if (e.categoryId && cat(e.categoryId) && cat(e.categoryId).type !== type) e.categoryId = null;
          if (!e.errors.length && e.accountId) {
            var k = C.dupKey(e.accountId, e.date, e.amount, e.payee);
            e.dup = !!existing[k];
            // gleiche Zeile mehrfach in der Datei ist legitim (z. B. zwei gleiche Einkäufe) – nur gegen Bestand prüfen
            seenInFile[k] = true;
          }
          out.push(e);
        });
        return out;
      }

      function render() {
        var form = $('#modal-root form');
        var m = o.map;
        var entries = build();
        var ok = entries.filter(function (e) { return !e.errors.length && e.accountId && !e.dup; });
        var dups = entries.filter(function (e) { return e.dup; }).length;
        var errs = entries.filter(function (e) { return e.errors.length; }).length;
        var noAcc = entries.filter(function (e) { return !e.errors.length && !e.accountId; }).length;
        var accKeys = [];
        if (o.accountMode === 'column' && m.account >= 0) {
          var seen = {};
          entries.forEach(function (e) { if (e.accKey != null && !seen[e.accKey]) { seen[e.accKey] = true; accKeys.push(e.accKey); } });
          accKeys.forEach(function (k) {
            if (o.accMap[k] === undefined) {
              var hit = s.accounts.find(function (a) { return a.name.toLowerCase() === k.toLowerCase() || (a.iban && a.iban.replace(/\s/g, '') === k.replace(/\s/g, '')); });
              o.accMap[k] = hit ? hit.id : '__new';
            }
          });
          entries = build();
          ok = entries.filter(function (e) { return !e.errors.length && e.accountId && !e.dup; });
          noAcc = entries.filter(function (e) { return !e.errors.length && !e.accountId; }).length;
          dups = entries.filter(function (e) { return e.dup; }).length;
        }
        var html = '<div class="grid two"><div><div class="form-grid">' +
          '<label>Datei</label><div class="ellipsis">' + esc(file.name) + '</div>' +
          '<label>Zeichensatz</label><select data-o="enc"><option value="auto"' + sel('auto', o.enc) + '>automatisch</option><option value="utf-8"' + sel('utf-8', o.enc) + '>UTF-8</option><option value="windows-1252"' + sel('windows-1252', o.enc) + '>Windows (ANSI)</option></select>' +
          '<label>Trennzeichen</label><select data-o="delim">' + [[';', 'Semikolon ;'], [',', 'Komma ,'], ['\t', 'Tabulator'], ['|', 'Senkrechtstrich |']].map(function (x) { return '<option value="' + esc(x[0]) + '"' + sel(x[0], o.delim) + '>' + x[1] + '</option>'; }).join('') + '</select>' +
          '<label>Kopfzeile</label><select data-o="header">' + rows.slice(0, 30).map(function (r, i) { return '<option value="' + i + '"' + (i === o.header ? ' selected' : '') + '>Zeile ' + (i + 1) + ': ' + esc(r.slice(0, 4).join(' | ').slice(0, 60)) + '</option>'; }).join('') + '</select>' +
          '<label>Konto</label><select data-o="accountMode"><option value="fixed"' + sel('fixed', o.accountMode) + '>alle in ein Konto</option><option value="column"' + sel('column', o.accountMode) + '>aus Spalte (mehrere Konten)</option></select>' +
          (o.accountMode === 'fixed' ? '<span></span><select data-o="accountId">' + App.accountOptions(o.accountId) + '</select>' : '<label>Konto-Spalte</label><select data-m="account">' + colOpts(m.account) + '</select>') +
          '</div></div><div><div class="form-grid">' +
          '<label>Datum</label><select data-m="date">' + colOpts(m.date) + '</select>' +
          '<label>Betrag</label><select data-m="amount">' + colOpts(m.amount) + '</select>' +
          (m.amount < 0 ? '<label>Soll (Abgang)</label><select data-m="debit">' + colOpts(m.debit) + '</select><label>Haben (Eingang)</label><select data-m="credit">' + colOpts(m.credit) + '</select>' : '') +
          '<label>Empfänger</label><select data-m="payee">' + colOpts(m.payee) + '</select>' +
          '<label>Verwendungszweck</label><select data-m="purpose">' + colOpts(m.purpose) + '</select>' +
          '<label>Kategorie</label><select data-m="category">' + colOpts(m.category) + '</select>' +
          '<label>Unterkategorie</label><select data-m="subcategory">' + colOpts(m.subcategory) + '</select>' +
          '</div></div></div>';
        if (o.accountMode === 'column' && accKeys.length) {
          html += '<hr class="sep"><div class="bold mb">Konten zuordnen</div><div class="form-grid">' + accKeys.map(function (k, i) {
            return '<label class="ellipsis" title="' + esc(k) + '">' + esc(k || '(leer)') + '</label><select data-acckey="' + i + '"><option value="__new"' + sel('__new', o.accMap[k]) + '>＋ Neues Konto „' + esc(k || 'Import') + '“ anlegen</option><option value=""' + sel('', o.accMap[k]) + '>– überspringen –</option>' + App.accountOptions(o.accMap[k]) + '</select>';
          }).join('') + '</div>';
        }
        html += '<hr class="sep"><div class="row">' +
          '<label class="chk"><input type="checkbox" data-o="invert"' + (o.invert ? ' checked' : '') + '> Vorzeichen umkehren</label>' +
          '<label class="chk"><input type="checkbox" data-o="purposeToNote"' + (o.purposeToNote ? ' checked' : '') + '> Verwendungszweck als Notiz</label>' +
          '<label class="chk"><input type="checkbox" data-o="useRules"' + (o.useRules ? ' checked' : '') + '> Regeln &amp; bekannte Empfänger nutzen</label>' +
          ((m.category >= 0 || m.subcategory >= 0) ? '<label class="chk"><input type="checkbox" data-o="catFromCsv"' + (o.catFromCsv ? ' checked' : '') + '> Kategorien aus CSV</label><label class="chk"><input type="checkbox" data-o="createCats"' + (o.createCats ? ' checked' : '') + '> fehlende Kategorien anlegen</label>' : '') +
          '</div>';
        html += '<div class="summary-line" style="padding-left:0;border:0"><span><b>' + ok.length + '</b> werden importiert</span>' + (dups ? '<span><b>' + dups + '</b> Duplikate übersprungen</span>' : '') + (errs ? '<span class="neg"><b>' + errs + '</b> fehlerhaft (Datum/Betrag)</span>' : '') + (noAcc ? '<span><b>' + noAcc + '</b> ohne Konto übersprungen</span>' : '') + '</div>';
        html += '<div class="tbl-wrap" style="max-height:38vh"><table class="tbl"><thead><tr><th>Zeile</th><th>Datum</th>' + (o.accountMode === 'column' ? '<th>Konto</th>' : '') + '<th>Empfänger</th><th>Zweck</th><th>Kategorie</th><th class="num">Betrag</th><th></th></tr></thead><tbody>' +
          entries.slice(0, 60).map(function (e) {
            var catTxt = e.categoryId ? App.h.catLabel(e.categoryId) : (e.csvCat && (e.csvCat.sub || e.csvCat.main) && o.createCats ? '<span class="badge">neu: ' + esc(e.csvCat.sub || e.csvCat.main) + '</span>' : '<span class="muted">–</span>');
            var st = e.errors.length ? '<span class="badge warn">Fehler: ' + e.errors.join(', ') + '</span>' : (e.dup ? '<span class="badge">Duplikat</span>' : (!e.accountId ? '<span class="badge">übersprungen</span>' : ''));
            return '<tr class="' + (e.dup || e.errors.length || !e.accountId ? 'muted' : '') + '"><td class="small">' + e.line + '</td><td class="nowrap">' + (e.date ? C.formatDate(e.date) : esc(e.raw[m.date] || '')) + '</td>' +
              (o.accountMode === 'column' ? '<td class="small">' + esc(e.accountId && e.accountId !== '__new' ? accName(e.accountId) : (e.accKey || '')) + '</td>' : '') +
              '<td class="ellipsis" style="max-width:180px">' + esc(e.payee) + '</td><td class="small ellipsis" style="max-width:220px">' + esc(e.purpose) + '</td><td>' + catTxt + '</td><td class="num">' + (isNaN(e.amount) ? '–' : money(e.amount, { color: true })) + '</td><td>' + st + '</td></tr>';
          }).join('') + (entries.length > 60 ? '<tr class="muted"><td colspan="8">… ' + (entries.length - 60) + ' weitere Zeilen</td></tr>' : '') + '</tbody></table></div>';
        $('.modal-body', form).innerHTML = html;
        var btn = $('button[type=submit]', form);
        btn.textContent = ok.length + ' Buchungen importieren';
        btn.disabled = !ok.length;
        bind(form);
      }

      function bind(form) {
        $$('[data-o]', form).forEach(function (inp) {
          inp.onchange = function () {
            var k = inp.dataset.o;
            if (inp.type === 'checkbox') o[k] = inp.checked;
            else if (k === 'header') { o.header = +inp.value; o.map = null; }
            else if (k === 'delim') { o.delim = inp.value; o.header = null; o.map = null; }
            else if (k === 'enc') { o.enc = inp.value; }
            else o[k] = inp.value;
            parse();
            render();
          };
        });
        $$('[data-m]', form).forEach(function (inp) {
          inp.onchange = function () { o.map[inp.dataset.m] = +inp.value; if (inp.dataset.m === 'account') o.accMap = {}; render(); };
        });
        var keys = [];
        if (o.accountMode === 'column') {
          var seen = {};
          build().forEach(function (e) { if (e.accKey != null && !seen[e.accKey]) { seen[e.accKey] = true; keys.push(e.accKey); } });
        }
        $$('[data-acckey]', form).forEach(function (inp) {
          inp.onchange = function () { o.accMap[keys[+inp.dataset.acckey]] = inp.value; render(); };
        });
      }

      App.modal({
        title: 'CSV-Import', body: '', wide: true, submitLabel: 'Importieren',
        onSubmit: function () {
          var entries = build().filter(function (e) { return !e.errors.length && e.accountId && !e.dup; });
          if (!entries.length) return false;
          var created = { acc: 0, cat: 0 };
          App.commit('CSV-Import', function (st) {
            var newAcc = {};
            var catCache = {};
            entries.forEach(function (e) {
              var accountId = e.accountId;
              if (accountId === '__new') {
                if (!newAcc[e.accKey]) {
                  var a = { id: C.uid(), name: e.accKey || 'Import', type: 'giro', group: 'Import', opening: 0, order: st.accounts.length, archived: false, note: 'aus CSV-Import' };
                  st.accounts.push(a);
                  newAcc[e.accKey] = a.id;
                  created.acc++;
                }
                accountId = newAcc[e.accKey];
              }
              var catId = e.categoryId;
              if (!catId && e.csvCat && o.catFromCsv && o.createCats && (e.csvCat.main || e.csvCat.sub)) {
                var key = e.csvCat.type + '|' + e.csvCat.main + '|' + e.csvCat.sub;
                if (!catCache[key]) catCache[key] = ensureCategory(st, e.csvCat, created);
                catId = catCache[key];
              }
              var note = [e.noteCol, o.purposeToNote && e.purpose && e.purpose !== e.payee ? e.purpose : ''].filter(Boolean).join(' · ');
              st.transactions.push({ id: C.uid(), date: e.date, accountId: accountId, counterAccountId: null, amount: e.amount, payee: e.payee, categoryId: catId || null, note: note, tags: [], imported: true });
            });
          });
          App.toast(entries.length + ' Buchungen importiert' + (created.acc ? ', ' + created.acc + ' Konten angelegt' : '') + (created.cat ? ', ' + created.cat + ' Kategorien angelegt' : '') + '.', { undo: true });
          if (created.acc) setTimeout(function () { App.toast('Tipp: Bei neuen Konten den Anfangsbestand über „Abgleichen“ setzen.'); }, 800);
        }
      });
      render();
    }).catch(function (e) { App.toast('Datei konnte nicht gelesen werden: ' + e.message, { error: true }); });
  };

  function ensureCategory(st, cc, created) {
    function find(name, parentId) {
      var n = name.toLowerCase();
      return st.categories.find(function (c) { return c.name.toLowerCase() === n && c.type === cc.type && (parentId === undefined || (c.parentId || null) === parentId); });
    }
    var mainName = cc.main || cc.sub;
    var main = find(mainName, null);
    if (!main) {
      main = { id: C.uid(), name: mainName, parentId: null, type: cc.type, color: C.PALETTE[st.categories.length % C.PALETTE.length], budget: 0 };
      st.categories.push(main);
      created.cat++;
    }
    if (!cc.sub || !cc.main || cc.sub.toLowerCase() === cc.main.toLowerCase()) return main.id;
    var sub = find(cc.sub, main.id);
    if (!sub) {
      sub = { id: C.uid(), name: cc.sub, parentId: main.id, type: cc.type, color: main.color, budget: 0 };
      st.categories.push(sub);
      created.cat++;
    }
    return sub.id;
  }
})();
