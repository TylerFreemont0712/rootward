import sys


def main() -> None:
    for line in sys.stdin.read().splitlines():
        # TODO: this reverses the letters, not the words. And extra spaces must not turn into empty words.
        print(line[::-1])


if __name__ == "__main__":
    main()
