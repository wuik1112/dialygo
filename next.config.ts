import type { NextConfig } from "next";

const withPWA = require('next-pwa')({
  dest: 'public',
  disable: process.env.NODE_ENV === 'development', // Disable in dev mode to prevent caching issues while coding
  register: true,
  skipWaiting: true,
});

/** @type {import('next').NextConfig} */

const nextConfig: NextConfig = {
  reactStrictMode: true,
};

module.exports = withPWA(nextConfig);
