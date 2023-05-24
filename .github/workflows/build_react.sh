#!/bin/bash

set -euo pipefail

# npx create-react-app app --template typescript

cd app
ls public/eco/dist
false
npm install
yarn build
rm -rf node_modules
