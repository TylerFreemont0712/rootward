import sys


def is_leap(year: int) -> bool:
    # TODO: centuries are an exception, and every 400th year is an exception to that exception
    return year % 4 == 0


def main() -> None:
    for line in sys.stdin.read().splitlines():
        if line.strip():
            print("leap" if is_leap(int(line)) else "common")


if __name__ == "__main__":
    main()
