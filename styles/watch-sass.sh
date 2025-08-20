#!/bin/bash

# SASS Watch Script
# This script watches for changes in .scss files and automatically compiles them to .css

echo "Starting SASS watch mode..."
echo "Watching for changes in .scss files..."
echo "Press Ctrl+C to stop watching"

# Watch and compile styles.scss to styles.css
sass --watch styles/styles.scss:styles/styles.css &
STYLES_PID=$!

# Watch and compile grid.scss to grid.css
sass --watch styles/grid.scss:styles/grid.css &
GRID_PID=$!

# Function to cleanup background processes on exit
cleanup() {
    echo -e "\nStopping SASS watch mode..."
    kill $STYLES_PID $GRID_PID 2>/dev/null
    exit 0
}

# Set up signal handlers
trap cleanup SIGINT SIGTERM

# Wait for background processes
wait
