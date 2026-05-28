open Types

(* Helper: Check if a list has a bundle for a field name *)
let has_bundle (bundles : field_bundle list) field_name =
  List.exists (fun (b : field_bundle) -> b.field_name = field_name) bundles

(* Helper: Find a bundle for a field name *)
let find_bundle (bundles : field_bundle list) field_name =
  List.find_opt (fun (b : field_bundle) -> b.field_name = field_name) bundles

(* Helper: Check if a default value exists in a bundle *)
let default_val_exists bundle_values state_values bundle_name value =
  let exists_in_enum = List.exists (fun (bv : bundle_value) -> bv.bundle_name = bundle_name && bv.value = value) bundle_values in
  let exists_in_state = List.exists (fun (sv : state_value) -> sv.bundle_name = bundle_name && sv.value = value) state_values in
  exists_in_enum || exists_in_state

(* Check 1: Referential Integrity *)
let check_referential_integrity (config : config) =
  List.fold_left (fun acc (f : field) ->
      match f.typ with
      | Enum | State ->
         if not (has_bundle config.bundles f.name) then
           let msg = Printf.sprintf "[referential_integrity]: Field '%s' in project '%s' is of type '%s' but has no associated bundle."
                       f.name f.project (match f.typ with Enum -> "enum" | State -> "state" | _ -> "other") in
           msg :: acc
         else acc
      | _ -> acc
    ) [] config.fields

(* Check 2: Default Value Soundness *)
let check_default_value_soundness (config : config) =
  List.fold_left (fun acc (d : default_value) ->
      match find_bundle config.bundles d.field_name with
      | Some b ->
         if not (default_val_exists config.bundle_values config.state_values b.bundle_name d.value) then
           let msg = Printf.sprintf "[default_value_soundness]: Default value '%s' for field '%s' in project '%s' does not exist in bundle '%s'."
                       d.value d.field_name d.project b.bundle_name in
           msg :: acc
         else acc
      | None -> acc
    ) [] config.defaults

(* Check 3: Project Identity Uniqueness *)
let check_project_identity_uniqueness (config : config) =
  let rec find_violations checked = function
    | [] -> []
    | (p : project) :: rest ->
       let dup_violations =
         List.fold_left (fun acc (other : project) ->
             if p.short_name = other.short_name && p.name <> other.name then
               let msg = Printf.sprintf "[project_identity_uniqueness]: Project ShortName '%s' is assigned to two different names: '%s' and '%s'."
                           p.short_name p.name other.name in
               if List.mem msg acc then acc else msg :: acc
             else acc
           ) [] checked
       in
       dup_violations @ (find_violations (p :: checked) rest)
  in
  find_violations [] config.projects

(* Check 5: State Machine Triviality *)
let check_state_machine_triviality (config : config) =
  List.fold_left (fun acc (f : field) ->
      match f.typ with
      | State ->
         (match find_bundle config.bundles f.name with
          | Some b ->
             let has_unresolved = List.exists (fun (sv : state_value) -> sv.bundle_name = b.bundle_name && not sv.is_resolved) config.state_values in
             if not has_unresolved then
               let msg = Printf.sprintf "[state_machine_triviality]: State bundle '%s' for field '%s' in project '%s' has no unresolved states."
                           b.bundle_name f.name f.project in
               msg :: acc
             else acc
          | None -> acc)
      | _ -> acc
    ) [] config.fields

(* reachability and stuck state checks *)
let check_workflow_reachability (config : config) =
  let bundle_names = List.fold_left (fun acc (sv : state_value) ->
      if List.mem sv.bundle_name acc then acc else sv.bundle_name :: acc
    ) [] config.state_values in
  
  List.fold_left (fun acc bundle_name ->
      let transitions = List.filter (fun (t : state_transition) -> t.bundle_name = bundle_name) config.transitions in
      if transitions = [] then acc
      else begin
        let all_states = List.filter (fun (sv : state_value) -> sv.bundle_name = bundle_name) config.state_values in
        let resolved_states = List.filter (fun (sv : state_value) -> sv.is_resolved) all_states |> List.map (fun (sv : state_value) -> sv.value) in
        
        let is_stuck state =
          let rec dfs current visited =
            if List.mem current resolved_states then false
            else if List.mem current visited then true
            else
              let next = List.filter (fun (t : state_transition) -> t.from_value = current) transitions
                         |> List.map (fun t -> t.to_value) in
              if next = [] then true
              else List.for_all (fun n -> dfs n (current :: visited)) next
          in
          dfs state []
        in
        
        let stuck_errors = List.fold_left (fun acc_err (sv : state_value) ->
            if is_stuck sv.value then
              let msg = Printf.sprintf "[reachability_stuck_state]: State '%s' in bundle '%s' is a dead end (cannot reach any resolved state)."
                          sv.value bundle_name in
              msg :: acc_err
            else acc_err
          ) [] all_states in
          
        let initial_state =
          match List.find_opt (fun (b : field_bundle) -> b.bundle_name = bundle_name) config.bundles with
          | Some fb ->
             (match List.find_opt (fun (d : default_value) -> d.field_name = fb.field_name) config.defaults with
              | Some d -> d.value
              | None -> if all_states <> [] then (List.hd all_states : state_value).value else "")
          | None -> if all_states <> [] then (List.hd all_states : state_value).value else ""
        in
        
        let is_reachable start target =
          let rec dfs current visited =
            if current = target then true
            else if List.mem current visited then false
            else
              let next = List.filter (fun (t : state_transition) -> t.from_value = current) transitions
                         |> List.map (fun t -> t.to_value) in
              List.exists (fun n -> dfs n (current :: visited)) next
          in
          dfs start []
        in
        
        let unreachable_errors =
          if initial_state = "" then []
          else
            List.fold_left (fun acc_err (sv : state_value) ->
                if not (is_reachable initial_state sv.value) then
                  let msg = Printf.sprintf "[reachability_unreachable_state]: State '%s' in bundle '%s' is unreachable from the initial state '%s'."
                              sv.value bundle_name initial_state in
                  msg :: acc_err
                else acc_err
              ) [] all_states
        in
        
        stuck_errors @ unreachable_errors @ acc
      end
    ) [] bundle_names

(* Check all invariants and return list of all error messages *)
let verify_all (config : config) =
  let ref_integrity = check_referential_integrity config in
  let def_soundness = check_default_value_soundness config in
  let proj_uniqueness = check_project_identity_uniqueness config in
  let state_triviality = check_state_machine_triviality config in
  let reachability = check_workflow_reachability config in
  ref_integrity @ def_soundness @ proj_uniqueness @ state_triviality @ reachability

