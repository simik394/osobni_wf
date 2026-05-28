"""
Prolog inference engine using Janus.

This module bridges Python and SWI-Prolog to run the IaC diff logic.
"""
import logging
from pathlib import Path
from typing import Optional

logger = logging.getLogger(__name__)

# Try to import janus, but allow graceful fallback for testing
try:
    import janus_swi as janus
    JANUS_AVAILABLE = True
except Exception as e:
    import sys
    print(f"Janus import failed: {e}", file=sys.stderr)
    JANUS_AVAILABLE = False
    logger.warning(f"janus-swi not available: {e}")


class PrologInferenceEngine:
    """
    Prolog inference engine for YouTrack IaC.
    
    Uses Janus to assert facts and run diff/plan logic.
    """
    
    def __init__(self, rules_path: Optional[Path] = None):
        """
        Initialize the inference engine.
        
        Args:
            rules_path: Path to core.pl rules file. If None, uses default.
        """
        if not JANUS_AVAILABLE:
            raise RuntimeError("janus-swi is not installed. Run: pip install janus-swi")
        
        self.rules_path = rules_path or Path(__file__).parent.parent / "logic" / "core.pl"
        self._initialized = False
    
    def initialize(self) -> None:
        """Load the Prolog rules file."""
        if self._initialized:
            return
        
        # Consult the core rules
        rules_str = str(self.rules_path.absolute())
        janus.consult(rules_str)
        self._initialized = True
        logger.info(f"Loaded Prolog rules from {self.rules_path}")
    
    def clear_facts(self) -> None:
        """Clear all dynamic facts to prepare for new inference."""
        self.initialize()
        
        # Retract all dynamic facts
        janus.query_once("retractall(curr_field(_, _, _))")
        janus.query_once("retractall(curr_project(_, _, _))")
        janus.query_once("retractall(curr_bundle(_, _, _))")
        janus.query_once("retractall(bundle_value(_, _, _))")
        janus.query_once("retractall(target_field(_, _, _))")
        janus.query_once("retractall(target_project(_, _, _))")
        janus.query_once("retractall(target_bundle_value(_, _))")
        janus.query_once("retractall(target_state_value(_, _, _))")
        janus.query_once("retractall(target_state_value(_, _, _))")
        janus.query_once("retractall(target_field_default(_, _, _))")
        janus.query_once("retractall(field_uses_bundle(_, _))")
        janus.query_once("retractall(field_required(_, _))")
        
        # Workflow facts
        janus.query_once("retractall(curr_workflow(_, _, _))")
        janus.query_once("retractall(curr_rule(_, _, _, _, _))")
        janus.query_once("retractall(curr_workflow_usage(_, _, _))")
        janus.query_once("retractall(target_workflow(_, _, _))")
        
        # Board facts
        janus.query_once("retractall(curr_board(_, _, _))")
        janus.query_once("retractall(target_board(_, _, _))")
        janus.query_once("retractall(target_board_project(_, _))")
        janus.query_once("retractall(target_board_sprints(_, _))")
        janus.query_once("retractall(target_board_visibility(_, _))")
        janus.query_once("retractall(target_board_column(_, _))")
        
        # Tags and queries
        janus.query_once("retractall(curr_tag(_, _, _, _))")
        janus.query_once("retractall(target_tag(_, _, _, _))")
        janus.query_once("retractall(curr_saved_query(_, _, _))")
        janus.query_once("retractall(target_saved_query(_, _, _))")
        
        # UAM facts
        for fact in [
            'curr_user(_, _, _)', 'target_user(_, _, _)', 'target_delete_user(_)',
            'curr_group(_)', 'target_group(_)', 'target_delete_group(_)',
            'curr_group_user(_, _)', 'target_group_user(_, _)',
            'curr_group_role(_, _)', 'target_group_role(_, _)',
            'curr_role(_)', 'target_role(_)', 'target_delete_role(_)',
            'curr_role_permission(_, _)', 'target_role_permission(_, _)',
            'curr_project_role(_, _, _, _)', 'target_project_role(_, _, _, _)', 'target_delete_project_role(_, _, _, _)'
        ]:
            janus.query_once(f"retractall({fact})")
        
        # Time Tracking, Custom Issue Link Types, and Reports facts
        for fact in [
            'target_global_time_tracking(_, _, _)', 'curr_global_time_tracking(_, _, _)',
            'target_project_time_tracking(_, _, _)', 'curr_project_time_tracking(_, _, _)',
            'target_project_work_item_type(_, _)', 'curr_project_work_item_type(_, _)',
            'target_issue_link_type(_, _, _, _, _)', 'curr_issue_link_type(_, _, _, _, _, _)', 'target_delete_issue_link_type(_)',
            'target_report(_, _, _, _, _, _, _)', 'curr_report(_, _, _, _, _, _, _, _)', 'target_delete_report(_)'
        ]:
            janus.query_once(f"retractall({fact})")

        janus.query_once("retractall(curr_workflow_usage(_, _, _))")
        janus.query_once("retractall(curr_field_default(_, _, _))")
        janus.query_once("retractall(target_workflow(_, _, _))")
        janus.query_once("retractall(target_rule(_, _, _, _))")
        janus.query_once("retractall(target_workflow_attachment(_, _))")
        
        # Delete target facts (state: absent in YAML)
        janus.query_once("retractall(target_delete_field(_, _))")
        janus.query_once("retractall(target_delete_rule(_, _))")
        janus.query_once("retractall(target_delete_field(_, _))")
        janus.query_once("retractall(target_delete_rule(_, _))")
        janus.query_once("retractall(target_delete_workflow(_))")
        
        # Agile Boards
        janus.query_once("retractall(target_board(_, _, _))")
        janus.query_once("retractall(target_board_project(_, _))")
        janus.query_once("retractall(curr_board(_, _, _))")
        janus.query_once("retractall(curr_project_field(_, _))")
        
        logger.debug("Cleared all dynamic facts")
    
    def assert_current_state(self, fields: list[dict], bundles: list[dict],
                             projects: list[dict] = None, workflows: list[dict] = None,
                             project_fields: dict[str, list[dict]] = None,
                             agiles: list[dict] = None,
                             tags: list[dict] = None,
                             saved_queries: list[dict] = None,
                             users: list[dict] = None,
                             groups: list[dict] = None,
                             roles: list[dict] = None,
                             project_roles: dict[str, list[dict]] = None,
                             global_time_tracking: dict = None,
                             project_time_tracking: dict[str, dict] = None,
                             issue_link_types: list[dict] = None,
                             reports: list[dict] = None) -> None:
        """
        Assert current YouTrack state as Prolog facts.
        
        Args:
            fields: Custom fields from YouTrack API
            bundles: Bundles from YouTrack API
            projects: Projects from YouTrack API
            workflows: Workflows from YouTrack API
            project_fields: Per-project fields with defaults
            agiles: Agile Boards from YouTrack API
        """
        self.initialize()
        
        # Assert fields
        for field in fields:
            field_id = self._escape(field.get('id', ''))
            name = self._escape(field.get('name', ''))
            field_type = self._escape(field.get('fieldType', {}).get('name', ''))
            janus.query_once(f"assertz(curr_field('{field_id}', '{name}', '{field_type}'))")
        
        logger.debug(f"Asserted {len(fields)} current fields")
        
        # Assert bundles
        for bundle in bundles:
            bundle_id = self._escape(bundle.get('id', ''))
            bundle_name = self._escape(bundle.get('name', ''))
            # Detect bundle type
            values = bundle.get('values', [])
            first_val = values[0] if values else {}
            bundle_type = 'state' if 'isResolved' in first_val else 'enum'
            janus.query_once(f"assertz(curr_bundle('{bundle_id}', '{bundle_name}', '{bundle_type}'))")
            
            for value in bundle.get('values', []):
                if not value.get('archived', False):
                    value_id = self._escape(value.get('id', ''))
                    value_name = self._escape(value.get('name', ''))
                    janus.query_once(f"assertz(bundle_value('{bundle_id}', '{value_id}', '{value_name}'))")
        
        logger.debug(f"Asserted {len(bundles)} current bundles")
        
        # Assert projects
        if projects:
            for project in projects:
                project_id = self._escape(project.get('id', ''))
                name = self._escape(project.get('name', ''))
                short_name = self._escape(project.get('shortName', ''))
                janus.query_once(f"assertz(curr_project('{project_id}', '{name}', '{short_name}'))")
            
            logger.debug(f"Asserted {len(projects)} current projects")
            
            # Assert project-specific field defaults
            if project_fields:
                # Build project_id -> short_name mapping
                proj_id_to_short = {p.get('id'): p.get('shortName') for p in projects}
                count_defaults = 0
                for pid, pfields in project_fields.items():
                    short_name = proj_id_to_short.get(pid)
                    if not short_name:
                        continue
                    short_name_escaped = self._escape(short_name)
                    for f in pfields:
                        # defaultValues is an array, take first element if exists
                        default_values = f.get('defaultValues', [])
                        if default_values and len(default_values) > 0:
                            default_elem = default_values[0]
                            # Get field name from nested 'field' object
                            field_obj = f.get('field', {})
                            field_name = field_obj.get('name', '')
                            val_name = default_elem.get('name', '')
                            if field_name and val_name:
                                fn_escaped = self._escape(field_name)
                                vn_escaped = self._escape(val_name)
                                # Assert curr_field_default(FieldName, DefaultValueName, ProjectShortName)
                                janus.query_once(f"assertz(curr_field_default('{fn_escaped}', '{vn_escaped}', '{short_name_escaped}'))")
                                count_defaults += 1
                logger.debug(f"Asserted {count_defaults} current field defaults")
            
            # Assert field attachments to projects (for attach_field idempotency)
            if project_fields:
                # Build project_id -> short_name mapping
                proj_id_to_short = {p.get('id'): p.get('shortName') for p in projects}
                count_attachments = 0
                for pid, pfields in project_fields.items():
                    short_name = proj_id_to_short.get(pid)
                    if not short_name:
                        continue
                    short_name_escaped = self._escape(short_name)
                    for f in pfields:
                        # Get field name from nested 'field' object
                        field_obj = f.get('field', {})
                        field_name = field_obj.get('name', '')
                        if field_name:
                            fn_escaped = self._escape(field_name)
                            janus.query_once(f"assertz(curr_project_field('{short_name_escaped}', '{fn_escaped}'))")
                            count_attachments += 1
                logger.debug(f"Asserted {count_attachments} current project-field attachments")

        # Assert workflows and rules
        if workflows:
            for wf in workflows:
                wf_id = self._escape(wf.get('id', ''))
                name = self._escape(wf.get('name', ''))
                title = self._escape(wf.get('title', ''))
                janus.query_once(f"assertz(curr_workflow('{wf_id}', '{name}', '{title}'))")
                
                # Rules
                for rule in wf.get('rules', []):
                    rule_id = self._escape(rule.get('id', ''))
                    rule_name = self._escape(rule.get('name', ''))
                    # Note: YouTrack list_workflow API might not return script content directly
                    # If empty, drift detection might be limited unless populated elsewhere
                    script = self._escape(rule.get('script', ''))
                    janus.query_once(f"assertz(curr_rule('{wf_id}', '{rule_id}', '{rule_name}', 'unknown', '{script}'))")
                
                # Workflow usages (attachments to projects)
                for usage in wf.get('usages', []):
                    usage_id = self._escape(usage.get('id', ''))
                    proj = usage.get('project', {})
                    proj_id = self._escape(proj.get('id', ''))
                    if wf_id and proj_id:
                        janus.query_once(f"assertz(curr_workflow_usage('{wf_id}', '{proj_id}', '{usage_id}'))")
            
            logger.debug(f"Asserted {len(workflows)} current workflows")
            
        # Assert Agile Boards
        if agiles:
            for board in agiles:
                bid = self._escape(board.get('id', ''))
                name = self._escape(board.get('name', ''))
                # Get column settings field ID
                col_settings = board.get('columnSettings', {})
                # Note: API might structure it as columnSettings -> field -> id
                # Or sometimes just columnSettings -> field (object)
                col_field = col_settings.get('field', {})
                col_field_id = self._escape(col_field.get('id', ''))
                
                
                janus.query_once(f"assertz(curr_board('{bid}', '{name}', '{col_field_id}'))")
                
                # Sprints
                sprints_settings = board.get('sprintsSettings', {})
                disable_sprints = sprints_settings.get('disableSprints', True)
                ds_val = 'true' if disable_sprints else 'false'
                janus.query_once(f"assertz(curr_board_sprints('{bid}', {ds_val}))")
                
                # Visibility (Permitted Groups)
                sharing = board.get('readSharingSettings', {})
                groups = sharing.get('permittedGroups', [])
                for group in groups:
                    g_name = self._escape(group.get('name', ''))
                    janus.query_once(f"assertz(curr_board_visibility('{bid}', '{g_name}'))")
                    
                # Columns (including WIP limits)
                columns = col_settings.get('columns', [])
                for col in columns:
                    c_name = self._escape(col.get('presentation', ''))
                    janus.query_once(f"assertz(curr_board_column('{bid}', '{c_name}'))")
                    
                    # Check for WIP limits
                    wip_limit = col.get('wipLimit')
                    if wip_limit:
                        min_val = wip_limit.get('min')
                        max_val = wip_limit.get('max')
                        min_str = min_val if min_val is not None else 'null'
                        max_str = max_val if max_val is not None else 'null'
                        janus.query_once(f"assertz(curr_board_column_wip('{bid}', '{c_name}', {min_str}, {max_str}))")

                # Swimlanes
                swim_settings = board.get('swimlaneSettings') or {}
                swim_field = swim_settings.get('field', {})
                if swim_field:
                    s_name = self._escape(swim_field.get('name', ''))
                    janus.query_once(f"assertz(curr_board_swimlane('{bid}', '{s_name}'))")
                
                # Projects
                projects = board.get('projects', [])
                for proj in projects:
                    p_short = self._escape(proj.get('shortName', ''))
                    janus.query_once(f"assertz(curr_board_project('{bid}', '{p_short}'))")
                    
                # Color Coding
                color_coding = board.get('colorCoding')
                if color_coding:
                    # FieldBasedColorCoding uses 'prototype', not 'field'
                    cc_prototype = color_coding.get('prototype', {})
                    if cc_prototype:
                        mode = 'field'
                        f_name = self._escape(cc_prototype.get('name', ''))
                    else:
                        mode = 'project'
                        f_name = 'null'
                    janus.query_once(f"assertz(curr_board_color_coding('{bid}', '{mode}', '{f_name}'))")
                
                # Estimation Fields
                est_field = board.get('estimationField')
                if est_field:
                    est_name = self._escape(est_field.get('name', ''))
                    janus.query_once(f"assertz(curr_board_estimation('{bid}', '{est_name}'))")
                orig_est = board.get('originalEstimationField')
                if orig_est:
                    orig_name = self._escape(orig_est.get('name', ''))
                    janus.query_once(f"assertz(curr_board_original_estimation('{bid}', '{orig_name}'))")
                
                # Orphan Settings
                orphans_top = 'true' if board.get('orphansAtTheTop', True) else 'false'
                janus.query_once(f"assertz(curr_board_orphans_at_top('{bid}', {orphans_top}))")
                hide_orphans = 'true' if board.get('hideOrphansSwimlane', False) else 'false'
                janus.query_once(f"assertz(curr_board_hide_orphans('{bid}', {hide_orphans}))")
                
                # Backlog
                backlog = board.get('backlog')
                if backlog:
                    bl_query = self._escape(backlog.get('query', ''))
                    if bl_query:
                        janus.query_once(f"assertz(curr_board_backlog('{bid}', '{bl_query}'))")
            
            logger.debug(f"Asserted {len(agiles)} current agile boards")
        

        # Users
        if users:
            for u in users:
                login = self._escape(u.get('login', ''))
                full_name = self._escape(u.get('fullName', ''))
                email = self._escape(u.get('email', ''))
                janus.query_once(f"assertz(curr_user('{login}', '{full_name}', '{email}')).")

        # Groups
        if groups:
            for g in groups:
                name = self._escape(g.get('name', ''))
                janus.query_once(f"assertz(curr_group('{name}')).")
                for gu in g.get('users', []):
                    u_login = self._escape(gu.get('login', ''))
                    janus.query_once(f"assertz(curr_group_user('{name}', '{u_login}')).")
                for gr in g.get('roles', []):
                    r_name = self._escape(gr.get('role', {}).get('name', ''))
                    janus.query_once(f"assertz(curr_group_role('{name}', '{r_name}')).")

        # Roles
        if roles:
            for r in roles:
                name = self._escape(r.get('name', ''))
                janus.query_once(f"assertz(curr_role('{name}')).")
                for p in r.get('permissions', []):
                    p_name = self._escape(p.get('permission', {}).get('name', ''))
                    janus.query_once(f"assertz(curr_role_permission('{name}', '{p_name}')).")
        
        # Project Roles
        if project_roles:
            for project_short_name, pr_list in project_roles.items():
                p_short = self._escape(project_short_name)
                for pr in pr_list:
                    role_name = self._escape(pr.get('role', {}).get('name', ''))
                    # Team member could be user or group
                    team = pr.get('team', {})
                    user = pr.get('user', {})
                    group = pr.get('group', {})
                    
                    if user and user.get('login'):
                        subj = self._escape(user.get('login'))
                        janus.query_once(f"assertz(curr_project_role('{p_short}', '{subj}', 'user', '{role_name}')).")
                    elif group and group.get('name'):
                        subj = self._escape(group.get('name'))
                        janus.query_once(f"assertz(curr_project_role('{p_short}', '{subj}', 'group', '{role_name}')).")

        # Tags
        if tags:
            for tag in tags:
                tid = tag['id']
                tname = self._escape(tag.get('name', ''))
                untag = 'true' if tag.get('untagOnResolve', False) else 'false'
                visible = tag.get('visibleFor', {}).get('name', '') if tag.get('visibleFor') else ''
                janus.query_once(f"assertz(curr_tag('{tid}', '{tname}', {untag}, '{self._escape(visible)}'))")
            logger.debug(f"Asserted {len(tags)} current tags")
        
        # Saved Queries
        if saved_queries:
            for sq in saved_queries:
                sqid = sq['id']
                sqname = self._escape(sq.get('name', ''))
                sqquery = self._escape(sq.get('query', ''))
                janus.query_once(f"assertz(curr_saved_query('{sqid}', '{sqname}', '{sqquery}'))")
            logger.debug(f"Asserted {len(saved_queries)} current saved queries")

        # Assert global time tracking
        if global_time_tracking:
            work_time = global_time_tracking.get('workTimeSettings') or {}
            first_day = work_time.get('firstDayOfWeek', 1)
            limit = work_time.get('minutesLimit', 480)
            days = work_time.get('daysOfWeek') or [1, 2, 3, 4, 5]
            days_str = ", ".join(str(d) for d in days)
            janus.query_once(f"assertz(curr_global_time_tracking({first_day}, {limit}, [{days_str}]))")

        # Assert project-specific time tracking
        if project_time_tracking:
            for p_short, p_tt in project_time_tracking.items():
                p_short_escaped = self._escape(p_short)
                enabled = 'true' if p_tt.get('enabled', False) else 'false'
                
                # Estimate field name
                est = p_tt.get('estimate') or {}
                est_field = est.get('field', {}).get('name', 'null')
                est_field_escaped = self._escape(est_field) if est_field != 'null' else 'null'
                
                janus.query_once(f"assertz(curr_project_time_tracking('{p_short_escaped}', {enabled}, '{est_field_escaped}'))")
                
                # Work item types
                for wit in p_tt.get('workItemTypes', []):
                    wit_name = self._escape(wit.get('name', ''))
                    janus.query_once(f"assertz(curr_project_work_item_type('{p_short_escaped}', '{wit_name}'))")

        # Assert custom issue link types
        if issue_link_types:
            for lt in issue_link_types:
                lt_id = self._escape(lt.get('id', ''))
                lt_name = self._escape(lt.get('name', ''))
                s_to_t = self._escape(lt.get('sourceToTarget', ''))
                t_to_s = self._escape(lt.get('targetToSource', ''))
                directed = 'true' if lt.get('directed', True) else 'false'
                aggregation = 'true' if lt.get('aggregation', False) else 'false'
                janus.query_once(f"assertz(curr_issue_link_type('{lt_id}', '{lt_name}', '{s_to_t}', '{t_to_s}', {directed}, {aggregation}))")

        # Assert reports
        if reports:
            for rep in reports:
                r_id = self._escape(rep.get('id', ''))
                r_name = self._escape(rep.get('name', ''))
                raw_type = rep.get('$type', '')
                r_type = 'burndown' if 'Burndown' in raw_type else ('cumulative_flow' if 'CumulativeFlow' in raw_type else 'unknown')
                
                query = self._escape(rep.get('query', ''))
                
                r_range = rep.get('range', {})
                date_range = self._escape(r_range.get('name', '')) if r_range else 'null'
                
                est = rep.get('estimationField') or {}
                est_field = est.get('field', {}).get('name', 'null')
                est_field_escaped = self._escape(est_field) if est_field != 'null' else 'null'
                
                state = rep.get('stateField') or {}
                state_field = state.get('field', {}).get('name', 'null')
                state_field_escaped = self._escape(state_field) if state_field != 'null' else 'null'
                
                projs = rep.get('projects', [])
                projs_str = ", ".join(f"'{self._escape(p.get('shortName', ''))}'" for p in projs)
                
                janus.query_once(f"assertz(curr_report('{r_id}', '{r_name}', '{r_type}', '{query}', '{date_range}', '{est_field_escaped}', '{state_field_escaped}', [{projs_str}]))")
    
    def assert_target_state(self, prolog_facts: str) -> None:
        """
        Assert target state from Prolog facts string.
        
        Args:
            prolog_facts: String of Prolog facts, one per line
        """
        self.initialize()
        
        count = 0
        for line in prolog_facts.strip().split('\n'):
            line = line.strip()
            if line and not line.startswith('%'):
                # Remove trailing period if present for assertz
                fact = line.rstrip('.')
                janus.query_once(f"assertz({fact})")
                count += 1
        
        logger.debug(f"Asserted {count} target facts")
    
    def compute_plan(self) -> list[tuple]:
        """
        Run Prolog inference to compute the action plan.
        
        Returns:
            List of action tuples, e.g.:
            [('create_bundle', 'PriorityBundle', 'enum'),
             ('create_field', 'Priority', 'enum', 'DEMO')]
        """
        self.initialize()
        
        # Query the plan
        # We transform terms to lists (univ =..) to assume robust conversion 
        # by Janus (which might fail on compound terms in some envs)
        # We underscore _Actions to prevent Janus from trying to return the 
        # intermediate term list (which would cause a py_term domain error)
        query = "plan(_Actions), maplist(=.., _Actions, ActionLists)"
        result = janus.query_once(query)
        
        if result is None:
            logger.warning("Prolog plan query returned no results")
            return []
        
        action_lists = result.get("ActionLists", [])
        if action_lists is None:
             # Logic failed
             return []
        
        # Convert lists to tuples for consistency
        plan = [tuple(a) for a in action_lists]
        
        logger.info(f"Computed plan with {len(plan)} actions")
        return plan
    
    def _term_to_tuple(self, term) -> tuple:
        """Convert a Janus Prolog term to a Python tuple."""
        if hasattr(term, 'functor'):
            functor = str(term.functor)
            args = [self._term_to_tuple(arg) if hasattr(arg, 'functor') else str(arg) 
                    for arg in term.args]
            return (functor, *args)
        return (str(term),)
    
    def _escape(self, s: str) -> str:
        """Escape a string for Prolog."""
        return s.replace("\\", "\\\\").replace("'", "\\'")


