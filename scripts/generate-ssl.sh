#!/bin/bash
# Generate self-signed SSL certificates for local development
# Usage: ./scripts/generate-ssl.sh

set -e

CERT_DIR="./ssl"
mkdir -p "$CERT_DIR"

echo "🔐 Generating self-signed SSL certificate..."

openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
  -keyout "$CERT_DIR/key.pem" \
  -out "$CERT_DIR/cert.pem" \
  -subj "/C=US/ST=State/L=City/O=Lectura/CN=localhost"

echo "✅ SSL certificates generated:"
echo "   Certificate: $CERT_DIR/cert.pem"
echo "   Key:         $CERT_DIR/key.pem"
echo ""
echo "To use HTTPS in docker-compose, mount these into nginx:"
echo "  volumes:"
echo "    - ./ssl:/etc/nginx/ssl:ro"
echo "  And replace nginx.conf with nginx.ssl.conf"
