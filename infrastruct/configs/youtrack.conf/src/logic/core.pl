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
:- dynamic curr_board/3.                %% curr_board(Id, Name, ColumnFieldId)
:- dynamic curr_project_field/2.        %% curr_project_field(ProjectShortName, FieldName) - field attached to project
:- dynamic curr_field_default/3.        %% curr_field_default(FieldName, DefaultValueName, ProjectShortName)

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
:- dynamic target_board/3.              %% target_board(Name, ColumnFieldName, MainProject)
:- dynamic target_board_project/2.      %% target_board_project(BoardName, ProjectShortName)
:- dynamic target_board_sprints/2.      %% target_board_sprints(BoardName, DisableSprints)
:- dynamic target_board_visibility/2.   %% target_board_visibility(BoardName, GroupName)
:- dynamic target_board_column/2.       %% target_board_column(BoardName, ColumnName)
:- dynamic target_board_swimlane/2.   %% target_board_swimlane(BoardName, FieldName)
:- dynamic curr_board_swimlane/2.
:- dynamic target_board_color_coding/3.
:- dynamic curr_board_color_coding/3.
:- dynamic target_board_column_wip/4.  %% target_board_column_wip(BoardName, ColumnName, Min, Max)
:- dynamic curr_board_column_wip/4.    %% curr_board_column_wip(BoardId, ColumnName, Min, Max)
:- dynamic target_board_estimation/2.  %% target_board_estimation(BoardName, FieldName)
:- dynamic curr_board_estimation/2.    %% curr_board_estimation(BoardId, FieldName)
:- dynamic target_board_original_estimation/2.
:- dynamic curr_board_original_estimation/2.
:- dynamic target_board_orphans_at_top/2.  %% target_board_orphans_at_top(BoardName, Bool)
:- dynamic curr_board_orphans_at_top/2.
:- dynamic target_board_hide_orphans/2.
:- dynamic curr_board_hide_orphans/2.
:- dynamic target_board_backlog/2.    %% target_board_backlog(BoardName, Query)
:- dynamic curr_board_backlog/2.      %% curr_board_backlog(BoardId, Query)

%% Tags
:- dynamic target_tag/4.              %% target_tag(Name, Color, UntagOnResolve, VisibleTo)
:- dynamic curr_tag/4.                %% curr_tag(Id, Name, UntagOnResolve, VisibleTo)
:- dynamic target_delete_tag/1.       %% target_delete_tag(Name)

%% Saved Queries
:- dynamic target_saved_query/3.      %% target_saved_query(Name, Query, VisibleTo)
:- dynamic curr_saved_query/3.        %% curr_saved_query(Id, Name, Query)
:- dynamic target_delete_saved_query/1. %% target_delete_saved_query(Name)

%% Time Tracking
:- dynamic target_global_time_tracking/3. %% target_global_time_tracking(FirstDayOfWeek, MinutesLimit, DaysOfWeekList)
:- dynamic curr_global_time_tracking/3.   %% curr_global_time_tracking(FirstDayOfWeek, MinutesLimit, DaysOfWeekList)
:- dynamic target_project_time_tracking/3. %% target_project_time_tracking(ProjShort, Enabled, EstField)
:- dynamic curr_project_time_tracking/3.   %% curr_project_time_tracking(ProjShort, Enabled, EstField)
:- dynamic target_project_work_item_type/2. %% target_project_work_item_type(ProjShort, Name)
:- dynamic curr_project_work_item_type/2.   %% curr_project_work_item_type(ProjShort, Name)

%% Custom Issue Link Types
:- dynamic target_issue_link_type/5.      %% target_issue_link_type(Name, Outward, Inward, Directed, Aggregation)
:- dynamic curr_issue_link_type/7.        %% curr_issue_link_type(Id, Name, Outward, Inward, Directed, Aggregation, ReadOnly)
:- dynamic target_delete_issue_link_type/1. %% target_delete_issue_link_type(Name)

