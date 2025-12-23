%% Logic-Driven IaC - Prolog Inference Engine
%% Core rules for configuration reconciliation

%% =============================================================================
%% ONTOLOGY - Predicate Definitions
%% =============================================================================

%% curr_field(Id, Name, Type) - Current field in YouTrack
%% curr_project(Id, Name, ShortName) - Current project
%% curr_bundle(Id, Name, Type) - Current bundle
%% target_field(Name, Type, Project) - Desired field from rules
%% target_project(ShortName, Name) - Desired project
%% target_project(ShortName, Name, Leader) - Desired project with leader
%% target_bundle_value(Bundle, Value) - Desired bundle value
%% target_state_value(Bundle, Value, IsResolved) - Desired state value
%% bundle_value(BundleId, ValueId, ValueName) - Current bundle values
%% depends_on(ActionA, ActionB) - ActionA depends on ActionB
%% field_uses_bundle(FieldName, BundleName) - Field uses bundle
%% field_required(FieldName, Project) - Field is required

:- dynamic curr_field/3.
:- dynamic curr_project/3.
:- dynamic curr_bundle/3.
:- dynamic target_field/3.
:- dynamic target_project/2.
:- dynamic target_project/3.
:- dynamic target_bundle_value/2.
:- dynamic target_state_value/3.
:- dynamic bundle_value/3.
:- dynamic field_uses_bundle/2.
:- dynamic field_required/2.

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

%% 1. Bundles
%% Ensure bundle exists if used by any field
action(ensure_bundle(Name, Type)) :-
    field_uses_bundle(FieldName, Name),
    target_field(FieldName, FieldType, _),
    (FieldType = state -> Type = state ; Type = enum),
    \+ curr_bundle(_, Name, _).

%% Add values to bundles
action(add_bundle_value(Bundle, Value, enum)) :-
    target_bundle_value(Bundle, Value),
    \+ (curr_bundle(Bid, Bundle, _), bundle_value(Bid, _, Value)).

action(add_state_value(Bundle, Value, IsResolved)) :-
    target_state_value(Bundle, Value, IsResolved),
    \+ (curr_bundle(Bid, Bundle, _), bundle_value(Bid, _, Value)).

%% 2. Fields
%% Create global field definition if missing
action(create_field(Name, Type, Bundle)) :-
    target_field(Name, Type, _),
    \+ curr_field(_, Name, _),
    field_uses_bundle(Name, Bundle).

action(create_field(Name, Type)) :-
    target_field(Name, Type, _),
    \+ curr_field(_, Name, _),
    \+ field_uses_bundle(Name, _).

%% Attach field to project if missing from project
%% (Simplified: If we target it, we attach it. Actuator checks if already attached)
action(attach_field(Name, Project)) :-
    target_field(Name, _, Project).
    % Ideally check if already attached, but we lack curr_project_field(Project, Field) fact yet.
    % We'll rely on Actuator idempotency or add that fact later.

%% =============================================================================
%% DEPENDENCY GRAPH
%% =============================================================================

%% Value addition depends on bundle creation
depends_on(add_bundle_value(B, _, _), ensure_bundle(B, _)).
depends_on(add_state_value(B, _, _), ensure_bundle(B, _)).

%% Field creation depends on bundle creation
depends_on(create_field(_, _, B), ensure_bundle(B, _)).

%% Field attachment depends on field creation
%% Field attachment depends on field creation
depends_on(attach_field(F, _), create_field(F, _, B)) :-
    field_uses_bundle(F, B).
depends_on(attach_field(F, _), create_field(F, _)) :-
    \+ field_uses_bundle(F, _).


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
