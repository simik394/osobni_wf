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

(* Check all invariants and return list of all error messages *)
let verify_all (config : config) =
  let ref_integrity = check_referential_integrity config in
  let def_soundness = check_default_value_soundness config in
  let proj_uniqueness = check_project_identity_uniqueness config in
  let state_triviality = check_state_machine_triviality config in
  ref_integrity @ def_soundness @ proj_uniqueness @ state_triviality

