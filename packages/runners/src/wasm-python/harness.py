# Runs one io test case for the wasm-python runner. host.mts loads this file once per sandbox process and calls
# run_case for every case of the job.
#
# Everything a program can change is reset between cases: stdin/stdout/stderr, sys.path, imported modules, builtins,
# the recursion limit, the working directory, and the player's files under /work. Output is captured in Python so a
# runaway printer is stopped at the limit instead of filling memory.
import builtins
import io
import linecache
import os
import shutil
import sys
import time
import traceback

WORK_DIR = "/work"
HARNESS_FILE = "<rootward-harness>"


class OutputLimitExceeded(BaseException):
    """Raised when a program prints past the limit. A BaseException, so `except Exception` cannot swallow it."""


class Capture(io.TextIOBase):
    def __init__(self, limit):
        super().__init__()
        self.parts = []
        self.size = 0
        self.limit = limit
        self.truncated = False

    def writable(self):
        return True

    def write(self, text):
        if not isinstance(text, str):
            raise TypeError("write() argument must be str, not " + type(text).__name__)
        if self.truncated:
            raise OutputLimitExceeded()
        if self.size + len(text) > self.limit:
            self.parts.append(text[: self.limit - self.size])
            self.size = self.limit
            self.truncated = True
            raise OutputLimitExceeded()
        self.parts.append(text)
        self.size += len(text)
        return len(text)

    def value(self):
        return "".join(self.parts)


def _format(error):
    """The traceback as Python prints it, minus this harness's own frames."""
    info = traceback.TracebackException.from_exception(error)
    info.stack = traceback.StackSummary.from_list([f for f in info.stack if f.filename != HARNESS_FILE])
    return "".join(info.format())


def _write_files(files):
    shutil.rmtree(WORK_DIR, ignore_errors=True)
    for path, contents in files.items():
        full_path = os.path.join(WORK_DIR, path)
        os.makedirs(os.path.dirname(full_path), exist_ok=True)
        with open(full_path, "w", encoding="utf-8") as handle:
            handle.write(contents)


def _restore_builtins(saved):
    current = vars(builtins)
    for name in [name for name in current if name not in saved]:
        del current[name]
    for name, value in saved.items():
        if current.get(name) is not value:
            current[name] = value


def run_case(files, entry, stdin_text, output_limit):
    """Run `entry` with `stdin_text`. Returns (status, stdout, stderr, message, duration_ms)."""
    _write_files(files)
    source = files[entry]
    stdout, stderr = Capture(output_limit), Capture(output_limit)
    saved_streams = (sys.stdin, sys.stdout, sys.stderr)
    saved_path = list(sys.path)
    saved_modules = set(sys.modules)
    saved_builtins = dict(vars(builtins))
    saved_recursion_limit = sys.getrecursionlimit()
    saved_cwd = os.getcwd()
    linecache.cache[entry] = (len(source), None, source.splitlines(True), entry)
    status, message, duration_ms = "ok", None, 0.0

    try:
        os.chdir(WORK_DIR)
        sys.path.insert(0, WORK_DIR)
        sys.stdin, sys.stdout, sys.stderr = io.StringIO(stdin_text), stdout, stderr
        try:
            code = compile(source, entry, "exec")
        except SyntaxError as error:
            status, message = "compile-error", "syntax error: %s (line %s)" % (error.msg, error.lineno)
            stderr.write(_format(error))
        else:
            started = time.perf_counter()
            try:
                exec(code, {"__name__": "__main__", "__file__": entry, "__builtins__": builtins})
            except SystemExit as error:
                if isinstance(error.code, str):
                    stderr.write(error.code + "\n")
                    status, message = "runtime-error", "exited: " + error.code
                elif error.code not in (None, 0):
                    status, message = "runtime-error", "exited with code %s" % (error.code,)
            except OutputLimitExceeded:
                status, message = "runtime-error", "output limit exceeded"
            except MemoryError:
                status, message = "oom", "MemoryError: out of memory"
            except RecursionError as error:
                status, message = "runtime-error", "RecursionError: the recursion went too deep (is a base case missing?)"
                stderr.write(_format(error)[-2000:])
            except BaseException as error:
                status, message = "runtime-error", "%s: %s" % (type(error).__name__, error)
                stderr.write(_format(error))
            finally:
                duration_ms = (time.perf_counter() - started) * 1000.0
    except OutputLimitExceeded:
        # The limit was reached while writing an error report; the outcome above is already recorded.
        pass
    finally:
        sys.stdin, sys.stdout, sys.stderr = saved_streams
        sys.path[:] = saved_path
        for name in set(sys.modules) - saved_modules:
            del sys.modules[name]
        _restore_builtins(saved_builtins)
        sys.setrecursionlimit(saved_recursion_limit)
        os.chdir(saved_cwd)

    return (status, stdout.value(), stderr.value(), message, duration_ms)
