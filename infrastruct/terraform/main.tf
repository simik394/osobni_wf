terraform {
  required_providers {
    oci = {
      source  = "oracle/oci"
      version = ">= 4.0.0"
    }
  }
}

provider "oci" {
  tenancy_ocid     = var.tenancy_ocid
  user_ocid        = var.user_ocid
  fingerprint      = var.fingerprint
  private_key_path = var.private_key_path
  region           = var.region
}

# --- Network Logic (New vs Existing) ---

# Lookup existing VCN by Name (if provided and create_network is false)
data "oci_core_vcns" "existing_vcns" {
  count          = (!var.create_network && var.existing_vcn_name != "") ? 1 : 0
  compartment_id = var.compartment_ocid
  display_name   = var.existing_vcn_name
}

# Lookup existing Subnet by Name (if provided and create_network is false)
# We need VCN ID first, either from lookup or we assume user might know just subnet name?
# OCI core_subnets requires compartment_id and vcn_id.
# So if user provides just VCN Name + Subnet Name, we can find it.
data "oci_core_subnets" "existing_subnets" {
  count          = (!var.create_network && var.existing_vcn_name != "" && var.existing_subnet_name != "") ? 1 : 0
  compartment_id = var.compartment_ocid
  vcn_id         = data.oci_core_vcns.existing_vcns[0].virtual_networks[0].id
  display_name   = var.existing_subnet_name
}

locals {
  # Determine final Subnet ID
  # Priority:
  # 1. New Network (create_network=true) -> oci_core_subnet.nomad_subnet[0].id
  # 2. Existing ID (create_network=false, existing_subnet_id set) -> var.existing_subnet_id
  # 3. Existing Name (create_network=false, existing_subnet_name set) -> data lookup
  final_subnet_id = var.create_network ? oci_core_subnet.nomad_subnet[0].id : (
    var.existing_subnet_id != "" ? var.existing_subnet_id : (
      length(data.oci_core_subnets.existing_subnets) > 0 ? data.oci_core_subnets.existing_subnets[0].subnets[0].id : ""
    )
  )
}


resource "oci_core_vcn" "nomad_vcn" {
  count          = var.create_network ? 1 : 0
  cidr_block     = "10.0.0.0/16"
  compartment_id = var.compartment_ocid
  display_name   = "nomad-vcn"
  dns_label      = "nomad"
}

resource "oci_core_internet_gateway" "nomad_ig" {
  count          = var.create_network ? 1 : 0
  compartment_id = var.compartment_ocid
  display_name   = "nomad-ig"
  vcn_id         = oci_core_vcn.nomad_vcn[0].id
  enabled        = true
}

resource "oci_core_route_table" "nomad_rt" {
  count          = var.create_network ? 1 : 0
  compartment_id = var.compartment_ocid
  vcn_id         = oci_core_vcn.nomad_vcn[0].id
  display_name   = "nomad-rt"

  route_rules {
    destination       = "0.0.0.0/0"
    destination_type  = "CIDR_BLOCK"
    network_entity_id = oci_core_internet_gateway.nomad_ig[0].id
  }
}

resource "oci_core_security_list" "nomad_sl" {
  count          = var.create_network ? 1 : 0
  compartment_id = var.compartment_ocid
  vcn_id         = oci_core_vcn.nomad_vcn[0].id
  display_name   = "nomad-security-list"

  egress_security_rules {
    destination = "0.0.0.0/0"
    protocol    = "all"
  }

  # SSH
  ingress_security_rules {
    protocol = "6" # TCP
    source   = "0.0.0.0/0"
    tcp_options {
      min = 22
      max = 22
    }
  }

  # HTTP
  ingress_security_rules {
    protocol = "6" # TCP
    source   = "0.0.0.0/0"
    tcp_options {
      min = 80
      max = 80
    }
  }

  # HTTPS
  ingress_security_rules {
    protocol = "6" # TCP
    source   = "0.0.0.0/0"
    tcp_options {
      min = 443
      max = 443
    }
  }

  # Tailscale UDP (Direct connections)
  ingress_security_rules {
    protocol = "17" # UDP
    source   = "0.0.0.0/0"
    udp_options {
      min = 41641
      max = 41641
    }
  }

  # ICMP (Ping)
  ingress_security_rules {
    protocol = "1"
    source   = "0.0.0.0/0"
  }
}

resource "oci_core_subnet" "nomad_subnet" {
  count             = var.create_network ? 1 : 0
  cidr_block        = "10.0.1.0/24"
  display_name      = "nomad-subnet"
  dns_label         = "nomadsub"
  security_list_ids = [oci_core_security_list.nomad_sl[0].id]
  compartment_id    = var.compartment_ocid
  vcn_id            = oci_core_vcn.nomad_vcn[0].id
  route_table_id    = oci_core_route_table.nomad_rt[0].id
}

# --- Compute ---

# Get latest Ubuntu 22.04 image
data "oci_core_images" "ubuntu" {
  compartment_id   = var.compartment_ocid
  operating_system = "Canonical Ubuntu"
  operating_system_version = "22.04"
  shape            = "VM.Standard.E2.1.Micro"
  sort_by          = "TIMECREATED"
  sort_order       = "DESC"
}

resource "oci_core_instance" "nomad_server" {
  availability_domain = var.availability_domain
  compartment_id      = var.compartment_ocid
  display_name        = "nomad-server"
  shape               = "VM.Standard.E2.1.Micro"

  create_vnic_details {
    subnet_id        = local.final_subnet_id
    display_name     = "primaryvnic"
    assign_public_ip = true
    hostname_label   = "halvarm"
  }

  source_details {
    source_type             = "image"
    source_id               = data.oci_core_images.ubuntu.images[0].id
    boot_volume_size_in_gbs = 50 # 50GB Boot Volume
  }

  metadata = {
    ssh_authorized_keys = var.ssh_public_key
  }
}

# --- Post-Provisioning Automation ---
# Generate/Update the Ansible Inventory file with the new Public IP

resource "local_file" "ansible_inventory" {
  content = templatefile("${path.module}/inventory.tpl", {
    public_ip = oci_core_instance.nomad_server.public_ip
    ssh_user  = "ubuntu"
  })
  filename = "${path.module}/../../infrastruct/nomad_stack/inventory.yml"
}

# Also update group_vars/servers.yml with the public IP
resource "local_file" "ansible_group_vars" {
  content = templatefile("${path.module}/group_vars.tpl", {
    public_ip = oci_core_instance.nomad_server.public_ip
  })
  filename = "${path.module}/../../infrastruct/nomad_stack/group_vars/servers.yml"
}


output "server_public_ip" {
  value = oci_core_instance.nomad_server.public_ip
}
