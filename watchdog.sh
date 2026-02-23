#!/bin/bash

# Watchdog script - monitors and restarts processes if they crash
LOGFILE="/tmp/watchdog.log"

log_msg() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" >> $LOGFILE
}

check_extraction() {
    if ! ps aux | grep "extract-and-analyze" | grep -v grep > /dev/null; then
        log_msg "❌ Extraction process crashed! Restarting..."
        cd /Users/antanaskasiulynas/brief-builder
        caffeinate -i node scraper/extract-and-analyze-all-ads.js > /tmp/extraction-full.log 2>&1 &
        log_msg "✅ Extraction restarted with caffeinate (PID: $!)"
    fi
}

check_server() {
    if ! lsof -i :3002 > /dev/null 2>&1; then
        log_msg "❌ Server crashed! Restarting..."
        cd /Users/antanaskasiulynas/brief-builder
        node server.js > /tmp/server.log 2>&1 &
        log_msg "✅ Server restarted (PID: $!)"
    fi
}

log_msg "🔍 Watchdog started"

# Run checks every 60 seconds
while true; do
    check_extraction
    check_server
    sleep 60
done
