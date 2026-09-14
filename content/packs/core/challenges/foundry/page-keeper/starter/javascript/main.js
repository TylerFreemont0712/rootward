function pageRange(total, perPage, page) {
  // TODO: pages and entries are counted from 1. And what should a page that does not exist print?
  const first = page * perPage;
  const last = first + perPage;
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
