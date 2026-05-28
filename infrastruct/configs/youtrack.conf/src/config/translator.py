"""
Translator from YAML config to Prolog facts.

Converts the Pydantic config models to Prolog facts that can be
asserted into the inference engine.
"""
from typing import Iterator

from .schema import (
    YouTrackConfig, ProjectConfig, FieldConfig, BundleValueConfig,
    WorkflowConfig, WorkflowRuleConfig, AgileBoardConfig, TagConfig, SavedQueryConfig,
    GlobalTimeTrackingConfig, ProjectTimeTrackingConfig, IssueLinkTypeConfig, ReportConfig
)


def escape_prolog_string(s: str) -> str:
    """Escape a string for use in Prolog."""
    # Must escape backslash first, then quotes
    if s is None:
        return ''
    return s.replace("\\", "\\\\").replace("'", "\\'").replace("\n", "\\n").replace("\r", "")


def config_to_prolog_facts(config: YouTrackConfig) -> str:
    """
    Convert a YouTrackConfig to a string of Prolog facts.
    
    Args:
        config: Parsed YouTrackConfig
        
    Returns:
        String containing Prolog facts, one per line
    """
    facts = list(_generate_facts(config))
    return '\n'.join(facts)


def _generate_facts(config: YouTrackConfig) -> Iterator[str]:
    """Generate Prolog facts from config."""
    
    # Global bundles
    if config.bundles:
        for bundle_name, values in config.bundles.items():
            for value in values:
                if isinstance(value, str):
                    yield f"target_bundle_value('{escape_prolog_string(bundle_name)}', '{escape_prolog_string(value)}')."
                elif isinstance(value, BundleValueConfig):
                    resolved = 'true' if value.resolved else 'false'
                    yield f"target_state_value('{escape_prolog_string(bundle_name)}', '{escape_prolog_string(value.name)}', {resolved})."
    
    # Global workflows
    if config.workflows:
        for workflow in config.workflows:
            yield from _generate_workflow_facts(workflow)
    
    # Global tags
    if config.tags:
        for tag in config.tags:
            name = escape_prolog_string(tag.name)
            color = escape_prolog_string(tag.color) if tag.color else 'null'
            untag = 'true' if tag.untag_on_resolve else 'false'
            visible = escape_prolog_string(tag.visible_to) if tag.visible_to else 'null'
            if tag.state == 'absent':
                yield f"target_delete_tag('{name}')."
            else:
                yield f"target_tag('{name}', '{color}', {untag}, '{visible}')."
    

    # Users
    if config.users:
        for user in config.users:
            login = escape_prolog_string(user.login)
            full_name = escape_prolog_string(user.full_name)
            email = escape_prolog_string(user.email)
            if user.state == 'absent':
                yield f"target_delete_user('{login}')."
            else:
                yield f"target_user('{login}', '{full_name}', '{email}')."

    # Roles
    if config.roles:
        for role in config.roles:
            name = escape_prolog_string(role.name)
            if role.state == 'absent':
                yield f"target_delete_role('{name}')."
            else:
                yield f"target_role('{name}')."
                for perm in role.permissions:
                    perm_name = escape_prolog_string(perm)
                    yield f"target_role_permission('{name}', '{perm_name}')."

    # Groups
    if config.groups:
        for group in config.groups:
            name = escape_prolog_string(group.name)
            if group.state == 'absent':
                yield f"target_delete_group('{name}')."
            else:
                yield f"target_group('{name}')."
                for u in group.users:
                    u_login = escape_prolog_string(u)
                    yield f"target_group_user('{name}', '{u_login}')."
                for r in group.roles:
                    r_name = escape_prolog_string(r)
                    yield f"target_group_role('{name}', '{r_name}')."

    # Saved queries
    if config.saved_queries:
        for sq in config.saved_queries:
            name = escape_prolog_string(sq.name)
            query = escape_prolog_string(sq.query)
            visible = escape_prolog_string(sq.visible_to) if sq.visible_to else 'null'
            if sq.state == 'absent':
                yield f"target_delete_saved_query('{name}')."
            else:
                yield f"target_saved_query('{name}', '{query}', '{visible}')."

    # Global Time Tracking
    if getattr(config, 'time_tracking', None):
        tt = config.time_tracking
        days = ", ".join(str(d) for d in tt.days_of_week)
        yield f"target_global_time_tracking({tt.first_day_of_week}, {tt.minutes_limit}, [{days}])."

    # Custom Issue Link Types
    if getattr(config, 'issue_link_types', None):
        for lt in config.issue_link_types:
            lt_name = escape_prolog_string(lt.name)
            source_to_target = escape_prolog_string(lt.source_to_target)
            target_to_source = escape_prolog_string(lt.target_to_source)
            directed = 'true' if lt.directed else 'false'
            aggregation = 'true' if lt.aggregation else 'false'
            if lt.state == 'absent':
                yield f"target_delete_issue_link_type('{lt_name}')."
            else:
                yield f"target_issue_link_type('{lt_name}', '{source_to_target}', '{target_to_source}', {directed}, {aggregation})."

    # Global Reports
    if getattr(config, 'reports', None):
        for rep in config.reports:
            yield from _generate_report_facts(rep)
    
    # Projects
    for project in config.projects:
        yield from _generate_project_facts(project)



