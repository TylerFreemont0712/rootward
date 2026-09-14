import sys


def main() -> None:
    for line in sys.stdin.read().splitlines():
        # split() with no argument splits on any run of whitespace and drops the empty strings.
        print(" ".join(reversed(line.split())))


if __name__ == "__main__":
    main()