%% Reports
:- dynamic target_report/7.               %% target_report(Name, Type, Query, DateRange, EstField, StateField, ProjectsList)
:- dynamic curr_report/8.                 %% curr_report(Id, Name, Type, Query, DateRange, EstField, StateField, ProjectsList)
:- dynamic target_delete_report/1.        %% target_delete_report(Name)


:- dynamic bundle_value/3.
:- dynamic field_uses_bundle/2.
:- dynamic field_required/2.

%% User Access Management
:- dynamic curr_user/3.
:- dynamic target_user/3.
:- dynamic target_delete_user/1.

:- dynamic curr_group/1.
:- dynamic target_group/1.
:- dynamic target_delete_group/1.

:- dynamic curr_group_user/2.
:- dynamic target_group_user/2.

:- dynamic curr_group_role/2.
:- dynamic target_group_role/2.

:- dynamic curr_role/1.
:- dynamic target_role/1.
:- dynamic target_delete_role/1.

:- dynamic curr_role_permission/2.
:- dynamic target_role_permission/2.

:- dynamic curr_project_role/4.
:- dynamic target_project_role/4.
:- dynamic target_delete_project_role/4.

%% Delete targets (from YAML state: absent)
:- dynamic target_delete_field/2.       %% target_delete_field(Name, Project)
:- dynamic target_delete_rule/2.        %% target_delete_rule(WorkflowName, RuleName)
:- dynamic target_delete_workflow/1.    %% target_delete_workflow(WorkflowName)
:- dynamic target_delete_board/1.       %% target_delete_board(BoardName)

%% =============================================================================
%% DIFF LOGIC - Detect missing/drifted resources
%% =============================================================================

%% Resource Missing Logic

%% Field missing
missing_field(Name, Type, Project) :-
    target_field(Name, Type, Project),
    \+ curr_field(_, Name, Type).

%% ... (omitted actions)

%% Plan Action: Update Board
action(update_agile_board(Name, Id)) :-
    drifted_board(Name, Id).

%% Plan Action: Delete Board
action(delete_agile_board(Id)) :-
    target_delete_board(Name),
    curr_board(Id, Name, _).


%% Field default missing or drifted (use field name and project short_name)
missing_field_default(Name, DefaultValue, Project) :-
    target_field_default(Name, DefaultValue, Project),
    curr_project_field(Project, Name),
    \+ curr_field_default(Name, _, Project).

drifted_field_default(Name, CurrentDefault, TargetDefault, Project) :-
    target_field_default(Name, TargetDefault, Project),
    curr_field_default(Name, CurrentDefault, Project),
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


%% =============================================================================
%% USER ACCESS MANAGEMENT LOGIC
%% =============================================================================

%% ------------------- Users -------------------
%% Create User
%% We need a safety check: max 10 users overall.
total_curr_users(Count) :-
    findall(U, curr_user(U, _, _), L),
    length(L, Count).

total_target_users(Count) :-
    findall(U, target_user(U, _, _), L),
    length(L, Count).

missing_user(Login, FullName, Email) :-
    target_user(Login, FullName, Email),
    \+ curr_user(Login, _, _).

%% Action: Create user (only if not exceeding max limit)
action(create_user(Login, FullName, Email)) :-
    missing_user(Login, FullName, Email),
    total_curr_users(CurrC),
    total_target_users(TargetC),
    % Calculate net count roughly... Wait, better to just check total_target_users
    % since declarative implies target state is truth.
    TargetC =< 10.

action(error_max_users_exceeded(TargetC)) :-
    missing_user(_, _, _),
    total_target_users(TargetC),
    TargetC > 10.

%% Update User
drifted_user(Login, FullName, Email) :-
    target_user(Login, FullName, Email),
    curr_user(Login, CurrFullName, CurrEmail),
    (FullName \= CurrFullName ; Email \= CurrEmail).

