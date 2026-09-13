# Linux and the shell (Kernel Halls; the Warden's home)

## Filesystem and navigation
FHS layout (`/etc`, `/var`, `/usr`, `/home`, `/proc`, `/sys`, `/tmp`, `/dev`); absolute vs relative paths; `ls -la`, `cd`, `pwd`, `find` (by name, type, size, mtime, `-exec`), `locate`, `tree`, hidden files, globbing vs regex, symlinks vs hard links, inodes, mounts, disk usage (`df`, `du`), file types (`file`).

## Files and text
`cat`, `less`, `head`, `tail -f`, `wc`, `sort`, `uniq -c`, `cut`, `paste`, `tr`, `grep -rniE`, `sed` (substitute, delete, in-place), `awk` (fields, sums, conditions), `xargs`, `tee`, `diff`, `comm`, `jq` for JSON, `column`, here-docs, redirection (`>`, `>>`, `2>&1`, `<`), pipes, `/dev/null`, exit codes (`$?`), `&&`/`||`.

## Users, permissions, ownership
`id`, `whoami`, `su`, `sudo` and sudoers, `/etc/passwd`, `/etc/group`, `chmod` (octal and symbolic; the meaning of x on directories), `chown`, `umask`, setuid/setgid/sticky bits, ACLs, capabilities (`getcap`), why running as root is dangerous.

## Processes and jobs
`ps aux`, `top`/`htop`, `pgrep`/`pkill`, `kill` and signals (TERM vs KILL vs HUP), job control (`&`, `jobs`, `fg`, `bg`, `nohup`, `disown`), `nice`, zombies and orphans, `/proc/<pid>`, `lsof`, `strace`, exit codes, `ulimit`, cgroups (intro), `systemd` units and `journalctl`, cron and timers.

## Environment and shell scripting
Environment variables, `export`, `PATH`, `.bashrc` vs `.profile`, aliases, functions, `$0 $1 $@ $#`, quoting rules (the single most common bug), `set -euo pipefail`, conditionals (`[[ ]]`), loops, `case`, arithmetic, arrays, command substitution, process substitution, traps, `getopts`, shellcheck, when to stop writing bash and use Python.

## Networking from the shell
`ip a`, `ss -tulpn`, `ping`, `curl` (methods, headers, `-v`, `-o`), `wget`, `dig`/`nslookup`, `nc`, `ssh` (keys, config, tunnels, `scp`/`rsync`), `/etc/hosts`, firewalls (`ufw`, `iptables`/`nftables` intro), `tcpdump` basics.

## Packages and system
`apt`/`dnf`/`pacman`, `dpkg -L`, building from source, `make`, logs in `/var/log`, `dmesg`, kernel modules (intro), boot process (intro), `tar`/`gzip`/`zip`, checksums (`sha256sum`), `date`, time zones, `locale`, `tmux`/`screen`, `vim` survival.

## Misconceptions / error tags
- Unquoted variables with spaces (`unquoted-variable`)
- Parsing `ls` output (`parsing-ls`)
- `rm -rf $DIR/` with empty var (`dangerous-expansion`)
- Running everything as root (`root-everything`)
- `kill -9` first (`sigkill-first`)
- Not checking exit codes / no `set -e` (`unchecked-exit-code`)
- Confusing `>` and `>>` (`clobbered-file`)

## Challenge ideas (terminal rooms with setup.sh / check.sh)
1. **Permission Denied Golem** — a script cannot run; fix ownership and mode without making it world-writable.
2. **Zombie Process** — find and reap zombies; identify the parent; checks inspect `ps`.
3. **Fork Bomb** — contained bomb running; set `ulimit -u` for the user and kill it; checks verify limits in `/etc/security/limits.d`.
4. **Log Line Lurker** — extract the top 5 IPs with 5xx responses from an nginx log using one pipeline.
5. **The Missing PATH** — a binary "is not found"; fix `PATH` persistently and correctly.
6. **Symlink Sphinx** — untangle a symlink loop; make `/opt/app/current` point at the right release.
7. **Cron Crawler** — schedule a backup script every night at 02:30 with logging; checks parse crontab and run the script.
8. **systemd Sentinel** — write a unit for a small service with restart-on-failure; checks `systemctl is-active` (in the container use a supervisor shim if systemd is unavailable; declare capability).
9. **Disk Full Drake** — find what filled `/var` and clean it safely; checks confirm free space and that logs are truncated not deleted.
10. **Quoting Quarrel** — a script breaks on filenames with spaces; fix it; checks run it against evil filenames.
11. **SSH Keeper** — set up key-based auth to a second container; disable password auth; checks attempt both.
12. **Port Poltergeist** — something is holding port 8080; find it, stop it, start the right service.
13. **awk Alchemist** — compute per-user totals from a CSV with awk only (Constraint Curse: no python).
14. **tar Troll** — package a directory excluding caches, verify checksum, extract elsewhere preserving permissions.
15. **Rootkit** (boss) — find persistence mechanisms (cron, bashrc, systemd, setuid binary), remove them, harden; multi-check phases.
