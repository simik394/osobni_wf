type field_type = Enum | State | Other of string

type project = {
  short_name : string;
  name : string;
}

type field = {
  name : string;
  typ : field_type;
  project : string;
}

type field_bundle = {
  field_name : string;
  bundle_name : string;
}

type bundle_value = {
  bundle_name : string;
  value : string;
}

type state_value = {
  bundle_name : string;
  value : string;
  is_resolved : bool;
}

type default_value = {
  field_name : string;
  value : string;
  project : string;
}

type state_transition = {
  bundle_name : string;
  from_value : string;
  to_value : string;
}

type config = {
  projects : project list;
  fields : field list;
  bundles : field_bundle list;
  bundle_values : bundle_value list;
  state_values : state_value list;
  defaults : default_value list;
  transitions : state_transition list;
}

(* Action types for topological sort *)
type action = string

type edge = {
  src : action;
  dst : action;
}
