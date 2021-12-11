# Installation steps

> :warning: Pay attention when following these steps. They might be old or make silly choices. When in doubt look at proper references.

## Overview

This guide is mostly for setting up the base system that is needed to be ansible ready.
It currently is based on usind debian bullseye (current stable).
The guide is based roughly off of [the openzfs guide for buster](https://openzfs.github.io/openzfs-docs/Getting%20Started/Debian/Debian%20Buster%20Root%20on%20ZFS.html) (last stable). There is no updated guide yet.
It also uses some of the commands from [the openzfs arch guide](https://openzfs.github.io/openzfs-docs/Getting%20Started/Arch%20Linux/index.html#root-on-zfs) to get more up to date commands.

## Live CD Setup
To start, get [a live cd](https://cdimage.debian.org/debian-cd/current-live/amd64/bt-hybrid/) flashed and booted on the target machine.
I specifically used the gnome version.
To make life simpler, I setup ssh into the live cd:
```sh
sudo apt update
sudo apt install openssh-server
sudo systemctl start sshd
sudo passwd user
ip a
```
Then connect to the server from my laptop with `ssh user@<ip address>`.

