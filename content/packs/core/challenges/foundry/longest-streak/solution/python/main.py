import sys


def longest_streak(items: list[str]) -> tuple[int, str]:
    best_length, best_item = 0, ""
    run_length, previous = 0, None
    for item in items:
        # A run continues while the item repeats; a different item starts a new run of 1.
        run_length = run_length + 1 if item == previous else 1
        previous = item
        # Strictly longer only, so the first of two equal runs stays the answer.
        if run_length > best_length:
            best_length, best_item = run_length, item
    return best_length, best_item


def main() -> None:
    for line in sys.stdin.read().splitlines():
        length, item = longest_streak(line.split())
        print(f"{length} {item}" if length > 0 else "0")


if __name__ == "__main__":
    main()
