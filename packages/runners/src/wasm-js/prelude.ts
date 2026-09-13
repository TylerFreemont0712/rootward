// JavaScript evaluated inside the QuickJS sandbox before the player's entry file. It builds a small, Node-shaped
// world out of three host functions: write(fd, text), readStdin(), and readFile(path).
//
// LEARN: the prelude evaluates to a function that receives the host functions as arguments instead of reading them
// from globals. They live only in this closure, so player code can use console/process/require but cannot call the
// raw host functions or replace them for the harness.
//
// Supported: console.log/info/debug (stdout), console.warn/error (stderr), process.stdout.write,
// process.stderr.write, process.exit, process.argv/env, require("fs").readFileSync(0) for stdin, and require() of
// the player's own files by relative path. Not supported: ES module syntax, timers, network, other Node modules.
export const PRELUDE = String.raw`(function (host, entryPath) {
  "use strict";
  var write = host.write;
  var readStdin = host.readStdin;
  var readFile = host.readFile;

  function inspect(value) {
    if (typeof value === "string") return value;
    if (value === undefined || value === null || typeof value === "number" || typeof value === "boolean" || typeof value === "bigint") return String(value);
    if (typeof value === "function") return "[Function " + (value.name || "anonymous") + "]";
    if (value instanceof Error) return value.name + ": " + value.message;
    if (value instanceof Map) return "Map(" + value.size + ") " + inspect(Array.from(value.entries()));
    if (value instanceof Set) return "Set(" + value.size + ") " + inspect(Array.from(value.values()));
    try {
      var json = JSON.stringify(value);
      return json === undefined ? String(value) : json;
    } catch (error) {
      return String(value);
    }
  }

  function print(fd, args) {
    var parts = [];
    for (var i = 0; i < args.length; i++) parts.push(inspect(args[i]));
    write(fd, parts.join(" ") + "\n");
  }

  var consoleShim = {
    log: function () { print(1, arguments); },
    info: function () { print(1, arguments); },
    debug: function () { print(1, arguments); },
    warn: function () { print(2, arguments); },
    error: function () { print(2, arguments); }
  };

  function RootwardExit(code) {
    this.name = "RootwardExit";
    this.message = "process.exit(" + code + ")";
    this.exitCode = code;
  }

  var stdinText = null;
  var fsShim = {
    readFileSync: function (path) {
      if (path === 0 || path === "/dev/stdin") {
        if (stdinText === null) stdinText = readStdin();
        return stdinText;
      }
      throw new Error("In the sandbox fs.readFileSync can only read standard input: fs.readFileSync(0, \"utf8\")");
    }
  };

  var processShim = {
    argv: ["node", entryPath],
    env: {},
    platform: "rootward-sandbox",
    stdout: { write: function (text) { write(1, String(text)); return true; } },
    stderr: { write: function (text) { write(2, String(text)); return true; } },
    exit: function (code) { throw new RootwardExit(code === undefined ? 0 : code); }
  };

  function dirname(path) {
    var slash = path.lastIndexOf("/");
    return slash === -1 ? "" : path.slice(0, slash);
  }

  function resolvePath(fromDir, request) {
    var parts = fromDir === "" ? [] : fromDir.split("/");
    var pieces = request.split("/");
    for (var i = 0; i < pieces.length; i++) {
      var piece = pieces[i];
      if (piece === "" || piece === ".") continue;
      if (piece === "..") {
        if (parts.length === 0) return null;
        parts.pop();
      } else {
        parts.push(piece);
      }
    }
    return parts.join("/");
  }

  var moduleCache = {};

  function makeRequire(fromDir) {
    return function require(request) {
      if (request === "fs" || request === "node:fs") return fsShim;
      if (request.slice(0, 2) === "./" || request.slice(0, 3) === "../") {
        var base = resolvePath(fromDir, request);
        if (base !== null) {
          var candidates = [base, base + ".js", base + "/index.js"];
          for (var i = 0; i < candidates.length; i++) {
            var path = candidates[i];
            if (moduleCache[path]) return moduleCache[path].exports;
            var source = readFile(path);
            if (typeof source !== "string") continue;
            var mod = { exports: {} };
            moduleCache[path] = mod;
            var factory = new Function("exports", "require", "module", "__filename", "__dirname", source);
            factory(mod.exports, makeRequire(dirname(path)), mod, path, dirname(path));
            return mod.exports;
          }
        }
      }
      throw new Error("Cannot find module '" + request + "'. The sandbox has no network, no child processes, and no files except your own.");
    };
  }

  var mainModule = { exports: {} };
  globalThis.console = consoleShim;
  globalThis.process = processShim;
  globalThis.require = makeRequire(dirname(entryPath));
  globalThis.module = mainModule;
  globalThis.exports = mainModule.exports;
  globalThis.__filename = entryPath;
  globalThis.__dirname = dirname(entryPath);
})`;
