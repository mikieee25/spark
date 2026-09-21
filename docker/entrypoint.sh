#!/bin/sh
set -eu

test -d "${SPARK_DATA_DIR:?SPARK_DATA_DIR is required}"
test -d "${SPARK_FILES_ROOT:?SPARK_FILES_ROOT is required}"
test -w "$SPARK_DATA_DIR"
test -r "$SPARK_FILES_ROOT"
test -w "$SPARK_FILES_ROOT"

exec "$@"
