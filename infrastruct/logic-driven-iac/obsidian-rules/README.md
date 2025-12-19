# YouTrack Configuration Rules

This folder contains your **desired YouTrack structure** written as Prolog facts in Markdown.

## How to Use

1. Create `.md` files in this folder
2. Add Prolog code blocks with `target_*` facts
3. Run the tool — it compares your rules vs actual YouTrack and generates changes

## Example: Define a Custom Field

```prolog
% I want a "Priority" field of type "enum" in project "MYPROJECT"
target_field('Priority', enum, 'MYPROJECT').

% The Priority field uses a bundle called "PriorityValues"
field_uses_bundle('Priority', 'PriorityValues').

% The bundle should have these values
target_bundle_value('PriorityValues', 'Critical').
target_bundle_value('PriorityValues', 'High').
target_bundle_value('PriorityValues', 'Medium').
target_bundle_value('PriorityValues', 'Low').
```

## Available Facts You Can Define

| Fact | Meaning |
|------|---------|
| `target_field(Name, Type, Project)` | You want field `Name` of `Type` in `Project` |
| `field_uses_bundle(Field, Bundle)` | Field uses this bundle for values |
| `target_bundle_value(Bundle, Value)` | Bundle should contain this value |

## Types

- `enum` - Dropdown list
- `state` - Workflow state field  
- `string` - Text field
- `integer` - Number field