def _generate_workflow_facts(workflow: WorkflowConfig, project_short_name: str = None) -> Iterator[str]:
    """Generate facts for a workflow."""
    name = escape_prolog_string(workflow.name)
    title = escape_prolog_string(workflow.title or workflow.name)
    attached = 'true' if workflow.attached else 'false'
    
    # Workflow definition (idempotent, title ignored for identity but used for create)
    if workflow.state == 'absent':
        # Mark workflow for deletion
        yield f"target_delete_workflow('{name}')."
        return  # No rules or attachments for deleted workflows
    
    yield f"target_workflow('{name}', '{title}', {attached})."
    
    # Rules
    for rule in workflow.rules:
        rule_name = escape_prolog_string(rule.name)
        if rule.state == 'absent':
            # Mark rule for deletion
            yield f"target_delete_rule('{name}', '{rule_name}')."
        else:
            rule_type = escape_prolog_string(rule.type)
            # Use script content (either inline or loaded from file)
            script = escape_prolog_string(rule.script)
            yield f"target_rule('{name}', '{rule_name}', '{rule_type}', '{script}')."
    
    # Attachment info is implicitly handled by `target_workflow(... true)` context,
    # but we need to link it to the project if specific.
    # Actually, attached=true in global workflow means ??? usually global workflows are just definitions.
    # Attached=true in PROJECT workflow means attached to THAT project.
    
    # Correction: The Prolog schema target_workflow has 3 args: Name, Title, Attached.
    # But attachment is a relationship between Workflow and Project.
    # So `target_workflow` just defines existence.
    # We probably need `target_workflow_attachment(WfName, Project)`.
    # Let's check core.pl:
    # missing_attachment(WorkflowName, ProjectShortName) :- target_workflow(WorkflowName, _, true), target_project(ProjectShortName, _).
    # Ah, the logic in core.pl assumes if `target_workflow(..., true)` exists AND `target_project` exists, it attaches?
    # That might be ambiguous if multiple projects exist.
    
    # Let's refine the translator logic for project-scoped workflows vs global.
    # If project_short_name is provided, we treat it as an attachment request.
    
    # Wait, my core.pl `missing_attachment` logic was:
    # missing_attachment(WorkflowName, ProjectShortName) :-
    #    target_workflow(WorkflowName, _, true),
    #    target_project(ProjectShortName, _), ...
    
    # This implies that `target_workflow` acts somewhat globally in Prolog.
    # But if I have Project A with Workflow X, and Project B with Workflow Y.
    # I yield `target_workflow('X', ...)` and `target_project('A', ...)`
    # And `target_workflow('Y', ...)` and `target_project('B', ...)`.
    # The rule `target_workflow(Name, _, true)` combined with `target_project(ShortName)` 
    # would perform cross product! That's a BUG in my core.pl logic logic for attachments.
    
    # FIX: We need explicit attachment facts.
    # Let's add `target_workflow_attachment(WfName, ProjectShortName)` to this fact generator
    # And I will need to update core.pl to use it.
    
    if project_short_name and workflow.attached:
        yield f"target_workflow_attachment('{name}', '{escape_prolog_string(project_short_name)}')."


