# My Project Configuration

## Custom Fields

```prolog
% === PROJECT: DEMO ===

% Priority field (dropdown)
target_field('Priority', enum, 'DEMO').
field_uses_bundle('Priority', 'PriorityBundle').

target_bundle_value('PriorityBundle', 'Critical').
target_bundle_value('PriorityBundle', 'High').
target_bundle_value('PriorityBundle', 'Medium').
target_bundle_value('PriorityBundle', 'Low').

% Severity field (dropdown)  
target_field('Severity', enum, 'DEMO').
field_uses_bundle('Severity', 'SeverityBundle').

target_bundle_value('SeverityBundle', 'Blocker').
target_bundle_value('SeverityBundle', 'Major').
target_bundle_value('SeverityBundle', 'Minor').
target_bundle_value('SeverityBundle', 'Trivial').

% Sprint field (text)
target_field('Sprint', string, 'DEMO').

% Story Points (number)
target_field('Story Points', integer, 'DEMO').
```