action(update_user(Login, FullName, Email)) :-
    drifted_user(Login, FullName, Email).

%% Delete User
deletable_user(Login) :-
    target_delete_user(Login),
    curr_user(Login, _, _).

action(delete_user(Login)) :-
    deletable_user(Login).

%% ------------------- Roles -------------------
%% Create Role
missing_role(Name) :-
    target_role(Name),
    \+ curr_role(Name).

action(create_role(Name)) :-
    missing_role(Name).

%% Update Role (Permissions Drift)
%% Missing permissions
missing_role_permission(Role, Perm) :-
    target_role_permission(Role, Perm),
    curr_role(Role),
    \+ curr_role_permission(Role, Perm).

%% Extraneous permissions
extraneous_role_permission(Role, Perm) :-
    curr_role_permission(Role, Perm),
    target_role(Role),
    \+ target_role_permission(Role, Perm).

action(add_role_permission(Role, Perm)) :-
    missing_role_permission(Role, Perm).

action(remove_role_permission(Role, Perm)) :-
    extraneous_role_permission(Role, Perm).

%% Delete Role
deletable_role(Name) :-
    target_delete_role(Name),
    curr_role(Name).

action(delete_role(Name)) :-
    deletable_role(Name).

%% ------------------- Groups -------------------
%% Create Group
missing_group(Name) :-
    target_group(Name),
    \+ curr_group(Name).

action(create_group(Name)) :-
    missing_group(Name).

%% Group Users
missing_group_user(Group, User) :-
    target_group_user(Group, User),
    curr_group(Group),
    curr_user(User, _, _),
    \+ curr_group_user(Group, User).

extraneous_group_user(Group, User) :-
    curr_group_user(Group, User),
    target_group(Group),
    \+ target_group_user(Group, User).

action(add_user_to_group(Group, User)) :-
    missing_group_user(Group, User).

action(remove_user_from_group(Group, User)) :-
    extraneous_group_user(Group, User).

%% Group Roles (Global)
missing_group_role(Group, Role) :-
    target_group_role(Group, Role),
    curr_group(Group),
    curr_role(Role),
    \+ curr_group_role(Group, Role).

extraneous_group_role(Group, Role) :-
    curr_group_role(Group, Role),
    target_group(Group),
    \+ target_group_role(Group, Role).

action(add_role_to_group(Group, Role)) :-
    missing_group_role(Group, Role).

action(remove_role_from_group(Group, Role)) :-
    extraneous_group_role(Group, Role).

%% Delete Group
deletable_group(Name) :-
    target_delete_group(Name),
    curr_group(Name).

action(delete_group(Name)) :-
    deletable_group(Name).

%% ------------------- Project Role Assignments -------------------
missing_project_role(Project, Subject, Type, Role) :-
    target_project_role(Project, Subject, Type, Role),
    curr_project(ProjectId, _, Project),
    \+ curr_project_role(Project, Subject, Type, Role).

action(grant_project_role(Project, Subject, Type, Role)) :-
    missing_project_role(Project, Subject, Type, Role).

deletable_project_role(Project, Subject, Type, Role) :-
    target_delete_project_role(Project, Subject, Type, Role),
    curr_project_role(Project, Subject, Type, Role).

extraneous_project_role(Project, Subject, Type, Role) :-
    curr_project_role(Project, Subject, Type, Role),
    target_project_role(_, _, _, _),
    %% If we manage ANY role in this project we revoke unmanaged ones? 
    %% Or do we strictly do declarative exact match per explicit definition?
    %% Usually list implies exact match. If target_project_role isn't there, remove it.
    %% But wait, what if another system manages other roles? 
    %% For now let's stick to declarative `state: absent` logic for unmanaged, 
    %% plus maybe strict drift if the config is meant to be exhaustive.
    %% But our schema only has `target_delete_project_role`, so we just use that.
    fail. 

%% We use explicit delete for now
action(revoke_project_role(Project, Subject, Type, Role)) :-
    deletable_project_role(Project, Subject, Type, Role).


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

