// LEARN: output from sandboxed code is untrusted in size. Counting bytes as text arrives means a program that prints
// in a loop cannot grow server memory without bound: everything past the cap is dropped and the result is marked.

export const TRUNCATION_MARKER = "\n[output truncated]\n";

export class OutputBuffer {
  readonly limitBytes: number;
  private readonly chunks: string[] = [];
  private bytes = 0;
  private overflowed = false;

  constructor(limitBytes: number) {
    this.limitBytes = limitBytes;
  }

  /** Append text. Returns false once the limit has been reached (the caller may stop the program). */
  write(text: string): boolean {
    if (this.overflowed) return false;
    const size = Buffer.byteLength(text, "utf8");
    if (this.bytes + size <= this.limitBytes) {
      this.chunks.push(text);
      this.bytes += size;
      return true;
    }
    const remaining = this.limitBytes - this.bytes;
    if (remaining > 0) this.chunks.push(truncateUtf8(text, remaining));
    this.bytes = this.limitBytes;
    this.overflowed = true;
    return false;
  }

  get truncated(): boolean {
    return this.overflowed;
  }

  toString(): string {
    return this.chunks.join("") + (this.overflowed ? TRUNCATION_MARKER : "");
  }
}

/** Cut a string to at most `maxBytes` of UTF-8 without leaving half a multi-byte character. */
export function truncateUtf8(text: string, maxBytes: number): string {
  const cut = Buffer.from(text, "utf8").subarray(0, Math.max(0, maxBytes)).toString("utf8");
  return cut.endsWith("�") && !text.endsWith("�") ? cut.slice(0, -1) : cut;
}