def _generate_project_facts(project: ProjectConfig) -> Iterator[str]:
    """Generate facts for a single project."""
    short_name = escape_prolog_string(project.short_name)
    name = escape_prolog_string(project.name)
    
    # Project definition
    if project.leader:
        leader = escape_prolog_string(project.leader)
        yield f"target_project('{short_name}', '{name}', '{leader}')."
    else:
        yield f"target_project('{short_name}', '{name}')."
    
    # Fields
    for field in project.fields:
        yield from _generate_field_facts(field, short_name)

    # Workflows
    if project.workflows:
        for wf in project.workflows:
            yield from _generate_workflow_facts(wf, project_short_name=short_name)


    # Role Assignments
    for assignment in getattr(project, 'role_assignments', []):
        subject = escape_prolog_string(assignment.subject)
        a_type = escape_prolog_string(assignment.type)
        role = escape_prolog_string(assignment.role)
        if assignment.state == 'absent':
            yield f"target_delete_project_role('{short_name}', '{subject}', '{a_type}', '{role}')."
        else:
            yield f"target_project_role('{short_name}', '{subject}', '{a_type}', '{role}')."

    # Agile Boards
    if project.boards:
        for board in project.boards:
            yield from _generate_agile_board_facts(board, main_project=short_name)

    # Project Time Tracking
    if getattr(project, 'time_tracking', None):
        pt = project.time_tracking
        enabled_val = 'true' if pt.enabled else 'false'
        est_field_val = escape_prolog_string(pt.estimation_field) if pt.estimation_field else 'null'
        yield f"target_project_time_tracking('{short_name}', {enabled_val}, '{est_field_val}')."
        for wit in pt.work_item_types:
            yield f"target_project_work_item_type('{short_name}', '{escape_prolog_string(wit)}')."

    # Project Reports
    if getattr(project, 'reports', None):
        for rep in project.reports:
            yield from _generate_report_facts(rep, project_short_name=short_name)

    # Project Seeds
    if getattr(project, 'seeds', None):
        for seed in project.seeds:
            sum_val = escape_prolog_string(seed.summary)
            desc_val = escape_prolog_string(seed.description)
            type_val = escape_prolog_string(seed.type)
            prio_val = escape_prolog_string(seed.priority)
            yield f"target_issue_seed('{short_name}', '{sum_val}', '{desc_val}', '{type_val}', '{prio_val}')."



def _generate_field_facts(field: FieldConfig, project: str) -> Iterator[str]:
    """Generate facts for a custom field."""
    name = escape_prolog_string(field.name)
    field_type = escape_prolog_string(field.type)
    
    # Handle deletion
    if field.state == 'absent':
        yield f"target_delete_field('{name}', '{project}')."
        return  # No other facts needed for deletion
    
    # Field definition
    yield f"target_field('{name}', '{field_type}', '{project}')."
    
    # Default Value
    if field.default_value:
        default_val = escape_prolog_string(field.default_value)
        yield f"target_field_default('{name}', '{default_val}', '{project}')."
    
    # Bundle association
    if field.bundle:
        bundle = escape_prolog_string(field.bundle)
        yield f"field_uses_bundle('{name}', '{bundle}')."
        
        # Bundle values (if defined inline)
        if field.values:
            for value in field.values:
                if isinstance(value, str):
                    yield f"target_bundle_value('{bundle}', '{escape_prolog_string(value)}')."
                elif isinstance(value, BundleValueConfig):
                    resolved = 'true' if value.resolved else 'false'
                    yield f"target_state_value('{bundle}', '{escape_prolog_string(value.name)}', {resolved})."
    
    # Can be empty setting
    if not field.can_be_empty:
        yield f"field_required('{name}', '{project}')."


