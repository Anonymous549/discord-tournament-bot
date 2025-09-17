// src/lib/brackets.js
function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
}
function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}
function generateSingleElim(playerIds) {
  const players = playerIds.slice();
  shuffle(players);
  let size = 1; while (size < players.length) size <<= 1;
  const byes = size - players.length;
  const padded = players.slice();
  for (let i = 0; i < byes; i++) padded.push(null);
  const rounds = [];
  const first = [];
  for (let i = 0; i < padded.length; i += 2) {
    first.push({ a: padded[i], b: padded[i + 1], winner: null, id: `r0m${i / 2}` });
  }
  rounds.push(first);
  let prev = first;
  let roundIndex = 1;
  while (prev.length > 1) {
    const next = new Array(Math.ceil(prev.length / 2)).fill(null).map((_, idx) => ({ a: null, b: null, winner: null, id: `r${roundIndex}m${idx}` }));
    rounds.push(next);
    prev = next;
    roundIndex++;
  }
  for (let m of rounds[0]) {
    if (m.a && !m.b) m.winner = m.a;
    if (!m.a && m.b) m.winner = m.b;
  }
  return rounds;
}
function swissPairing(players, round, results) {
  const scores = {};
  for (let p of players) scores[p] = 0;
  for (let r of results) {
    for (let m of r) {
      if (!m) continue;
      if (m.winner) scores[m.winner] = (scores[m.winner] || 0) + 1;
    }
  }
  const sorted = players.slice().sort((x, y) => ((scores[y] || 0) - (scores[x] || 0)));
  const pairs = [];
  for (let i = 0; i < sorted.length; i += 2) {
    const a = sorted[i];
    const b = sorted[i + 1] || null;
    pairs.push({ a, b, winner: null });
  }
  return pairs;
}
function generateGroups(players, groupSize = 1, fillMethod = 'random') {
  const p = players.slice();
  if (fillMethod === 'random') shuffle(p);
  if (groupSize <= 1) return p.map(x => [x]);
  return chunk(p, groupSize);
}
function distributeRoundRobin(players, groupSize) {
  const groupCount = Math.ceil(players.length / groupSize);
  const groups = Array.from({ length: groupCount }, () => []);
  for (let i = 0; i < players.length; i++) groups[i % groupCount].push(players[i]);
  return groups;
}
module.exports = { shuffle, chunk, generateSingleElim, swissPairing, generateGroups, distributeRoundRobin };
