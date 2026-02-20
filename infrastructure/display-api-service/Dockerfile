######## Clients [Screen|Admin] build ########
FROM --platform=$BUILDPLATFORM node:24-alpine AS client_app_builder
LABEL maintainer="ITK Dev <itkdev@mkb.aarhus.dk>"

ARG APP_VERSION="develop"

RUN mkdir -p /app
WORKDIR /app

# Copy only necessary files for npm install
COPY package.json package-lock.json vite.config.js ./

# Install dependencies
RUN npm ci --no-audit --no-fund

# Copy source files needed for build
COPY assets/ ./assets/

# Build the application with version info
RUN npm run build


######### API backend build ########
FROM --platform=$BUILDPLATFORM itkdev/php8.4-fpm:latest AS api_app_builder
LABEL maintainer="ITK Dev <itkdev@mkb.aarhus.dk>"

ARG APP_VERSION="develop"

WORKDIR /app

# Copy only composer files first for better layer caching
COPY --chown=deploy:deploy . ./

# Composer packages first
RUN APP_ENV=prod composer install --no-dev --optimize-autoloader --classmap-authoritative

# Remove files we do not need to the final image
RUN rm -rf package* vite.config.js

######## PHP-FPM (API) production image ########
FROM --platform=$BUILDPLATFORM itkdev/php8.4-fpm:alpine
LABEL maintainer="ITK Dev <itkdev@mkb.aarhus.dk>"

ENV APP_ENV=prod \
    COMPOSER_VERSION=2 \
    PHP_OPCACHE_ENABLED=1 \
    PHP_OPCACHE_VALIDATE_TIMESTAMPS=0 \
    PHP_OPCACHE_MAX_ACCELERATED_FILES=20000 \
    PHP_OPCACHE_MEMORY_CONSUMPTION=256 \
    PHP_PM_TYPE="dynamic" \
    PHP_PM_MAX_CHILDREN="24" \
    PHP_PM_MAX_REQUESTS="0" \
    PHP_PM_START_SERVERS="5" \
    PHP_PM_MIN_SPARE_SERVERS="5" \
    PHP_PM_MAX_SPARE_SERVERS="10"

# Install the api application.
COPY --chown=deploy:deploy --from=api_app_builder /app .
RUN mkdir -p ./config/secrets

CMD [ "docker-entrypoint.sh" ]
