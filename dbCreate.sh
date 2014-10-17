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
export SUFFIX=$1
export CSVFile=$2
export SKIPROWS=${3:-7}
export TMPDIR=${4:-~/tmp/phantalyzerData}
export URL=${5:-"URL"}


$NODE csv2${SUFFIX}.js --dataDir $TMPDIR --csvFile $CSVFile --skipRows $SKIPROWS \
    --urlColumn $URL
