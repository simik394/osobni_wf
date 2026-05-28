open Types

let () =
  let (config, actions, edges) = Parser.parse_channel stdin in
  
  (* 1. Verify semantic invariants *)
  let invariant_errors = Invariants.verify_all config in
  if invariant_errors <> [] then begin
    Printf.eprintf "FORMAL SEMANTIC VERIFICATION FAILURE:\n";
    List.iter (fun err -> Printf.eprintf "- %s\n" err) invariant_errors;
    exit 1
  end;
  
  (* 2. Verify topological sort *)
  match Topsort.find_cycle actions edges with
  | Some cycle_path ->
     Printf.eprintf "FORMAL VERIFICATION FAILURE: Cyclic dependency detected!\n";
     Printf.eprintf "Cycle: %s\n" (String.concat " -> " cycle_path);
     exit 2
  | None ->
     let sorted_actions = Topsort.topological_sort actions edges in
     if not (Topsort.verify_topological_sort actions edges sorted_actions) then begin
       Printf.eprintf "FORMAL VERIFICATION FAILURE: Topological sort result checker failed mathematical safety checks!\n";
       exit 3
     end else begin
       (* Print sorted actions to stdout for Python to consume *)
       List.iter (fun act -> print_endline act) sorted_actions;
       exit 0
     end
