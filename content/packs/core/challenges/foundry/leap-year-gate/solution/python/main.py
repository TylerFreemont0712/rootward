import sys


def is_leap(year: int) -> bool:
    # The most specific rule first, so each later check can assume the earlier ones did not apply.
    if year % 400 == 0:
        return True
    if year % 100 == 0:
        return False
    return year % 4 == 0


def main() -> None:
    for line in sys.stdin.read().splitlines():
        if line.strip():
            print("leap" if is_leap(int(line)) else "common")


if __name__ == "__main__":
    main()
