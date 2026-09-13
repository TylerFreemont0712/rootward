import sys


def main() -> None:
    register: dict[str, int] = {}
    for line in sys.stdin.read().splitlines():
        parts = line.split()
        if not parts:
            continue
        command, name = parts[0], parts[1]
        if command == "set":
            register[name] = int(parts[2])
        elif command == "print":
            print(register[name])
        # TODO: add, copy, and names that were never set


if __name__ == "__main__":
    main()
