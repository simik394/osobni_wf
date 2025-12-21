%% Logic-Driven IaC - Prolog Inference Engine
%% Core rules for configuration reconciliation

%% =============================================================================
%% ONTOLOGY - Predicate Definitions
%% =============================================================================

%% curr_field(Id, Name, Type) - Current field in YouTrack
%% target_field(Name, Type, Project) - Desired field from rules
%% bundle_value(BundleId, ValueId, ValueName) - Bundle values
%% depends_on(ActionA, ActionB) - ActionA depends on ActionB
%% field_uses_bundle(FieldName, BundleName) - Field uses bundle

:- dynamic curr_field/3.
:- dynamic target_field/3.
:- dynamic bundle_value/3.
:- dynamic field_uses_bundle/2.

%% =============================================================================
%% DIFF LOGIC - Detect missing/drifted resources
%% =============================================================================

%% A resource is missing if it's in target but not in current
missing_field(Name, Type, Project) :-
    target_field(Name, Type, Project),
    \+ curr_field(_, Name, Type).

%% A resource has drifted if types don't match
drifted_field(Id, Name, CurrentType, TargetType) :-
    curr_field(Id, Name, CurrentType),
    target_field(Name, TargetType, _),
    CurrentType \= TargetType.

%% =============================================================================
%% ACTION GENERATION
%% =============================================================================

%% Generate create action for missing fields
action(create_field(Name, Type, Project)) :-
    missing_field(Name, Type, Project).

%% Generate update action for drifted fields (WARNING: destructive!)
action(update_field_type(Id, Name, NewType)) :-
    drifted_field(Id, Name, _, NewType).

%% =============================================================================
%% DEPENDENCY GRAPH
%% =============================================================================

%% Field creation depends on bundle existence
depends_on(create_field(Name, enum, _), ensure_bundle(BundleName)) :-
    field_uses_bundle(Name, BundleName).

%% =============================================================================
%% TOPOLOGICAL SORT
%% =============================================================================

%% Collect all actions and sort by dependencies
plan(OrderedActions) :-
    findall(A, action(A), Unsorted),
    topological_sort(Unsorted, OrderedActions).

%% Simple topological sort (Kahn's algorithm)
topological_sort(Actions, Sorted) :-
    partition_by_deps(Actions, NoDeps, HasDeps),
    topo_helper(NoDeps, HasDeps, [], Sorted).

partition_by_deps([], [], []).
partition_by_deps([A|Rest], [A|NoDeps], HasDeps) :-
    \+ depends_on(A, _),
    partition_by_deps(Rest, NoDeps, HasDeps).
partition_by_deps([A|Rest], NoDeps, [A|HasDeps]) :-
    depends_on(A, _),
    partition_by_deps(Rest, NoDeps, HasDeps).

topo_helper([], [], Acc, Sorted) :- reverse(Acc, Sorted).
topo_helper([A|NoDeps], HasDeps, Acc, Sorted) :-
    remove_dep(A, HasDeps, NewHasDeps, Freed),
    append(NoDeps, Freed, NewNoDeps),
    topo_helper(NewNoDeps, NewHasDeps, [A|Acc], Sorted).

remove_dep(_, [], [], []).
remove_dep(Done, [A|Rest], [A|NewRest], Freed) :-
    depends_on(A, Dep), Dep \= Done,
    remove_dep(Done, Rest, NewRest, Freed).
remove_dep(Done, [A|Rest], NewRest, [A|Freed]) :-
    depends_on(A, Done),
    \+ (depends_on(A, Other), Other \= Done),
    remove_dep(Done, Rest, NewRest, Freed).