%% Attach field to project if not already attached
action(attach_field(Name, Project)) :-
    target_field(Name, _, Project),
    \+ curr_project_field(Project, Name).

%% Set field default value
action(set_field_default(Name, Value, Project)) :-
    (missing_field_default(Name, Value, Project) ;
     drifted_field_default(Name, _, Value, Project)).

%% 4. Agile Boards
%% Board missing (create)
missing_board(Name, MainProject, ColField) :-
    target_board(Name, ColField, MainProject),
    \+ curr_board(_, Name, _).

%% Board drifted (update)
drifted_board(Name, Id) :-
    target_board(Name, _, _),
    curr_board(Id, Name, _),
    (
        drifted_board_sprints(Name, Id);
        drifted_board_projects(Name, Id);
        drifted_board_visibility(Name, Id);
        drifted_board_columns(Name, Id);
        drifted_board_swimlane(Name, Id);
        drifted_board_color_coding(Name, Id);
        drifted_board_column_wip(Name, Id);
        drifted_board_estimation(Name, Id);
        drifted_board_orphans(Name, Id);
        drifted_board_backlog(Name, Id)
    ).

drifted_board_projects(Name, Id) :-
    ( target_board_project(Name, P), \+ curr_board_project(Id, P) ) ;
    ( curr_board_project(Id, P), \+ target_board_project(Name, P) ).

drifted_board_sprints(Name, Id) :-
    target_board_sprints(Name, TargetVal),
    curr_board_sprints(Id, CurrVal),
    TargetVal \= CurrVal.
    
drifted_board_visibility(Name, Id) :-
    target_board_visibility(Name, Group),
    \+ curr_board_visibility(Id, Group).
    
drifted_board_columns(Name, Id) :-
    target_board_column(Name, Col),
    \+ curr_board_column(Id, Col).

drifted_board_swimlane(Name, Id) :-
    target_board_swimlane(Name, TargetField),
    \+ curr_board_swimlane(Id, TargetField).

drifted_board_color_coding(Name, Id) :-
    target_board_color_coding(Name, Mode, Field),
    \+ curr_board_color_coding(Id, Mode, Field).

drifted_board_column_wip(Name, Id) :-
    target_board_column_wip(Name, ColName, TargetMin, TargetMax),
    \+ curr_board_column_wip(Id, ColName, TargetMin, TargetMax).

drifted_board_estimation(Name, Id) :-
    ( target_board_estimation(Name, F), \+ curr_board_estimation(Id, F) );
    ( target_board_original_estimation(Name, F), \+ curr_board_original_estimation(Id, F) ).

drifted_board_orphans(Name, Id) :-
    ( target_board_orphans_at_top(Name, V), \+ curr_board_orphans_at_top(Id, V) );
    ( target_board_hide_orphans(Name, V), \+ curr_board_hide_orphans(Id, V) ).

drifted_board_backlog(Name, Id) :-
    target_board_backlog(Name, Query),
    \+ curr_board_backlog(Id, Query).

%% Plan Action: Create Board
action(create_agile_board(Name, MainProject, ColField)) :-
    missing_board(Name, MainProject, ColField).

%% Plan Action: Update Board
action(update_agile_board(Name, Id)) :-
    drifted_board(Name, Id).

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

%% 5. Tags

%% Create missing tag
missing_tag(Name, Color, UntagOnResolve, VisibleTo) :-
    target_tag(Name, Color, UntagOnResolve, VisibleTo),
    \+ curr_tag(_, Name, _, _).

action(create_tag(Name, Color, UntagOnResolve, VisibleTo)) :-
    missing_tag(Name, Color, UntagOnResolve, VisibleTo).

