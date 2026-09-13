import sys


def main() -> None:
    total = 0
    best = None  # None means "no total yet"; 0 could be a real answer
    for line in sys.stdin.read().splitlines():
        if not line.strip():
            continue
        total += int(line)  # rebinds total to a new value built from the old one
        print(total)
        if best is None or total > best:
            best = total
    if best is not None:
        print(f"max {best}")


if __name__ == "__main__":
    main()
