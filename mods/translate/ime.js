// A small pinyin input method: letters in, Chinese candidates out. Pure logic, no UI.
import { SYLLABLES, DATA } from "./dict.js";

let table = null, syllables = null, starts = null;

function load() {
  if (table) return;
  table = new Map();
  for (const line of DATA.split("\n")) {
    const tab = line.indexOf("\t");
    table.set(line.slice(0, tab), line.slice(tab + 1));
  }
  syllables = new Set(SYLLABLES);
  starts = new Set();
  for (const s of SYLLABLES) for (let i = 1; i < s.length; i++) starts.add(s.slice(0, i));
}

const chars = (syllable) => [...(table.get(syllable) ?? "")];
const words = (syls) => syls.length === 1 ? chars(syls[0]) : (table.get(syls.join("'")) ?? "").split(" ").filter(Boolean);

// Every way to cut the letters into syllables, longest syllable first, at most `limit`.
// A cut is { syls, ends, rest }: ends[i] is how many letters syllables 0..i use (apostrophes
// included), rest is an unfinished last syllable ("zh", "n"), "" when the cut is complete.
function cuts(run, limit = 6) {
  const out = [];
  const walk = (at, syls, ends) => {
    if (out.length >= limit) return;
    while (run[at] === "'") at++;
    if (at >= run.length) { if (syls.length) out.push({ syls, ends, rest: "" }); return; }
    for (let n = Math.min(6, run.length - at); n >= 1; n--) {
      const piece = run.slice(at, at + n);
      if (syllables.has(piece)) walk(at + n, [...syls, piece], [...ends, at + n]);
    }
    const tail = run.slice(at);
    if (syls.length && !tail.includes("'") && starts.has(tail)) out.push({ syls, ends, rest: tail });
  };
  walk(0, [], []);
  // Complete cuts first, then fewer syllables (longer words).
  return out.sort((a, b) => (a.rest ? 1 : 0) - (b.rest ? 1 : 0) || a.syls.length - b.syls.length);
}

// The longest dictionary words chained end to end: a guess for a whole phrase.
function phrase(cut) {
  let text = "", i = 0;
  while (i < cut.syls.length) {
    let n = Math.min(6, cut.syls.length - i), hit = null;
    for (; n >= 1; n--) { hit = words(cut.syls.slice(i, i + n))[0]; if (hit) break; }
    if (!hit) return null;
    text += hit; i += n;
  }
  return text;
}

/** Candidates for a run of lowercase letters and apostrophes typed as pinyin.
 *  Returns [] when the run is not pinyin (an English word, say). Each candidate is
 *  { text, used }: `used` letters of the run become `text`; the rest stays to compose. */
export function candidates(run) {
  if (!run || run.length > 60 || !/^[a-z][a-z']*$/.test(run)) return [];
  load();
  const all = cuts(run);
  if (!all.length) return [];
  const main = all[0], out = [], seen = new Set();
  const add = (text, used) => { if (text && !seen.has(text)) { seen.add(text); out.push({ text, used }); } };
  const whole = (cut) => cut.ends[cut.ends.length - 1];
  const full = words(main.syls);
  // Whole-run matches of the main cut; a chained guess when the run is not one word.
  if (main.syls.length > 1 && !full.length) add(phrase(main), whole(main));
  full.slice(0, main.syls.length === 1 ? 3 : 12).forEach(w => add(w, whole(main)));
  // The other ways to cut it ("xian" is also "xi'an").
  for (const cut of all.slice(1)) if (cut.syls.length > 1) words(cut.syls).slice(0, 3).forEach(w => add(w, whole(cut)));
  if (main.syls.length > 1 && full.length) add(phrase(main), whole(main));
  full.slice(3).forEach(w => add(w, whole(main)));
  // Shorter words from the front, then single characters for the first syllable.
  for (let n = Math.min(6, main.syls.length - 1); n >= 2; n--) words(main.syls.slice(0, n)).slice(0, 6).forEach(w => add(w, main.ends[n - 1]));
  if (main.syls.length > 1) chars(main.syls[0]).forEach(w => add(w, main.ends[0]));
  return out;
}
