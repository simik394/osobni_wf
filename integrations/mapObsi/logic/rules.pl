% ==========================================
% MapObsi Logic Validation Rules
% ==========================================

% ------------------------------------------
% Data Definitions (Exported from Go)
% ------------------------------------------
% node(Id, Label, [PropList]).
% edge(SourceId, TargetId, Type).

% ------------------------------------------
% Helper Predicates
% ------------------------------------------

% Get label for a node ID
has_label(Id, Label) :-
    node(Id, Label, _).

% Get name property (assuming we export it, or mock it for now)
% For now, we rely on the Label as a proxy or we need to parse the property list in future.
% node_name(Id, Name) :- ...

% ------------------------------------------
% Validation Rules
% ------------------------------------------

% Rule 1: Orphans
% A Note is an orphan if it has no incoming LINKS_TO edges.
orphan_note(Id) :-
    has_label(Id, 'Note'),
    \+ edge(_, Id, 'LINKS_TO').

% Rule 2: Broken Links (Phantom Nodes)
% A link is broken if the target node does not exist.
% (Note: In our export, we only export existing nodes, but if we had placeholders...)
% Implementation: Edge points to Id that is not in node/3.
broken_link(SourceId, TargetId) :-
    edge(SourceId, TargetId, 'LINKS_TO'),
    \+ node(TargetId, _, _).

% Rule 3: Circular Dependencies (Direct)
% A Note links to itself.
circular_link_self(Id) :-
    has_label(Id, 'Note'),
    edge(Id, Id, 'LINKS_TO').

% Rule 4: Untagged Notes
% A Note has no TAGGED edge.
untagged_note(Id) :-
    has_label(Id, 'Note'),
    \+ edge(Id, _, 'TAGGED').

% Rule 5: Task without Status
% A Task node must have a status property (needs Property parsing first).
% skipping for now.

% Rule 6: Code file not in any Project.
loose_code(Id) :-
    has_label(Id, 'Code'),
    \+ edge(_, Id, 'CONTAINS').

% ------------------------------------------
% Reporting
% ------------------------------------------

report_orphans :-
    findall(Id, orphan_note(Id), List),
    length(List, Count),
    format('Found ~w orphan notes.~n', [Count]),
    print_list(List).

report_broken :-
    findall(S-T, broken_link(S, T), List),
    length(List, Count),
    format('Found ~w broken links.~n', [Count]),
    print_list(List).

print_list([]).
print_list([H|T]) :-
    format(' - ~w~n', [H]),
    print_list(T).
