/** @type {import('next').NextConfig} */
const nextConfig = {
  ...(process.env.SPARK_NEXT_DIST_DIR ? { distDir: process.env.SPARK_NEXT_DIST_DIR } : {}),
  async headers() {
    return [{ source: "/(.*)", headers: [
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      { key: "X-Frame-Options", value: "DENY" },
      { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
    ] }];
  },
};

export default nextConfig;