def run_inference(fields: list[dict], bundles: list[dict], 
                  target_facts: str, projects: list[dict] = None, workflows: list[dict] = None,
                  project_fields: dict[str, list[dict]] = None,
                  agiles: list[dict] = None,
                  tags: list[dict] = None,
                  saved_queries: list[dict] = None,
                  users: list[dict] = None,
                  groups: list[dict] = None,
                  roles: list[dict] = None,
                  project_roles: dict[str, list[dict]] = None,
                  global_time_tracking: dict = None,
                  project_time_tracking: dict[str, dict] = None,
                  issue_link_types: list[dict] = None,
                  reports: list[dict] = None) -> list[tuple]:
    """
    Convenience function to run complete inference.
    
    Args:
        fields: Current fields from YouTrack API
        bundles: Current bundles from YouTrack API
        target_facts: Prolog facts string from config translator
        projects: Current projects from YouTrack API
        workflows: Current workflows from YouTrack API
        project_fields: Map of project_id -> list of fields with defaults
        agiles: Agile Boards from YouTrack API
        tags: Tags from YouTrack API
        saved_queries: Saved queries from YouTrack API
        
    Returns:
        List of action tuples for the actuator
    """
    engine = PrologInferenceEngine()
    engine.clear_facts()
    engine.assert_current_state(
        fields, bundles, projects, workflows, project_fields, agiles, tags, saved_queries,
        users, groups, roles, project_roles,
        global_time_tracking, project_time_tracking, issue_link_types, reports
    )
    engine.assert_target_state(target_facts)
    
    return engine.compute_plan()

