#!/bin/sh

set -eux

APP_VERSION=3.0.0-beta1

docker pull itkdev/php8.4-fpm:alpine
docker pull nginxinc/nginx-unprivileged:alpine

docker buildx build \
      --platform linux/amd64,linux/arm64 \
      --no-cache \
      --pull \
      --build-arg APP_VERSION=${APP_VERSION} \
      --tag=ghcr.io/itk-dev/os2display-api-service:${APP_VERSION} \
      --file="display-api-service/Dockerfile" ../

docker push ghcr.io/itk-dev/os2display-api-service:${APP_VERSION}

docker buildx build \
      --platform linux/amd64,linux/arm64 \
      --no-cache \
      --pull \
      --build-arg APP_VERSION=${APP_VERSION} \
      --build-arg APP_IMAGE=os2display-api-service \
      --tag=ghcr.io/itk-dev/os2display-api-service-nginx:${APP_VERSION} \
      --file="nginx/Dockerfile" nginx

docker push ghcr.io/itk-dev/os2display-api-service-nginx:${APP_VERSION}
