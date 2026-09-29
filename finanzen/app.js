/*
 * Finanzen – Oberfläche, Teil 1: Grundgerüst, Übersicht, Buchungen, Konten.
 * Teil 2 (views.js): Depots, Wiederkehrend, Auswertung, Kategorien, Daten/Import.
 */
(function () {
  'use strict';
  var C = window.FinCore;
  var Store = window.FinStore;

  var App = window.App = {
    state: null,
    view: 'uebersicht',
    views: {},
    undoStack: [],
    ui: {
      tx: { account: '', period: 'thisMonth', from: '', to: '', cat: '', type: '', q: '', tag: '', limit: 300, sort: 'date', dir: -1 },
      txSel: {},
      quick: { type: 'expense', date: null, accountId: '' },
      showArchived: false
    }
  };

  // ---------------------------------------------------------------- Hilfen
  function $(sel, root) { return (root || document).querySelector(sel); }
  function $$(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function money(c, opts) {
    opts = opts || {};
    var cls = opts.plain ? '' : (c < 0 ? 'neg' : (c > 0 && opts.color ? 'pos' : ''));
    return '<span class="' + cls + '">' + esc(C.formatMoney(c, opts)) + '</span>';
  }
  function today() { return C.todayISO(); }
  function acc(id) { return C.findById(App.state.accounts, id); }
  function cat(id) { return C.findById(App.state.categories, id); }
  function accName(id) { var a = acc(id); return a ? a.name : '(gelöschtes Konto)'; }
  function catLabel(id) {
    if (!id) return '<span class="muted">–</span>';
    var c = cat(id);
    if (!c) return '<span class="muted">?</span>';
    return '<span class="cat-dot" style="background:' + esc(c.color || '#888') + '"></span>' + esc(C.categoryPath(App.state, id));
  }
  function readSettingsUI() {
    try {
      var s = JSON.parse(localStorage.getItem('finanzen-ui') || '{}');
      if (s.tx) Object.assign(App.ui.tx, s.tx, { limit: 300 });
      if (s.quick) Object.assign(App.ui.quick, s.quick, { date: null });
    } catch (e) { /* ignore */ }
  }
  function writeSettingsUI() {
    try { localStorage.setItem('finanzen-ui', JSON.stringify({ tx: App.ui.tx, quick: App.ui.quick })); } catch (e) { /* ignore */ }
  }

  /** Konten, die als „liquide“ zählen (Geld, keine Depots/Kredite/Sachwerte). */
  App.isCashAccount = function (a) { return ['depot', 'darlehen', 'immobilie'].indexOf(a.type) < 0; };

  App.h = { $: $, $$: $$, esc: esc, money: money, today: today, acc: acc, cat: cat, accName: accName, catLabel: catLabel };

  // ---------------------------------------------------------------- Speichern & Undo
  var saveTimer = null;
  App.persist = function () {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(function () {
      Store.save(App.state).then(renderSideFoot);
    }, 250);
  };

  /** Änderung durchführen: Undo-Punkt setzen, fn ausführen, speichern, neu zeichnen. */
  App.commit = function (label, fn, opts) {
    var snap = JSON.stringify(App.state);
    var res = fn(App.state);
    App.undoStack.push({ label: label, snap: snap });
    if (App.undoStack.length > 30) App.undoStack.shift();
    App.persist();
    if (!opts || opts.render !== false) App.render();
    if (opts && opts.toast) App.toast(opts.toast, { undo: true });
    return res;
  };

  App.undo = function () {
    var u = App.undoStack.pop();
    if (!u) { App.toast('Nichts zum Rückgängigmachen.'); return; }
    App.state = C.normalizeState(JSON.parse(u.snap));
    App.persist();
    App.render();
    App.toast('Rückgängig: ' + u.label);
  };

  // ---------------------------------------------------------------- Toast
  App.toast = function (msg, opts) {
    opts = opts || {};
    var root = $('#toast-root');
    var el = document.createElement('div');
    el.className = 'toast' + (opts.error ? ' err' : '');
    el.innerHTML = '<span>' + esc(msg) + '</span>' + (opts.undo ? '<button type="button">Rückgängig</button>' : '');
    if (opts.undo) el.querySelector('button').onclick = function () { el.remove(); App.undo(); };
    root.appendChild(el);
    while (root.children.length > 3) root.removeChild(root.firstChild);
    setTimeout(function () { el.remove(); }, opts.undo ? 6000 : 3500);
  };

  // ---------------------------------------------------------------- Modal
  /**
   * App.modal({ title, body (HTML), wide, onSubmit(form) -> false um offen zu bleiben,
   *             submitLabel, extraButtons: [{label, cls, onClick}], onOpen(root) })
   */
  App.modal = function (o) {
    App.closeModal();
    var root = $('#modal-root');
    var extra = (o.extraButtons || []).map(function (b, i) {
      return '<button type="button" class="btn ' + (b.cls || '') + '" data-extra="' + i + '">' + esc(b.label) + '</button>';
    }).join('');
    root.innerHTML =
      '<div class="modal-backdrop"><form class="modal' + (o.wide ? ' wide' : '') + '" novalidate autocomplete="off">' +
      '<div class="modal-head"><h2>' + esc(o.title) + '</h2><button type="button" class="x" data-close aria-label="Schließen">×</button></div>' +
      '<div class="modal-body">' + o.body + '</div>' +
      '<div class="modal-foot">' + extra + '<div class="r">' +
      '<button type="button" class="btn" data-close>' + (o.onSubmit ? 'Abbrechen' : 'Schließen') + '</button>' +
      (o.onSubmit ? '<button type="submit" class="btn primary">' + esc(o.submitLabel || 'Speichern') + '</button>' : '') +
      '</div></div></form></div>';
    var form = $('form', root);
    $$('[data-close]', root).forEach(function (b) { b.onclick = App.closeModal; });
    $('.modal-backdrop', root).addEventListener('mousedown', function (e) {
      if (e.target.classList.contains('modal-backdrop')) App.closeModal();
    });
    $$('[data-extra]', root).forEach(function (b) {
      b.onclick = function () { o.extraButtons[+b.dataset.extra].onClick(form); };
    });
    form.onsubmit = function (e) {
      e.preventDefault();
      if (!o.onSubmit) return App.closeModal();
      var r = o.onSubmit(form);
      if (r !== false) App.closeModal();
    };
    if (o.onOpen) o.onOpen(form);
    var first = $('[autofocus]', form) || $('input:not([type=hidden]):not([type=checkbox]), select, textarea', form);
    if (first) { first.focus(); if (first.select) first.select(); }
    return form;
  };
  App.closeModal = function () { $('#modal-root').innerHTML = ''; };
  App.confirm = function (msg, onYes, label) {
    App.modal({ title: 'Bitte bestätigen', body: '<p>' + msg + '</p>', submitLabel: label || 'Ja', onSubmit: function () { onYes(); } });
  };

  // ---------------------------------------------------------------- Auswahllisten
  App.accountOptions = function (selected, opts) {
    opts = opts || {};
    var html = opts.empty != null ? '<option value="">' + esc(opts.empty) + '</option>' : '';
    var groups = {};
    var order = [];
    C.sortedAccounts(App.state, true).forEach(function (a) {
      if (a.archived && a.id !== selected && !opts.includeArchived) return;
      if (opts.filter && !opts.filter(a)) return;
      var g = a.group || 'Ohne Gruppe';
      if (!groups[g]) { groups[g] = []; order.push(g); }
      groups[g].push(a);
    });
    if (opts.groups) {
      order.forEach(function (g) { html += '<option value="group:' + esc(g) + '"' + (selected === 'group:' + g ? ' selected' : '') + '>Gruppe: ' + esc(g) + '</option>'; });
    }
    order.forEach(function (g) {
      html += '<optgroup label="' + esc(g) + '">';
      groups[g].forEach(function (a) {
        html += '<option value="' + a.id + '"' + (a.id === selected ? ' selected' : '') + '>' + esc(a.name) + (a.archived ? ' (archiviert)' : '') + '</option>';
      });
      html += '</optgroup>';
    });
    return html;
  };

  App.categoryOptions = function (selected, opts) {
    opts = opts || {};
    var html = '<option value="">' + esc(opts.empty || '– keine Kategorie –') + '</option>';
    if (opts.none) html += '<option value="__none"' + (selected === '__none' ? ' selected' : '') + '>Ohne Kategorie</option>';
    [['expense', 'Ausgaben'], ['income', 'Einnahmen']].forEach(function (tp) {
      if (opts.type && opts.type !== tp[0]) return;
      C.categoryTree(App.state, tp[0]).forEach(function (node) {
        html += '<optgroup label="' + esc(tp[1] + ' · ' + node.cat.name) + '">';
        html += '<option value="' + node.cat.id + '"' + (node.cat.id === selected ? ' selected' : '') + '>' + esc(node.cat.name) + (node.children.length ? ' (allgemein)' : '') + '</option>';
        node.children.forEach(function (c) {
          html += '<option value="' + c.id + '"' + (c.id === selected ? ' selected' : '') + '>  ' + esc(c.name) + '</option>';
        });
        html += '</optgroup>';
      });
    });
    return html;
  };

  function payeeList() {
    var seen = {}, out = [];
    var txs = App.state.transactions;
    for (var i = txs.length - 1; i >= 0 && out.length < 800; i--) {
      var p = (txs[i].payee || '').trim();
      if (p && !txs[i].tradeId && !seen[p.toLowerCase()]) { seen[p.toLowerCase()] = true; out.push(p); }
    }
    return out.sort(function (a, b) { return a.localeCompare(b, 'de'); });
  }
  App.payeeDatalist = function (id) {
    return '<datalist id="' + id + '">' + payeeList().map(function (p) { return '<option value="' + esc(p) + '">'; }).join('') + '</datalist>';
  };

  function parseTags(str) {
    return String(str || '').split(/[,;]/).map(function (s) { return s.trim().replace(/^#/, ''); }).filter(Boolean);
  }
  /** "#urlaub Pizza mit Freunden #privat" -> {note:'Pizza mit Freunden', tags:['urlaub','privat']} */
  function splitHashTags(note) {
    var tags = [];
    var rest = String(note || '').replace(/(^|\s)#([\wäöüÄÖÜß-]+)/g, function (_, sp, t) { tags.push(t); return sp; });
    return { note: rest.replace(/\s+/g, ' ').trim(), tags: tags };
  }
  App.parseTags = parseTags;

  // ---------------------------------------------------------------- Zeiträume
  App.periodRange = function (p, from, to) {
    var t = today();
    switch (p) {
      case 'thisMonth': return [C.startOfMonth(t), C.endOfMonth(t)];
      case 'lastMonth': { var lm = C.addMonths(C.startOfMonth(t), -1, 1); return [lm, C.endOfMonth(lm)]; }
      case 'last30': return [C.addDays(t, -30), t];
      case 'last90': return [C.addDays(t, -90), t];
      case 'thisYear': return [t.slice(0, 4) + '-01-01', t.slice(0, 4) + '-12-31'];
      case 'lastYear': { var y = +t.slice(0, 4) - 1; return [y + '-01-01', y + '-12-31']; }
      case 'last12': return [C.addMonths(C.startOfMonth(t), -11, 1), C.endOfMonth(t)];
      case 'custom': return [from || '0000-01-01', to || '9999-12-31'];
      default: return ['0000-01-01', '9999-12-31'];
    }
  };
  App.PERIODS = [
    ['thisMonth', 'Dieser Monat'], ['lastMonth', 'Letzter Monat'], ['last30', 'Letzte 30 Tage'], ['last90', 'Letzte 90 Tage'],
    ['thisYear', 'Dieses Jahr'], ['lastYear', 'Letztes Jahr'], ['last12', 'Letzte 12 Monate'], ['all', 'Alle'], ['custom', 'Zeitraum …']
  ];

  /** Konto-Filter ('' | id | 'group:Name') -> Array von Konto-IDs oder null */
  App.accountFilterIds = function (val) {
    if (!val) return null;
    if (val.indexOf('group:') === 0) {
      var g = val.slice(6);
      return App.state.accounts.filter(function (a) { return (a.group || 'Ohne Gruppe') === g; }).map(function (a) { return a.id; });
    }
    return [val];
  };

  // ---------------------------------------------------------------- Rendering
  App.go = function (view, params) {
    if (params && params.tx) Object.assign(App.ui.tx, params.tx);
    if (location.hash !== '#' + view) location.hash = view;
    else App.render();
  };

  App.render = function () {
    var v = (location.hash || '#uebersicht').slice(1).split('?')[0];
    if (!App.views[v]) v = 'uebersicht';
    App.view = v;
    $$('#nav a').forEach(function (a) { a.classList.toggle('active', a.dataset.view === v); });
    renderSidebar();
    renderBanner();
    var el = $('#view');
    var scroll = el.dataset.view === v ? window.scrollY : 0;
    el.dataset.view = v;
    App.views[v](el);
    if (scroll) window.scrollTo(0, scroll);
    writeSettingsUI();
  };

  function renderSidebar() {
    var s = App.state;
    var bal = C.allBalances(s, today());
    var html = '';
    var groups = {};
    var order = [];
    C.sortedAccounts(s, false).forEach(function (a) {
      var g = a.group || 'Ohne Gruppe';
      if (!groups[g]) { groups[g] = []; order.push(g); }
      groups[g].push(a);
    });
    var selected = App.view === 'buchungen' ? App.ui.tx.account : null;
    order.forEach(function (g) {
      var sum = 0;
      groups[g].forEach(function (a) { if (!a.excludeFromNetWorth) sum += bal[a.id]; });
      html += '<div class="side-group side-acc' + (selected === 'group:' + g ? ' active' : '') + '" data-acc="group:' + esc(g) + '"><span>' + esc(g) + '</span><span>' + esc(C.formatMoney(sum)) + '</span></div>';
      groups[g].forEach(function (a) {
        html += '<a class="side-acc' + (selected === a.id ? ' active' : '') + '" data-acc="' + a.id + '" title="' + esc(a.name) + '"><span class="n">' + esc(a.name) + '</span><span class="v' + (bal[a.id] < 0 ? ' neg' : '') + '">' + esc(C.formatMoney(bal[a.id])) + '</span></a>';
      });
    });
    if (order.length) html += '<div class="side-total"><span>Vermögen</span><span>' + esc(C.formatMoney(C.netWorth(s, null, bal))) + '</span></div>';
    var side = $('#side-accounts');
    side.innerHTML = html;
    side.onclick = function (e) {
      var a = e.target.closest('[data-acc]');
      if (!a) return;
      App.ui.txSel = {};
      App.go('buchungen', { tx: { account: a.dataset.acc, limit: 300 } });
    };
    renderSideFoot();
  }

  function renderSideFoot() {
    var f = $('#side-foot');
    if (!f || !App.state) return;
    var html;
    if (Store.fileStatus === 'connected') {
      html = '<span class="dot ok"></span>Datei: ' + esc(Store.fileName()) +
        (Store.lastFileSave ? '<br><span>gespeichert ' + Store.lastFileSave.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }) + '</span>' : '');
    } else if (Store.fileStatus === 'needs-permission') {
      html = '<span class="dot warn"></span>Datei nicht verbunden<br><button type="button" data-reconnect>Wieder verbinden</button>';
    } else if (Store.fileStatus === 'error') {
      html = '<span class="dot warn"></span>Fehler beim Speichern in Datei<br><button type="button" data-reconnect>Erneut verbinden</button>';
    } else {
      html = '<span class="dot"></span>Nur im Browser gespeichert<br><a href="#daten" style="color:inherit">Speicherort wählen</a>';
    }
    html += '<div style="margin-top:6px"><kbd>N</kbd> neue Buchung · <kbd>Strg</kbd>+<kbd>Z</kbd> rückgängig</div>';
    f.innerHTML = html;
    var b = $('[data-reconnect]', f);
    if (b) b.onclick = App.reconnectFile;
  }
  Store.onStatus = renderSideFoot;

  function renderBanner() {
    var s = App.state;
    var html = '';
    if (!Store.storageOk && Store.fileStatus !== 'connected') {
      html += '<div class="banner" style="border-color:var(--neg)"><span class="grow"><b>Achtung: Hier kann nichts gespeichert werden</b> (eingebettete Vorschau). Zum Ausprobieren okay – für echte Daten die Datei herunterladen und per Doppelklick in Chrome oder Edge öffnen.</span></div>';
    } else if (Store.fileStatus === 'needs-permission') {
      html += '<div class="banner"><span class="grow">Deine Datei <b>' + esc(Store.fileName()) + '</b> ist verknüpft, braucht nach dem Neustart aber einmal deine Freigabe.</span><button class="btn primary" data-reconnect>Datei freigeben</button></div>';
    } else if (Store.fileStatus !== 'connected' && s.transactions.length > 20) {
      var last = s.meta.lastBackup;
      if (!last || C.diffDays(last.slice(0, 10), today()) > 14) {
        html += '<div class="banner"><span class="grow">Deine Daten liegen nur im Browser. Lege eine Datei als Speicherort an oder exportiere regelmäßig ein Backup.</span><a class="btn" href="#daten">Einrichten</a></div>';
      }
    }
    s.accounts.forEach(function (a) {
      if (a.type !== 'darlehen' || a.archived || !a.loan || !a.loan.fixedUntil) return;
      var days = C.diffDays(today(), a.loan.fixedUntil);
      if (days < 0 || days > 365 || !C.loanDebt(s, a.id, today())) return;
      var st = C.loanStats(s, a.id, today());
      html += '<div class="banner info"><span class="grow"><b>Zinsbindung „' + esc(a.name) + '“ endet am ' + C.formatDate(a.loan.fixedUntil) + '</b> (in ' + days + ' Tagen). Restschuld dann ca. ' + esc(C.formatMoney(st.restAtFixedEnd)) + ' – Zeit, Anschlussfinanzierung / Forward-Darlehen zu vergleichen.</span><a class="btn" href="#kredite">Zum Kredit</a></div>';
    });
    if (s.meta.demo) {
      html += '<div class="banner info"><span class="grow">Du siehst <b>Beispieldaten</b>. Schau dich um – wenn du startklar bist, lösche sie und lege deine eigenen Konten an.</span><button class="btn" data-clear-demo>Beispieldaten löschen</button></div>';
    }
    var el = $('#banner');
    el.innerHTML = html;
    var b = $('[data-reconnect]', el);
    if (b) b.onclick = App.reconnectFile;
    var d = $('[data-clear-demo]', el);
    if (d) d.onclick = function () {
      App.confirm('Alle Beispieldaten löschen und mit einer leeren Datenbasis (Standard-Kategorien) starten?', function () {
        App.commit('Beispieldaten gelöscht', function () {
          App.state = C.emptyState();
        });
        location.hash = 'konten';
      }, 'Löschen');
    };
  }

  App.reconnectFile = function () {
    Store.reconnect().then(function (fileState) {
      App.adoptFileState(fileState);
    }).catch(function (e) { App.toast(e.message || String(e), { error: true }); });
  };

  /** Beim (Wieder-)Verbinden: neueren Stand verwenden. */
  App.adoptFileState = function (fileState) {
    var local = App.state;
    var fAt = fileState && fileState.meta && fileState.meta.savedAt;
    var lAt = local && local.meta && local.meta.savedAt;
    if (fileState && (!lAt || (fAt && fAt >= lAt))) {
      App.state = C.normalizeState(fileState);
      runRecurring();
      App.toast('Daten aus Datei geladen.');
    } else {
      App.toast('Lokaler Stand ist neuer – wurde in die Datei geschrieben.');
    }
    App.persist();
    App.render();
  };

  function runRecurring() {
    var n = C.processRecurring(App.state, today());
    if (n) {
      App.persist();
      setTimeout(function () { App.toast(n === 1 ? '1 wiederkehrende Buchung automatisch gebucht.' : n + ' wiederkehrende Buchungen automatisch gebucht.'); }, 300);
    }
  }
  App.runRecurring = runRecurring;

  // ================================================================ ÜBERSICHT
  App.views.uebersicht = function (el) {
    var s = App.state;
    var t = today();
    if (!s.accounts.length) {
      el.innerHTML = '<div class="page-head"><div><h1>Willkommen</h1><div class="sub">Dein Finanz-Tracker – lokal, ohne Cloud, ohne Abo.</div></div></div>' +
        '<div class="card"><div class="empty"><h3>Noch keine Konten angelegt</h3>' +
        '<p>Starte mit deinen Konten (Girokonto, Tagesgeld, Kreditkarte, Depots …) und ihrem aktuellen Kontostand.<br>Oder schau dir zuerst die Beispieldaten an.</p>' +
        '<div class="row" style="justify-content:center;margin-top:14px"><button class="btn primary" data-act="new-account">Erstes Konto anlegen</button><button class="btn" data-act="demo">Beispieldaten laden</button><a class="btn" href="#daten">Backup / CSV importieren</a></div></div></div>';
      el.onclick = function (e) {
        var a = e.target.closest('[data-act]');
        if (!a) return;
        if (a.dataset.act === 'new-account') App.editAccount(null);
        if (a.dataset.act === 'demo') App.commit('Beispieldaten geladen', function () { App.state = C.demoState(t); });
      };
      return;
    }
    var bal = C.allBalances(s, t);
    var nw = C.netWorth(s, t, bal);
    var lastMonthEnd = C.addDays(C.startOfMonth(t), -1);
    var nwPrev = C.netWorth(s, lastMonthEnd);
    var liquid = 0, depots = 0, depotCost = 0;
    s.accounts.forEach(function (a) {
      if (a.excludeFromNetWorth) return;
      if (a.type === 'depot') {
        depots += bal[a.id];
        C.holdings(s, a.id, t).forEach(function (h) { depotCost += h.cost; });
      } else if (App.isCashAccount(a)) liquid += bal[a.id];
    });
    var depotHoldValue = 0;
    s.accounts.forEach(function (a) { if (a.type === 'depot' && !a.excludeFromNetWorth) depotHoldValue += C.depotValue(s, a.id, t); });
    var ms = C.startOfMonth(t), me = C.endOfMonth(t);
    var rep = C.categoryReport(s, { from: ms, to: me });
    var mk = C.monthKey(t);
    var inc = rep.income[mk] || 0, exp = rep.expense[mk] || 0;
    var fc = C.forecastBalances(s, t, me);
    var fcLiquid = 0;
    s.accounts.forEach(function (a) { if (!a.excludeFromNetWorth && App.isCashAccount(a)) fcLiquid += fc[a.id]; });

    var html = '<div class="page-head"><div><h1>Übersicht</h1><div class="sub">' + esc(C.MONTHS_LONG[+t.slice(5, 7) - 1] + ' ' + t.slice(0, 4)) + ' · Stand ' + C.formatDate(t) + '</div></div>' +
      '<div class="actions"><button class="btn primary" data-act="new-tx">+ Buchung</button><button class="btn" data-act="new-transfer">⇄ Umbuchung</button></div></div>';

    html += '<div class="kpis">' +
      kpi('Nettovermögen', money(nw), 'seit Monatsbeginn ' + C.formatMoney(nw - nwPrev, { sign: true })) +
      kpi('Liquide Mittel', money(liquid), 'Prognose Monatsende ' + C.formatMoney(fcLiquid)) +
      kpi('Depots', money(depotHoldValue), depotCost ? 'G/V ' + C.formatMoney(depotHoldValue - depotCost, { sign: true }) + ' (' + C.formatPercent((depotHoldValue - depotCost) / depotCost) + ')' : '&nbsp;') +
      kpi('Einnahmen ' + C.formatMonth(mk), money(inc), '&nbsp;') +
      kpi('Ausgaben ' + C.formatMonth(mk), money(exp), 'Saldo ' + C.formatMoney(inc + exp, { sign: true })) +
      '</div>';

    // Zu bestätigen
    var due = C.dueConfirmations(s, t);
    if (due.length) {
      html += '<div class="card"><div class="card-head"><h2>Zu bestätigen <span class="badge warn">' + due.length + '</span></h2><span class="help">Wiederkehrende Buchungen im Modus „bestätigen“</span></div><div class="list">';
      due.forEach(function (d, i) {
        html += '<div class="list-item"><div class="main"><div class="t">' + esc(d.rule.name) + '</div><div class="s">' + C.formatDate(d.date) + ' · ' + esc(ruleAccountsLabel(d.rule)) + '</div></div>' +
          '<div class="nowrap bold">' + money(C.ruleAmount(d.rule)) + '</div>' +
          '<button class="btn small primary" data-act="due-book" data-rule="' + d.rule.id + '">Buchen</button>' +
          '<button class="btn small" data-act="due-edit" data-rule="' + d.rule.id + '">Anpassen …</button>' +
          '<button class="btn small ghost" data-act="due-skip" data-rule="' + d.rule.id + '" title="Diesen Termin auslassen">Überspringen</button></div>';
        void i;
      });
      html += '</div></div>';
    }

    html += '<div class="grid two" style="margin-top:16px">';
    // Konten
    html += '<div class="card"><div class="card-head"><h2>Konten</h2><a class="btn small" href="#konten">Verwalten</a></div><div class="card-body flush"><table class="tbl"><thead><tr><th>Konto</th><th class="num">Stand</th><th class="num" title="inkl. aller wiederkehrenden Buchungen bis Monatsende">Monatsende</th></tr></thead><tbody>';
    var groups = {}, order = [];
    C.sortedAccounts(s, false).forEach(function (a) {
      var g = a.group || 'Ohne Gruppe';
      if (!groups[g]) { groups[g] = []; order.push(g); }
      groups[g].push(a);
    });
    order.forEach(function (g) {
      var sum = 0, sumF = 0;
      groups[g].forEach(function (a) { if (!a.excludeFromNetWorth) { sum += bal[a.id]; sumF += fc[a.id]; } });
      html += '<tr class="group-row"><td>' + esc(g) + '</td><td class="num">' + money(sum) + '</td><td class="num">' + money(sumF) + '</td></tr>';
      groups[g].forEach(function (a) {
        html += '<tr class="click" data-acc="' + a.id + '"><td class="sub">' + esc(a.name) + ' <span class="small">' + esc(C.ACCOUNT_TYPES[a.type] || '') + '</span></td><td class="num">' + money(bal[a.id]) + '</td><td class="num">' + money(fc[a.id]) + '</td></tr>';
      });
    });
    html += '<tr class="sum-row"><td>Gesamt</td><td class="num">' + money(nw) + '</td><td class="num">' + money(C.netWorth(s, null, fc)) + '</td></tr>';
    html += '</tbody></table></div></div>';

    // Ausgaben nach Kategorie
    html += '<div class="card"><div class="card-head"><h2>Ausgaben ' + esc(C.formatMonth(mk, true)) + '</h2><a class="btn small" href="#auswertung">Auswertung</a></div><div class="card-body">' + expenseBars(rep, mk) + '</div></div>';
    html += '</div>';

    html += '<div class="grid two" style="margin-top:16px">';
    // Nächste 30 Tage
    var up = C.upcoming(s, C.addDays(t, 1), C.addDays(t, 30));
    html += '<div class="card"><div class="card-head"><h2>Nächste 30 Tage</h2><a class="btn small" href="#wiederkehrend">Alle Daueraufträge</a></div>';
    if (!up.length) html += '<div class="empty">Keine geplanten Buchungen. <a href="#wiederkehrend">Daueraufträge anlegen</a></div>';
    else {
      html += '<div class="card-body flush"><table class="tbl"><tbody>';
      up.slice(0, 14).forEach(function (u) {
        html += '<tr class="click" data-rule="' + u.rule.id + '"><td class="nowrap">' + C.formatDate(u.date) + '</td><td>' + esc(u.rule.name) + '<div class="small">' + esc(ruleAccountsLabel(u.rule)) + (u.rule.mode === 'auto' ? '' : ' · bestätigen') + '</div></td><td class="num">' + money(C.ruleAmount(u.rule)) + '</td></tr>';
      });
      if (up.length > 14) html += '<tr class="muted"><td colspan="3">… und ' + (up.length - 14) + ' weitere</td></tr>';
      html += '</tbody></table></div>';
    }
    html += '</div>';
    // Vermögensentwicklung
    var hist = C.netWorthHistory(s, t, 12);
    html += '<div class="card"><div class="card-head"><h2>Nettovermögen – 12 Monate</h2></div><div class="card-body">' + App.lineChart(hist.map(function (p) { return { label: C.formatMonth(p.month), value: p.value, sub: C.formatDate(p.date) }; })) + '</div></div>';
    html += '</div>';

    el.innerHTML = html;
    App.bindChartTips(el);
    el.onclick = function (e) {
      var a = e.target.closest('[data-act],[data-acc],[data-rule]');
      if (!a) return;
      var act = a.dataset.act;
      if (act === 'new-tx') return App.editTransaction(null);
      if (act === 'new-transfer') return App.editTransaction(null, { type: 'transfer' });
      if (act === 'due-book' || act === 'due-skip' || act === 'due-edit') {
        var r = C.findById(s.recurring, a.dataset.rule);
        if (act === 'due-book') App.commit('Buchung bestätigt', function () { C.bookNext(App.state, C.findById(App.state.recurring, r.id)); }, { toast: r.name + ' gebucht.' });
        if (act === 'due-skip') App.commit('Termin übersprungen', function () { C.skipNext(C.findById(App.state.recurring, r.id)); }, { toast: 'Termin übersprungen.' });
        if (act === 'due-edit') App.bookRuleDialog(r);
        return;
      }
      if (a.dataset.acc) return App.go('buchungen', { tx: { account: a.dataset.acc } });
      if (a.dataset.rule) return App.editRule(C.findById(s.recurring, a.dataset.rule));
    };
  };

  function kpi(l, v, s) { return '<div class="kpi"><div class="l">' + esc(l) + '</div><div class="v">' + v + '</div><div class="s">' + s + '</div></div>'; }

  function ruleAccountsLabel(r) {
    if (r.loanAccountId) return accName(r.accountId) + ' → ' + accName(r.loanAccountId);
    if (r.securityId) return accName(r.accountId) + ' → ' + accName(r.depotId);
    if (r.counterAccountId) return accName(r.accountId) + ' → ' + accName(r.counterAccountId);
    return accName(r.accountId) + (r.categoryId ? ' · ' + C.categoryPath(App.state, r.categoryId) : '');
  }
  App.ruleAccountsLabel = ruleAccountsLabel;

  function expenseBars(rep, mk) {
    var s = App.state;
    var rows = [];
    Object.keys(rep.byMain).forEach(function (mid) {
      var v = rep.byMain[mid][mk] || 0;
      var c = cat(mid);
      if (c && c.type === 'income') return;
      if (v >= 0 && !(c && c.budget)) return;
      rows.push({ id: mid, name: c ? c.name : 'Ohne Kategorie', color: c ? c.color : '#999', v: -v, budget: c ? budgetFor(c) : 0 });
    });
    // Budgets ohne Ausgaben ebenfalls anzeigen
    s.categories.forEach(function (c) {
      if (!c.parentId && c.type === 'expense' && budgetFor(c) && !rows.some(function (r) { return r.id === c.id; })) {
        rows.push({ id: c.id, name: c.name, color: c.color, v: 0, budget: budgetFor(c) });
      }
    });
    if (!rows.length) return '<div class="empty">Diesen Monat noch keine Ausgaben.</div>';
    rows.sort(function (a, b) { return b.v - a.v; });
    var max = Math.max.apply(null, rows.map(function (r) { return Math.max(r.v, r.budget); })) || 1;
    return '<div class="bars">' + rows.slice(0, 12).map(function (r) {
      var over = r.budget && r.v > r.budget;
      var title = C.formatMoney(r.v) + (r.budget ? ' von ' + C.formatMoney(r.budget) + ' Budget' : '');
      return '<div class="bar-row" title="' + esc(title) + '"><span class="name"><span class="cat-dot" style="background:' + esc(r.color) + '"></span>' + esc(r.name) + '</span>' +
        '<span class="bar-track"><span class="bar-fill" style="display:block;width:' + (r.v / max * 100).toFixed(1) + '%;background:' + (over ? 'var(--neg)' : 'var(--series-1)') + '"></span>' +
        (r.budget ? '<span class="bar-budget" style="left:' + (r.budget / max * 100).toFixed(1) + '%"></span>' : '') + '</span>' +
        '<span class="val">' + esc(C.formatMoney(r.v)) + (r.budget ? '<div class="small ' + (over ? 'neg' : 'muted') + '">' + (over ? 'über ' : 'von ') + esc(C.formatMoney(over ? r.v - r.budget : r.budget)) + '</div>' : '') + '</span></div>';
    }).join('') + '</div>' + (rows.some(function (r) { return r.budget; }) ? '<div class="help mt">Strich = Monatsbudget (einstellbar unter Kategorien).</div>' : '');
  }

  /** Budget einer Hauptkategorie: eigenes Budget oder Summe der Unterkategorie-Budgets. */
  function budgetFor(c) {
    if (c.budget) return c.budget;
    var sum = 0;
    App.state.categories.forEach(function (x) { if (x.parentId === c.id) sum += x.budget || 0; });
    return sum;
  }
  App.budgetFor = budgetFor;

  // ---------------------------------------------------------------- Diagramme
  /** Einfaches Liniendiagramm (eine Reihe). points: [{label, value, sub}] */
  App.lineChart = function (points) {
    if (!points.length) return '';
    var W = 560, H = 200, L = 64, R = 12, T = 12, B = 26;
    var vals = points.map(function (p) { return p.value; });
    var min = Math.min.apply(null, vals), max = Math.max.apply(null, vals);
    if (min > 0 && (max - min) < max * 0.5) min = min - (max - min) * 0.3; else min = Math.min(0, min);
    if (max === min) { max += 100; min -= 100; }
    var ticks = niceTicks(min, max, 4);
    min = ticks[0]; max = ticks[ticks.length - 1];
    var n = points.length;
    function x(i) { return L + (n === 1 ? (W - L - R) / 2 : i * (W - L - R) / (n - 1)); }
    function y(v) { return T + (H - T - B) * (1 - (v - min) / (max - min)); }
    var svg = '<svg class="chart" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Verlauf">';
    ticks.forEach(function (tv) {
      svg += '<line class="grid-line" x1="' + L + '" x2="' + (W - R) + '" y1="' + y(tv) + '" y2="' + y(tv) + '"/>' +
        '<text x="' + (L - 6) + '" y="' + (y(tv) + 4) + '" text-anchor="end">' + esc(shortMoney(tv)) + '</text>';
    });
    points.forEach(function (p, i) {
      if (n <= 13 || i % 2 === 0) svg += '<text x="' + x(i) + '" y="' + (H - 8) + '" text-anchor="middle">' + esc(p.label) + '</text>';
    });
    var d = points.map(function (p, i) { return (i ? 'L' : 'M') + x(i).toFixed(1) + ' ' + y(p.value).toFixed(1); }).join(' ');
    var area = d + ' L' + x(n - 1).toFixed(1) + ' ' + y(Math.max(min, 0)) + ' L' + x(0).toFixed(1) + ' ' + y(Math.max(min, 0)) + ' Z';
    svg += '<path d="' + area + '" fill="var(--series-1)" opacity=".10"/>';
    svg += '<path d="' + d + '" fill="none" stroke="var(--series-1)" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>';
    var last = points[n - 1];
    svg += '<circle cx="' + x(n - 1) + '" cy="' + y(last.value) + '" r="4" fill="var(--series-1)" stroke="var(--surface)" stroke-width="2"/>';
    // Hover-Zonen
    var step = n > 1 ? (W - L - R) / (n - 1) : W - L - R;
    points.forEach(function (p, i) {
      svg += '<rect x="' + (x(i) - step / 2) + '" y="' + T + '" width="' + step + '" height="' + (H - T - B) + '" fill="transparent" data-tip="' + esc(p.label + (p.sub ? ' (' + p.sub + ')' : '') + ': ' + C.formatMoney(p.value)) + '" data-cx="' + x(i) + '"/>';
    });
    svg += '<line class="hover-line" x1="0" x2="0" y1="' + T + '" y2="' + (H - B) + '" stroke="var(--muted)" stroke-dasharray="3 3" visibility="hidden"/>';
    return svg + '</svg>';
  };

  /** Gruppiertes Säulendiagramm Einnahmen/Ausgaben. rows: [{label, a, b}] (a,b >= 0) */
  App.barChart = function (rows, names) {
    var W = 900, H = 230, L = 64, R = 10, T = 12, B = 26;
    var max = 0;
    rows.forEach(function (r) { max = Math.max(max, r.a, r.b); });
    var ticks = niceTicks(0, max || 100, 4);
    max = ticks[ticks.length - 1];
    var n = rows.length || 1;
    var slot = (W - L - R) / n;
    var bw = Math.max(3, Math.min(22, slot * 0.34));
    function y(v) { return T + (H - T - B) * (1 - v / max); }
    var svg = '<svg class="chart" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="' + esc(names[0] + ' und ' + names[1]) + '">';
    ticks.forEach(function (tv) {
      svg += '<line class="grid-line" x1="' + L + '" x2="' + (W - R) + '" y1="' + y(tv) + '" y2="' + y(tv) + '"/>' +
        '<text x="' + (L - 6) + '" y="' + (y(tv) + 4) + '" text-anchor="end">' + esc(shortMoney(tv)) + '</text>';
    });
    rows.forEach(function (r, i) {
      var cx = L + slot * i + slot / 2;
      svg += bar(cx - bw - 1, r.a, 'var(--series-1)') + bar(cx + 1, r.b, 'var(--series-2)');
      svg += '<text x="' + cx + '" y="' + (H - 8) + '" text-anchor="middle">' + esc(r.label) + '</text>';
      svg += '<rect x="' + (L + slot * i) + '" y="' + T + '" width="' + slot + '" height="' + (H - T - B) + '" fill="transparent" data-tip="' +
        esc(r.label + ' – ' + names[0] + ': ' + C.formatMoney(r.a) + ' · ' + names[1] + ': ' + C.formatMoney(r.b) + ' · Saldo: ' + C.formatMoney(r.a - r.b, { sign: true })) + '"/>';
    });
    function bar(x0, v, color) {
      if (!v) return '';
      var h = Math.max(1, (H - T - B) * v / max);
      var y0 = H - B - h;
      var rr = Math.min(4, h, bw / 2);
      // oben abgerundet, unten gerade (an der Nulllinie)
      return '<path d="M' + x0 + ' ' + (H - B) + ' V' + (y0 + rr) + ' Q' + x0 + ' ' + y0 + ' ' + (x0 + rr) + ' ' + y0 + ' H' + (x0 + bw - rr) + ' Q' + (x0 + bw) + ' ' + y0 + ' ' + (x0 + bw) + ' ' + (y0 + rr) + ' V' + (H - B) + ' Z" fill="' + color + '"/>';
    }
    return svg + '</svg>';
  };

  App.bindChartTips = function (root) {
    var tip = null;
    $$('svg.chart', root).forEach(function (svg) {
      var line = $('.hover-line', svg);
      svg.addEventListener('mousemove', function (e) {
        var t = e.target.closest('[data-tip]');
        if (!t) { hide(); return; }
        if (!tip) { tip = document.createElement('div'); tip.className = 'chart-tip'; document.body.appendChild(tip); }
        tip.textContent = t.getAttribute('data-tip');
        tip.style.left = Math.min(e.clientX + 12, window.innerWidth - tip.offsetWidth - 8) + 'px';
        tip.style.top = (e.clientY - 34) + 'px';
        if (line && t.dataset.cx) { line.setAttribute('x1', t.dataset.cx); line.setAttribute('x2', t.dataset.cx); line.setAttribute('visibility', 'visible'); }
      });
      svg.addEventListener('mouseleave', hide);
      function hide() {
        if (tip) { tip.remove(); tip = null; }
        if (line) line.setAttribute('visibility', 'hidden');
      }
    });
  };

  function niceTicks(min, max, count) {
    var span = max - min;
    var step = Math.pow(10, Math.floor(Math.log10(span / count)));
    var err = span / count / step;
    if (err >= 7.5) step *= 10; else if (err >= 3.5) step *= 5; else if (err >= 1.5) step *= 2;
    var lo = Math.floor(min / step) * step, hi = Math.ceil(max / step) * step;
    var out = [];
    for (var v = lo; v <= hi + step / 2; v += step) out.push(Math.round(v));
    return out;
  }
  function shortMoney(c) {
    var e = c / 100;
    if (Math.abs(e) >= 1e6) return C.formatNumber(e / 1e6, 1) + ' Mio';
    if (Math.abs(e) >= 1e4) return C.formatNumber(e / 1e3, 0) + ' T';
    if (Math.abs(e) >= 1e3) return C.formatNumber(e / 1e3, 1) + ' T';
    return C.formatNumber(e, 0);
  }

  // ================================================================ BUCHUNGEN
  function filteredTransactions() {
    var s = App.state, f = App.ui.tx;
    var range = App.periodRange(f.period, f.from, f.to);
    var accIds = App.accountFilterIds(f.account);
    var accSet = accIds ? toSet(accIds) : null;
    var catSet = f.cat && f.cat !== '__none' ? toSet(C.descendantIds(s, f.cat)) : null;
    var q = f.q.trim().toLowerCase();
    var qAmount = q ? C.parseMoney(q) : NaN;
    var tag = f.tag.trim().toLowerCase();
    var out = [];
    s.transactions.forEach(function (t, idx) {
      if (t.date < range[0] || t.date > range[1]) return;
      if (accSet && !accSet[t.accountId] && !accSet[t.counterAccountId]) return;
      if (accSet && t.counterAccountId && accSet[t.accountId] && accSet[t.counterAccountId] && f.account.indexOf('group:') === 0) { /* interne Umbuchung in der Gruppe: anzeigen */ }
      if (f.cat === '__none' && (t.categoryId || !C.isIncomeExpense(t))) return;
      if (catSet && !catSet[t.categoryId]) return;
      if (f.type && C.txType(t) !== f.type) return;
      if (tag && !(t.tags || []).some(function (x) { return x.toLowerCase() === tag; })) return;
      if (q) {
        var hay = ((t.payee || '') + ' ' + (t.note || '') + ' ' + (t.tags || []).join(' ') + ' ' + C.categoryPath(s, t.categoryId)).toLowerCase();
        var amtHit = !isNaN(qAmount) && qAmount !== 0 && Math.abs(t.amount) === Math.abs(qAmount);
        if (hay.indexOf(q) < 0 && !amtHit) return;
      }
      out.push({ t: t, idx: idx });
    });
    var dir = f.dir;
    out.sort(function (a, b) {
      var r;
      if (f.sort === 'amount') r = Math.abs(a.t.amount) - Math.abs(b.t.amount);
      else if (f.sort === 'payee') r = (a.t.payee || '').localeCompare(b.t.payee || '', 'de');
      else r = a.t.date < b.t.date ? -1 : a.t.date > b.t.date ? 1 : 0;
      if (!r) r = a.idx - b.idx;
      return r * dir;
    });
    return { rows: out, range: range, accSet: accSet };
  }

  function toSet(arr) { var s = {}; arr.forEach(function (x) { s[x] = true; }); return s; }

  /** Laufender Saldo je Buchung für ein einzelnes (Nicht-Depot-)Konto. */
  function runningBalances(accountId) {
    var s = App.state;
    var a = acc(accountId);
    var list = [];
    s.transactions.forEach(function (t, idx) {
      if (t.accountId === accountId || t.counterAccountId === accountId) list.push({ t: t, idx: idx });
    });
    list.sort(function (x, y) { return x.t.date < y.t.date ? -1 : x.t.date > y.t.date ? 1 : x.idx - y.idx; });
    var bal = a.opening || 0, map = {};
    list.forEach(function (e) { bal += C.effectOn(e.t, accountId); map[e.t.id] = bal; });
    return map;
  }

  App.views.buchungen = function (el) {
    var s = App.state, f = App.ui.tx, q = App.ui.quick;
    if (!s.accounts.length) {
      el.innerHTML = '<div class="page-head"><h1>Buchungen</h1></div><div class="card"><div class="empty"><h3>Lege zuerst ein Konto an.</h3><a class="btn primary" href="#konten">Zu den Konten</a></div></div>';
      return;
    }
    var singleAcc = f.account && f.account.indexOf('group:') < 0 ? acc(f.account) : null;
    if (!q.accountId || !acc(q.accountId) || acc(q.accountId).archived) q.accountId = (singleAcc && !singleAcc.archived ? singleAcc.id : C.sortedAccounts(s, false)[0].id);
    if (singleAcc && !singleAcc.archived) q.accountId = singleAcc.id;
    if (!q.date) q.date = today();

    var res = filteredTransactions();
    var rows = res.rows;
    var showBal = singleAcc && f.sort === 'date' && !f.cat && !f.type && !f.q && !f.tag;
    var balMap = showBal ? runningBalances(singleAcc.id) : null;
    var sumIn = 0, sumOut = 0;
    rows.forEach(function (r) {
      var amt = displayAmount(r.t, res.accSet);
      if (amt == null) return;
      if (amt >= 0) sumIn += amt; else sumOut += amt;
    });

    var title = singleAcc ? singleAcc.name : (f.account ? f.account.slice(6) : 'Alle Buchungen');
    var sub = singleAcc ? 'Kontostand ' + C.formatMoney(C.accountBalance(s, singleAcc.id, today())) + (singleAcc.type !== 'depot' ? '' : ' (inkl. Depotwert)') : rows.length + ' Buchungen';
    var html = '<div class="page-head"><div><h1>' + esc(title) + '</h1><div class="sub">' + esc(sub) + '</div></div><div class="actions">' +
      (singleAcc ? '<button class="btn" data-act="reconcile">Saldo abgleichen</button><button class="btn" data-act="edit-acc">Konto bearbeiten</button>' : '') +
      '<button class="btn" data-act="export">CSV exportieren</button></div></div>';

    // Schnelleingabe
    var isTr = q.type === 'transfer';
    html += '<div class="card"><form class="quick" id="quick" autocomplete="off">' +
      '<label>Datum<input type="date" name="date" value="' + esc(q.date) + '" required></label>' +
      '<label>' + (isTr ? 'Von Konto' : 'Konto') + '<select name="accountId">' + App.accountOptions(q.accountId) + '</select></label>' +
      '<label>Art<span class="seg" id="q-type">' +
      '<button type="button" data-type="expense" class="' + (q.type === 'expense' ? 'on neg' : '') + '" title="Ausgabe (Alt+A)">−</button>' +
      '<button type="button" data-type="income" class="' + (q.type === 'income' ? 'on pos' : '') + '" title="Einnahme (Alt+E)">+</button>' +
      '<button type="button" data-type="transfer" class="' + (isTr ? 'on' : '') + '" title="Umbuchung (Alt+U)">⇄</button></span></label>' +
      '<label>Betrag<input type="text" name="amount" class="amount" placeholder="0,00" inputmode="decimal" required></label>' +
      (isTr
        ? '<label>Nach Konto<select name="counterAccountId">' + App.accountOptions(q.counterAccountId || '', { empty: '– Zielkonto –' }) + '</select></label><label>Bezeichnung<input type="text" name="payee" placeholder="z. B. Sparrate"></label>'
        : '<label>Empfänger / Zahler<input type="text" name="payee" list="dl-payees" placeholder="z. B. REWE"></label><label>Kategorie<select name="categoryId">' + App.categoryOptions('', { type: q.type }) + '</select></label>') +
      '<label title="Wörter mit # werden als Tag gespeichert, z. B. #urlaub">Notiz / #Tag<input type="text" name="note" placeholder="optional, z. B. #urlaub"></label>' +
      '<button class="btn primary" type="submit" title="Enter">Buchen</button>' +
      '</form>' + App.payeeDatalist('dl-payees') + '</div>';

    // Liste
    html += '<div class="card"><div class="filters">' +
      '<select data-f="account"><option value="">Alle Konten</option>' + App.accountOptions(f.account, { groups: true, includeArchived: true }) + '</select>' +
      '<select data-f="period">' + App.PERIODS.map(function (p) { return '<option value="' + p[0] + '"' + (f.period === p[0] ? ' selected' : '') + '>' + p[1] + '</option>'; }).join('') + '</select>' +
      (f.period === 'custom' ? '<input type="date" data-f="from" value="' + esc(f.from) + '"><span class="muted">bis</span><input type="date" data-f="to" value="' + esc(f.to) + '">' : '') +
      '<select data-f="cat">' + App.categoryOptions(f.cat, { empty: 'Alle Kategorien', none: true }) + '</select>' +
      '<select data-f="type"><option value="">Alle Arten</option>' + [['expense', 'Ausgaben'], ['income', 'Einnahmen'], ['transfer', 'Umbuchungen'], ['trade', 'Wertpapier']].map(function (o) { return '<option value="' + o[0] + '"' + (f.type === o[0] ? ' selected' : '') + '>' + o[1] + '</option>'; }).join('') + '</select>' +
      '<input type="search" data-f="q" placeholder="Suchen … (Text oder Betrag)  /" value="' + esc(f.q) + '" style="min-width:200px">' +
      '<input type="text" data-f="tag" placeholder="Tag" value="' + esc(f.tag) + '" style="width:90px">' +
      ((f.account || f.cat || f.type || f.q || f.tag || f.period !== 'thisMonth') ? '<button class="btn small ghost" data-act="reset">Filter zurücksetzen</button>' : '') +
      '</div>';
    html += '<div class="summary-line"><span><b>' + rows.length + '</b> Buchungen</span><span>Eingänge <b class="pos">' + esc(C.formatMoney(sumIn)) + '</b></span><span>Ausgänge <b class="neg">' + esc(C.formatMoney(sumOut)) + '</b></span><span>Saldo <b>' + esc(C.formatMoney(sumIn + sumOut, { sign: true })) + '</b></span>' +
      (res.range[0] > '0000' && res.range[1] < '9999' ? '<span>' + C.formatDate(res.range[0]) + ' – ' + C.formatDate(res.range[1]) + '</span>' : '') + '</div>';

    var selIds = Object.keys(App.ui.txSel).filter(function (id) { return App.ui.txSel[id]; });
    if (selIds.length) {
      html += '<div class="bulk"><b>' + selIds.length + ' ausgewählt</b><select id="bulk-cat">' + App.categoryOptions('', { empty: 'Kategorie setzen …' }) + '</select>' +
        '<button class="btn small" data-act="bulk-cat">Übernehmen</button><button class="btn small danger" data-act="bulk-del">Löschen</button><button class="btn small ghost" data-act="bulk-clear">Auswahl aufheben</button></div>';
    }

    if (!rows.length) {
      html += '<div class="empty">Keine Buchungen im gewählten Zeitraum/Filter.</div>';
    } else {
      var arrow = function (k) { return f.sort === k ? (f.dir < 0 ? ' ↓' : ' ↑') : ''; };
      html += '<div class="tbl-wrap"><table class="tbl"><thead><tr><th class="cb"><input type="checkbox" data-act="sel-all"' + (selIds.length && selIds.length >= Math.min(rows.length, f.limit) ? ' checked' : '') + '></th>' +
        '<th class="sortable" data-sort="date">Datum' + arrow('date') + '</th>' + (singleAcc ? '' : '<th>Konto</th>') +
        '<th class="sortable" data-sort="payee">Empfänger / Beschreibung' + arrow('payee') + '</th><th>Kategorie</th><th class="num sortable" data-sort="amount">Betrag' + arrow('amount') + '</th>' +
        (showBal ? '<th class="num">Saldo</th>' : '') + '</tr></thead><tbody>';
      var t0 = today();
      rows.slice(0, f.limit).forEach(function (r) {
        var t = r.t;
        var amt = displayAmount(t, res.accSet);
        var isT = !!t.counterAccountId;
        var desc = esc(t.payee || '');
        if (isT) {
          var other = res.accSet && res.accSet[t.counterAccountId] && !res.accSet[t.accountId] ? '← ' + accName(t.accountId) : '→ ' + accName(t.counterAccountId);
          desc = (desc ? desc + ' ' : '') + '<span class="muted">' + esc(other) + '</span>';
        }
        if (t.note) desc += '<div class="small ellipsis">' + esc(t.note) + '</div>';
        var tags = (t.tags || []).map(function (x) { return '<span class="tag">#' + esc(x) + '</span>'; }).join('');
        var icons = (t.recurringId ? '<span class="icon-rec" title="aus wiederkehrender Buchung">↻</span>' : '') + (t.tradeId ? '<span class="icon-rec" title="Wertpapier-Buchung">◆</span>' : '');
        html += '<tr class="click' + (App.ui.txSel[t.id] ? ' sel' : '') + (t.date > t0 ? ' planned' : '') + '" data-id="' + t.id + '"><td class="cb"><input type="checkbox" data-sel="' + t.id + '"' + (App.ui.txSel[t.id] ? ' checked' : '') + '></td>' +
          '<td class="nowrap">' + C.formatDate(t.date) + '</td>' +
          (singleAcc ? '' : '<td class="nowrap">' + esc(isT ? accName(t.accountId) : accName(t.accountId)) + '</td>') +
          '<td>' + desc + tags + icons + '</td>' +
          '<td>' + (isT ? '<span class="badge">Umbuchung</span>' : (t.tradeId && t.tradeType !== 'dividend' ? '<span class="badge">Wertpapier</span>' : (t.excludeFromReports ? '<span class="badge" title="zählt nicht in Auswertungen">Korrektur</span>' : catLabel(t.categoryId)))) + '</td>' +
          '<td class="num bold">' + (amt == null ? '<span class="muted">' + esc(C.formatMoney(Math.abs(t.amount))) + '</span>' : money(amt, { color: true })) + '</td>' +
          (showBal ? '<td class="num">' + money(balMap[t.id]) + '</td>' : '') + '</tr>';
      });
      html += '</tbody></table></div>';
      if (rows.length > f.limit) html += '<div class="empty"><button class="btn" data-act="more">Weitere ' + Math.min(500, rows.length - f.limit) + ' laden (' + (rows.length - f.limit) + ' ausgeblendet)</button></div>';
    }
    html += '</div>';
    el.innerHTML = html;
    bindTransactions(el);
  };

  /** Betrag aus Sicht der gefilterten Konten; null = neutrale Umbuchung (beide Seiten im Filter bzw. kein Filter). */
  function displayAmount(t, accSet) {
    if (!t.counterAccountId) return t.amount;
    if (!accSet) return null;
    var a = !!accSet[t.accountId], b = !!accSet[t.counterAccountId];
    if (a && b) return null;
    return a ? t.amount : -t.amount;
  }

  function bindTransactions(el) {
    var f = App.ui.tx, q = App.ui.quick;
    var form = $('#quick', el);
    if (form) {
      var amountIn = form.elements.amount, payeeIn = form.elements.payee, catSel = form.elements.categoryId;
      $$('#q-type button', el).forEach(function (b) {
        b.onclick = function () { setQuickType(b.dataset.type); };
      });
      form.elements.date.onchange = function () { q.date = this.value; };
      form.elements.accountId.onchange = function () { q.accountId = this.value; };
      if (form.elements.counterAccountId) form.elements.counterAccountId.onchange = function () { q.counterAccountId = this.value; };
      amountIn.addEventListener('input', function () {
        var v = amountIn.value.trim();
        if (q.type !== 'transfer' && /^\+/.test(v) && q.type !== 'income') { setQuickType('income', { amount: v.slice(1) }); }
        else if (q.type !== 'transfer' && /^-/.test(v) && q.type !== 'expense') { setQuickType('expense', { amount: v.slice(1) }); }
      });
      if (payeeIn && catSel) payeeIn.addEventListener('change', function () {
        if (catSel.value) return;
        var sug = C.suggestCategory(App.state, payeeIn.value);
        if (sug && $('option[value="' + sug + '"]', catSel)) catSel.value = sug;
      });
      form.onsubmit = function (e) {
        e.preventDefault();
        var amt = C.parseMoney(amountIn.value.replace(/^[+-]/, ''));
        if (isNaN(amt) || amt === 0) { amountIn.classList.add('invalid'); amountIn.focus(); return; }
        amt = Math.abs(amt);
        var date = form.elements.date.value || today();
        var ht = splitHashTags(form.elements.note.value);
        var t = { id: C.uid(), date: date, accountId: form.elements.accountId.value, counterAccountId: null, amount: 0, payee: (payeeIn ? payeeIn.value.trim() : ''), categoryId: null, note: ht.note, tags: ht.tags };
        if (q.type === 'transfer') {
          var to = form.elements.counterAccountId.value;
          if (!to || to === t.accountId) { form.elements.counterAccountId.focus(); App.toast('Bitte ein anderes Zielkonto wählen.', { error: true }); return; }
          t.counterAccountId = to;
          t.amount = -amt;
          if (!t.payee) t.payee = 'Umbuchung';
        } else {
          t.amount = q.type === 'expense' ? -amt : amt;
          t.categoryId = catSel.value || null;
        }
        q.date = date;
        App.commit('Buchung angelegt', function (s) { s.transactions.push(t); });
        App.toast('Gebucht: ' + (t.payee || 'Buchung') + ' ' + C.formatMoney(t.counterAccountId ? amt : t.amount), { undo: true });
        var a = $('#quick input[name=amount]');
        if (a) a.focus();
      };
      function setQuickType(type, keep) {
        q.type = type;
        var vals = { amount: amountIn.value, payee: payeeIn ? payeeIn.value : '', note: form.elements.note.value, date: form.elements.date.value };
        if (keep) Object.assign(vals, keep);
        q.date = vals.date;
        App.render();
        var nf = $('#quick');
        nf.elements.amount.value = vals.amount;
        if (nf.elements.payee) nf.elements.payee.value = vals.payee;
        nf.elements.note.value = vals.note;
        nf.elements.amount.focus();
      }
      App.setQuickType = setQuickType;
    }

    $$('[data-f]', el).forEach(function (inp) {
      var ev = inp.tagName === 'INPUT' && inp.type !== 'date' ? 'input' : 'change';
      var timer;
      inp.addEventListener(ev, function () {
        clearTimeout(timer);
        timer = setTimeout(function () {
          f[inp.dataset.f] = inp.value;
          f.limit = 300;
          App.ui.txSel = {};
          var focusKey = inp.dataset.f, pos = inp.selectionStart;
          App.render();
          var again = $('[data-f="' + focusKey + '"]');
          if (again && ev === 'input') { again.focus(); try { again.setSelectionRange(pos, pos); } catch (e) { /* ignore */ } }
        }, ev === 'input' ? 250 : 0);
      });
    });

    el.onclick = function (e) {
      var sel = e.target.closest('[data-sel]');
      if (sel) { App.ui.txSel[sel.dataset.sel] = sel.checked; e.stopPropagation(); App.render(); return; }
      var th = e.target.closest('[data-sort]');
      if (th) {
        if (f.sort === th.dataset.sort) f.dir = -f.dir; else { f.sort = th.dataset.sort; f.dir = th.dataset.sort === 'payee' ? 1 : -1; }
        App.render();
        return;
      }
      var a = e.target.closest('[data-act]');
      if (a) {
        var act = a.dataset.act;
        if (act === 'sel-all') {
          var rows = filteredTransactions().rows.slice(0, f.limit);
          App.ui.txSel = {};
          if (a.checked) rows.forEach(function (r) { App.ui.txSel[r.t.id] = true; });
          App.render();
        } else if (act === 'bulk-clear') { App.ui.txSel = {}; App.render(); }
        else if (act === 'bulk-cat') {
          var cid = $('#bulk-cat').value;
          if (!cid) return App.toast('Bitte eine Kategorie wählen.');
          var ids = App.ui.txSel;
          App.commit('Kategorie gesetzt', function (s) {
            s.transactions.forEach(function (t) { if (ids[t.id] && !t.counterAccountId && !(t.tradeId && t.tradeType !== 'dividend')) t.categoryId = cid; });
          }, { toast: 'Kategorie gesetzt.' });
          App.ui.txSel = {};
          App.render();
        } else if (act === 'bulk-del') {
          var del = App.ui.txSel;
          var n = Object.keys(del).filter(function (k) { return del[k]; }).length;
          App.confirm(n + ' Buchungen löschen? (Wertpapier-Buchungen werden mit dem zugehörigen Depot-Eintrag gelöscht.)', function () {
            App.commit(n + ' Buchungen gelöscht', function (s) {
              s.transactions.filter(function (t) { return del[t.id] && t.tradeId; }).forEach(function (t) { C.deleteTrade(s, t.tradeId); });
              s.transactions = s.transactions.filter(function (t) { return !del[t.id]; });
            }, { toast: n + ' Buchungen gelöscht.' });
            App.ui.txSel = {};
            App.render();
          }, 'Löschen');
        } else if (act === 'more') { f.limit += 500; App.render(); }
        else if (act === 'reset') { Object.assign(f, { account: '', period: 'thisMonth', from: '', to: '', cat: '', type: '', q: '', tag: '' }); App.render(); }
        else if (act === 'export') exportCSV();
        else if (act === 'reconcile') App.reconcile(f.account);
        else if (act === 'edit-acc') App.editAccount(acc(f.account));
        return;
      }
      var tr = e.target.closest('tr[data-id]');
      if (tr) App.editTransaction(C.findById(App.state.transactions, tr.dataset.id));
    };
  }

  function exportCSV() {
    var s = App.state;
    var rows = [['Datum', 'Konto', 'Gegenkonto', 'Betrag', 'Empfänger', 'Hauptkategorie', 'Kategorie', 'Notiz', 'Tags', 'Art']];
    filteredTransactions().rows.forEach(function (r) {
      var t = r.t;
      var c = cat(t.categoryId);
      var main = c && c.parentId ? cat(c.parentId) : c;
      rows.push([C.formatDate(t.date), accName(t.accountId), t.counterAccountId ? accName(t.counterAccountId) : '', C.formatAmountInput(t.amount),
        t.payee || '', main ? main.name : '', c && c.parentId ? c.name : '', t.note || '', (t.tags || []).join(', '), { expense: 'Ausgabe', income: 'Einnahme', transfer: 'Umbuchung', trade: 'Wertpapier' }[C.txType(t)]]);
    });
    App.download('buchungen-' + today() + '.csv', '﻿' + C.toCSV(rows, ';'), 'text/csv;charset=utf-8');
  }

  App.download = function (name, content, type) {
    var blob = new Blob([content], { type: type || 'application/octet-stream' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url; a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 2000);
  };

  // ---------------------------------------------------------------- Buchung bearbeiten
  App.editTransaction = function (t, preset) {
    var s = App.state;
    if (t && t.tradeId) {
      var tr = C.findById(s.trades, t.tradeId);
      if (tr) return App.editTrade(tr);
    }
    var isNew = !t;
    preset = preset || {};
    var type = t ? (t.counterAccountId ? 'transfer' : (t.amount < 0 ? 'expense' : 'income')) : (preset.type || 'expense');
    var d = t ? Object.assign({}, t) : {
      date: today(), accountId: preset.accountId || App.ui.quick.accountId || (C.sortedAccounts(s, false)[0] || {}).id,
      counterAccountId: preset.counterAccountId || null, amount: 0, payee: preset.payee || '', categoryId: null, note: '', tags: []
    };
    function body() {
      var tr = type === 'transfer';
      return '<div class="mb"><span class="seg" id="m-type">' +
        '<button type="button" data-type="expense" class="' + (type === 'expense' ? 'on neg' : '') + '">Ausgabe</button>' +
        '<button type="button" data-type="income" class="' + (type === 'income' ? 'on pos' : '') + '">Einnahme</button>' +
        '<button type="button" data-type="transfer" class="' + (tr ? 'on' : '') + '">Umbuchung</button></span></div>' +
        '<div class="form-grid">' +
        '<label>Datum</label><input type="date" name="date" value="' + esc(d.date) + '" required>' +
        '<label>' + (tr ? 'Von Konto' : 'Konto') + '</label><select name="accountId">' + App.accountOptions(d.accountId) + '</select>' +
        (tr ? '<label>Nach Konto</label><select name="counterAccountId">' + App.accountOptions(d.counterAccountId, { empty: '– Zielkonto –' }) + '</select>' : '') +
        '<label>Betrag (€)</label><input type="text" name="amount" class="amount" value="' + (d.amount ? esc(C.formatAmountInput(Math.abs(d.amount))) : '') + '" placeholder="0,00" autofocus required>' +
        '<label>' + (tr ? 'Bezeichnung' : 'Empfänger / Zahler') + '</label><input type="text" name="payee" list="dl-payees-m" value="' + esc(d.payee) + '">' +
        (tr ? '' : '<label>Kategorie</label><select name="categoryId">' + App.categoryOptions(d.categoryId, { type: type }) + '</select>') +
        '<label>Notiz</label><input type="text" name="note" value="' + esc(d.note) + '">' +
        '<label>Tags</label><input type="text" name="tags" value="' + esc((d.tags || []).join(', ')) + '" placeholder="z. B. Urlaub, Steuer">' +
        (d.recurringId ? '<span></span><div class="help">↻ Entstanden aus „' + esc((C.findById(s.recurring, d.recurringId) || { name: 'gelöschte Regel' }).name) + '“.</div>' : '') +
        '</div>' + App.payeeDatalist('dl-payees-m');
    }
    function readForm(form) {
      d.date = form.elements.date.value;
      d.accountId = form.elements.accountId.value;
      d.counterAccountId = form.elements.counterAccountId ? form.elements.counterAccountId.value : null;
      d.payee = form.elements.payee.value.trim();
      d.categoryId = form.elements.categoryId ? (form.elements.categoryId.value || null) : null;
      d.note = form.elements.note.value.trim();
      d.tags = parseTags(form.elements.tags.value);
      var amt = C.parseMoney(form.elements.amount.value);
      d._amt = isNaN(amt) ? NaN : Math.abs(amt);
    }
    function open() {
      var form = App.modal({
        title: isNew ? 'Neue Buchung' : 'Buchung bearbeiten',
        body: body(),
        onSubmit: function (form) {
          readForm(form);
          if (!d.date) { App.toast('Bitte ein Datum angeben.', { error: true }); return false; }
          if (isNaN(d._amt) || !d._amt) { form.elements.amount.classList.add('invalid'); form.elements.amount.focus(); return false; }
          if (type === 'transfer' && (!d.counterAccountId || d.counterAccountId === d.accountId)) { App.toast('Bitte ein anderes Zielkonto wählen.', { error: true }); return false; }
          var rec = {
            id: d.id || C.uid(), date: d.date, accountId: d.accountId,
            counterAccountId: type === 'transfer' ? d.counterAccountId : null,
            amount: type === 'income' ? d._amt : -d._amt,
            payee: d.payee || (type === 'transfer' ? 'Umbuchung' : ''), categoryId: type === 'transfer' ? null : d.categoryId,
            note: d.note, tags: d.tags
          };
          if (d.recurringId) rec.recurringId = d.recurringId;
          if (d.excludeFromReports && !rec.categoryId && type !== 'transfer') rec.excludeFromReports = true;
          if (d.loanPart) rec.loanPart = d.loanPart;
          App.commit(isNew ? 'Buchung angelegt' : 'Buchung geändert', function (st) {
            var i = st.transactions.findIndex(function (x) { return x.id === rec.id; });
            if (i >= 0) st.transactions[i] = rec; else st.transactions.push(rec);
          }, { toast: isNew ? 'Buchung angelegt.' : 'Gespeichert.' });
        },
        extraButtons: (isNew ? [] : [
          { label: 'Löschen', cls: 'danger', onClick: function () {
            App.closeModal();
            App.commit('Buchung gelöscht', function (st) { st.transactions = st.transactions.filter(function (x) { return x.id !== t.id; }); }, { toast: 'Buchung gelöscht.' });
          } },
          { label: 'Duplizieren', onClick: function (form) { readForm(form); var copy = Object.assign({}, d, { id: null, date: today(), recurringId: null }); copy.amount = type === 'income' ? d._amt : -d._amt; App.closeModal(); App.editTransaction(null, { type: type }); prefill(copy); } }
        ]).concat([{ label: '↻ Als Dauerauftrag', onClick: function (form) {
          readForm(form);
          App.closeModal();
          App.editRule(null, {
            name: d.payee || '', accountId: d.accountId, counterAccountId: type === 'transfer' ? d.counterAccountId : null,
            amount: isNaN(d._amt) ? 0 : (type === 'income' ? d._amt : -d._amt), payee: d.payee, categoryId: d.categoryId,
            note: d.note, startDate: C.addMonths(d.date || today(), 1)
          });
        } }])
      });
      $$('#m-type button', form).forEach(function (b) {
        b.onclick = function () {
          readForm(form);
          type = b.dataset.type;
          d.amount = isNaN(d._amt) ? 0 : d._amt;
          if (type === 'transfer') d.categoryId = null;
          else if (d.categoryId && cat(d.categoryId) && cat(d.categoryId).type !== type) d.categoryId = null;
          open();
        };
      });
      var payeeIn = form.elements.payee, catSel = form.elements.categoryId;
      if (catSel) payeeIn.addEventListener('change', function () {
        if (catSel.value) return;
        var sug = C.suggestCategory(App.state, payeeIn.value);
        if (sug && $('option[value="' + sug + '"]', catSel)) catSel.value = sug;
      });
      return form;
    }
    function prefill(copy) {
      var form = $('#modal-root form');
      if (!form) return;
      form.elements.accountId.value = copy.accountId;
      if (form.elements.counterAccountId) form.elements.counterAccountId.value = copy.counterAccountId || '';
      form.elements.amount.value = C.formatAmountInput(Math.abs(copy.amount));
      form.elements.payee.value = copy.payee || '';
      if (form.elements.categoryId) form.elements.categoryId.value = copy.categoryId || '';
      form.elements.note.value = copy.note || '';
      form.elements.tags.value = (copy.tags || []).join(', ');
    }
    open();
  };

  // ================================================================ KONTEN
  App.views.konten = function (el) {
    var s = App.state;
    var t = today();
    var bal = C.allBalances(s, t);
    var list = C.sortedAccounts(s, App.ui.showArchived);
    var archivedCount = s.accounts.filter(function (a) { return a.archived; }).length;
    var html = '<div class="page-head"><div><h1>Konten</h1><div class="sub">Gruppen fassen Konten zusammen, z. B. Privat, Business, Rücklagen, Geldanlage.</div></div>' +
      '<div class="actions">' + (archivedCount ? '<label class="chk"><input type="checkbox" data-act="archived"' + (App.ui.showArchived ? ' checked' : '') + '> Archivierte zeigen (' + archivedCount + ')</label>' : '') +
      '<button class="btn primary" data-act="new">+ Konto</button></div></div>';
    if (!list.length) {
      html += '<div class="card"><div class="empty"><h3>Noch keine Konten</h3><p>Lege jedes Konto mit seinem aktuellen Stand an. Depots legst du als Kontotyp „Depot“ an.</p><button class="btn primary" data-act="new">Konto anlegen</button></div></div>';
      el.innerHTML = html;
    } else {
      html += '<div class="card"><div class="card-body flush"><table class="tbl"><thead><tr><th>Konto</th><th>Typ</th><th>Gruppe</th><th class="num">Buchungen</th><th class="num">Kontostand</th><th></th></tr></thead><tbody>';
      var counts = {};
      s.transactions.forEach(function (tx) {
        counts[tx.accountId] = (counts[tx.accountId] || 0) + 1;
        if (tx.counterAccountId) counts[tx.counterAccountId] = (counts[tx.counterAccountId] || 0) + 1;
      });
      var lastGroup = null;
      list.forEach(function (a) {
        var g = a.group || 'Ohne Gruppe';
        if (g !== lastGroup) {
          var sum = 0;
          list.forEach(function (x) { if ((x.group || 'Ohne Gruppe') === g && !x.excludeFromNetWorth && !x.archived) sum += bal[x.id]; });
          html += '<tr class="group-row"><td colspan="4">' + esc(g) + '</td><td class="num">' + money(sum) + '</td><td></td></tr>';
          lastGroup = g;
        }
        html += '<tr class="' + (a.archived ? 'muted' : '') + '"><td class="sub"><a href="#buchungen" data-open="' + a.id + '">' + esc(a.name) + '</a>' + (a.excludeFromNetWorth ? ' <span class="badge" title="Nicht im Nettovermögen">ausgenommen</span>' : '') + (a.archived ? ' <span class="badge">archiviert</span>' : '') + (a.note ? '<div class="small">' + esc(a.note) + '</div>' : '') + '</td>' +
          '<td>' + esc(C.ACCOUNT_TYPES[a.type] || a.type) + '</td><td>' + esc(a.group || '') + '</td><td class="num">' + (counts[a.id] || 0) + '</td><td class="num bold">' + money(bal[a.id]) + '</td>' +
          '<td class="num nowrap"><button class="btn small ghost" data-act="up" data-id="' + a.id + '" title="nach oben">↑</button><button class="btn small ghost" data-act="down" data-id="' + a.id + '" title="nach unten">↓</button>' +
          (a.type !== 'depot' ? '<button class="btn small" data-act="reconcile" data-id="' + a.id + '">Abgleichen</button>' : '<a class="btn small" href="#depots">Depot</a>') +
          '<button class="btn small" data-act="edit" data-id="' + a.id + '">Bearbeiten</button></td></tr>';
      });
      html += '<tr class="sum-row"><td colspan="4">Nettovermögen</td><td class="num">' + money(C.netWorth(s, t, bal)) + '</td><td></td></tr>';
      html += '</tbody></table></div></div>';
      html += '<div class="help mt"><p><b>Abgleichen:</b> Du gibst den echten Kontostand laut Bank ein. Hast du <b>alte Buchungen nachgetragen</b>, wähle „Anfangsbestand anpassen“ – dann stimmt der Stand heute und der Verlauf davor. Fehlt nur zwischendurch etwas, wähle „Korrekturbuchung“.</p></div>';
      el.innerHTML = html;
    }
    el.onclick = function (e) {
      var o = e.target.closest('[data-open]');
      if (o) { e.preventDefault(); return App.go('buchungen', { tx: { account: o.dataset.open } }); }
      var a = e.target.closest('[data-act]');
      if (!a) return;
      var act = a.dataset.act;
      if (act === 'new') App.editAccount(null);
      else if (act === 'archived') { App.ui.showArchived = a.checked; App.render(); }
      else if (act === 'edit') App.editAccount(acc(a.dataset.id));
      else if (act === 'reconcile') App.reconcile(a.dataset.id);
      else if (act === 'up' || act === 'down') moveAccount(a.dataset.id, act === 'up' ? -1 : 1);
    };
  };

  function moveAccount(id, dir) {
    App.commit('Reihenfolge geändert', function (s) {
      var a = C.findById(s.accounts, id);
      var same = C.sortedAccounts(s, true).filter(function (x) { return (x.group || '') === (a.group || ''); });
      same.forEach(function (x, i) { x.order = i; });
      var i = same.indexOf(a), j = i + dir;
      if (j < 0 || j >= same.length) return;
      same[i].order = j; same[j].order = i;
    });
  }

  App.editAccount = function (a, preset) {
    var s = App.state;
    var isNew = !a;
    var d = a ? Object.assign({}, a) : Object.assign({ name: '', type: 'giro', group: '', opening: 0, note: '', iban: '', archived: false, excludeFromNetWorth: false }, preset || {});
    var groups = C.accountGroups(s).filter(Boolean);
    ['Privat', 'Business', 'Rücklagen', 'Geldanlage'].forEach(function (g) { if (groups.indexOf(g) < 0) groups.push(g); });
    var bal = isNew ? 0 : C.accountBalance(s, a.id, today());
    var body = '<div class="form-grid">' +
      '<label>Name</label><input type="text" name="name" value="' + esc(d.name) + '" required placeholder="z. B. Girokonto Sparkasse" autofocus>' +
      '<label>Typ</label><select name="type">' + Object.keys(C.ACCOUNT_TYPES).map(function (k) { return '<option value="' + k + '"' + (d.type === k ? ' selected' : '') + '>' + C.ACCOUNT_TYPES[k] + '</option>'; }).join('') + '</select>' +
      '<label>Gruppe</label><input type="text" name="group" list="dl-groups" value="' + esc(d.group) + '" placeholder="z. B. Privat">' +
      '<datalist id="dl-groups">' + groups.map(function (g) { return '<option value="' + esc(g) + '">'; }).join('') + '</datalist>' +
      (isNew
        ? '<label>Aktueller Kontostand</label><input type="text" name="balance" class="amount" value="" placeholder="0,00"><div class="hint">Stand heute laut Bank. Depots: nur ein evtl. Bargeldbestand – Wertpapiere erfasst du im Bereich Depots.</div>'
        : '<label>Anfangsbestand</label><input type="text" name="opening" class="amount" value="' + esc(C.formatAmountInput(d.opening || 0)) + '"><div class="hint">Stand vor der ersten erfassten Buchung. Aktuell: ' + esc(C.formatMoney(bal)) + '. Zum Korrigieren besser „Abgleichen“ nutzen.</div>') +
      '<label>IBAN / Nr.</label><input type="text" name="iban" value="' + esc(d.iban || '') + '" placeholder="optional">' +
      '<label>Notiz</label><input type="text" name="note" value="' + esc(d.note || '') + '" placeholder="optional">' +
      '<span></span><label class="chk"><input type="checkbox" name="excludeFromNetWorth"' + (d.excludeFromNetWorth ? ' checked' : '') + '> Nicht ins Nettovermögen einrechnen</label>' +
      (isNew ? '' : '<span></span><label class="chk"><input type="checkbox" name="archived"' + (d.archived ? ' checked' : '') + '> Archiviert (aufgelöstes Konto, Buchungen bleiben erhalten)</label>') +
      '</div>';
    var used = !isNew && (s.transactions.some(function (t) { return t.accountId === a.id || t.counterAccountId === a.id; }) || s.trades.some(function (t) { return t.depotId === a.id; }) || s.recurring.some(function (r) { return r.accountId === a.id || r.counterAccountId === a.id || r.depotId === a.id; }));
    App.modal({
      title: isNew ? 'Neues Konto' : 'Konto bearbeiten',
      body: body,
      onSubmit: function (form) {
        var name = form.elements.name.value.trim();
        if (!name) { form.elements.name.focus(); return false; }
        var rec = Object.assign({}, d, {
          name: name, type: form.elements.type.value, group: form.elements.group.value.trim(),
          iban: form.elements.iban.value.trim(), note: form.elements.note.value.trim(),
          excludeFromNetWorth: form.elements.excludeFromNetWorth.checked
        });
        if (isNew) {
          var b = C.parseMoney(form.elements.balance.value || '0');
          rec.id = C.uid();
          rec.opening = isNaN(b) ? 0 : b;
          rec.order = s.accounts.length;
          rec.archived = false;
        } else {
          var o = C.parseMoney(form.elements.opening.value || '0');
          rec.opening = isNaN(o) ? d.opening : o;
          rec.archived = form.elements.archived.checked;
        }
        App.commit(isNew ? 'Konto angelegt' : 'Konto geändert', function (st) {
          var i = st.accounts.findIndex(function (x) { return x.id === rec.id; });
          if (i >= 0) st.accounts[i] = rec; else st.accounts.push(rec);
          if (st.meta.demo && isNew) { /* eigenes Konto zu Demo-Daten */ }
        }, { toast: isNew ? 'Konto „' + rec.name + '“ angelegt.' : 'Gespeichert.' });
      },
      extraButtons: isNew ? [] : [{
        label: used ? 'Löschen (nicht möglich)' : 'Löschen', cls: 'danger', onClick: function () {
          if (used) { App.toast('Das Konto hat Buchungen, Depot-Einträge oder Daueraufträge – bitte archivieren statt löschen.', { error: true }); return; }
          App.closeModal();
          App.commit('Konto gelöscht', function (st) { st.accounts = st.accounts.filter(function (x) { return x.id !== a.id; }); }, { toast: 'Konto gelöscht.' });
        }
      }]
    });
  };

  App.reconcile = function (accountId) {
    var a = acc(accountId);
    if (!a) return;
    var cur = C.cashBalance(App.state, a.id, today());
    var isDepot = a.type === 'depot';
    var form = App.modal({
      title: 'Saldo abgleichen – ' + a.name,
      body: '<div class="form-grid"><label>Stand laut App</label><div class="bold" id="rec-app">' + esc(C.formatMoney(cur)) + (isDepot ? ' <span class="muted">(Bargeld, ohne Wertpapiere)</span>' : '') + '</div>' +
        '<label>Datum</label><input type="date" name="date" value="' + today() + '">' +
        '<label>Echter Stand</label><input type="text" name="real" class="amount" placeholder="laut Kontoauszug / Banking-App" autofocus>' +
        '<label>Differenz</label><div class="bold" id="rec-diff">–</div>' +
        '<label>Ausgleichen durch</label><div>' +
        '<label class="chk"><input type="radio" name="mode" value="opening"> <span><b>Anfangsbestand anpassen</b><br><span class="help">Richtig, wenn du alte Buchungen nachgetragen hast. Der ganze Verlauf verschiebt sich, es entsteht keine zusätzliche Buchung.</span></span></label>' +
        '<label class="chk mt"><input type="radio" name="mode" value="booking" checked> <span><b>Korrekturbuchung am Datum</b><br><span class="help">Richtig, wenn zwischendurch etwas nicht erfasst wurde. Zählt nicht in Auswertungen.</span></span></label>' +
        '</div></div>',
      submitLabel: 'Abgleichen',
      onSubmit: function (form) {
        var real = C.parseMoney(form.elements.real.value);
        if (isNaN(real)) { form.elements.real.classList.add('invalid'); return false; }
        var date = form.elements.date.value || today();
        var mode = form.elements.mode.value;
        var diff = 0;
        App.commit('Saldo abgeglichen', function (st) { diff = C.reconcileAccount(st, a.id, date, real, mode); });
        if (!diff) App.toast('Passt bereits – keine Korrektur nötig.');
        else App.toast(mode === 'opening' ? 'Anfangsbestand um ' + C.formatMoney(diff, { sign: true }) + ' angepasst.' : 'Korrektur ' + C.formatMoney(diff, { sign: true }) + ' gebucht.', { undo: true });
      }
    });
    // Differenz live anzeigen
    function upd() {
      var date = form.elements.date.value || today();
      var atDate = C.cashBalance(App.state, a.id, date);
      $('#rec-app', form).innerHTML = esc(C.formatMoney(atDate)) + (date !== today() ? ' <span class="muted">(am ' + C.formatDate(date) + ')</span>' : '');
      var real = C.parseMoney(form.elements.real.value);
      $('#rec-diff', form).textContent = isNaN(real) ? '–' : C.formatMoney(real - atDate, { sign: true });
    }
    form.addEventListener('input', upd);
    form.addEventListener('change', upd);
    $$('label.chk', form).forEach(function (l) { l.style.alignItems = 'flex-start'; });
  };

  // ================================================================ Tastatur & Start
  document.addEventListener('keydown', function (e) {
    var tag = (e.target.tagName || '').toLowerCase();
    var typing = tag === 'input' || tag === 'select' || tag === 'textarea';
    var modalOpen = !!$('#modal-root .modal');
    if (e.key === 'Escape' && modalOpen) { App.closeModal(); return; }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !typing && !modalOpen) { e.preventDefault(); App.undo(); return; }
    if (e.altKey && !e.ctrlKey && App.view === 'buchungen' && App.setQuickType && $('#quick')) {
      var k = e.key.toLowerCase();
      var map = { a: 'expense', e: 'income', u: 'transfer' };
      if (map[k]) { e.preventDefault(); App.setQuickType(map[k]); return; }
    }
    if (typing || modalOpen || e.ctrlKey || e.metaKey || e.altKey) return;
    if (/^[1-9]$/.test(e.key)) {
      var links = $$('#nav a');
      var l = links[+e.key - 1];
      if (l) { e.preventDefault(); location.hash = l.dataset.view; }
    } else if (e.key === 'n' || e.key === 'N') {
      e.preventDefault();
      if (App.view === 'buchungen' && $('#quick')) $('#quick input[name=amount]').focus();
      else App.editTransaction(null);
    } else if (e.key === '/') {
      var sIn = $('[data-f="q"]');
      if (sIn) { e.preventDefault(); sIn.focus(); }
    }
  });

  window.addEventListener('hashchange', function () { App.render(); });
  window.addEventListener('focus', function () {
    // Nach längerer Pause (z. B. über Nacht) fällige Daueraufträge nachziehen
    if (!App.state) return;
    var before = App.state.transactions.length + App.state.trades.length;
    C.processRecurring(App.state, today());
    if (App.state.transactions.length + App.state.trades.length !== before) { App.persist(); App.render(); }
  });

  App.applyTheme = function () {
    var th = App.state && App.state.settings.theme;
    if (th === 'light' || th === 'dark') document.documentElement.setAttribute('data-theme', th);
    else document.documentElement.removeAttribute('data-theme');
  };

  App.start = function () {
    readSettingsUI();
    Store.load().then(function (st) {
      try { App.state = st ? C.normalizeState(st) : C.emptyState(); }
      catch (e) { App.state = C.emptyState(); App.toast('Gespeicherte Daten konnten nicht gelesen werden.', { error: true }); }
      if (!st) App.persist();
      App.applyTheme();
      runRecurring();
      App.render();
    });
  };

  document.addEventListener('DOMContentLoaded', function () {
    // views.js registriert weitere Ansichten; Start erst, wenn alles geladen ist
    App.start();
  });
})();
