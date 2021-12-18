#!/usr/bin/env python3

from datetime import datetime
import feedparser
import itertools
import re
import subprocess
from urllib import parse

# Wanted distro regexes for finding torrents.
# These need to match to a specific torrent execept for version.
# It it matched to both the kde and gnome version, they would overwrite eachother.
WANTED = [
    {
        # Arch Linux
        'feed': 'https://linuxtracker.org/rss_torrents.php?cat[]=39&pid=00000000000000000000000000000000',
        'torrents': [
            'archlinux.\d\d\d\d\.\d\d\.\d\d.x86.64(.iso)?'
        ]
        # TODO: deal with other distros
    },
]

# How many versions of each torrent to keep.
# It will delete the version that has been sitting idle the longest.
# This should hopefully keep around useful lts versions.
KEEP = 3


def get_torrent_details(torrent):
    data = torrent.split()
    id = data[0]
    name = data[-1]
    result = subprocess.run(
        ['docker', 'exec', 'transmission', 'transmission-remote', '-t', id, '-i'], capture_output=True)
    if result.returncode != 0:
        # transmission app failed, just exit.
        exit(result.returncode)
    out = result.stdout.decode("utf-8")
    last_active = next(filter(lambda line: 'Latest activity' in line,
                              out.splitlines()))
    last_active = last_active.split('Latest activity:')[1].strip()
    last_active = datetime.strptime(last_active, '%a %b %d %H:%M:%S %Y')
    return {
        "id": id,
        "name": name,
        "last_active": last_active,
    }


def main():
    # Grab list of current torrents.
    # This depends on the docker transmission container.
    result = subprocess.run(
        ['docker', 'exec', 'transmission', 'transmission-remote', '-l'], capture_output=True)
    if result.returncode != 0:
        # transmission app failed, just exit.
        exit(result.returncode)
    out = result.stdout.decode("utf-8")
    old_torrents = out.splitlines()[1:-1]
    old_torrents = map(get_torrent_details, old_torrents)
    old_torrents = list(old_torrents)
    print(old_torrents)
    for rss in WANTED:
        feed = feedparser.parse(rss['feed'])
        all_links = itertools.chain(*map(lambda x: x.links, feed.entries))
        all_links = filter(lambda link: link.type ==
                           'application/x-bittorrent', all_links)
        all_links = map(lambda link: {
            'name': parse.parse_qs(parse.urlparse(link.href).query)['f'][0],
            'link': link.href
        }, all_links)
        for torrent in rss['torrents']:
            all_links, torrent_links = itertools.tee(all_links, 2)
            torrent_links = filter(lambda link: re.search(
                torrent, link['name'] + '.*\.torrent', re.IGNORECASE), torrent_links)
            torrent_links = map(
                lambda link: link['name'], torrent_links)
            newest = next(torrent_links)
            existing = filter(lambda x: re.search(
                x['name'], link['name'], re.IGNORECASE), old_torrents)
            print(list(existing))
            # TODO: cleanup old torrents then add new one.


if __name__ == '__main__':
    main()
