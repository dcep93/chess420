#!/bin/bash

set -euo pipefail

# npx create-react-app app --template typescript

cd app
npm install
yarn build
rm -rf node_modules
