job "logic-core" {
  datacenters = ["oci-eu"]
  type        = "batch"

  meta {
    version = "0.1.0"
  }

  group "inference" {
    count = 1

    # No restarts for batch jobs
    restart {
      attempts = 0
    }

    task "logic-engine" {
      driver = "docker"

      config {
        image = "ldi-logic-core:latest"
        
        args = [
          "--youtrack-url", "${YOUTRACK_URL}",
          "--rules-dir", "/rules",
          "${DRY_RUN}"
        ]

        volumes = [
          "local/rules:/rules:ro"
        ]
      }

      # Fetch rules from Git
      artifact {
        source      = "git::https://github.com/user/logic-rules.git"
        destination = "local/rules"
      }

      # Environment from Vault or Nomad Variables
      template {
        data = <<EOF
YOUTRACK_TOKEN={{ with secret "kv/data/youtrack" }}{{ .Data.data.token }}{{ end }}
YOUTRACK_URL={{ env "meta.youtrack_url" | default "https://youtrack.example.com" }}
DRY_RUN={{ env "meta.dry_run" | default "--dry-run" }}
EOF
        destination = "secrets/env"
        env         = true
      }

      resources {
        cpu    = 500
        memory = 512
      }
    }
  }
}
