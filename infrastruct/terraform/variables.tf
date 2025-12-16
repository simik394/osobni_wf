variable "tenancy_ocid" {
  description = "OCI Tenancy OCID"
  type        = string
}

variable "user_ocid" {
  description = "OCI User OCID"
  type        = string
}

variable "fingerprint" {
  description = "OCI API Key Fingerprint"
  type        = string
}

variable "private_key_path" {
  description = "Path to OCI API Private Key"
  type        = string
}

variable "region" {
  description = "OCI Region (e.g., eu-frankfurt-1)"
  type        = string
}

variable "compartment_ocid" {
  description = "Compartment OCID where resources will be created"
  type        = string
}

variable "availability_domain" {
  description = "Availability Domain (e.g., Uocm:EU-FRANKFURT-1-AD-1)"
  type        = string
}

variable "ssh_public_key" {
  description = "SSH Public Key content (e.g., 'ssh-rsa AAAA...')"
  type        = string
}

variable "create_network" {
  description = "Set to false to use an existing VCN and Subnet"
  type        = bool
  default     = true
}

variable "existing_subnet_id" {
  description = "OCID of the existing subnet (Optional if create_network=false and existing_vcn_name/subnet_name provided)"
  type        = string
  default     = ""
}

variable "existing_vcn_name" {
  description = "Display Name of the existing VCN (Used for lookup if ID not provided)"
  type        = string
  default     = ""
}

variable "existing_subnet_name" {
  description = "Display Name of the existing Subnet (Used for lookup if ID not provided)"
  type        = string
  default     = ""
}
