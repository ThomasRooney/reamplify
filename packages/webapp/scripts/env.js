#!/usr/bin/env node

const spawn = require('cross-spawn');
const fs = require('fs');
const path = require('path');

const envDir = path.resolve(__dirname, '..', '..', 'deploy', 'env');

async function getEnvVars(env) {
  const envFile = path.resolve(envDir, `${env}.json`);
  if (!fs.existsSync(envFile)) {
    throw new Error(`Environment file ${envFile} does not exist`);
  }
  return JSON.parse(fs.readFileSync(envFile, 'utf8'));
}

async function Exec() {
  const args = process.argv.slice(2);

  const env = await getEnvVars(args[0]);
  const transformedEnv = Object.keys(env).reduce((acc, key) => {
    acc[`REACT_APP_${key}`] = env[key];
    return acc;
  }, {});
  // Execute the command with the given environment variables
  const proc = spawn(args[1], args.slice(2), {
    stdio: 'inherit',
    env: { ...process.env, ...transformedEnv },
  });
  proc.on('exit', (code) => {
    process.exit(code);
  });
  return env;
}

Exec();
