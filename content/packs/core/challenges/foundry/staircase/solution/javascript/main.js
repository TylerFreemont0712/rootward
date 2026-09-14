function main(input) {
  const n = Number(input.trim());
  // step runs 1, 2, ..., n because `<=` includes n itself. For n <= 0 the loop never runs.
  for (let step = 1; step <= n; step++) console.log("#".repeat(step).padStart(n));
}

main(require("fs").readFileSync(0, "utf8"));
