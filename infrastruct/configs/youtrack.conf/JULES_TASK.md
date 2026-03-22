# Task: Implement User Access Management in YouTrack IaC

This document outlines the requirements for adding declarative User Access Management (Users, Groups, Roles, and Role Assignments) to the `infrastruct/configs/youtrack.conf` project.

## Goal Description
Enable administrators to manage YouTrack users, user groups, custom roles, and project-level role assignments declaratively via YAML configuration files.

## Required Changes

### 1. Configuration Schema (`src/config/schema.py`)
Extend the YAML schema (Pydantic models) to support:
- `UserConfig`: `login`, `fullName`, `email`, `state` (present/absent)
- `RoleConfig`: `name`, `permissions` (list of strings)
- `GroupConfig`: `name`, `roles` (global roles), `users` (list of logins)
- Extend `ProjectConfig` to include `role_assignments`: mapping of group/user to a role for that specific project.
- Extend `YouTrackConfig` root model to include optional `users`, `groups`, and `roles`.

### 2. Logic Translation (`src/config/translator.py`)
Translate the new Pydantic models into Prolog facts representing the desired target state:
- `target_user(Login, FullName, Email)`
- `target_group(Name)`
- `target_role(Name, Permissions)`
- `target_group_user(GroupName, UserLogin)`
- `target_project_role(ProjectShortName, AssigneeName, RoleName)`

### 3. Inference Engine (`src/logic/core.pl`)
Define the ontology and inference rules for the Prolog engine:
- Declare dynamic target facts (as above) and current facts (e.g., `curr_user/3`, `curr_group/1`).
- Define missing and drifted logic for users, groups, and assignments.
- Generate action facts: `action(create_user(Login, Name, Email))`, `action(create_group(Name))`, `action(assign_user(Group, User))`, `action(grant_project_role(Project, Subject, Role))`.
- Handle dependencies: E.g., Adding a user to a group depends on both existing.

### 4. Controller Sensing (`src/controller/main.py`)
- Add API calls to fetch all active users, groups, roles, and project team assignments from YouTrack.
- Translate fetched data into Prolog facts:
  - `prolog.assertz(f"curr_user('{u.login}', '{u.fullName}', '{u.email}')")`
  - `prolog.assertz(f"curr_group('{g.name}')")`

### 5. Actuator Implementation (`src/actuator/main.py`)
Implement the REST API calls matching the Prolog actions:
- `create_user`, `update_user`
- `create_group`, `add_user_to_group`
- `grant_project_role` 

### 6. Testing
- Update `test_schema.py`, `test_logic.pl`, and `test_actuator.py` to cover the new features.
