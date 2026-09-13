import sys


def is_mirror(line: str) -> bool:
    # TODO: ignore case, and everything that is not a letter or a digit
    for i in range(len(line) // 2):
        if line[i] != line[len(line) - i]:
            return False
    return True


def main() -> None:
    for line in sys.stdin.read().splitlines():
        print("open" if is_mirror(line) else "shut")


if __name__ == "__main__":
    main()
