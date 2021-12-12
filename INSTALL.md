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
# Also disable suspend
sudo systemctl mask sleep.target suspend.target hibernate.target hybrid-sleep.target
ip a
```
Then connect to the server from my laptop with `ssh user@<ip address>`.

## Setup Guide

> :warning: Again, this is based on the debian zfs guide. It is probably better to follow, especially if any significant amout of time has passed sense December 2021.

### Enable Contrib
Update `/etc/apt/sources.list` to add contrib:
```
deb http://deb.debian.org/debian/ bullseye main contrib
```

### Install base dependencies

Disable automount incase of issues with old patitions:
```sh
gsettings set org.gnome.desktop.media-handling automount false
```

Become root with: 
```sh
sudo -i
```

Then install deps:
```sh
apt update

apt install --yes debootstrap mdadm gdisk dkms dpkg-dev linux-headers-$(uname -r)

apt install --yes --no-install-recommends zfs-dkms

modprobe zfs
apt install --yes zfsutils-linux
```

## Setup disks

> Note: if you have old mdadm, or partitions, you may need to explicitly clean it up. Look at the zfs guide.


It is important to pick the correct disks here and use `/dev/disk/by-id`.
Simply run `ls /dev/disk/by-id` and pick the disks you want to use.
Then set the `$DISKS` varibale to match:
```sh
DISKS='/dev/disk/by-id/ata-FOO /dev/disk/by-id/nvme-BAR'
```
A few more sizes must also be set (size is in G).
The suggested values are listed below:
```sh
SWAP_SIZE=8
BPOOL_SIZE=2
``` 

Then clear the disks and install the new partitions:
```sh
#disable swap
sudo swapoff --all

# cleanup old data
for i in ${DISKS}; do
blkdiscard -f $i &
done
wait

# setup new paritions
for i in ${DISKS}; do
# Clear partitions
sgdisk --zap-all $i
# EFI partition
sgdisk -n1:1M:+1G -t1:EF00 $i
# Long term, swap should go on ZFS, but with high memory pressure it currently can cause lockups.
# Instead it will be mirrored on MDADM.
sgdisk -n2:0:+${SWAP_SIZE}G -t2:FD00 $i
# bpool
sgdisk -n3:0:+${BPOOL_SIZE}G -t3:BE00 $i
# rpool
sgdisk -n4:0:0   -t4:BF00 $i
done
```

# Create ZFS Pools

> Note: The data pool is separate from both of these.

```sh
# Mirrored bpool
zpool create \
    -o cachefile=/etc/zfs/zpool.cache \
    -o ashift=12 -o autotrim=on -d \
    -o feature@async_destroy=enabled \
    -o feature@bookmarks=enabled \
    -o feature@embedded_data=enabled \
    -o feature@empty_bpobj=enabled \
    -o feature@enabled_txg=enabled \
    -o feature@extensible_dataset=enabled \
    -o feature@filesystem_limits=enabled \
    -o feature@hole_birth=enabled \
    -o feature@large_blocks=enabled \
    -o feature@lz4_compress=enabled \
    -o feature@spacemap_histogram=enabled \
    -o feature@zpool_checkpoint=enabled \
    -O acltype=posixacl -O canmount=off -O compression=lz4 \
    -O devices=off -O normalization=formD -O relatime=on -O xattr=sa \
    -O mountpoint=/boot -R /mnt \
    bpool mirror \
    $(for i in ${DISKS}; do
       printf "$i-part3 ";
      done)

# Mirrored rpool
# I am turning atime and relatime off.
zpool create \
    -o ashift=12 \
    -o autotrim=on \
    -R /mnt \
    -O acltype=posixacl \
    -O canmount=off \
    -O compression=zstd \
    -O dnodesize=auto \
    -O normalization=formD \
    -O atime=off \
    -O relatime=off \
    -O xattr=sa \
    -O mountpoint=/ \
    rpool mirror \
   $(for i in ${DISKS}; do
      printf "$i-part4 ";
     done)
```