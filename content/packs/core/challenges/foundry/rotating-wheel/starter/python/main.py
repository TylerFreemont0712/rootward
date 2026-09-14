import sys


def rotate_right(items: list[str], k: int) -> list[str]:
    # TODO: a step larger than the wheel breaks this. Check the negative steps and the empty wheel too.
    return items[-k:] + items[:-k]


def main() -> None:
    for line in sys.stdin.read().splitlines():
        if not line.strip():
            continue
        first, *items = line.split()
        print(" ".join(rotate_right(items, int(first))))


if __name__ == "__main__":
    main()
