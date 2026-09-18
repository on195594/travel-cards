#!/usr/bin/env bash
set -euo pipefail

export NODE_ENV="test"
export AUTH_SECRET="test-only-secret-that-is-at-least-32-characters"
export AUTH_URL="http://127.0.0.1:3100"
export ADMIN_EMAIL="admin@example.test"
export ADMIN_PASSWORD_HASH='scrypt$00$00'
export MONGODB_URI="mongodb://127.0.0.1:1/travel_cards_build_test"
export GEMINI_API_KEY="test-only-not-a-real-key"
export GEMINI_MODEL="test-model"
export R2_ENDPOINT="https://r2.example.test"
export R2_BUCKET="test-bucket"
export R2_ACCESS_KEY_ID="test-key-id"
export R2_SECRET_ACCESS_KEY="test-secret"
export R2_PUBLIC_BASE_URL="https://images.example.test/"
unset HERMES_API_TOKEN API_TOKEN

npm run build
