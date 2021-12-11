## This is just a rough list of the current goals of the project:

- [ ] Stable simple base (probably Debian)
- [ ] Minimal well-documented install (maybe scripted)
- [ ] No snowflakes. Fully rebuildable with install guide. (Ansible after install)
- [ ] Mirrored boot drives - must boot fine with a dead drive (probably zfs, maybe btrfs)
- [ ] Encrypted raid (any type) data drives (probably zfs, maybe btrfs)
- [ ] Can boot without password (must get encryption key somehow, probably file on boot drive)
- [ ] Automatic updates and reboots at least for security patches
- [ ] Automatic snapshot creation and pruning
- [ ] At least manual rollback of boot drive to fix bad updates
- [ ] Automatic backup (only essential data) to cloud or another device else (probably restic)
- [ ] Docker containers for apps (maybe with limited memory/cpu)
- [ ] Automatic updates for Docker containers (maybe this is a bad idea???)
- [ ] VPN container that some other containers are piped through
- [ ] Hosts web site with let's encrypt, DDNS, and good security
- [ ] Can be remotely ssh'd into (only with keyfile)
- [ ] Sends email notifications if it notices any failures

## Current likely app plan:

- [ ] Traefik
- [ ] OpenVPN
- [ ] Gitea / Gitlab (mirror public repos on github)
- [ ] Github CI action runner
- [ ] Nextcloud
- [ ] Samba share that can also see Nextcloud and has history viewable
- [ ] Heimdall
- [ ] Jellyfin (if not liked fallback to Plex)
- [ ] Sonarr
- [ ] Radarr
- [ ] Bazarr?
- [ ] Prowlarr?
- [ ] Jackett
- [ ] Torrent app (needs to deal well with old stalled torrents)
- [ ] NZBGet???
- [ ] Bitwarden?
- [ ] Home Assistant?
- [ ] Portainer (only for status, not snowflake containers)?
- [ ] Graphana?
- [ ] Some sort of youtube-dl?
- [ ] Some sort of transcoder pipeline (handbrake)?
