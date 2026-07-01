// PM2 process definition. Keeps the bot alive on a VPS: restarts it if it
// crashes, and (with `pm2 startup`) restarts it automatically after reboot.
module.exports = {
  apps: [
    {
      name: 'kakaotalk-bot',
      script: 'dist/index.js',
      cwd: __dirname,
      instances: 1,
      autorestart: true,
      restart_delay: 5000,
      max_restarts: 20,
      watch: false,
      env: {
        NODE_ENV: 'production',
      },
    },
  ],
};
