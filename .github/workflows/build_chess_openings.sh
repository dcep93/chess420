#!/bin/bash

set -euo pipefail

cd app/public/eco
pip3 install chess
make
