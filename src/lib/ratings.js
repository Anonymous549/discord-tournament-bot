// src/lib/ratings.js
function expectedScore(rA, rB) {
  return 1 / (1 + Math.pow(10, (rB - rA) / 400));
}
function updateElo(rA, rB, scoreA, k = 32) {
  const expA = expectedScore(rA, rB);
  const expB = expectedScore(rB, rA);
  const newA = rA + k * (scoreA - expA);
  const newB = rB + k * ((1 - scoreA) - expB);
  return [newA, newB];
}
module.exports = { expectedScore, updateElo };
