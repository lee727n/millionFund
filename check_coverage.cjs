const c = require('./coverage/coverage-summary.json');
const files = Object.entries(c).filter(([f]) => f !== 'total');
files.sort((a, b) => (a[1].lines.pct || 0) - (b[1].lines.pct || 0));
for (const [f, d] of files) {
  const lines = d.lines || {};
  const pct = lines.pct || 0;
  const total = lines.total || 0;
  const covered = lines.covered || 0;
  const name = f.includes('millionFund') ? f.slice(f.indexOf('millionFund') + 'millionFund'.length + 1) : f;
  console.log(pct.toFixed(1) + '% (' + covered + '/' + total + ') ' + name);
}
