module.exports = {
  apps: [
    {
      name: 'renoise-themes',
      cwd: '/var/www/renoisethemes',
      script: './app.js',
      instances: 1,
      exec_mode: 'fork',
      env: {
        NODE_ENV: 'production',
        PORT: 3000,
      },
      env_file: '/var/www/renoisethemes/.env',
      log_file: '/var/log/pm2/renoisethemes.log',
      error_file: '/var/log/pm2/renoisethemes-error.log',
      out_file: '/var/log/pm2/renoisethemes-out.log',
      merge_logs: true,
      max_memory_restart: '512M',
      restart_delay: 3000,
      max_restarts: 5,
      min_uptime: '10s',
      watch: false,
      // Graceful shutdown
      kill_timeout: 5000,
      listen_timeout: 8000,
    },
  ],
};