def _generate_agile_board_facts(board: AgileBoardConfig, main_project: str) -> Iterator[str]:
    """Generate Prolog facts for an Agile Board."""
    name = escape_prolog_string(board.name)
    
    if board.state == 'absent':
        yield f"target_delete_board('{name}')."
        return

    col_field = escape_prolog_string(board.column_field)
    main_proj = escape_prolog_string(main_project)
    
    yield f"target_board('{name}', '{col_field}', '{main_proj}')."
    
    # Projects included in the board
    projects = board.projects if board.projects else [main_project]
    if main_project not in projects:
        projects.append(main_project)
    for proj in set(projects):
        p_name = escape_prolog_string(proj)
        yield f"target_board_project('{name}', '{p_name}')."
    
    # Sprint settings - sprints.enabled = False means disableSprints = True
    disable_sprints = 'true' if not board.sprints.enabled else 'false'
    yield f"target_board_sprints('{name}', {disable_sprints})."
    
    # Visibility - groups that can view the board
    for group in board.visible_to:
        g_name = escape_prolog_string(group)
        yield f"target_board_visibility('{name}', '{g_name}')."
    
    # Columns - explicit column names (supports both string and ColumnConfig)
    for col in board.columns:
        if isinstance(col, str):
            col_name = escape_prolog_string(col)
            yield f"target_board_column('{name}', '{col_name}')."
        else:
            # ColumnConfig object with WIP limits
            col_name = escape_prolog_string(col.name)
            yield f"target_board_column('{name}', '{col_name}')."
            if col.min_wip is not None or col.max_wip is not None:
                min_val = col.min_wip if col.min_wip is not None else 'null'
                max_val = col.max_wip if col.max_wip is not None else 'null'
                yield f"target_board_column_wip('{name}', '{col_name}', {min_val}, {max_val})."
        
    # Swimlane settings
    if board.swimlane_field:
        sl_field = escape_prolog_string(board.swimlane_field)
        yield f"target_board_swimlane('{name}', '{sl_field}')."

    # Color coding
    if board.color_coding:
        mode = board.color_coding.mode
        field = escape_prolog_string(board.color_coding.field) if board.color_coding.field else 'null'
        yield f"target_board_color_coding('{name}', '{mode}', '{field}')."

    # Estimation fields
    if board.estimation_field:
        est_field = escape_prolog_string(board.estimation_field)
        yield f"target_board_estimation('{name}', '{est_field}')."
    if board.original_estimation_field:
        orig_est = escape_prolog_string(board.original_estimation_field)
        yield f"target_board_original_estimation('{name}', '{orig_est}')."
    
    # Orphan settings
    orphans_top = 'true' if board.orphans_at_top else 'false'
    yield f"target_board_orphans_at_top('{name}', {orphans_top})."
    hide_orphans = 'true' if board.hide_orphans_swimlane else 'false'
    yield f"target_board_hide_orphans('{name}', {hide_orphans})."
    
    # Backlog configuration
    if board.backlog_query:
        query = escape_prolog_string(board.backlog_query)
        yield f"target_board_backlog('{name}', '{query}')."


def _generate_report_facts(report: ReportConfig, project_short_name: str = None) -> Iterator[str]:
    """Generate facts for a report."""
    name = escape_prolog_string(report.name)
    if report.state == 'absent':
        yield f"target_delete_report('{name}')."
        return

    r_type = escape_prolog_string(report.type)
    date_range = escape_prolog_string(report.date_range)
    est_field = escape_prolog_string(report.estimation_field) if report.estimation_field else 'null'
    state_field = escape_prolog_string(report.field) if report.field else 'null'

    # Collect project list
    projects = list(report.projects)
    if project_short_name and project_short_name not in projects:
        projects.append(project_short_name)
    
    projs_str = ", ".join(f"'{escape_prolog_string(p)}'" for p in projects)
    yield f"target_report('{name}', '{r_type}', '', '{date_range}', '{est_field}', '{state_field}', [{projs_str}])."

