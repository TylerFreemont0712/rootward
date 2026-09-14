import sys


def main() -> None:
    n = int(sys.stdin.read())
    # range(1, n + 1) counts 1, 2, ..., n: the stop value itself is never included. For n <= 0 it is empty.
    for step in range(1, n + 1):
        print(("#" * step).rjust(n))


if __name__ == "__main__":
    main()
