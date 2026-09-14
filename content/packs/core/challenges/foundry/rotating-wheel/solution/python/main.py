import sys


def rotate_right(items: list[str], k: int) -> list[str]:
    if not items:
        return []
    # With a positive length, % always lands in 0..len-1, even for a negative k: -1 % 4 is 3, a right turn of 3.
    k %= len(items)
    cut = len(items) - k
    return items[cut:] + items[:cut]


def main() -> None:
    for line in sys.stdin.read().splitlines():
        if not line.strip():
            continue
        first, *items = line.split()
        print(" ".join(rotate_right(items, int(first))))


if __name__ == "__main__":
    main()
