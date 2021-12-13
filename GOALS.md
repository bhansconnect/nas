## This is just a rough list of the current goals of the project:

- [x] Stable simple base (probably Debian)
- [x] Minimal well-documented install (maybe scripted)
- [x] No snowflakes. Fully rebuildable with install guide. (Ansible after install)
- [x] Mirrored boot drives - must boot fine with a dead drive (probably zfs, maybe btrfs)
- [x] Encrypted raid (any type) data drives (probably zfs, maybe btrfs)
- [x] Can boot without password (load encryption key from file on boot drive) This means if you throw away a single data pool disk, you don't have to worry about the data. If someone steals the entire server, you will have issues.
- [x] Encrypted Swap
- [x] Automatic updates and reboots at least for security patches
- [x] Automatic snapshot creation and pruning
- [x] At least manual rollback of boot drive to fix bad updates
- [ ] Automatic backup (only essential data) to cloud or another device else (probably restic)
- [x] Docker containers for apps (maybe with limited memory/cpu)
- [x] Automatic updates for Docker containers (maybe this is a bad idea???)
- [ ] VPN container that some other containers are piped through
- [ ] Hosts web site with let's encrypt, DDNS, and good security
- [x] Can be remotely ssh'd into (only with keyfile)
- [ ] Sends email notifications if it notices any failures

## Current likely app plan:

- [x] DDClient for DDNS
- [x] Endlessh for fake ssh
- [ ] OpenVPN
- [ ] Openspeedtest
- [ ] Traefik
- [ ] Gitea / Gitlab (mirror public repos on github)
- [ ] Github CI action runner
- [ ] Nextcloud
- [ ] Samba share that can also see Nextcloud and has history viewable
- [ ] Heimdall
- [ ] Jellyfin (if not liked fallback to Plex)
- [ ] Sonarr
- [ ] Radarr
- [ ] Bazarr?
- [ ] Readarr?
- [ ] lidarr?
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
