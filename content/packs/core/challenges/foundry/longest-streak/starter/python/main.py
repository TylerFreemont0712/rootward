import sys


def longest_streak(items: list[str]) -> tuple[int, str]:
    best_length, best_item = 0, ""
    run_length = 0
    for item in items:
        # TODO: the run should start again when the item changes, and a tie should keep the first run
        run_length += 1
        if run_length >= best_length:
            best_length, best_item = run_length, item
    return best_length, best_item


def main() -> None:
    for line in sys.stdin.read().splitlines():
        length, item = longest_streak(line.split())
        print(f"{length} {item}" if length > 0 else "0")


if __name__ == "__main__":
    main()
