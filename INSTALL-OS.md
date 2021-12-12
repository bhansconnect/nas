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
Then set the `$DISKS` variable to match:
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
  address 192.168.1.2/24
  broadcast 192.168.1.255
  network 192.168.1.0
  gateway 192.168.1.254
```

Update apt sources to include updates and contrib.
> Note: If you see misisng firmware, you may need to comeback and add non-free. Just look up the issue.
The file is `/mnt/etc/apt/sources.list`. Set it to:
```
deb http://deb.debian.org/debian bullseye main contrib
deb-src http://deb.debian.org/debian bullseye main contrib

deb http://security.debian.org/debian-security bullseye-security main contrib
deb-src http://security.debian.org/debian-security bullseye-security main contrib

deb http://deb.debian.org/debian bullseye-updates main contrib
deb-src http://deb.debian.org/debian bullseye-updates main contrib
```

Setup and chroot. Then do some basic config:
```sh
# Bind virtual filesystem and chroot
mount --rbind /dev  /mnt/dev
mount --rbind /proc /mnt/proc
mount --rbind /sys  /mnt/sys
chroot /mnt /usr/bin/env DISKS="$DISKS" bash --login

# Basic setup
ln -s /proc/self/mounts /etc/mtab
apt update
apt install --yes console-setup locales

# Setup locals
# Note: always include `en_US.UTF-8`
# Can skip if only using default english us, qwerty, etc.
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

Take a note of the primary disk. It is needed later:
```sh
echo $PRIMARY_DISK
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

### GRUB installation

Double check that boot is recognized by grub:
```sh
grub-probe /boot
```
Should print `zfs`

Update initrd:
> Note: Ignore any error messages saying `ERROR: Couldn't resolve device` and `WARNING: Couldn't determine root device`
```sh
update-initramfs -c -k all
```

Edit `/etc/default/grub`:
 - Set `GRUB_CMDLINE_LINUX="root=ZFS=rpool/ROOT/debian"`
 - Remove quiet from: `GRUB_CMDLINE_LINUX_DEFAULT`
 - Uncomment: `GRUB_TERMINAL=console`

Update grub with:
```sh
update-grub
```

Install uefi boot:
```sh
grub-install --target=x86_64-efi --efi-directory=/boot/efi \
    --bootloader-id=debian --recheck --no-floppy
```

Fix filesystem mounting order:
```sh
mkdir /etc/zfs/zfs-list.cache
touch /etc/zfs/zfs-list.cache/bpool
touch /etc/zfs/zfs-list.cache/rpool
ln -s /usr/lib/zfs-linux/zed.d/history_event-zfs-list-cacher.sh /etc/zfs/zed.d
zed -F &
```

Verify the previous command by making sure these are not empty:
```sh
cat /etc/zfs/zfs-list.cache/bpool
cat /etc/zfs/zfs-list.cache/rpool
```
If either is empty force update:
```sh
zfs set canmount=on     bpool/BOOT/debian
zfs set canmount=noauto rpool/ROOT/debian
```
If still empty, stop zed and repeat:
```sh
fg
# Press Ctrl-C.
```

Once everything is good, stop zed and remove `/mnt` from paths:
```sh
fg
# Press Ctrl-C.

