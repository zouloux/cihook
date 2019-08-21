#!/bin/bash

# Get repo path / updated branch / last commit message
path=$(git config --get remote.origin.url)
branch=$1
commit=$(git log -1 --pretty=%B)

/Users/zouloux/.nvm/versions/node/v11.13.0/bin/node /Users/zouloux/Documents/local/_framework/cihook/trunk/index.js run $path $branch $commit