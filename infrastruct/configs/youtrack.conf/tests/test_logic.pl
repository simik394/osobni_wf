%% Tests for Logic-Driven IaC Prolog Engine
%% Run with: swipl -g run_tests -t halt tests/test_logic.pl

:- use_module(library(plunit)).
:- consult('../src/logic/core.pl').

%% =============================================================================
%% Test fixtures - simulate current and target state
%% =============================================================================

setup_test_state :-
    % Current state (from YouTrack API)
    assertz(curr_field('f1', 'Status', 'state')),
    assertz(curr_field('f2', 'Priority', 'enum')),
    assertz(bundle_value('b1', 'v1', 'Open')),
    assertz(bundle_value('b1', 'v2', 'Closed')),
    
    % Target state (from Obsidian rules)
    assertz(target_field('Status', 'state', 'DEMO')),
    assertz(target_field('Priority', 'enum', 'DEMO')),
    assertz(target_field('Severity', 'enum', 'DEMO')),  % Missing!
    assertz(field_uses_bundle('Severity', 'SeverityBundle')).

cleanup_test_state :-
    retractall(curr_field(_, _, _)),
    retractall(target_field(_, _, _)),
    retractall(bundle_value(_, _, _)),
    retractall(field_uses_bundle(_, _)).

%% =============================================================================
%% Diff Logic Tests
%% =============================================================================

:- begin_tests(diff_logic).

test(missing_field_detected, [setup(setup_test_state), cleanup(cleanup_test_state)]) :-
    missing_field('Severity', 'enum', 'DEMO').

test(existing_field_not_missing, [setup(setup_test_state), cleanup(cleanup_test_state), fail]) :-
    missing_field('Status', 'state', 'DEMO').

setup_drift_state :-
    assertz(curr_field('f2', 'Priority', 'enum')),
    assertz(target_field('Priority', 'string', 'DEMO')).

cleanup_drift_state :-
    retractall(curr_field(_, _, _)),
    retractall(target_field(_, _, _)).

test(drifted_field_detected, [setup(setup_drift_state), cleanup(cleanup_drift_state)]) :-
    findall(curr_field(A,B,C), curr_field(A,B,C), Currs),
    format('DBG Currs: ~w~n', [Currs]),
    findall(target_field(X,Y,Z), target_field(X,Y,Z), Targs),
    format('DBG Targs: ~w~n', [Targs]),
    
    (curr_field('f2', 'Priority', 'enum') -> writeln('Step 1: curr_field OK'); writeln('Step 1: curr_field FAIL')),
    (curr_field('f2', 'Priority', 'enum') -> writeln('Step 1: curr_field OK'); writeln('Step 1: curr_field FAIL')),
    (target_field('Priority', 'string', _) -> writeln('Step 2: target_field OK'); writeln('Step 2: target_field FAIL')),
    ('enum' \= 'string' -> writeln('Step 3: Diff OK'); writeln('Step 3: Diff FAIL')),

    user:drifted_field('f2', 'Priority', 'enum', 'string'). 

:- end_tests(diff_logic).

%% =============================================================================
%% Action Generation Tests
%% =============================================================================

:- begin_tests(action_generation).

test(create_action_for_missing, [setup(setup_test_state), cleanup(cleanup_test_state)]) :-
    action(create_field('Severity', 'enum', 'SeverityBundle')).

test(no_action_for_existing, [setup(setup_test_state), cleanup(cleanup_test_state), fail]) :-
    action(create_field('Status', 'state', 'DEMO')).

:- end_tests(action_generation).

%% =============================================================================
%% Dependency Graph Tests
%% =============================================================================

:- begin_tests(dependencies).

test(field_depends_on_bundle, [setup(setup_test_state), cleanup(cleanup_test_state)]) :-
    depends_on(create_field('Severity', 'enum', 'SeverityBundle'), ensure_bundle('SeverityBundle', _)).

:- end_tests(dependencies).

%% =============================================================================
%% Topological Sort Tests
%% =============================================================================

:- begin_tests(topological_sort).

test(simple_sort) :-
    Actions = [create_field(f, t, b), ensure_bundle(b, enum)],
    % Dependency: create_field(..., b) depends on ensure_bundle(b, ...)
    topological_sort(Actions, Sorted),
    Sorted = [ensure_bundle(b, enum), create_field(f, t, b)].

:- end_tests(topological_sort).


%% =============================================================================
%% Run all tests
%% =============================================================================

run_tests :-
    run_tests(diff_logic),
    run_tests(action_generation),
    run_tests(dependencies),
    run_tests(topological_sort).