sed -Ei "s|/mnt/?|/|" /etc/zfs/zfs-list.cache/*
```

### First boot

Take snapshot of install (should remove after a few good boots to not waste space):
```sh
zfs snapshot bpool/BOOT/debian@install
zfs snapshot rpool/ROOT/debian@install
```

Exit the chroot with `exit`

Unmount everything and reboot:
```sh
mount | grep -v zfs | tac | awk '/\/mnt/ {print $3}' | \
    xargs -i{} umount -lf {}
zpool export -a

reboot
```

### Create User account
```sh
username=YOUR_USERNAME

zfs create rpool/home/$username
adduser $username

cp -a /etc/skel/. /home/$username
chown -R $username:$username /home/$username
usermod -a -G audio,cdrom,dip,floppy,netdev,plugdev,sudo,video $username
```

### Mirror Grub

> :warning: This is not automatic and can easily be messed up. so pay attention.

First unmount efi:
```sh
umount /boot/efi
```

Then for each disk, copy the bootloader over. This comes from the PRIMARY_DISK you noted down earlier.
Make sure to update the debian number and the disk number if using more than 2 disks.
```sh
dd if=/dev/disk/by-id/scsi-SATA_disk1-part1 \
   of=/dev/disk/by-id/scsi-SATA_disk2-part1
efibootmgr -c -g -d /dev/disk/by-id/scsi-SATA_disk2 \
    -p 2 -L "debian-2" -l '\EFI\debian\grubx64.efi'

mount /boot/efi
```

### Configure swap

Grab your 2 disk ids and run the following to have mirrored swap:
```sh
apt install --yes mdadm

# Adjust the level (ZFS raidz = MD raid5, raidz2 = raid6) and
# raid-devices if necessary and specify the actual devices.
mdadm --create /dev/md0 --metadata=1.2 --level=mirror \
    --raid-devices=2 ${DISK1}-part2 ${DISK2}-part2
mkswap -f /dev/md0

# Setup encrypted swap.
UUID_SWAP=$(sudo blkid -s UUID -o value /dev/md0)
echo "cryptswap_md UUID=${UUID_SWAP} /dev/urandom swap,offset=2048,cipher=aes-xts-plain64,size=512" >> /etc/crypttab

# Add it to fstab
echo "/dev/mapper/cryptswap_md none swap defaults 0 0" >> /etc/fstab
```

### Full Software install
```sh
apt full-upgrade

# Disable log compression because zfs will do it
for file in /etc/logrotate.d/* ; do
    if grep -Eq "(^|[^#y])compress" "$file" ; then
        sed -i -r "s/(^|[^#y])(compress)/\1#\2/" "$file"
    fi
done

reboot
```

# Cleanup
```sh
# remove install snapshot since booting is good
sudo zfs destroy bpool/BOOT/debian@install
sudo zfs destroy rpool/ROOT/debian@install

# remove root password
sudo usermod -p '*' root
```

Disable root ssh login by commenting out `PermitRootLogin yes` in `/etc/ssh/sshd_config`
Then run `sudo systemctl restart ssh`

## Setup or import data pool

> Note: zfs related commands may not be found unless they are called with `sudo`
If you already have a data pool, just import it with `zpool import ...`.
If the pool may mount in a bad location, you may need to specify a temporary root with `-R` before setting the mountpoints.

Finally set the data pool mountpoint to where the nas expects it:
```sh
zfs set mountpoint=/mnt/dpool <pool name>
```

If you are making a new one, use these commands to create it with zfs encryption save to a file in the rpool:
```sh
sudo openssl rand -base64 -out /root/.dpool_key 32
sudo chmod u=r,go= /root/.dpool_key

sudo zpool create \
    -o ashift=12 \
    -o autotrim=on \
    -O acltype=posixacl \
    -O canmount=on \
    -O compression=zstd \
    -O dnodesize=auto \
    -O normalization=formD \
    -O atime=off \
    -O relatime=off \
    -O xattr=sa \
    -O mountpoint=/mnt/dpool \
    -O encryption=aes-256-gcm \
    -O keylocation=file:///root/.dpool_key \
    -O keyformat=raw \
    dpool \
    <raid config with drives>
```
> :warning: Write down and backup `/root/.dpool_key` if it is lost, the data is gone.

Create a service to load the encrypted dpool on boot by writing it to `/etc/systemd/system/zfs-mount-dpool.service`:
```
[Unit]
Description=Mount dpool
DefaultDependencies=no
ConditionPathExists=/root/.dpool_key
Before=local-fs.target
After=zfs-mount.service
Requires=zfs-mount.service

[Service]
Type=oneshot
RemainAfterExit=yes
ExecStart=/sbin/zfs mount -l dpool

[Install]
WantedBy=zfs.target
```

Then enable it with:
```ssh
sudo systemctl enable zfs-mount-dpool.service
```