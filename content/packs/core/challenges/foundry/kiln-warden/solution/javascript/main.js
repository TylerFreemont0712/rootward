/** Return a Map of metal -> net score across every line: +1 per "temper" verdict, -1 per "crack" verdict. */
function tally(lines) {
  const scores = new Map();
  for (const line of lines) {
    const [metal, verdict] = line.split(" ");
    const delta = verdict === "temper" ? 1 : -1;
    scores.set(metal, (scores.get(metal) ?? 0) + delta);
  }
  return scores;
}

function main(input) {
  const lines = input.split("\n").filter((line) => line.trim());
  for (const [metal, score] of tally(lines)) console.log(`${metal}: ${score}`);
}

main(require("fs").readFileSync(0, "utf8"));
