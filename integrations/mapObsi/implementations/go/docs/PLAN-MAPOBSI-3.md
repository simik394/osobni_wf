# Plan: Vault Validation Layer (MAPOBSI-3)

**Objective**: Implement the "Foundation" phase of the Vault Validation Spec, enabling `librarian validate` to check structural rules using SWI-Prolog.

## 1. Architecture Choice via Spec
Selected Strategy: **Export-to-Prolog** (Batch Validation).
- **Why**: SWI-Prolog is mature, robust, and easy to run as a subprocess. Embedding via CGO is complex/risky for Phase 1.
- **Workflow**:
    1. `librarian validate` -> `FalkorDB` (Fetch Graph).
    2. `librarian` -> `facts.pl` (Write Prolog Facts).
    3. `swipl -f rules/vault.pl -f facts.pl -g validate -t halt` (Execute).
    4. Output parsed and printed to user.

## 2. Implementation Steps

### Step 1: Prolog Export (`internal/export/prolog.go`)
Create a new package/module to convert the Graph into Facts.
- **Fact Schema**:
    - `node(Id, Label, Props).`
    - `edge(Source, Target, Type).`
- **Logic**:
    - Query `MATCH (n) RETURN n` -> Iterate -> Write `node(...)`.
    - Query `MATCH ()-[r]->() RETURN r` -> Iterate -> Write `edge(...)`.

### Step 2: Rule Definition (`rules/vault.pl`)
Create the initial rule set as per Spec:
```prolog
% Basic violations
violation(missing_readme, Project) :-
    node(Project, 'Project', _),
    \+ (edge(Project, File, 'HAS_FILE'), node(File, 'File', Props), get_dict(name, Props, 'README.md')).

validate :-
    findall(violation(Type, Entity), violation(Type, Entity), Violations),
    maplist(print_violation, Violations).
```

### Step 3: CLI Command (`cmd/librarian/validate.go`)
- Add `validate` command to Cobra.
- Flags:
    - `--rules`: Path to `.pl` file (default: `~/.config/librarian/rules.pl`).
    - `--output`: json or text.

### Step 4: Logic Validation Layer (`internal/validator/runner.go`)
- Orchestrate the `Export -> Run -> Parse` pipeline.
- Ensure `swipl` is available on PATH.

## 3. Deployment
- **Dependencies**: User needs `swi-prolog` installed (`apt install swi-prolog`).
- **Config**: Add `validator` section to `config.yaml`.

## 4. Verification
1. Create a dummy project without README.
2. Run `librarian scan`.
3. Run `librarian validate`.
4. Expect: `[VIOLATION] missing_readme on Project(X)`.
