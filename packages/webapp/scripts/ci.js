#!/usr/bin/env node

const spawn = require('cross-spawn');

async function Exec() {
  const args = process.argv.slice(2);

  if (!process.env.DEPLOY_CONFIG) {
    throw new Error(
      'missing process environment variable $DEPLOY_CONFIG: is this command running in a CI environment?'
    );
  }

  const env = JSON.parse(process.env.DEPLOY_CONFIG);
  const transformedEnv = Object.keys(env).reduce((acc, key) => {
    acc[`REACT_APP_${key}`] = env[key];
    return acc;
  }, {});
  // Execute the command with the given environment variables
  const proc = spawn(args[0], args.slice(1), {
    stdio: 'inherit',
    env: { ...process.env, ...transformedEnv },
  });

  proc.on('exit', (code) => {
    process.exit(code);
  });

  return env;
}

Exec();
