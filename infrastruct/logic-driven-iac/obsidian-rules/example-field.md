# Example: Defining a Required Field

This rule ensures the "Priority" enum field exists in Project "DEMO".

```prolog
target_field("Priority", enum, "DEMO").
field_uses_bundle("Priority", "PriorityBundle").
```

## Bundle Values

```prolog
target_bundle_value("PriorityBundle", "Critical").
target_bundle_value("PriorityBundle", "High").
target_bundle_value("PriorityBundle", "Medium").
target_bundle_value("PriorityBundle", "Low").
```
