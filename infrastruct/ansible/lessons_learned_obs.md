# Lessons Learned: Adding OBS Studio via Ansible

## Technical Insights
- **Ansible and Sudo**: When running Ansible playbooks that require escalation (`become: true`) from a local machine, using `--ask-become-pass` is necessary if the user doesn't have passwordless sudo configured.
- **PPA Management**: Using the `apt_repository` module is a clean way to manage external repositories on Ubuntu/Pop!_OS systems, ensuring the latest stable version is installed.
- **Role Reusability**: Creating a dedicated role for `obs-studio` follows the project's established structure and allows for easier maintenance or future deployment to other machines.

## Process Improvements
- **Interactive Commands**: Background commands in this environment can struggle with interactive prompts. It's better to inform the user and ask them to handle the interactive part (like entering a sudo password) in their terminal.
- **Documentation**: Keeping `pwf.TODO.md` updated provides a clear history of what was achieved and aligns with the project's workflow.
