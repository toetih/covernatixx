/*
 * Finanzen – Arbeitsabläufe, die Zeit sparen:
 *  - mehrere CSV-Dateien auf einmal importieren (Auswahl oder Drag & Drop ins Fenster)
 *  - offene Buchungen gruppiert nach Empfänger schnell kategorisieren
 *  - Regeln aus deinen Zuordnungen lernen
 *  - Monatsabschluss als geführte Checkliste
 */
(function () {
  'use strict';
  var C = window.FinCore;
  var App = window.App;
  var H = App.h;
  var $ = H.$, $$ = H.$$, esc = H.esc, money = H.money, today = H.today, acc = H.acc, accName = H.accName;

  // ================================================================ Mehrere Dateien importieren
  function isDepotText(text) {
    var head = text.split(/\r?\n/).slice(0, 40).join('\n').toLowerCase();
    return /isin|wkn/.test(head) && /(stück|stueck|anzahl|menge|nominal|einstand|kurswert)/.test(head) && !/(verwendungszweck|auftraggeber|empfänger|begünstigter)/.test(head);
  }

  /** Dateien nacheinander importieren: je Datei der passende Dialog (Konto- oder Depot-Import). */
  App.importFiles = function (fileList) {
    var files = Array.prototype.filter.call(fileList, function (f) { return /\.(csv|txt)$/i.test(f.name) || /csv|text/.test(f.type); });
    if (!files.length) return App.toast('Bitte CSV-Dateien wählen (Export aus dem Online-Banking).', { error: true });
    var i = 0, total = files.length, sum = { files: 0, imported: 0, uncategorized: 0, skipped: 0, depot: 0, tx: 0 };
    function next() {
      if (i >= files.length) return finish();
      var f = files[i++];
      var step = total > 1 ? 'Datei ' + i + ' von ' + total + ': ' + f.name : '';
      var q = {
        step: step,
        onDone: function (r) { sum.files++; sum.imported += r.imported; sum.uncategorized += r.uncategorized; next(); },
        onSkip: total > 1 ? function () { sum.skipped++; next(); } : null
      };
      f.slice(0, 8192).text().then(function (head) {
        if (isDepotText(head)) { sum.depot++; App.depotCsvImport(f, q); } else { sum.tx++; App.csvImport(f, q); }
      });
    }
    function finish() {
      if (!sum.files) return;
      if (sum.depot && !sum.tx) { App.go('depots'); return; }   // nur Depotdaten → ins Depot
      App.render();
      var msg = sum.imported + ' Buchungen aus ' + sum.files + (sum.files === 1 ? ' Datei' : ' Dateien') + ' importiert' + (sum.skipped ? ', ' + sum.skipped + ' übersprungen' : '') + '.';
      if (countOpen()) App.toast(msg + ' Noch ohne Kategorie: ' + countOpen() + '.', { action: { label: 'Jetzt zuordnen', fn: function () { App.quickCategorize(); } } });
      else App.toast(msg);
    }
    next();
  };

  function countOpen(opts) {
    var n = 0;
    C.uncategorizedGroups(App.state, opts).forEach(function (g) { n += g.count; });
    return n;
  }
  App.countUncategorized = countOpen;

  // Drag & Drop: CSV-Dateien einfach ins Fenster ziehen
  (function () {
    var overlay = null, depth = 0;
    function hasFiles(e) { return e.dataTransfer && Array.prototype.indexOf.call(e.dataTransfer.types || [], 'Files') >= 0; }
    function show() {
      if (overlay) return;
      overlay = document.createElement('div');
      overlay.className = 'drop-overlay';
      overlay.innerHTML = '<div><b>CSV-Dateien hier ablegen</b><br><span>Kontoauszüge oder Depotdaten – mehrere auf einmal möglich</span></div>';
      document.body.appendChild(overlay);
    }
    function hide() { if (overlay) { overlay.remove(); overlay = null; } depth = 0; }
    document.addEventListener('dragenter', function (e) { if (!hasFiles(e)) return; depth++; show(); });
    document.addEventListener('dragleave', function () { depth--; if (depth <= 0) hide(); });
    document.addEventListener('dragover', function (e) { if (hasFiles(e)) e.preventDefault(); });
    document.addEventListener('drop', function (e) {
      if (!hasFiles(e)) return;
      e.preventDefault();
      hide();
      if ($('#modal-root .modal')) return App.toast('Bitte erst den offenen Dialog schließen.', { error: true });
      App.importFiles(e.dataTransfer.files);
    });
  })();

  // ================================================================ Lernende Regeln
  /** Nach dem Zuordnen: Regeln lernen und auf weitere offene Buchungen anwenden. */
  App.learnAfter = function (ids) {
    var s = App.state;
    if (s.settings.learnRules === false) return;
    var cand = C.learnableRules(s, ids);
    if (!cand.length) return;
    var applied = 0;
    App.commit('Regel gelernt', function (st) {
      cand.forEach(function (r) { st.rules.push({ id: C.uid(), pattern: r.pattern, field: 'payee', categoryId: r.categoryId, learned: true }); });
      st.transactions.forEach(function (t) {
        if (t.categoryId || !C.isIncomeExpense(t) || t.excludeFromReports) return;
        var c = C.applyRules(st.rules, t.payee, '');
        var cat = c && C.findById(st.categories, c);
        if (cat && cat.type === (t.amount < 0 ? 'expense' : 'income')) { t.categoryId = c; applied++; }
      });
    });
    var first = cand[0];
    App.toast((cand.length === 1 ? 'Regel gelernt: „' + first.pattern + '“ → ' + C.categoryPath(s, first.categoryId) : cand.length + ' Regeln gelernt') +
      (applied ? ' · ' + applied + ' weitere Buchungen zugeordnet' : '') + '.', { undo: true });
  };

  // ================================================================ Schnell-Kategorisieren
  /** Offene Buchungen (ohne Kategorie) gruppiert nach Empfänger zuordnen. opts: { from, to } */
  App.quickCategorize = function (opts) {
    opts = opts || {};
    var s = App.state;
    var groups = C.uncategorizedGroups(s, opts);
    if (!groups.length) return App.toast('Alles zugeordnet – keine offenen Buchungen.');
    var shown = groups.slice(0, 150);
    var total = 0;
    groups.forEach(function (g) { total += g.count; });
    var learn = s.settings.learnRules !== false;
    var body = '<p class="help">Gleiche Empfänger sind zusammengefasst – eine Auswahl gilt für alle Buchungen der Zeile. Vorschläge kommen aus deinen Regeln und früheren Zuordnungen. ' +
      'Leer lassen = später. Mit <kbd>Tab</kbd> zur nächsten Zeile, Kategorie per Tippen auswählen.</p>' +
      '<div class="tbl-wrap" style="max-height:60vh"><table class="tbl"><thead><tr><th>Empfänger</th><th class="num">Anzahl</th><th class="num">Summe</th><th>Kategorie</th><th title="Für künftige Importe merken">Regel</th></tr></thead><tbody>' +
      shown.map(function (g, i) {
        var key = C.learnKey(g.label);
        var period = g.first === g.last ? C.formatDate(g.first) : C.formatDate(g.first) + ' – ' + C.formatDate(g.last);
        return '<tr><td><div class="bold ellipsis" style="max-width:320px" title="' + esc(g.label) + '">' + esc(g.label) + '</div><div class="small">' + esc(period) + ' · ' + esc(g.accounts.map(accName).join(', ')) + (g.sample.note ? ' · ' + esc(g.sample.note.slice(0, 60)) : '') + '</div></td>' +
          '<td class="num">' + g.count + '×</td><td class="num">' + money(g.sum, { color: true }) + '</td>' +
          '<td><select name="g' + i + '" style="max-width:260px">' + App.categoryOptions(g.suggestion || '', { type: g.type, empty: '– später –' }) + '</select>' + (g.suggestion ? ' <span class="badge accent" title="Vorschlag">Vorschlag</span>' : '') + '</td>' +
          '<td class="cb">' + (key ? '<input type="checkbox" name="r' + i + '" title="Regel „' + esc(key) + '“ anlegen"' + (learn && g.count >= 2 ? ' checked' : '') + '>' : '') + '</td></tr>';
      }).join('') + '</tbody></table></div>' +
      (groups.length > shown.length ? '<div class="help mt">… und ' + (groups.length - shown.length) + ' weitere Empfänger – nach dem Speichern erneut öffnen.</div>' : '');
    App.modal({
      title: total + ' Buchungen ohne Kategorie', wide: true, submitLabel: 'Zuordnen',
      body: body,
      onSubmit: function (form) {
        var n = 0, rulesAdded = 0;
        App.commit('Buchungen zugeordnet', function (st) {
          shown.forEach(function (g, i) {
            var cid = form.elements['g' + i].value;
            if (!cid) return;
            var idSet = {};
            g.ids.forEach(function (id) { idSet[id] = true; });
            st.transactions.forEach(function (t) { if (idSet[t.id] && !t.categoryId) { t.categoryId = cid; n++; } });
            var rb = form.elements['r' + i];
            var key = C.learnKey(g.label);
            if (rb && rb.checked && key && !C.matchRule(st.rules, g.label, '')) {
              st.rules.push({ id: C.uid(), pattern: key, field: 'payee', categoryId: cid, learned: true });
              rulesAdded++;
            }
          });
        });
        App.toast(n + ' Buchungen zugeordnet' + (rulesAdded ? ', ' + rulesAdded + (rulesAdded === 1 ? ' Regel' : ' Regeln') + ' für künftige Importe gemerkt' : '') + '.', { undo: true });
      }
    });
  };

  // ================================================================ Monatsabschluss
  function prevMonthKey(t) { return C.monthKey(C.addMonths(C.startOfMonth(t), -1, 1)); }

  /** Ist der Vormonat noch offen (und hat die Nutzung schon vorher begonnen)? */
  App.openClosingMonth = function () {
    var s = App.state, t = today();
    if (!s.accounts.length || s.meta.demo) return null;
    var mk = prevMonthKey(t);
    var closed = (s.meta.closedMonths || {})[mk];
    var created = (s.meta.created || '').slice(0, 7);
    if (closed || !created || created > mk) return null;
    return mk;
  };

  App.ui.closing = { month: null };

  App.views.abschluss = function (el) {
    var s = App.state, t = today();
    var f = App.ui.closing;
    if (!f.month) f.month = prevMonthKey(t);
    var mk = f.month;
    var from = mk + '-01', to = C.endOfMonth(from);
    var closedAt = (s.meta.closedMonths || {})[mk];
    var cashAccs = C.sortedAccounts(s, false).filter(function (a) { return App.isCashAccount(a); });
    var months = [];
    for (var i = 0; i < 12; i++) months.push(C.monthKey(C.addMonths(C.startOfMonth(t), -i, 1)));

    // Schritt 1: Importe
    var importRows = cashAccs.map(function (a) {
      var last = null;
      s.transactions.forEach(function (x) { if ((x.accountId === a.id || x.counterAccountId === a.id) && (!last || x.date > last)) last = x.date; });
      var done = a.noImport || (a.lastImport && a.lastImport > to) || (last && last >= C.addDays(to, -3) && a.lastImport && a.lastImport >= from);
      var prof = (s.importProfiles || []).find(function (p) { return p.accountId === a.id || (p.accMap && Object.keys(p.accMap).some(function (k) { return p.accMap[k] === a.id; })); });
      return { a: a, last: last, done: !!done, prof: prof };
    });
    var step1 = importRows.every(function (r) { return r.done; });
    // Schritt 2: offene Buchungen
    var open = countOpen({ from: from, to: to });
    // Schritt 3: zu bestätigende Termine
    var due = C.dueConfirmations(s, t).filter(function (d) { return d.date <= to; });
    // Schritt 4: Kontostände
    var checks = ((s.meta.balanceChecks || {})[mk]) || {};
    var step4 = cashAccs.every(function (a) { return checks[a.id] || a.noImport; });
    // Schritt 5: Depotkurse
    var stale = [];
    s.accounts.filter(function (a) { return a.type === 'depot' && !a.archived; }).forEach(function (a) {
      C.holdings(s, a.id, t).forEach(function (h) { if (h.qty > 0 && (!h.priceDate || h.priceDate < C.addDays(to, -10))) stale.push(h.securityId); });
    });
    // Ergebnis
    var rep = C.categoryReport(s, { from: from, to: to });
    var inc = rep.income[mk] || 0, exp = rep.expense[mk] || 0;

    function stepHead(n, title, ok, sub) {
      return '<div class="card-head"><div><h2><span class="step-dot' + (ok ? ' ok' : '') + '">' + (ok ? '✓' : n) + '</span>' + esc(title) + '</h2>' + (sub ? '<div class="help">' + sub + '</div>' : '') + '</div>';
    }

    var html = '<div class="page-head"><div><h1>Monatsabschluss</h1><div class="sub">In 5 Schritten zu sauberen Zahlen – ca. 10 Minuten.</div></div>' +
      '<div class="actions"><select data-f="month">' + months.map(function (m) { return '<option value="' + m + '"' + (m === mk ? ' selected' : '') + '>' + esc(C.formatMonth(m, true)) + ((s.meta.closedMonths || {})[m] ? ' ✓' : '') + '</option>'; }).join('') + '</select></div></div>';
    if (closedAt) html += '<div class="banner info"><span class="grow">✓ ' + esc(C.formatMonth(mk, true)) + ' wurde am ' + C.formatDate(closedAt) + ' abgeschlossen.</span><button class="btn small" data-act="reopen">Wieder öffnen</button></div>';

    // 1 Import
    html += '<div class="card">' + stepHead(1, 'Kontoauszüge importieren', step1, 'CSV-Export je Konto aus dem Online-Banking (Zeitraum mindestens bis ' + C.formatDate(to) + '). Mehrere Dateien auf einmal – oder einfach ins Fenster ziehen.') +
      '<label class="btn primary">CSV-Dateien wählen …<input type="file" accept=".csv,.txt,text/csv" multiple data-act="files" hidden></label></div>' +
      '<div class="card-body flush"><table class="tbl"><thead><tr><th>Konto</th><th>Import-Profil</th><th>Letzte Buchung</th><th>Letzter Import</th><th>Status</th><th class="num" title="z. B. Bargeld – wird ohne Import geführt">ohne Import</th></tr></thead><tbody>' +
      importRows.map(function (r) {
        return '<tr' + (r.a.noImport ? ' class="muted"' : '') + '><td class="bold">' + esc(r.a.name) + '</td><td>' + (r.a.noImport ? '<span class="muted">ohne Import (z. B. Bargeld)</span>' : r.prof ? '<span class="badge accent">' + esc(r.prof.name) + '</span>' : '<span class="muted">– (wird beim 1. Import angelegt)</span>') + '</td>' +
          '<td>' + (r.last ? C.formatDate(r.last) : '–') + '</td><td>' + (r.a.lastImport ? C.formatDate(r.a.lastImport) : '–') + '</td>' +
          '<td>' + (r.done ? '<span class="pos">✓ aktuell</span>' : '<span class="badge warn">offen</span>') + '</td>' +
          '<td class="num"><input type="checkbox" data-noimport="' + r.a.id + '"' + (r.a.noImport ? ' checked' : '') + '></td></tr>';
      }).join('') + '</tbody></table></div></div>';

    // 2 Kategorien
    html += '<div class="card">' + stepHead(2, 'Offene Buchungen zuordnen', !open, open ? open + ' Buchungen im ' + esc(C.formatMonth(mk, true)) + ' haben noch keine Kategorie.' : 'Alle Buchungen des Monats sind zugeordnet.') +
      (open ? '<button class="btn primary" data-act="categorize">Jetzt zuordnen</button>' : '') + '</div></div>';

    // 3 Bestätigen
    html += '<div class="card">' + stepHead(3, 'Wiederkehrende Buchungen bestätigen', !due.length, due.length ? due.length + ' Termine bis ' + C.formatDate(to) + ' warten auf Bestätigung (z. B. schwankende Beträge).' : 'Nichts offen.') +
      (due.length ? '<a class="btn" href="#uebersicht">Zur Übersicht</a>' : '') + '</div>' +
      (due.length ? '<div class="card-body flush"><table class="tbl"><tbody>' + due.map(function (d) {
        return '<tr><td class="nowrap">' + C.formatDate(d.date) + '</td><td>' + esc(d.rule.name) + '</td><td class="num">' + money(C.ruleAmount(d.rule)) + '</td><td class="num nowrap"><button class="btn small primary" data-book="' + d.rule.id + '">Buchen</button> <button class="btn small" data-bookedit="' + d.rule.id + '">Anpassen …</button> <button class="btn small ghost" data-skip="' + d.rule.id + '">Überspringen</button></td></tr>';
      }).join('') + '</tbody></table></div>' : '') + '</div>';

    // 4 Kontostände
    html += '<div class="card">' + stepHead(4, 'Kontostände prüfen', step4, 'Stand laut Kontoauszug zum ' + C.formatDate(to) + ' eintragen. Weicht er ab, buchst du die Differenz mit einem Klick als Korrektur.') + '</div>' +
      '<div class="card-body flush"><table class="tbl"><thead><tr><th>Konto</th><th class="num">Laut App</th><th class="num">Laut Bank</th><th class="num">Differenz</th><th></th></tr></thead><tbody>' +
      cashAccs.map(function (a) {
        var appBal = C.cashBalance(s, a.id, to);
        return '<tr' + (a.noImport ? ' class="muted"' : '') + ' data-balrow="' + a.id + '" data-app="' + appBal + '"><td class="bold">' + esc(a.name) + '</td><td class="num">' + money(appBal) + '</td>' +
          '<td class="num"><input type="text" class="amount" data-real="' + a.id + '" placeholder="0,00" style="width:120px;padding:3px 7px"></td><td class="num" data-diff="' + a.id + '">' + (checks[a.id] ? '<span class="pos">✓ geprüft</span>' : '–') + '</td>' +
          '<td class="num nowrap"><button class="btn small" data-check="' + a.id + '">Stimmt</button></td></tr>';
      }).join('') + '</tbody></table></div></div>';

    // 5 Depot
    var hasDepot = s.accounts.some(function (a) { return a.type === 'depot' && !a.archived; });
    if (hasDepot) {
      html += '<div class="card">' + stepHead(5, 'Depotkurse aktualisieren', !stale.length, stale.length ? stale.length + ' Wertpapiere ohne aktuellen Kurs zum Monatsende.' : 'Kurse sind aktuell.') +
        (stale.length ? '<button class="btn" data-act="prices">Kurse eintragen</button>' : '') + '</div></div>';
    }

    // Ergebnis
    var budgetOver = [];
    s.categories.forEach(function (c) {
      if (c.parentId || c.type !== 'expense') return;
      var b = App.budgetFor(c);
      if (!b) return;
      var spent = -(rep.byMain[c.id] ? rep.byMain[c.id][mk] || 0 : 0);
      if (spent > b) budgetOver.push(c.name + ' (+' + C.formatMoney(spent - b) + ')');
    });
    html += '<div class="card"><div class="card-head"><h2>Ergebnis ' + esc(C.formatMonth(mk, true)) + '</h2>' +
      (closedAt ? '' : '<button class="btn primary" data-act="close">Monat abschließen</button>') + '</div><div class="card-body"><div class="kpis">' +
      kpi('Einnahmen', money(inc)) + kpi('Ausgaben', money(exp)) + kpi('Saldo', money(inc + exp, { color: true })) +
      kpi('Sparquote', esc(inc > 0 ? C.formatPercent((inc + exp) / inc).replace('+', '') : '–')) + '</div>' +
      (budgetOver.length ? '<p class="mt">Budget überschritten: <span class="neg">' + esc(budgetOver.join(', ')) + '</span></p>' : '') +
      '<p class="help mt">Details in der <a href="#auswertung">Auswertung</a>. „Abschließen“ ist nur eine Markierung – du kannst danach weiter buchen.</p></div></div>';

    el.innerHTML = html;

    $('[data-f="month"]', el).onchange = function () { f.month = this.value; App.render(); };
    var fi = $('[data-act="files"]', el);
    if (fi) fi.onchange = function () { if (fi.files.length) App.importFiles(fi.files); fi.value = ''; };
    $$('[data-noimport]', el).forEach(function (cb) {
      cb.onchange = function () {
        var id = cb.dataset.noimport, on = cb.checked;
        App.commit('Import-Einstellung', function (st) { var a = C.findById(st.accounts, id); if (on) a.noImport = true; else delete a.noImport; });
      };
    });
    $$('[data-real]', el).forEach(function (inp) {
      inp.addEventListener('input', function () {
        var id = inp.dataset.real;
        var row = inp.closest('tr');
        var appBal = +row.dataset.app;
        var v = C.parseMoney(inp.value);
        var cell = $('[data-diff="' + id + '"]', el);
        if (isNaN(v) || !inp.value.trim()) { cell.innerHTML = '–'; return; }
        var d = v - appBal;
        cell.innerHTML = d ? money(d, { color: true, sign: true }) + ' <button class="btn small" data-fix="' + id + '">Korrektur buchen</button>' : '<span class="pos">✓ passt</span>';
      });
      inp.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); var b = $('[data-check="' + inp.dataset.real + '"]', el); if (b) b.click(); } });
    });
    el.onclick = function (e) {
      if (e.target.closest('label.btn')) return;
      var b = e.target.closest('button,[data-act]');
      if (!b) return;
      var d = b.dataset;
      if (d.act === 'categorize') return App.quickCategorize({ from: from, to: to });
      if (d.act === 'prices') return App.updatePrices(null);
      if (d.act === 'close') return App.commit('Monat abgeschlossen', function (st) { st.meta.closedMonths = st.meta.closedMonths || {}; st.meta.closedMonths[mk] = today(); }, { toast: C.formatMonth(mk, true) + ' abgeschlossen. 👍' });
      if (d.act === 'reopen') return App.commit('Monat geöffnet', function (st) { delete st.meta.closedMonths[mk]; });
      if (d.book) return App.commit('Buchung bestätigt', function (st) { C.bookNext(st, C.findById(st.recurring, d.book)); });
      if (d.skip) return App.commit('Termin übersprungen', function (st) { C.skipNext(C.findById(st.recurring, d.skip)); });
      if (d.bookedit) return App.bookRuleDialog(C.findById(s.recurring, d.bookedit));
      if (d.fix || d.check) {
        var id = d.fix || d.check;
        var inp = $('[data-real="' + id + '"]', el);
        var v = C.parseMoney(inp.value);
        if (d.check && !inp.value.trim()) v = +inp.closest('tr').dataset.app; // „Stimmt“ ohne Eingabe = App-Stand bestätigt
        if (isNaN(v)) { inp.classList.add('invalid'); return; }
        var diff = 0;
        App.commit('Kontostand geprüft', function (st) {
          diff = C.reconcileAccount(st, id, to, v, 'booking');
          st.meta.balanceChecks = st.meta.balanceChecks || {};
          st.meta.balanceChecks[mk] = st.meta.balanceChecks[mk] || {};
          st.meta.balanceChecks[mk][id] = true;
        });
        App.toast(diff ? 'Korrektur ' + C.formatMoney(diff, { sign: true }) + ' gebucht.' : 'Kontostand bestätigt.', { undo: !!diff });
      }
    };
  };

  function kpi(l, v) { return '<div class="kpi"><div class="l">' + esc(l) + '</div><div class="v">' + v + '</div></div>'; }

  // ================================================================ Import-Profile verwalten (Daten-Seite)
  App.profilesCard = function () {
    var list = App.state.importProfiles || [];
    var html = '<div class="card"><div class="card-head"><div><h2>Import-Profile</h2><div class="help">Gemerkte Bankformate: Spalten, Konto und Optionen. Wird beim Import automatisch erkannt.</div></div></div>';
    if (!list.length) return html + '<div class="empty">Noch keine Profile – beim ersten CSV-Import einer Bank wird eins angelegt.</div></div>';
    html += '<div class="card-body flush"><table class="tbl"><thead><tr><th>Name</th><th>Konto</th><th>Zuletzt genutzt</th><th></th></tr></thead><tbody>' +
      list.map(function (p) {
        var target = p.accountMode === 'column' ? 'aus Spalte (' + Object.keys(p.accMap || {}).length + ' Konten)' : (p.accountId && acc(p.accountId) ? acc(p.accountId).name : '–');
        return '<tr><td class="bold">' + esc(p.name) + '</td><td>' + esc(target) + '</td><td>' + (p.lastUsed ? C.formatDate(p.lastUsed) : '–') + '</td>' +
          '<td class="num"><button class="btn small ghost danger" data-delprofile="' + p.id + '">Löschen</button></td></tr>';
      }).join('') + '</tbody></table></div></div>';
    return html;
  };
  App.bindProfilesCard = function (el) {
    $$('[data-delprofile]', el).forEach(function (b) {
      b.onclick = function (e) {
        e.stopPropagation();
        var id = b.dataset.delprofile;
        App.commit('Import-Profil gelöscht', function (st) { st.importProfiles = st.importProfiles.filter(function (p) { return p.id !== id; }); }, { toast: 'Profil gelöscht.' });
      };
    });
  };
})();
