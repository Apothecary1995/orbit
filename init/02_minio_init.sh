#!/bin/sh
# MinIO bucket'ını otomatik oluşturur
set -e

echo "MinIO bucket kurulumu bekleniyor..."
sleep 5

mc alias set local http://minio:9000 "${MINIO_ROOT_USER}" "${MINIO_ROOT_PASSWORD}"

# Bucket yoksa oluştur
if ! mc ls local/orbit-files > /dev/null 2>&1; then
  mc mb local/orbit-files
  echo "orbit-files bucket oluşturuldu."
fi

# Public okuma politikası — medya dosyaları herkese açık olsun
mc anonymous set download local/orbit-files
echo "Bucket politikası ayarlandı: public-read"
