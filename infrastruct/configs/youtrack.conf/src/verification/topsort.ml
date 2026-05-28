open Types

(* Adjacency list representation *)
module StringMap = Map.Make(String)
module StringSet = Set.Make(String)

let build_adjacency actions edges =
  let empty_adj = List.fold_left (fun acc act -> StringMap.add act [] acc) StringMap.empty actions in
  List.fold_left (fun acc edge ->
      if StringMap.mem edge.src acc && StringMap.mem edge.dst acc then
        (* edge.src depends on edge.dst, so edge.dst must point to edge.src (dst -> src) *)
        let curr = StringMap.find edge.dst acc in
        StringMap.add edge.dst (edge.src :: curr) acc
      else
        acc
    ) empty_adj edges

(* DFS cycle detection *)
let find_cycle actions edges =
  let adj = build_adjacency actions edges in
  let visited = ref StringSet.empty in
  let rec_stack = ref [] in
  let cycle = ref None in
  
  let rec dfs node =
    if !cycle <> None then ()
    else if List.mem node !rec_stack then
      (* Found cycle! Reconstruct path *)
      let rec reconstruct = function
        | [] -> []
        | x :: xs ->
           if x = node then [x]
           else x :: reconstruct xs
      in
      cycle := Some (List.rev (node :: reconstruct !rec_stack))
    else if not (StringSet.mem node !visited) then begin
      visited := StringSet.add node !visited;
      rec_stack := node :: !rec_stack;
      let neighbors = StringMap.find_opt node adj |> Option.value ~default:[] in
      List.iter dfs neighbors;
      rec_stack := List.tl !rec_stack
    end
  in
  List.iter (fun act -> if !cycle = None then dfs act) actions;
  !cycle

(* Kahn's Algorithm for Topological Sort *)
let topological_sort actions edges =
  let adj = build_adjacency actions edges in
  (* Compute in-degrees *)
  let in_degrees = ref (List.fold_left (fun acc act -> StringMap.add act 0 acc) StringMap.empty actions) in
  StringMap.iter (fun _ neighbors ->
      List.iter (fun n ->
          let curr = StringMap.find n !in_degrees in
          in_degrees := StringMap.add n (curr + 1) !in_degrees
        ) neighbors
    ) adj;
  
  (* Queue of nodes with in-degree 0 *)
  let q = ref (List.fold_left (fun acc act ->
                   if StringMap.find act !in_degrees = 0 then act :: acc else acc
                 ) [] actions) in
  
  let result = ref [] in
  while !q <> [] do
    let u = List.hd !q in
    q := List.tl !q;
    result := u :: !result;
    let neighbors = StringMap.find_opt u adj |> Option.value ~default:[] in
    List.iter (fun v ->
        let curr_deg = StringMap.find v !in_degrees in
        let new_deg = curr_deg - 1 in
        in_degrees := StringMap.add v new_deg !in_degrees;
        if new_deg = 0 then q := v :: !q
      ) neighbors
  done;
  List.rev !result

(* Formal result checker *)
let verify_topological_sort original_actions edges sorted_actions =
  (* 1. Check completeness: sorted_actions has exact same set of elements as original_actions *)
  let orig_set = List.fold_left (fun acc x -> StringSet.add x acc) StringSet.empty original_actions in
  let sort_set = List.fold_left (fun acc x -> StringSet.add x acc) StringSet.empty sorted_actions in
  let completeness = StringSet.equal orig_set sort_set && List.length original_actions = List.length sorted_actions in
  
  (* 2. Check order preservation *)
  let rec get_index item list idx =
    match list with
    | [] -> -1
    | x :: xs -> if x = item then idx else get_index item xs (idx + 1)
  in
  let order_preservation =
    List.for_all (fun edge ->
        let src_idx = get_index edge.src sorted_actions 0 in
        let dst_idx = get_index edge.dst sorted_actions 0 in
        if src_idx <> -1 && dst_idx <> -1 then
          dst_idx < src_idx (* dst must come before src *)
        else
          true
      ) edges
  in
  completeness && order_preservation
