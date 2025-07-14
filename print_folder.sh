#!/bin/bash
find . -path './.github' -prune -o -path './.git' -prune -o -path './node_modules' -prune -o -path './functions/node_modules' -prune -o -path './dist' -prune -o -print
