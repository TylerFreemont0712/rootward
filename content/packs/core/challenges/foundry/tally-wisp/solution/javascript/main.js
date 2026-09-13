const PUNCT = '.,!?;:"\'()';

function trimPunct(word) {
  let start = 0;
  let end = word.length;
  while (start < end && PUNCT.includes(word[start])) start++;
  while (end > start && PUNCT.includes(word[end - 1])) end--;
  return word.slice(start, end);
}

/** Return a Map of normalized word -> count. */
function countWords(text) {
  const counts = new Map();
  // split(/\s+/) on trimmed text avoids the empty strings that leading/trailing whitespace would produce.
  for (const raw of text.trim().split(/\s+/)) {
    const word = trimPunct(raw.toLowerCase());
    if (!word) continue;
    counts.set(word, (counts.get(word) ?? 0) + 1);
  }
  return counts;
}

function main(input) {
  const rows = [...countWords(input)].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
  for (const [word, count] of rows) console.log(`${word} ${count}`);
}

main(require("fs").readFileSync(0, "utf8"));
