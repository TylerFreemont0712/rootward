import sys


def main() -> None:
    total = 0
    for line in sys.stdin.read().splitlines():
        if not line.strip():
            continue
        # TODO: add the number to the total instead of replacing it, and remember the largest total for the last line
        total = int(line)
        print(total)


if __name__ == "__main__":
    main()
