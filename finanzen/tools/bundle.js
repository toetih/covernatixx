// Baut eine einzelne, eigenständige Datei: finanzen/Finanzen.html
// Aufruf: node finanzen/tools/bundle.js
const fs = require('fs');
const path = require('path');
const dir = path.join(__dirname, '..');
let html = fs.readFileSync(path.join(dir, 'index.html'), 'utf8');
const read = f => fs.readFileSync(path.join(dir, f), 'utf8');
html = html.replace('<link rel="stylesheet" href="style.css">', () => '<style>\n' + read('style.css') + '\n</style>');
html = html.replace(/<script src="([\w.]+)"><\/script>/g, (_, f) => {
  const js = read(f).replace(/<\/script/gi, '<\\/script');
  return '<script>\n' + js + '\n</script>';
});
fs.writeFileSync(path.join(dir, 'Finanzen.html'), html);
console.log('Finanzen.html geschrieben (' + Math.round(html.length / 1024) + ' KB)');