%% Update drifted tag
drifted_tag(Id, Name, Color, UntagOnResolve, VisibleTo) :-
    target_tag(Name, Color, UntagOnResolve, VisibleTo),
    curr_tag(Id, Name, CurrUntag, _),
    (atom_string(UntagOnResolve, UntagStr), atom_string(CurrUntag, CurrUntagStr), UntagStr \= CurrUntagStr ; true).

action(update_tag(Id, Name, Color, UntagOnResolve, VisibleTo)) :-
    drifted_tag(Id, Name, Color, UntagOnResolve, VisibleTo).

%% Delete tag
deletable_tag(Id, Name) :-
    target_delete_tag(Name),
    curr_tag(Id, Name, _, _).

action(delete_tag(Id)) :-
    deletable_tag(Id, _).

%% 6. Saved Queries

%% Create missing saved query
missing_saved_query(Name, Query, VisibleTo) :-
    target_saved_query(Name, Query, VisibleTo),
    \+ curr_saved_query(_, Name, _).

action(create_saved_query(Name, Query, VisibleTo)) :-
    missing_saved_query(Name, Query, VisibleTo).

%% Update drifted saved query
drifted_saved_query(Id, Name, Query, VisibleTo) :-
    target_saved_query(Name, Query, VisibleTo),
    curr_saved_query(Id, Name, CurrQuery),
    Query \= CurrQuery.

action(update_saved_query(Id, Name, Query)) :-
    target_saved_query(Name, Query, _),
    curr_saved_query(Id, Name, CurrQuery),
    Query \= CurrQuery.

%% Delete saved query
deletable_saved_query(Id, Name) :-
    target_delete_saved_query(Name),
    curr_saved_query(Id, Name, _).

action(delete_saved_query(Id)) :-
    deletable_saved_query(Id, _).

%% 7. Time Tracking Settings

missing_global_time_tracking(FirstDay, Limit, Days) :-
    target_global_time_tracking(FirstDay, Limit, Days),
    \+ curr_global_time_tracking(_, _, _).

drifted_global_time_tracking(FirstDay, Limit, Days) :-
    target_global_time_tracking(FirstDay, Limit, Days),
    curr_global_time_tracking(CurrFirstDay, CurrLimit, CurrDays),
    (FirstDay \= CurrFirstDay ; Limit \= CurrLimit ; Days \= CurrDays).

action(set_global_time_tracking(FirstDay, Limit, Days)) :-
    missing_global_time_tracking(FirstDay, Limit, Days) ;
    drifted_global_time_tracking(FirstDay, Limit, Days).

missing_project_time_tracking(Project, Enabled, EstField) :-
    target_project_time_tracking(Project, Enabled, EstField),
    curr_project(_, _, Project),
    \+ curr_project_time_tracking(Project, _, _).

drifted_project_time_tracking(Project, Enabled, EstField) :-
    target_project_time_tracking(Project, Enabled, EstField),
    curr_project_time_tracking(Project, CurrEnabled, CurrEstField),
    (Enabled \= CurrEnabled ; EstField \= CurrEstField).

action(set_project_time_tracking(Project, Enabled, EstField)) :-
    missing_project_time_tracking(Project, Enabled, EstField) ;
    drifted_project_time_tracking(Project, Enabled, EstField).

missing_work_item_type(Project, Name) :-
    target_project_work_item_type(Project, Name),
    curr_project(_, _, Project),
    \+ curr_project_work_item_type(Project, Name).

action(create_work_item_type(Project, Name)) :-
    missing_work_item_type(Project, Name).

%% 8. Custom Issue Link Types

missing_issue_link_type(Name, Outward, Inward, Directed, Aggregation) :-
    target_issue_link_type(Name, Outward, Inward, Directed, Aggregation),
    \+ curr_issue_link_type(_, Name, _, _, _, _, _).

drifted_issue_link_type(Id, Name, Outward, Inward, Directed, Aggregation) :-
    target_issue_link_type(Name, Outward, Inward, Directed, Aggregation),
    curr_issue_link_type(Id, Name, CurrOutward, CurrInward, CurrDirected, CurrAggregation, false),
    (Outward \= CurrOutward ; Inward \= CurrInward ; Directed \= CurrDirected ; Aggregation \= CurrAggregation).

