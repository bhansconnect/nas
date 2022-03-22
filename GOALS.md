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
- [x] Docker containers for apps (maybe with limited memory/cpu)
- [x] Automatic updates for Docker containers (maybe this is a bad idea???)
- [x] Hosts web site with let's encrypt, DDNS, and authentication
- [x] Can be remotely ssh'd into (only with keyfile)
- [x] VPN container that some other containers are piped through
- [x] ZFS scrub timer
- [x] ZFS status alerts (maybe via uptime kuma, maybe just cron)
- [ ] Automatic backup (only essential data) to cloud or another device else (probably restic)
- [x] Sends email notifications if it notices any failures (done via uptime kuma)

## Current likely app plan:

- [x] DDClient for DDNS
- [x] Endlessh for fake ssh
- [x] Traefik
- [x] Authelia
- [x] Openspeedtest
- [x] VPN
- [x] Torrent app (needs to deal well with old stalled torrents)
- [x] Uptime Kuma looks nice for service monitor
- [ ] Heimdall or Homer
- [ ] Portainer (only for status, not snowflake containers)?
- [x] Gitea / Gitlab (mirror public repos on github)
- [ ] Nextcloud
- [ ] Samba share that can also see Nextcloud and has history viewable
- [ ] Github CI action runner
- [x] Prowlarr
- [x] Jellyfin (if not liked fallback to Plex)
- [ ] Sonarr
- [x] Radarr
- [ ] Bazarr?
- [ ] Readarr?
- [ ] lidarr?
- [ ] Home Assistant?
- [ ] Some sort of youtube-dl?
- [ ] Some sort of transcoder pipeline (handbrake)?
- [ ] NZBGet???
- [ ] Graphana???
