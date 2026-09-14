function rotateRight(items, k) {
  if (items.length === 0) return [];
  // % keeps the sign of k (-1 % 4 is -1), so add the length and take % again to land in 0..length-1.
  const shift = ((k % items.length) + items.length) % items.length;
  const cut = items.length - shift;
  return [...items.slice(cut), ...items.slice(0, cut)];
}

function main(input) {
  for (const line of input.split("\n")) {
    if (!line.trim()) continue;
    const [first, ...items] = line.trim().split(/\s+/);
    console.log(rotateRight(items, Number(first)).join(" "));
  }
}

main(require("fs").readFileSync(0, "utf8"));
