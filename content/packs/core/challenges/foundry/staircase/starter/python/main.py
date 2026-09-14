import sys


def main() -> None:
    n = int(sys.stdin.read())
    # TODO: the first line comes out empty and the last step is missing. And the steps should lean right.
    for step in range(n):
        print("#" * step)


if __name__ == "__main__":
    main()
