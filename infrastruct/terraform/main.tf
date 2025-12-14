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

# --- Network ---

resource "oci_core_vcn" "nomad_vcn" {
  cidr_block     = "10.0.0.0/16"
  compartment_id = var.compartment_ocid
  display_name   = "nomad-vcn"
  dns_label      = "nomad"
}

resource "oci_core_internet_gateway" "nomad_ig" {
  compartment_id = var.compartment_ocid
  display_name   = "nomad-ig"
  vcn_id         = oci_core_vcn.nomad_vcn.id
  enabled        = true
}

resource "oci_core_route_table" "nomad_rt" {
  compartment_id = var.compartment_ocid
  vcn_id         = oci_core_vcn.nomad_vcn.id
  display_name   = "nomad-rt"

  route_rules {
    destination       = "0.0.0.0/0"
    destination_type  = "CIDR_BLOCK"
    network_entity_id = oci_core_internet_gateway.nomad_ig.id
  }
}

resource "oci_core_security_list" "nomad_sl" {
  compartment_id = var.compartment_ocid
  vcn_id         = oci_core_vcn.nomad_vcn.id
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
  cidr_block        = "10.0.1.0/24"
  display_name      = "nomad-subnet"
  dns_label         = "nomadsub"
  security_list_ids = [oci_core_security_list.nomad_sl.id]
  compartment_id    = var.compartment_ocid
  vcn_id            = oci_core_vcn.nomad_vcn.id
  route_table_id    = oci_core_route_table.nomad_rt.id
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
    subnet_id        = oci_core_subnet.nomad_subnet.id
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

output "server_public_ip" {
  value = oci_core_instance.nomad_server.public_ip
}
