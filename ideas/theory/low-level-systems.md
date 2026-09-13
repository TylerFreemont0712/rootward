# Low-level systems (Silicon Depths)

## Concepts
- Binary, hex, two's complement, integer overflow, endianness, bitwise ops and masks, fixed-point vs floating point (IEEE 754: precision, NaN, infinity, why 0.1+0.2), character encodings (ASCII, UTF-8, code points vs grapheme clusters).
- Memory: stack vs heap, addresses and pointers, arrays as pointer arithmetic, structs and alignment/padding, the call stack and frames, buffer overflows (conceptual demo), use-after-free, double free, memory leaks, `malloc/free`, RAII, garbage collection strategies (refcount, mark-sweep, generational) and their costs.
- CPU: instructions, registers, pipelines, branch prediction, caches (see complexity), SIMD intro, what a compiler does (see compilers), `-O2` effects, inspecting assembly (godbolt).
- Operating system: processes, threads, scheduling, virtual memory and paging, system calls, file descriptors, signals, pipes, mmap, the boot sequence (intro), how `fork/exec` works, `/proc`.
- Rust: ownership, borrowing, lifetimes, `Option/Result`, traits, pattern matching, `Vec/String/&str`, iterators, error handling with `?`, unsafe (why it exists), Cargo. Rust as "C with a type system that prevents the classic bugs".
- C: pointers, arrays, strings (null termination), structs, manual memory, headers and linking, `make`, undefined behavior, sanitizers (ASan/UBSan), valgrind.
- Networking and storage at the byte level: parsing binary formats (PNG header, TCP header), checksums, serialization (protobuf intro), compression basics (RLE, Huffman, LZ intro).
- Assembly literacy (read, not write): a hello-world walk-through, calling convention basics.

## Misconceptions / error tags
- Off-by-one on buffer sizes / missing null terminator (`buffer-bounds`)
- Returning pointer to stack memory (`dangling-pointer`)
- Signed/unsigned mixups and overflow (`integer-overflow`)
- Float equality (`float-equality`)
- Treating bytes as characters (`bytes-vs-chars`)
- Fighting the borrow checker with `clone()` everywhere (`clone-everything`)

## Challenge ideas
1. **Bit Basilisk** — popcount, parity, bit reversal, masks; Constraint Curse: no loops for power-of-two check.
2. **Two's Complement Cave** (Puzzle) — convert, add, detect overflow by hand.
3. **UTF-8 Undine** — encode/decode UTF-8 by hand from code points; hidden tests include 4-byte emoji and invalid sequences.
4. **PNG Peeker** — parse a PNG header and chunk list from bytes (Python `struct` / Node Buffer).
5. **Segfault Golem** (C) — a program with three memory bugs; fix under ASan; tests run with sanitizers.
6. **Arena Allocator** (C/Rust) — bump allocator with alignment; tests check alignment and reuse.
7. **Ownership Ogre** (Rust) — make a non-compiling program compile without `clone()` (the runner counts clones); Teach-back on borrowing.
8. **Linked List in Rust** — the famous hard one; guided as a multi-phase Elite with `Box`.
9. **Float Fiend** (Puzzle) — which of these comparisons are true? Why? Then implement `approx_equal` with relative tolerance.
10. **Syscall Sentinel** (terminal) — use `strace` to find why a program hangs; fix the config; checks read the transcript for `strace` usage.
11. **Fork/Exec Fox** (C/Python) — spawn a child, pipe output, wait, propagate exit code.
12. **Endian Eel** — read a little-endian binary log; hidden tests include a big-endian variant flagged by a magic number.
13. **Huffman Harpy II** — implement compression end to end; measure ratio.
14. **Cache Line Chameleon** — row vs column traversal timing; false sharing demo with threads (Rust).
