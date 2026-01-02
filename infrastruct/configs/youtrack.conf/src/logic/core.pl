%% Logic-Driven IaC - Prolog Inference Engine
%% Core rules for configuration reconciliation

:- discontiguous action/1.
:- discontiguous depends_on/2.

%% =============================================================================
%% ONTOLOGY - Predicate Definitions
%% =============================================================================

%% curr_field(Id, Name, Type) - Current field in YouTrack
%% curr_project(Id, Name, ShortName) - Current project
%% curr_bundle(Id, Name, Type) - Current bundle
%% curr_workflow(Id, Name, Title) - Current workflow
%% curr_rule(WorkflowId, RuleId, Name, Type, Script) - Current workflow rule
%% curr_workflow_usage(WorkflowId, ProjectId, UsageId) - Current workflow usage (attachment)

%% target_field(Name, Type, Project) - Desired field from rules
%% target_project(ShortName, Name) - Desired project
%% target_project(ShortName, Name, Leader) - Desired project with leader
%% target_bundle_value(Bundle, Value) - Desired bundle value
%% target_state_value(Bundle, Value, IsResolved) - Desired state value
%% target_workflow(Name, Title, Attached) - Desired workflow
%% target_rule(WorkflowName, RuleName, Type, Script) - Desired workflow rule
%% target_workflow_attachment(WorkflowName, ProjectShortName) - Desired attachment

%% bundle_value(BundleId, ValueId, ValueName) - Current bundle values
%% depends_on(ActionA, ActionB) - ActionA depends on ActionB
%% field_uses_bundle(FieldName, BundleName) - Field uses bundle
%% field_required(FieldName, Project) - Field is required

:- dynamic curr_field/3.
:- dynamic curr_project/3.
:- dynamic curr_bundle/3.
:- dynamic curr_workflow/3.
:- dynamic curr_rule/5.
:- dynamic curr_workflow_usage/3.
:- dynamic curr_field_default/3.        %% curr_field_default(FieldId, ValueName, ProjectId)

:- dynamic target_field/3.
:- dynamic target_project/2.
:- dynamic target_project/3.
:- dynamic target_bundle_value/2.
:- dynamic target_state_value/3.
:- dynamic target_workflow/3.
:- dynamic target_rule/4.
:- dynamic target_rule/4.
:- dynamic target_workflow_attachment/2.
:- dynamic target_field_default/3.      %% target_field_default(FieldName, DefaultValue, Project)

:- dynamic bundle_value/3.
:- dynamic field_uses_bundle/2.
:- dynamic field_required/2.

%% Delete targets (from YAML state: absent)
:- dynamic target_delete_field/2.       %% target_delete_field(Name, Project)
:- dynamic target_delete_rule/2.        %% target_delete_rule(WorkflowName, RuleName)
:- dynamic target_delete_workflow/1.    %% target_delete_workflow(WorkflowName)

%% =============================================================================
%% DIFF LOGIC - Detect missing/drifted resources
%% =============================================================================

%% Resource Missing Logic

%% Field missing
missing_field(Name, Type, Project) :-
    target_field(Name, Type, Project),
    \+ curr_field(_, Name, Type).

%% Field default missing or drifted
missing_field_default(Name, DefaultValue, Project) :-
    target_field_default(Name, DefaultValue, Project),
    curr_project(ProjectId, _, Project),
    curr_field(FieldId, Name, _),
    \+ curr_field_default(FieldId, _, ProjectId).

drifted_field_default(Name, CurrentDefault, TargetDefault, Project) :-
    target_field_default(Name, TargetDefault, Project),
    curr_project(ProjectId, _, Project),
    curr_field(FieldId, Name, _),
    curr_field_default(FieldId, CurrentDefault, ProjectId),
    CurrentDefault \= TargetDefault.

%% Workflow missing
missing_workflow(Name, Title) :-
    target_workflow(Name, Title, _),
    \+ curr_workflow(_, Name, Title).

