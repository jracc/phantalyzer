#!/bin/bash

#
# Make sure eveerything exists that we need
#
# Does node exist?
#
export NODE="`which node`"
if [ "$NODE" == "" ]; then
    print "Node.JS is required to run this program\n"
fi
#
# Does PhantomJS exist?
#
export PHANTOMJS="`which phantomJS`"
if [ "$PHANTOMJS" == "" ]; then
    print "Phantom.JS is required to run this program\n"
fi
export PROG=$1
export CSVFile=$2
export SKIPROWS=${3:-7}
export TMPDIR=${4:-~/tmp/phantalyzerData}
export URL=${5:-"URL"}

set -x
time $NODE ${PROG}2csv.js --dataDir $TMPDIR --csvFile $CSVFile --regexFile regexlist.json --urlColumn $URL
# mv ${CSVFile}.new $CSVFile

