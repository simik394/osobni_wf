# For running ansible from a local machine (e.g., ntb) to provision 'halvarm'
servers:
  hosts:
    halvarm:
      ansible_host: ${public_ip}
      ansible_user: ${ssh_user}
      # ansible_ssh_private_key_file is in group_vars
      node_class: cloud
      nomad_role: server

# For running ansible from 'halvarm' itself or the laptop 'ntb'
local:
  hosts:
    localhost:
      ansible_connection: local
      node_class: laptop
      nomad_role: non_voting_server
