module.exports = {
  apps: [
    {
      name: "beatoon",
      cwd: "/opt/beatoon",
      script: "server.js",
      exec_mode: "fork",
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: "700M",
      env: {
        NODE_ENV: "production",
        HOST: "127.0.0.1",
        PORT: "3000",
        STORAGE_DIR: "/var/lib/beatoon",
        PUBLIC_BASE_URL: "https://sfera.fun",

        // SMTP (Yandex). Replace SMTP_PASS with your Yandex app password.
        SMTP_HOST: "smtp.yandex.ru",
        SMTP_PORT: "465",
        SMTP_SECURE: "true",
        SMTP_USER: "lxumy@yandex.com",
        SMTP_FROM: "sfera <lxumy@yandex.com>",
        SMTP_PASS: "PUT_YANDEX_APP_PASSWORD_HERE",

        // Optional SMTP tuning:
        SMTP_REQUIRE_TLS: "false",
        SMTP_TLS_REJECT_UNAUTHORIZED: "true",

        // Keep fallback outbox disabled when SMTP succeeds.
        MAIL_WRITE_OUTBOX_COPY: "false"
      }
    }
  ]
};