action(create_issue_link_type(Name, Outward, Inward, Directed, Aggregation)) :-
    missing_issue_link_type(Name, Outward, Inward, Directed, Aggregation).

action(update_issue_link_type(Id, Name, Outward, Inward, Directed, Aggregation)) :-
    drifted_issue_link_type(Id, Name, Outward, Inward, Directed, Aggregation).

action(delete_issue_link_type(Id)) :-
    target_delete_issue_link_type(Name),
    curr_issue_link_type(Id, Name, _, _, _, _, false).

%% 9. Reports

report_est_match(Target, Curr) :- Target = 'null', (Curr = '' ; Curr = 'null'), !.
report_est_match(Target, Target).

report_state_match(Target, Curr) :- Target = 'null', (Curr = '' ; Curr = 'null'), !.
report_state_match(Target, Target).

missing_report(Name, Type, Query, Range, EstField, StateField, Projects) :-
    target_report(Name, Type, Query, Range, EstField, StateField, Projects),
    \+ curr_report(_, Name, _, _, _, _, _, _).

drifted_report(Id, Name, Type, Query, Range, EstField, StateField, Projects) :-
    target_report(Name, Type, Query, Range, EstField, StateField, Projects),
    curr_report(Id, Name, CurrType, CurrQuery, CurrRange, CurrEstField, CurrStateField, CurrProjects),
    (
        Type \= CurrType ;
        Query \= CurrQuery ;
        Range \= CurrRange ;
        Projects \= CurrProjects ;
        \+ report_est_match(EstField, CurrEstField) ;
        \+ report_state_match(StateField, CurrStateField)
    ).

action(create_report(Name, Type, Query, Range, EstField, StateField, Projects)) :-
    missing_report(Name, Type, Query, Range, EstField, StateField, Projects).

action(update_report(Id, Name, Type, Query, Range, EstField, StateField, Projects)) :-
    drifted_report(Id, Name, Type, Query, Range, EstField, StateField, Projects).

action(delete_report(Id)) :-
    target_delete_report(Name),
    curr_report(Id, Name, _, _, _, _, _, _).


%% =============================================================================
%% DEPENDENCY GRAPH
%% =============================================================================


%% User Access Management Dependencies
depends_on(add_user_to_group(_, U), create_user(U, _, _)).
depends_on(add_user_to_group(G, _), create_group(G)).

depends_on(add_role_to_group(_, R), create_role(R)).
depends_on(add_role_to_group(G, _), create_group(G)).

depends_on(add_role_permission(R, _), create_role(R)).

depends_on(grant_project_role(_, S, 'user', _), create_user(S, _, _)).
depends_on(grant_project_role(_, S, 'group', _), create_group(S)).
depends_on(grant_project_role(_, _, _, R), create_role(R)).

depends_on(delete_group(G), remove_user_from_group(G, _)).
depends_on(delete_role(R), remove_role_from_group(_, R)).
depends_on(delete_user(U), remove_user_from_group(_, U)).

%% Time Tracking & Work Item Dependencies
depends_on(set_project_time_tracking(Proj, _, _), create_project(Proj, _)).
depends_on(create_work_item_type(Proj, _), create_project(Proj, _)).
depends_on(create_work_item_type(Proj, _), set_project_time_tracking(Proj, _, _)).

%% Report Dependencies
depends_on(create_report(_, _, _, _, _, _, Projs), create_project(P, _)) :- member(P, Projs).


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

%% Agile Board Dependencies
%% Board creation needs the Main Project to exist
depends_on(create_agile_board(_, MainProj, _), create_project(MainProj, _)).
%% Board creation needs the Column Field to be attached to Main Project
depends_on(create_agile_board(_, MainProj, ColField), attach_field(ColField, MainProj)).

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

