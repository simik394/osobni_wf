job "rsrch-browser" {
  datacenters = ["oci-eu"]
  type        = "service"

  group "browser" {
    count = 1

    constraint {
      attribute = "${node.class}"
      value     = "cloud"
    }

    network {
      mode = "host"
      port "vnc" {
        static = 5955
      }
      port "health" {
        static = 9227
      }
      port "cdp" {
        static = 9222
      }
    }

    task "chromium" {
      driver = "docker"

      config {
        image        = "localhost:5001/rsrch:latest"
        command      = "node"
        args         = ["deploy/launch-browser.js"]
        force_pull   = false
        network_mode = "host"
        shm_size     = 1073741824

        volumes = [
          "/home/sim/.rsrch/profiles/default/state:/app/user-data",
        ]
      }

      env {
        USER_DATA_DIR = "/app/user-data"
        DISPLAY       = ":99"
        HEALTH_PORT   = "9227"
        PROXY_PORT    = "9223"
      }

      resources {
        cpu    = 500
        memory = 2048
      }

      service {
        name = "rsrch-browser"
        port = "cdp"
        tags = ["rsrch", "browser"]
      }
    }
  }
}
