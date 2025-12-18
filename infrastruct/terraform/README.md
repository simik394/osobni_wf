# Terraform Infrastructure for OCI

This folder contains Terraform configuration to provision an **Always Free** instance on Oracle Cloud Infrastructure (OCI) suitable for the Nomad stack.

## Resources Created

- **VCN & Subnet**: Public network configuration.
- **Security List**: Firewall rules allowing SSH (22), HTTP (80), HTTPS (443), and Tailscale (UDP 41641).
- **Compute Instance**: `VM.Standard.E2.1.Micro` (1 CPU, 1GB RAM) with **50GB Storage**.

## Prerequisites

1.  **OCI Account**: You need an active Oracle Cloud account.
2.  **Terraform**: [Install Terraform](https://developer.hashicorp.com/terraform/downloads).
3.  **OCI API Keys**:
    *   Go to your OCI Console -> User Settings -> API Keys -> Add API Key.
    *   Download the private key and save it (e.g., `~/.oci/oci_api_key.pem`).
    *   Note down the `Tenancy OCID`, `User OCID`, `Fingerprint`, and `Region`.

## Setup Instructions

1.  **Initialize Terraform**:
    ```bash
    cd infrastruct/terraform
    terraform init
    ```

2.  **Configure Variables**:
    *   Copy the example file:
        ```bash
        cp terraform.tfvars.example terraform.tfvars
        ```
    *   Edit `terraform.tfvars` and fill in your OCI details.
    *   **Availability Domain**: You can find this by running `oci iam availability-domain list` or looking in the OCI Console when creating a VM.

    **Using Existing Infrastructure?**
    If you already have a VCN and Subnet, you can skip creating them. You have two options:

    *Option A: By Name (Easier)*
    ```hcl
    create_network       = false
    existing_vcn_name    = "nomad-vcn"
    existing_subnet_name = "nomad-subnet"
    ```

    *Option B: By OCID (Precise)*
    ```hcl
    create_network       = false
    existing_subnet_id   = "ocid1.subnet.oc1..aaaa..."
    ```

3.  **Deploy**:
    ```bash
    terraform apply
    ```
    *   Type `yes` to confirm.

4.  **Post-Deploy**:
    *   Terraform will **automatically update** your Ansible inventory (`infrastruct/nomad_stack/inventory.yml`) and variables with the new server's IP.
    *   You can immediately run the Ansible playbook step.

## Notes on "Always Free" Limits
*   The `VM.Standard.E2.1.Micro` is the x86 Always Free tier.
*   If you have access to ARM resources (`VM.Standard.A1.Flex`), you can change the `shape` in `main.tf` to get 4 CPUs and 24GB RAM, but availability is often limited. This config targets the x86 tier as requested ("single core . single gb").
