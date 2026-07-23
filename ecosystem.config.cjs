module.exports = {
  apps: [
    {
      name: 'airocall-server',
      script: 'server.js',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '150M',
      env: {
        NODE_ENV: 'production',
        PORT: 3000,
      },
    },
  ],
};
