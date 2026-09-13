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
        elif command == "add":
            if name in register:
                register[name] += int(parts[2])  # rebinds the name to a new int
            else:
                print(f"unbound {name}")
        elif command == "copy":
            source = parts[2]
            if source in register:
                # The target is bound to the source's current value; a later change rebinds only the source.
                register[name] = register[source]
            else:
                print(f"unbound {source}")
        elif command == "print":
            print(register[name] if name in register else f"unbound {name}")


if __name__ == "__main__":
    main()
