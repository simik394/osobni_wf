open Types

let parse_args s =
  let len = String.length s in
  let rec loop i current acc in_quote =
    if i >= len then
      let acc = if current = "" then acc else (String.trim current) :: acc in
      List.rev acc
    else
      match s.[i] with
      | '\'' -> loop (i + 1) current acc (not in_quote)
      | ',' when not in_quote ->
         let term = String.trim current in
         loop (i + 1) "" (term :: acc) false
      | c -> loop (i + 1) (current ^ String.make 1 c) acc in_quote
  in
  loop 0 "" [] false

let parse_fact line =
  let line = String.trim line in
  let line = if String.length line > 0 && line.[String.length line - 1] = '.' then
               String.sub line 0 (String.length line - 1)
             else line in
  try
    let open_paren = String.index line '(' in
    let close_paren = String.rindex line ')' in
    let functor_name = String.sub line 0 open_paren in
    let args_str = String.sub line (open_paren + 1) (close_paren - open_paren - 1) in
    Some (String.trim functor_name, parse_args args_str)
  with _ -> None

let parse_field_type = function
  | "enum" -> Enum
  | "state" -> State
  | s -> Other s

type parse_state = {
  projects : project list;
  fields : field list;
  bundles : field_bundle list;
  bundle_values : bundle_value list;
  state_values : state_value list;
  defaults : default_value list;
  actions : action list;
  edges : edge list;
}

let empty_state = {
  projects = [];
  fields = [];
  bundles = [];
  bundle_values = [];
  state_values = [];
  defaults = [];
  actions = [];
  edges = [];
}

let parse_line state line =
  let line = String.trim line in
  if String.length line >= 7 && String.sub line 0 7 = "action:" then
    let act = String.sub line 7 (String.length line - 7) |> String.trim in
    { state with actions = act :: state.actions }
  else if String.length line >= 5 && String.sub line 0 5 = "edge:" then
    let edge_str = String.sub line 5 (String.length line - 5) |> String.trim in
    match String.split_on_char ';' edge_str with
    | [src; dst] ->
       { state with edges = { src = String.trim src; dst = String.trim dst } :: state.edges }
    | _ -> state
  else
    match parse_fact line with
    | None -> state
    | Some (functor_name, args) ->
       match (functor_name, args) with
       | "target_project", [short_name; name] ->
          { state with projects = { short_name; name } :: state.projects }
       | "target_project", [short_name; name; _] ->
          { state with projects = { short_name; name } :: state.projects }
       | "target_field", [name; typ_str; project] ->
          { state with fields = { name; typ = parse_field_type typ_str; project } :: state.fields }
       | "field_uses_bundle", [field_name; bundle_name] ->
          { state with bundles = { field_name; bundle_name } :: state.bundles }
       | "target_bundle_value", [bundle_name; value] ->
          { state with bundle_values = { bundle_name; value } :: state.bundle_values }
       | "target_state_value", [bundle_name; value; is_resolved_str] ->
          let is_resolved = (is_resolved_str = "true") in
          { state with state_values = { bundle_name; value; is_resolved } :: state.state_values }
       | "target_field_default", [field_name; value; project] ->
          { state with defaults = { field_name; value; project } :: state.defaults }
       | _ -> state

let parse_channel ic =
  let rec loop state =
    try
      let line = input_line ic in
      loop (parse_line state line)
    with End_of_file -> state
  in
  let final_state = loop empty_state in
  let config = {
    projects = List.rev final_state.projects;
    fields = List.rev final_state.fields;
    bundles = List.rev final_state.bundles;
    bundle_values = List.rev final_state.bundle_values;
    state_values = List.rev final_state.state_values;
    defaults = List.rev final_state.defaults;
  } in
  (config, List.rev final_state.actions, List.rev final_state.edges)
