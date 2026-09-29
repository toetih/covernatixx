/*
 * Finanzen – Speicherung.
 *  1. Immer: IndexedDB im Browser (automatisch, sofort).
 *  2. Optional: eine JSON-Datei auf dem Rechner (File System Access API, Chrome/Edge).
 *     Die Datei ist dann die „Quelle der Wahrheit“ – z. B. im Dropbox/OneDrive-Ordner
 *     für Backup und Nutzung auf mehreren Rechnern.
 */
(function (root) {
  'use strict';

  var DB_NAME = 'finanzen';
  var STORE = 'kv';
  var dbPromise = null;

  function db() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise(function (resolve, reject) {
      if (!root.indexedDB) return reject(new Error('IndexedDB nicht verfügbar'));
      var req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = function () { req.result.createObjectStore(STORE); };
      req.onsuccess = function () { resolve(req.result); };
      req.onerror = function () { reject(req.error); };
    });
    return dbPromise;
  }

  function idbGet(key) {
    return db().then(function (d) {
      return new Promise(function (resolve, reject) {
        var r = d.transaction(STORE, 'readonly').objectStore(STORE).get(key);
        r.onsuccess = function () { resolve(r.result); };
        r.onerror = function () { reject(r.error); };
      });
    });
  }

  function idbSet(key, val) {
    return db().then(function (d) {
      return new Promise(function (resolve, reject) {
        var tx = d.transaction(STORE, 'readwrite');
        tx.objectStore(STORE).put(val, key);
        tx.oncomplete = function () { resolve(); };
        tx.onerror = function () { reject(tx.error); };
      });
    });
  }

  function idbDel(key) {
    return db().then(function (d) {
      return new Promise(function (resolve, reject) {
        var tx = d.transaction(STORE, 'readwrite');
        tx.objectStore(STORE).delete(key);
        tx.oncomplete = function () { resolve(); };
        tx.onerror = function () { reject(tx.error); };
      });
    });
  }

  var fileSupported = typeof root.showSaveFilePicker === 'function' && typeof root.showOpenFilePicker === 'function';
  var FILE_TYPES = [{ description: 'Finanzen-Datei (JSON)', accept: { 'application/json': ['.json'] } }];

  var Store = {
    fileSupported: fileSupported,
    handle: null,          // FileSystemFileHandle
    fileStatus: 'none',    // none | connected | needs-permission | error
    lastFileSave: null,
    lastError: null,
    storageOk: true,       // false = Browser erlaubt keine Speicherung (Daten nur bis zum Schließen)
    onStatus: function () {},

    /** Lädt den Browser-Stand; stellt ggf. die Datei-Verbindung wieder her (ohne Rechteabfrage). */
    load: function () {
      var self = this;
      var fallback = null;
      try { fallback = root.localStorage && localStorage.getItem('finanzen-state'); } catch (e) { /* ignore */ }
      self.storageOk = true;
      return idbGet('state').catch(function () {
        // IndexedDB gesperrt (z. B. eingebettete Vorschau) – geht wenigstens localStorage?
        try { localStorage.setItem('finanzen-probe', '1'); localStorage.removeItem('finanzen-probe'); }
        catch (e) { self.storageOk = false; }
        return null;
      }).then(function (state) {
        if (!state && fallback) { try { state = JSON.parse(fallback); } catch (e) { state = null; } }
        if (!fileSupported) return state;
        return idbGet('fileHandle').catch(function () { return null; }).then(function (h) {
          if (!h) return state;
          self.handle = h;
          return h.queryPermission({ mode: 'readwrite' }).then(function (p) {
            self.fileStatus = p === 'granted' ? 'connected' : 'needs-permission';
            self.onStatus();
            return state;
          }).catch(function () { self.fileStatus = 'needs-permission'; return state; });
        });
      });
    },

    /** Speichert im Browser und – falls verbunden – in der Datei. */
    save: function (state) {
      var self = this;
      state.meta.savedAt = new Date().toISOString();
      var json = JSON.stringify(state);
      var p = idbSet('state', JSON.parse(json)).catch(function () {
        try { localStorage.setItem('finanzen-state', json); } catch (e) { self.lastError = e; }
      });
      if (this.handle && this.fileStatus === 'connected') {
        p = p.then(function () { return self.writeFile(json); });
      }
      return p;
    },

    writeFile: function (json) {
      var self = this;
      return this.handle.createWritable().then(function (w) {
        return w.write(json).then(function () { return w.close(); });
      }).then(function () {
        self.lastFileSave = new Date();
        self.lastError = null;
        self.onStatus();
      }).catch(function (e) {
        self.lastError = e;
        self.fileStatus = 'error';
        self.onStatus();
      });
    },

    readFile: function (handle) {
      return (handle || this.handle).getFile().then(function (f) { return f.text(); }).then(function (t) { return JSON.parse(t); });
    },

    /** Neue Datei anlegen und aktuellen Stand hineinschreiben. */
    createFile: function (state) {
      var self = this;
      return root.showSaveFilePicker({ suggestedName: 'finanzen.json', types: FILE_TYPES }).then(function (h) {
        self.handle = h;
        self.fileStatus = 'connected';
        // Verknüpfung merken (für den nächsten Start); Speichern darf daran nicht scheitern
        return idbSet('fileHandle', h).catch(function () {}).then(function () { return self.save(state); });
      });
    },

    /** Vorhandene Datei öffnen; gibt deren Inhalt zurück. */
    openFile: function () {
      var self = this;
      return root.showOpenFilePicker({ types: FILE_TYPES, multiple: false }).then(function (hs) {
        var h = hs[0];
        return h.requestPermission({ mode: 'readwrite' }).then(function (p) {
          if (p !== 'granted') throw new Error('Keine Schreibberechtigung für die Datei.');
          return self.readFile(h).then(function (data) {
            self.handle = h;
            self.fileStatus = 'connected';
            return idbSet('fileHandle', h).catch(function () {}).then(function () { self.onStatus(); return data; });
          });
        });
      });
    },

    /** Nach Neustart: Berechtigung erneut anfragen (muss durch Klick ausgelöst werden). */
    reconnect: function () {
      var self = this;
      if (!this.handle) return Promise.reject(new Error('Keine Datei verbunden.'));
      return this.handle.requestPermission({ mode: 'readwrite' }).then(function (p) {
        if (p !== 'granted') throw new Error('Zugriff verweigert.');
        self.fileStatus = 'connected';
        self.onStatus();
        return self.readFile();
      });
    },

    disconnect: function () {
      this.handle = null;
      this.fileStatus = 'none';
      this.onStatus();
      return idbDel('fileHandle').catch(function () {});
    },

    fileName: function () { return this.handle ? this.handle.name : null; },

    clearAll: function () {
      try { localStorage.removeItem('finanzen-state'); } catch (e) { /* ignore */ }
      return Promise.all([idbDel('state'), idbDel('fileHandle')]).catch(function () {});
    }
  };

  root.FinStore = Store;
})(window);
