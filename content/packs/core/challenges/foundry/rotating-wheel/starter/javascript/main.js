function rotateRight(items, k) {
  // TODO: a step larger than the wheel breaks this. Check the negative steps and the empty wheel too.
  const cut = items.length - k;
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
