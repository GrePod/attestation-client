bash ./scripts/services-stop-all.sh
CONFIG_PATH=.secure node dist/lib/runIndexer -c ALGO -r RESET_COMPLETE
bash ./scripts/services-restart-all.sh
