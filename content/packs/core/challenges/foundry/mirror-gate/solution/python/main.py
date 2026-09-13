import sys


def is_mirror(line: str) -> bool:
    kept = "".join(ch for ch in line.lower() if ch.isalnum())
    # A slice with step -1 walks backwards; strings are immutable, so kept[::-1] is a new string.
    return kept == kept[::-1]


def main() -> None:
    # splitlines() does not invent an empty line after the final newline.
    for line in sys.stdin.read().splitlines():
        print("open" if is_mirror(line) else "shut")


if __name__ == "__main__":
    main()
