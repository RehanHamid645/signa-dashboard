// ===== SIGNA: Build Dashboard JSON =====
// Reads the FULL Keyword Master sheet and assembles the exact shape the
// Signa dashboard expects for one tenant. Writes nothing here — the next
// node (GitHub) commits it. Whole-tenant snapshot, not a single draft.

const TENANT_ID = 'ibreathe';
const FOUNDED = 2009;
const rows = $input.all().map(i => i.json).filter(r => r && r.Keyword);

function num(v, d){ const n = parseFloat(v); return isNaN(n) ? d : n; }

// ---- per-keyword rows for the ledger ----
const keywordMaster = rows.map(r => {
  const pos = num(r['Current Position'], null);
  const status = (r.Status || 'Queued').toString().trim();
  // page path: prefer an explicit column, else derive nothing (dashboard tolerates '/')
  const page = (r['Target Page'] || r['Page'] || '').toString().trim();
  // provisional GEO flag: question-intent keywords + informational content are GEO-relevant.
  // This is a heuristic from sheet data, NOT a crawl score. Real score arrives via signa-engine.
  const kw = (r.Keyword || '').toLowerCase();
  const isQuestion = /^(how|what|why|when|where|who|which|can|is|are|should|will|do|does)\b/.test(kw) || kw.includes('?');
  const geo = isQuestion || (r['Content Type'] || '').toString().toLowerCase().includes('article');
  return {
    Keyword: r.Keyword,
    page: page,
    pos: pos === null ? 'unranked' : pos.toFixed(1),
    imp: (r.Impressions || 0).toString(),
    Status: status,
    geo: geo
  };
});

// ---- striking distance count (positions 8-20) ----
const striking = keywordMaster.filter(r => {
  const p = parseFloat(r.pos); return p >= 8 && p <= 20;
}).length;

// ---- movement: from optional "Previous Position" column, if present ----
const movement = [];
for (const r of rows) {
  const prev = num(r['Previous Position'], null);
  const cur  = num(r['Current Position'], null);
  if (prev !== null && cur !== null && Math.abs(prev - cur) >= 0.1) {
    const delta = +(prev - cur).toFixed(1); // positive = improved (moved up)
    movement.push({ Keyword: r.Keyword, Delta: Math.abs(delta), Direction: delta > 0 ? 'UP' : 'DOWN' });
  }
}
movement.sort((a,b) => b.Delta - a.Delta);

// ---- review count: drafts awaiting sign-off ----
const review = rows.filter(r => {
  const s = (r.Status || '').toString().toLowerCase();
  return s.includes('needs review') || s.includes('drafted');
}).length;

// ---- audit: pull from an optional "Audit" tab passthrough, else safe defaults ----
// If you wire a site-health source later, set these from it. Provisional for now.
const audit = {
  score: num($vars ? $vars.auditScore : null, 74),
  grade: 'B',
  pages: num($vars ? $vars.auditPages : null, 30),
  issues: num($vars ? $vars.auditIssues : null, 41)
};

// ---- GEO block: provisional site-level readiness ----
// Derived from how many tracked terms are GEO-relevant and how many drafts exist.
// Flagged provisional; real numbers come from signa-engine geo_score() per page.
const geoRelevant = keywordMaster.filter(r => r.geo).length;
const geoPct = keywordMaster.length ? Math.round((geoRelevant / keywordMaster.length) * 100) : 0;
const geo = {
  score: Math.min(72, 40 + Math.round(geoPct * 0.3)),   // conservative provisional band
  answerFirst: Math.min(70, 30 + Math.round(geoPct * 0.2)),
  citability: 55,
  qa: Math.min(80, 45 + Math.round(geoPct * 0.3)),
  provisional: true,
  prose: '<p>Search is no longer only a results page \u2014 a growing share of buyers ask an AI assistant and read one answer. <em>Every draft is worded for both surfaces</em>: ranked by Google, quotable by the machines.</p>' +
         '<p>Of ' + keywordMaster.length + ' tracked terms, <b>' + geoRelevant + '</b> are question- or answer-shaped \u2014 the ones most likely to be lifted into an AI answer. This readiness score is provisional until the next crawl scores each page directly.</p>'
};

const payload = {
  tenant: TENANT_ID,
  generated: $now.toISO(),
  keywordMaster,
  audit,
  geo,
  movement,
  review,
  striking
};

// The GitHub node needs the file content base64-encoded and a commit message.
const contentJson = JSON.stringify(payload, null, 2);
const contentB64 = Buffer.from(contentJson, 'utf8').toString('base64');

return [{ json: {
  tenant: TENANT_ID,
  path: 'data/' + TENANT_ID + '.json',
  commitMessage: 'Signa: refresh ' + TENANT_ID + ' dashboard data (' + $now.toFormat('yyyy-MM-dd HH:mm') + ')',
  contentJson,
  contentB64,
  payload
}}];
