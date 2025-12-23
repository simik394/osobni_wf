# Lessons Learned: YouTrack configuration management (LDI)

## 1. Janus-SWI and Complex Terms
When bridging Python and Prolog using `janus-swi`, compound terms (like `action(create_field(Name, Type))`) can sometimes be tricky to serialize back to Python, especially if they are returned as opaque objects.
**Lesson**: Using `=..` (univ) in Prolog to convert terms to lists before returning them to Python is a robust strategy.
```prolog
% Convert actions to list of lists for easy Python consumption
plan(_Actions), maplist(=.., _Actions, ActionLists)
```

## 2. Dependency-Aware Configuration
Fields in YouTrack often rely on "Bundles" (sets of values). Attempting to create a field before its bundle exists results in API errors.
**Lesson**: Use a logic engine to compute dependencies. In Prolog, we can express this naturally:
```prolog
depends_on(create_field(F, _), ensure_bundle(B, _)) :- field_uses_bundle(F, B).
```
And then use `topological_sort` to ensure the `Actuator` receives commands in the correct order.

## 3. Idempotency vs. State Drift
An actuator must be able to run repeatedly without side effects if the state matches.
**Lesson**: Every action should check both the *target state* (what we want) and the *current state* (what we have) before deciding to act. This prevents "action loops" where the engine keeps trying to create a field that already exists but wasn't correctly detected.

## 4. SWI-Prolog and Pip (Ansible)
Installing `janus-swi` via Ansible `pip` module can be brittle if it tries to install into a user directory that doesn't exist or isn't in Python's path.
**Lesson**: For infrastructure roles, prefer system-wide installation (`become: true` and no `--user` flag) to ensure all services (like Windmill or background workers) can access the library.
