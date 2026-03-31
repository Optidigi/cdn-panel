FROM python:3.12-slim
WORKDIR /app

# curl is needed to fetch the Tailwind CLI binary at build time
RUN apt-get update && apt-get install -y --no-install-recommends curl \
    && rm -rf /var/lib/apt/lists/*

RUN pip install --no-cache-dir flask pillow gunicorn bcrypt

COPY . /app/

# Download Tailwind CSS CLI (v3, standalone binary), compile minified CSS, remove binary
RUN curl -sL https://github.com/tailwindlabs/tailwindcss/releases/download/v3.4.17/tailwindcss-linux-x64 \
    -o /tmp/tailwindcss && chmod +x /tmp/tailwindcss \
    && /tmp/tailwindcss -c tailwind.config.js -i input.css -o static/tailwind.css --minify \
    && rm /tmp/tailwindcss

ENV CDN_ROOT=/data/cdn
CMD ["gunicorn", "-w", "4", "-b", "0.0.0.0:8080", "--timeout", "300", "app:app"]