%% Workflow rule missing
missing_rule(WorkflowName, RuleName, Type, Script) :-
    target_rule(WorkflowName, RuleName, Type, Script),
    curr_workflow(WfId, WorkflowName, _),
    \+ curr_rule(WfId, _, RuleName, _, _).

%% Workflow attachment missing
missing_attachment(WorkflowName, ProjectShortName) :-
    target_workflow_attachment(WorkflowName, ProjectShortName),
    curr_workflow(WfId, WorkflowName, _),
    curr_project(ProjId, _, ProjectShortName),
    \+ curr_workflow_usage(WfId, ProjId, _).

%% Resource Drift Logic

%% Field type mismatched
drifted_field(Id, Name, CurrentType, TargetType) :-
    curr_field(Id, Name, CurrentType),
    target_field(Name, TargetType, _),
    CurrentType \= TargetType.

%% Rule script changed
drifted_rule(WorkflowId, RuleId, WorkflowName, RuleName, TargetScript) :-
    target_rule(WorkflowName, RuleName, _, TargetScript),
    curr_workflow(WorkflowId, WorkflowName, _),
    curr_rule(WorkflowId, RuleId, RuleName, _, CurrentScript),
    CurrentScript \= TargetScript.

%% Resource Deletion Logic (marked for removal in YAML)

%% Field marked for deletion exists in current state
deletable_field(FieldId, Name, Project) :-
    target_delete_field(Name, Project),
    curr_field(FieldId, Name, _).

%% Rule marked for deletion exists in current state
deletable_rule(WorkflowId, RuleId, WorkflowName, RuleName) :-
    target_delete_rule(WorkflowName, RuleName),
    curr_workflow(WorkflowId, WorkflowName, _),
    curr_rule(WorkflowId, RuleId, RuleName, _, _).

%% Workflow marked for deletion exists in current state  
deletable_workflow(WorkflowId, Name) :-
    target_delete_workflow(Name),
    curr_workflow(WorkflowId, Name, _).

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
action(attach_field(Name, Project)) :-
    target_field(Name, _, Project).
    % Ideally check if already attached, but we lack curr_project_field(Project, Field) fact yet.

%% Set field default value
action(set_field_default(Name, Value, Project)) :-
    (missing_field_default(Name, Value, Project) ;
     drifted_field_default(Name, _, Value, Project)).

%% 3. Workflows
%% Create missing workflow container
action(create_workflow(Name, Title)) :-
    missing_workflow(Name, Title).

%% Create missing rule
action(create_rule(WorkflowId, Type, Name, Script)) :-
    missing_rule(WorkflowName, Name, Type, Script),
    curr_workflow(WorkflowId, WorkflowName, _).

%% Update drifted rule
action(update_rule(WorkflowId, RuleId, Script)) :-
    drifted_rule(WorkflowId, RuleId, _, _, Script).

%% Attach workflow to project
action(attach_workflow(WorkflowId, ProjectId)) :-
    missing_attachment(WorkflowName, ProjectShortName),
    curr_workflow(WorkflowId, WorkflowName, _),
    curr_project(ProjectId, _, ProjectShortName).

%% 4. Delete Operations (state: absent in YAML)

%% Delete field from project (detach + optionally delete global)
action(detach_field(Name, ProjectId)) :-
    deletable_field(_, Name, ProjectShortName),
    curr_project(ProjectId, _, ProjectShortName).

%% Delete workflow rule
action(delete_rule(WorkflowId, RuleId)) :-
    deletable_rule(WorkflowId, RuleId, _, _).

%% Delete entire workflow (must delete rules first - see dependencies)
action(delete_workflow(WorkflowId)) :-
    deletable_workflow(WorkflowId, _).

%% =============================================================================
%% DEPENDENCY GRAPH
%% =============================================================================

