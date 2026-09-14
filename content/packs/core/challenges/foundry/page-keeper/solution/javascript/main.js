function pageRange(total, perPage, page) {
  const first = (page - 1) * perPage + 1;
  // The two ways a page can fail to exist: it comes before page 1, or it starts past the last entry.
  if (page < 1 || first > total) return "none";
  // A last page may be only partly full.
  const last = Math.min(page * perPage, total);
  return `${first}-${last}`;
}

function main(input) {
  for (const line of input.split("\n")) {
    if (!line.trim()) continue;
    const [total, perPage, page] = line.trim().split(/\s+/).map(Number);
    console.log(pageRange(total, perPage, page));
  }
}

main(require("fs").readFileSync(0, "utf8"));
