ARG APP_VERSION="develop"

FROM --platform=$BUILDPLATFORM ghcr.io/itk-dev/display-api-service:${APP_VERSION} AS app


######## Nginx production image ########
FROM --platform=$BUILDPLATFORM nginxinc/nginx-unprivileged:alpine
LABEL maintainer="ITK Dev <itkdev@mkb.aarhus.dk>"

ENV NGINX_PORT=8080 \
    NGINX_SET_REAL_IP_FROM=172.17.0.0/16 \
    NGINX_MAX_BODY_SIZE=10m

WORKDIR /app

USER root

# Create directory and copy built client assets
RUN mkdir -p ./public
COPY --from=app --chown=nginx:nginx /app/public ./public

# Copy configuration
COPY --chown=nginx:nginx etc /etc/nginx

# Add health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:${NGINX_PORT}/health || exit 1

USER nginx

EXPOSE ${NGINX_PORT}

CMD ["nginx", "-g", "daemon off;"]
