First run `INSTALL-OS.md` before using this guide.
That will setup the base operating system with zfs pools.
This guide is for using ansible to actually deploy the nas software.

## SSH Key

It is nice to use an ssh key when using ansible.
Just run this to generate and copy the key over:
```sh
ssh-keygen -t ed25519 -C "Any comment you want"
ssh-copy-id -i ~/.ssh/id_ed25519 user@ip
```
If you want to be extra secure, also disable ssh password authentication at this point.

## Install ansible and setup inventory

Multiple ways to do this. I just use:
```sh
pip3 install ansible
```

To [setup the inventory](https://docs.ansible.com/ansible/latest/user_guide/intro_inventory.html), create an `inventory` file with roughly these contents:
> Note: ansible_port should be change to something besides 22. On port 22, we will end up running endlessh. This requires setting the port in `/etc/ssh/sshd_config` and restarting `sshd`
```
[nas]
192.168.1.2 ansible_port=2222 ansible_connection=ssh ansible_user=myuser
```

Verify ansible can connect:
```ssh
ansible nas -m ping
```
You should get a success, and it should discover python3.

## Install the Nas

```sh
# install required roles
ansible-galaxy install -r requirements.yml

# permission data pool
# This should only ever need to be done once.
# When updating the nas, just run nas.yml
ansible-playbook permission_data.yml -K

# install nas
ansible-playbook nas.yml -K --ask-vault-pass
```