%% Value addition depends on bundle creation
depends_on(add_bundle_value(B, _, _), ensure_bundle(B, _)).
depends_on(add_state_value(B, _, _), ensure_bundle(B, _)).

%% Field creation depends on bundle creation
depends_on(create_field(_, _, B), ensure_bundle(B, _)).

%% Field attachment depends on field creation
depends_on(attach_field(F, _), create_field(F, _, B)) :-
    field_uses_bundle(F, B).
depends_on(attach_field(F, _), create_field(F, _)) :-
    \+ field_uses_bundle(F, _).

%% Setting default depends on field being attached
depends_on(set_field_default(F, _, P), attach_field(F, P)).

%% Workflow dependencies
%% Use logic variable WfId so rule creation depends on the creation of *that specific* workflow
depends_on(create_rule(_, _, _, _), create_workflow(Name, _)) :-
    curr_workflow(_, Name, _). 

depends_on(create_rule(WorkflowName, _, _, _), create_workflow(WorkflowName, _)).
depends_on(attach_workflow(WorkflowName, _), create_workflow(WorkflowName, _)).
depends_on(attach_workflow(WorkflowName, _), create_rule(WorkflowName, _, _, _)).

%% Delete dependencies
%% Must delete rules before deleting the workflow
depends_on(delete_workflow(WfId), delete_rule(WfId, _)).

%% =============================================================================
%% TOPOLOGICAL SORT
%% =============================================================================

%% Collect all actions and sort by dependencies
%% Collect all actions and sort by dependencies
plan(OrderedActions) :-
    findall(A, action(A), UnsortedWithDups),
    list_to_set(UnsortedWithDups, Unsorted),
    topological_sort(Unsorted, OrderedActions).

%% Simple topological sort (Kahn's algorithm)
%% Simple topological sort (Kahn's algorithm)
topological_sort(Actions, Sorted) :-
    partition_by_deps(Actions, NoDeps, HasDeps, Actions),
    topo_helper(NoDeps, HasDeps, Sorted).

partition_by_deps([], [], [], _).
partition_by_deps([A|Rest], [A|NoDeps], HasDeps, AllActions) :-
    \+ (member(B, AllActions), depends_on(A, B)),
    partition_by_deps(Rest, NoDeps, HasDeps, AllActions).
partition_by_deps([A|Rest], NoDeps, [A|HasDeps], AllActions) :-
    member(B, AllActions), depends_on(A, B),
    partition_by_deps(Rest, NoDeps, HasDeps, AllActions).

topo_helper([], [], []).
topo_helper([], HasDeps, _) :- 
    HasDeps \= [], 
    writeln('ERROR: Cycle detected or logical error in topological sort.'),
    writeln('Remaining Actions:'), writeln(HasDeps),
    fail.
topo_helper([A|NoDeps], HasDeps, [A|SortedRest]) :-
    append(NoDeps, HasDeps, Context),
    remove_satisfied(A, HasDeps, Context, NewHasDeps, Freed),
    append(NoDeps, Freed, NewNoDeps),
    topo_helper(NewNoDeps, NewHasDeps, SortedRest).

remove_satisfied(_, [], _, [], []).

%% Case 1: A depends on Done. Check if A has any other Unfinished dependencies (in Context)
remove_satisfied(Done, [A|Rest], Context, NewRest, [A|Freed]) :-
    depends_on(A, Done),
    %% Check if A has ANY OTHER dependency that is IN THE CONTEXT (still pending)
    \+ (depends_on(A, Other), member(Other, Context)),
    remove_satisfied(Done, Rest, Context, NewRest, Freed).

%% Case 2: A doesn't depend on Done, OR A still has other Unfinished dependencies
remove_satisfied(Done, [A|Rest], Context, [A|NewRest], Freed) :-
    ( \+ depends_on(A, Done)
    ; (depends_on(A, Other), member(Other, Context))
    ),
    remove_satisfied(Done, Rest, Context, NewRest, Freed).

