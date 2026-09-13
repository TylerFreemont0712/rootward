import sys


def main() -> None:
    for line in sys.stdin.read().splitlines():
        if not line.strip():
            continue
        a, b = map(int, line.split())
        # TODO: b can be 0. And does int(a / b) round down when a is negative?
        q = int(a / b)
        r = a - q * b
        print(q, r)


if __name__ == "__main__":
    main()
