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
- [x] Hosts web site with let's encrypt, DDNS, and authentication
- [x] Can be remotely ssh'd into (only with keyfile)
- [ ] Sends email notifications if it notices any failures (maybe use discord)

## Current likely app plan:

- [x] DDClient for DDNS
- [x] Endlessh for fake ssh
- [x] Traefik
- [x] Authelia
- [ ] Heimdall or Homer
- [ ] Uptime Kuma looks nice for service monitor
- [ ] Portainer (only for status, not snowflake containers)?
- [x] Openspeedtest
- [ ] Gitea / Gitlab (mirror public repos on github)
- [ ] Nextcloud
- [ ] Samba share that can also see Nextcloud and has history viewable
- [ ] Github CI action runner
- [ ] NordVPN
- [ ] Torrent app (needs to deal well with old stalled torrents)
- [ ] Jackett
- [ ] Jellyfin (if not liked fallback to Plex)
- [ ] Sonarr
- [ ] Radarr
- [ ] Bazarr?
- [ ] Readarr?
- [ ] lidarr?
- [ ] Prowlarr?
- [ ] Home Assistant?
- [ ] Some sort of youtube-dl?
- [ ] Some sort of transcoder pipeline (handbrake)?
- [ ] NZBGet???
- [ ] Graphana???
