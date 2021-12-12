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

### Setup disks

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

### Create ZFS Pools

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

### Base system install
```sh
# Container datasets
zfs create -o canmount=off -o mountpoint=none rpool/ROOT
zfs create -o canmount=off -o mountpoint=none bpool/BOOT

# Filesystem datasets
zfs create -o canmount=noauto -o mountpoint=/ rpool/ROOT/debian
zfs mount rpool/ROOT/debian

zfs create -o mountpoint=/boot bpool/BOOT/debian

# Folder datasets for snapshoting
zfs create                                 rpool/home
zfs create -o mountpoint=/root             rpool/home/root
chmod 700 /mnt/root
zfs create -o canmount=off                 rpool/var
zfs create -o canmount=off                 rpool/var/lib
zfs create                                 rpool/var/log
zfs create                                 rpool/var/spool

zfs create -o com.sun:auto-snapshot=false  rpool/var/cache
zfs create -o com.sun:auto-snapshot=false  rpool/var/tmp
chmod 1777 /mnt/var/tmp

# TODO double check docker datasets/speed/avoid this maybe
zfs create -o com.sun:auto-snapshot=false  rpool/var/lib/docker

# tmpfs at /run
mkdir /mnt/run
mount -t tmpfs tmpfs /mnt/run
mkdir /mnt/run/lock

# Base install
debootstrap bullseye /mnt

# Copy in zpool cache
mkdir /mnt/etc/zfs
cp /etc/zfs/zpool.cache /mnt/etc/zfs/
```

### System config

Setup the hostname:
```sh
echo HOSTNAME > /mnt/etc/hostname
```

edit `/mnt/etc/hosts` to be something like:
```sh
Add a line:
127.0.1.1       HOSTNAME
or if the system has a real name in DNS:
127.0.1.1       FQDN HOSTNAME
```

Setup a static ip. Add a new file to `/mnt/etc/network/interfaces.d/<name>`
It should have content similar to:
```
auto enp33s0
iface enp33s0 inet static
  address 192.168.0.2/24
  broadcast 192.168.0.255
  network 192.168.0.0
  gateway 192.168.0.254
```

Update apt sources to include updates and contrib.
The file is `/mnt/etc/apt/sources.list`. Set it to:
```
deb http://deb.debian.org/debian bullseye main contrib
deb-src http://deb.debian.org/debian bullseye main contrib

deb http://security.debian.org/debian-security bullseye/updates main contrib
deb-src http://security.debian.org/debian-security bullseye/updates main contrib

deb http://deb.debian.org/debian bullseye-updates main contrib
deb-src http://deb.debian.org/debian bullseye-updates main contrib
```

Setup and chroot. Then do some basic config:
```sh
# Bind virtual filesystem and chroot
mount --rbind /dev  /mnt/dev
mount --rbind /proc /mnt/proc
mount --rbind /sys  /mnt/sys
chroot /mnt /usr/bin/env DISKS='$DISKS' bash --login

# Basic setup
ln -s /proc/self/mounts /etc/mtab
apt update
apt install --yes console-setup locales

# Setup locals
# Note: always include `en_US.UTF-8`
dpkg-reconfigure locales tzdata keyboard-configuration console-setup

# Setup ZFS
# Ignore any error messages saying `ERROR: Couldn't resolve device` and `WARNING: Couldn't determine root device`
apt install --yes dpkg-dev linux-headers-amd64 linux-image-amd64

apt install --yes zfs-initramfs

echo REMAKE_INITRD=yes > /etc/dkms/zfs.conf

# Setup grub on first disk. Rest handled later.
PRIMARY_DISK=$(echo $DISKS | cut -f1 -d\ )

apt install dosfstools

mkdosfs -F 32 -s 1 -n EFI ${PRIMARY_DISK}-part1
mkdir /boot/efi
echo /dev/disk/by-uuid/$(blkid -s UUID -o value ${PRIMARY_DISK}-part1) \
   /boot/efi vfat defaults 0 0 >> /etc/fstab
mount /boot/efi
apt install --yes grub-efi-amd64 shim-signed

# Remove dual boot os-prober
apt remove --purge os-prober
```

Set the root password:
```sh
passwd
```

Setup bpool importing by creating `/etc/systemd/system/zfs-import-bpool.service` with content:
```
[Unit]
DefaultDependencies=no
Before=zfs-import-scan.service
Before=zfs-import-cache.service

[Service]
Type=oneshot
RemainAfterExit=yes
ExecStart=/sbin/zpool import -N -o cachefile=none bpool
# Work-around to preserve zpool cache:
ExecStartPre=-/bin/mv /etc/zfs/zpool.cache /etc/zfs/preboot_zpool.cache
ExecStartPost=-/bin/mv /etc/zfs/preboot_zpool.cache /etc/zfs/zpool.cache

[Install]
WantedBy=zfs-import.target
```

Also enable it:
```sh
systemctl enable zfs-import-bpool.service
```

Optional minor setup stuff:
```sh
# Create tmpfs for /tmp
cp /usr/share/systemd/tmp.mount /etc/systemd/system/
systemctl enable tmp.mount

# Install ssh server
apt install --yes openssh-server

# Install package popularity context to let the world know you use ZFS
apt install --yes popularity-contest
```

> Note: we only have a root user, so if you set up ssh, make sure to permit root login by setting `PermitRootLogin yes` in `/etc/ssh/sshd_config`