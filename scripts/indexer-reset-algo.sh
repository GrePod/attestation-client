systemctl --user stop indexer-algo.service
CONFIG_PATH=.secure node dist/lib/runIndexer -a ALGO -r RESET_ACTIVE
systemctl --user start indexer-algo.service
