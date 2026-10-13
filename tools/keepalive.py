#!/usr/bin/env python3
"""Keep the authorized Render backend warm while this workspace is running."""
import argparse
import datetime
import time
from urllib.request import Request, urlopen

parser = argparse.ArgumentParser()
parser.add_argument('--url', default='https://tds-solver-backend.onrender.com/health')
parser.add_argument('--interval', type=int, default=300)
parser.add_argument('--once', action='store_true')
args = parser.parse_args()
while True:
    try:
        with urlopen(Request(args.url, headers={'User-Agent': 'tds-solver-keepalive/1.0'}), timeout=55) as response:
            response.read(4096)
            message = 'HTTP ' + str(response.status)
    except Exception as error:
        message = str(error)
    print(datetime.datetime.now(datetime.timezone.utc).isoformat(), message, flush=True)
    if args.once:
        break
    time.sleep(max(60, args.interval))
